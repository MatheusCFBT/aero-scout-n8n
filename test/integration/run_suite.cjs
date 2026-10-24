// Runs only in a disposable n8n container. No external network or real Telegram credential is used.
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const { startLocalN8n } = require("./local_n8n.cjs");

function command(args, logPath) {
  return new Promise((resolve, reject) => {
    const fd = fs.openSync(logPath, "w", 0o600);
    const environment = args[0] === "execute"
      ? { ...process.env, N8N_RUNNERS_BROKER_PORT: "5689" }
      : process.env;
    const child = spawn("n8n", args, {
      stdio: ["ignore", fd, fd], timeout: 180000, env: environment,
    });
    child.on("error", (error) => { fs.closeSync(fd); reject(error); });
    child.on("close", (code) => { fs.closeSync(fd); resolve(code); });
  });
}

function executionFrom(log) {
  const start = log.indexOf("\n{");
  if (start < 0) {
    throw Error(log.slice(-3000));
  }
  let source = log.slice(start + 1);
  const trailer = source.indexOf("\nError executing workflow.");
  if (trailer >= 0) {
    source = source.slice(0, trailer);
  }
  return JSON.parse(source.trim());
}

function outputItems(result, name) {
  return (result.runData[name] || []).flatMap(
    (run) => run.data?.main?.[0]?.map((item) => item.json) || [],
  );
}

async function main() {
  const folder = process.argv[2];
  const reference = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, "../reference/compact_workflow_results.json"), "utf8"));
  const { SCENARIOS } = await import("./fixtures.mjs");
  const requested = process.env.AERO_SCENARIOS?.split(",") || SCENARIOS.filter(s => s !== "windowReplay");
  let requests = [];
  let failFirst = false;
  const server = http.createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) {
      raw += chunk;
    }
    const body = JSON.parse(raw);
    requests.push(body);
    response.setHeader("Content-Type", "application/json");
    if (failFirst && requests.length === 1) {
      response.writeHead(400);
      response.end(JSON.stringify({ ok: false, error_code: 400, description: "Simulated send failure" }));
    } else {
      response.end(JSON.stringify({
        ok: true,
        result: { message_id: requests.length, chat: { id: 123 }, from: { username: "LocalFakeBot" } },
      }));
    }
  });
  await new Promise((resolve) => server.listen(3456, "127.0.0.1", resolve));
  const summaries = {};
  let n8n;
  try {
    n8n = await startLocalN8n();
    assert.equal(await command([
      "import:credentials", "--input=" + path.join(folder, "credentials.json"),
    ], "/tmp/import-credentials.log"), 0);
    for (const scenario of requested) {
      requests = [];
      failFirst = scenario === "deliveryFailure";
      assert.equal(await command([
        "import:workflow", "--input=" + path.join(folder, scenario + ".json"),
      ], "/tmp/import-workflow.log"), 0);
      for (const child of ["AeroScoutFlightQuery", "AeroScoutTelegramDelivery"]) {
        await n8n.publish(child);
      }
      process.stderr.write("Executando " + scenario + "\n");
      const logPath = "/tmp/run-" + scenario + ".log";
      const exitCode = await command([
        "execute", "--id=AeroScoutDaily20261017", "--rawOutput",
      ], logPath);
      const execution = executionFrom(fs.readFileSync(logPath, "utf8"));
      const result = execution.data.resultData;
      const failed = !!result.error;
      if (failed !== (scenario === "deliveryFailure")) {
        throw Error(JSON.stringify({ scenario, exitCode, error: result.error }));
      }
      const current = {
        failed,
        messages: structuredClone(requests),
        preview: outputItems(result, "Enviar listas"),
        reports: outputItems(result, "Buscar ofertas"),
        formatted: outputItems(result, "Montar listas"),
      };
      if (reference[scenario]) {
        assert.deepEqual(current.formatted, reference[scenario].messages,
          "Mensagens devem corresponder à referência compacta das mesmas ofertas");
      }
      if (scenario === "commandInvalid") {
        const replies = outputItems(result, "Enviar listas");
        assert.equal(current.reports.length, 0);
        assert.equal(current.messages.length, 0);
        assert.equal(replies.length, 1);
        assert.match(replies[0].text, /Data inválida/);
      } else if (scenario.startsWith("command") || scenario === "windowReplay") {
        assert.equal(current.messages.length, 0);
        assert.deepEqual(current.preview, current.formatted);
        assert.equal(current.reports.length, 4);
        assert.ok(current.reports.every(report => report.mode === "command" && report.status !== "failed"),
          JSON.stringify(current.reports.map(report => report.warnings)));
        assert.ok(current.reports.some(report => report.category === "nacionais" && report.offers.length));
        assert.ok(current.reports.some(report => report.category === "internacionais" && report.offers.length));
        const start = scenario === "commandLong" ? "2027-06-01" : "2027-05-14";
        const end = scenario === "commandLong" ? "2027-06-30" : "2027-05-20";
        assert.ok(current.reports.flatMap(report => report.offers)
          .every(offer => offer.departure >= start && offer.returnDate <= end));
      } else if (scenario === "preview") {
        assert.deepEqual(current.preview, current.formatted, "Prévia deve preservar as mensagens");
      } else {
        assert.deepEqual(current.messages.map((item) => item.text),
          current.formatted.map((item) => item.text), "Telegram deve manter conteúdo e ordem");
      }
      for (const category of ["nacionais", "internacionais"]) {
        const text = current.formatted.filter((item) => item.category === category)
          .map((item) => item.text).join("\n");
        const discounts = [...text.matchAll(/(\d+(?:,\d+)?)% abaixo da média/g)]
          .map((match) => Number(match[1].replace(",", ".")));
        assert.ok(discounts.every((value, index) => value > 0 &&
          (index === 0 || value <= discounts[index - 1])), "Descontos devem ser decrescentes");
        const destinations = [...text.matchAll(/\d+\. <b>(.*?)<\/b>/g)].map((match) => match[1]);
        assert.equal(destinations.length, new Set(destinations).size);
        assert.ok(destinations.length <= 10);
      }
      if (["preview", "send", "recovered", "deliveryFailure"].includes(scenario)) {
        const firstNational = current.formatted.find((item) => item.category === "nacionais");
        const firstInternational = current.formatted.find((item) => item.category === "internacionais");
        assert.match(firstNational.text, /1\. <b>Cuiabá<\/b>/);
        assert.match(firstNational.text, /44% abaixo da média/);
        assert.match(firstInternational.text, /1\. <b>Cidade do Panamá<\/b>, Panamá/);
        assert.match(firstInternational.text, /33% abaixo da média/);
      }
      const reports = current.reports;
      if (scenario === "empty") {
        assert.ok(reports.every((report) => report.status === "complete" && report.offers.length === 0),
          "Vazio válido deve concluir sem ofertas");
      } else if (scenario === "failed") {
        assert.ok(reports.every((report) => report.status === "failed"),
          "Falha total não pode ser apresentada como vazio");
      } else if (["partial", "timeout"].includes(scenario)) {
        assert.ok(reports.filter((report) => report.category === "nacionais")
          .every((report) => report.status === "failed"));
        assert.ok(reports.filter((report) => report.category === "internacionais")
          .every((report) => report.offers.length > 0), "Outra categoria deve continuar");
      } else if (scenario === "invalid") {
        const report = reports.find((item) => item.category === "nacionais" && item.origin === "GRU");
        assert.equal(report.status, "partial");
        assert.ok(report.offers.length > 0, "Cards válidos devem ser preservados");
        assert.ok(report.warnings.length > 0, "Card inválido exige aviso");
      }
      const attempts = current.reports.map(({ category, origin, attempt }) => ({
        category, origin, attempt,
      }));
      assert.equal(attempts.length, scenario === "commandInvalid" ? 0 : 4,
        "Comando inválido não deve consultar; buscas retornam quatro relatórios");
      for (const item of attempts) {
        const nationalFailure = ["partial", "timeout"].includes(scenario) && item.category === "nacionais";
        const expected = scenario === "recovered" || nationalFailure ? 3 : 1;
        assert.equal(item.attempt, expected);
      }
      if (scenario === "deliveryFailure") {
        assert.ok(current.messages.length > 1);
        assert.equal(current.messages.length, current.formatted.length,
          "Falha não deve impedir mensagens seguintes");
      }
      summaries[scenario] = {
        validated: true,
        failed: current.failed,
        messageCount: current.messages.length,
        attempts,
        messages: current.formatted,
        reports: reports.map(({category, origin, status, offers, warnings}) => ({
          category, origin, status, offerCount: offers.length, warningCount: warnings.length,
        })),
      };
      process.stderr.write("Validado: " + scenario + "\n");
    }
    console.log(JSON.stringify(summaries, null, 2));
  } finally {
    n8n?.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
