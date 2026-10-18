// Only disposable Docker: local simulated Telegram, native custom trigger and native Set.
const fs = require("node:fs");
const http = require("node:http");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { startLocalN8n } = require("./local_n8n.cjs");

function command(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("n8n", args, { stdio: ["ignore", "pipe", "pipe"], timeout: 90000 });
    let output = "";
    child.stdout.on("data", data => { output += data; });
    child.stderr.on("data", data => { output += data; });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(Error(output)));
  });
}
async function until(condition, label) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await condition()) { return; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw Error("Tempo esgotado: " + label);
}
async function main() {
  const { createWorkflows } = await import("../../scripts/workflow/definition.mjs");
  const fixtures = await import("./fixtures.mjs");
  const workflows = createWorkflows();
  const data = fixtures.fixtureData("/work");
  const receiver = workflows.main.nodes.find(node => node.name === "Receber comandos");
  receiver.parameters.allowedChatId = "123";
  receiver.credentials = { telegramApi: { id: "fakeTelegram", name: "Fake" } };
  workflows.delivery.nodes.find(node => node.type === "n8n-nodes-base.telegram")
    .credentials = structuredClone(receiver.credentials);
  const assignments = workflows.main.nodes.find(node => node.name === "Configuração")
    .parameters.assignments.assignments;
  assignments.find(item => item.name === "chatId").value = "123";
  workflows.main.nodes.find(node => node.type === "n8n-nodes-base.scheduleTrigger").disabled = true;
  fixtures.replaceCode(workflows.query.nodes.find(node => node.type === "n8n-nodes-base.httpRequest"),
    function ({ input }, { data }) {
      return input.all().map((item, index) => ({
        json: { statusCode: 200, body: data[
          (item.json.startDate === "2027-06-01" ? "commandLong" : "commandPreview") +
          "_" + item.json.category + "_" + item.json.origin] }, pairedItem: { item: index },
      }));
    }, { data });
  fs.writeFileSync("/tmp/workflows.json", JSON.stringify(Object.values(workflows)));
  fs.writeFileSync("/tmp/credential.json", JSON.stringify([{
    id: "fakeTelegram", name: "Fake", type: "telegramApi",
    data: { accessToken: "123:fake", baseUrl: "http://127.0.0.1:3456" },
  }]));
  let updates = [];
  let sends = 0;
  const offsets = [];
  const server = http.createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) { raw += chunk; }
    const body = raw ? JSON.parse(raw) : {};
    let result;
    if (request.url.endsWith("/getMe")) {
      result = { id: 123, username: "DetectiveFlightBot" };
    } else if (request.url.endsWith("/getWebhookInfo")) {
      result = { url: "" };
    } else if (request.url.endsWith("/getUpdates")) {
      offsets.push(body.offset);
      result = updates.filter(update => update.update_id >= body.offset);
    } else { sends += 1; result = {}; }
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ ok: true, result }));
  });
  await new Promise(resolve => server.listen(3456, "127.0.0.1", resolve));
  let n8n;
  try {
    n8n = await startLocalN8n();
    assert.ok(fs.existsSync("/home/node/.n8n/custom/aero-scout/TelegramPollingTrigger.node.js"));
    console.error("Etapa: importar credencial");
    await command(["import:credentials", "--input=/tmp/credential.json"]);
    console.error("Etapa: importar workflows");
    await command(["import:workflow", "--input=/tmp/workflows.json"]);
    console.error("Etapa: publicar consulta");
    await n8n.publish(workflows.query.id);
    console.error("Etapa: publicar envio");
    await n8n.publish(workflows.delivery.id);
    console.error("Etapa: publicar principal");
    await n8n.publish(workflows.main.id);
    await until(() => fs.existsSync("/home/node/.n8n/aero-scout/bot-123.json"), "ativação do receptor");
    const timestamp = Math.floor(Date.now() / 1000);
    const update = (id, text, date = timestamp, chatId = 123) => ({ update_id: id,
      message: { message_id: id, chat: { id: chatId }, date, text } });
    updates = [update(1, "/start", 0), update(2, "/start", timestamp, 456),
      update(3, "/ofertas Brasil 14/05/27 - 20/05/27"),
      update(4, "/ofertas@DetectiveFlightBot BR 01/06/27 - 30/06/27")];
    let executions;
    const list = async () => {
      const result = await n8n.request("/rest/executions?filter=" +
        encodeURIComponent(JSON.stringify({ workflowId: workflows.main.id })));
      return result.results;
    };
    await until(async () => {
      executions = await list();
      return executions.length === 2 && executions.every(item => item.status === "success");
    }, "duas execuções por comando");
    const windows = [];
    for (const execution of executions) {
      const detail = await n8n.request("/rest/executions/" + execution.id + "?includeData=true");
      // n8n's REST endpoint serializes execution data with its bundled flatted codec.
      const executionData = typeof detail.data === "string"
        ? require("/usr/local/lib/node_modules/n8n/node_modules/flatted").parse(detail.data)
        : detail.data;
      const runs = executionData.resultData.runData;
      windows.push(runs["Interpretar pedido"][0].data.main[0][0].json.startDate);
      assert.equal(runs["Buscar ofertas"][0].data.main[0].length, 4);
    }
    assert.deepEqual(windows.sort(), ["2027-05-14", "2027-06-01"]);
    await n8n.request("/rest/workflows/" + workflows.main.id + "/deactivate", "POST", {});
    console.error("Etapa: publicar principal");
    await n8n.publish(workflows.main.id);
    await new Promise(resolve => setTimeout(resolve, 17000));
    assert.equal((await list()).length, 2);
    assert.equal(sends, 0);
    console.log(JSON.stringify({ customNodeLoaded: true, commands: 2, executions: 2,
      restartDidNotReplay: true, realSends: 0, offsets }));
  } catch (error) {
    console.error(fs.existsSync("/tmp/n8n-server.log")
      ? fs.readFileSync("/tmp/n8n-server.log", "utf8").slice(-4000) : "Sem log do servidor");
    throw error;
  } finally { n8n?.close(); server.close(); }
}
main().catch(error => { console.error(String(error.stack)); console.error(error.cause); process.exitCode = 1; });
