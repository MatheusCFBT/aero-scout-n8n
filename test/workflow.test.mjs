import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import { createHash } from "node:crypto";
import { createWorkflow, createWorkflows } from "../scripts/workflow/definition.mjs";
import { assembleProbe } from "../scripts/workflow/probe_assembler.mjs";

function reference(name) {
  return JSON.parse(readFileSync(new URL("./reference/" + name + ".json", import.meta.url)));
}

function plainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

async function runCodeNode(name, items, select) {
  const workflow = createWorkflow();
  const source = workflow.nodes.find((node) => node.name === name).parameters.jsCode;
  const compiled = new Script("(async function($input, $, $now) {\n" + source + "\n})");
  // No require/import/module or filesystem API is provided to the generated Code node.
  const execute = compiled.runInNewContext({ Buffer });
  const result = await execute({ all: () => items }, select, {});
  return plainObject(result);
}

test("principal tem nove nodes e reutiliza os dois subworkflows", () => {
  const { main, query, delivery } = createWorkflows();
  assert.equal(main.nodes.length, 9);
  assert.equal(query.nodes.length, 10);
  assert.equal(delivery.nodes.length, 4);
  assert.ok(!Object.hasOwn(query.connections, "Configuração"));
  const calls = main.nodes.filter((node) => node.type === "n8n-nodes-base.executeWorkflow");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].parameters.workflowId.value, query.id);
  assert.equal(calls[0].parameters.mode, "each");
  assert.equal(calls[1].parameters.workflowId.value, delivery.id);
  assert.equal(calls[1].parameters.mode, "once");
  assert.ok(calls.every((node) => node.parameters.options.waitForSubWorkflow));
  const schedule = main.nodes.find((node) => node.name === "Todos os dias às 22h");
  assert.equal(schedule.parameters.rule.interval[0].expression, "0 22 * * *");
  assert.equal(main.settings.timezone, "America/Sao_Paulo");
});

test("Code nodes de consulta funcionam sem módulos externos e preservam as quatro URLs", async () => {
  const configuration = { searchedAt: "2026-10-17T14:00:00Z", today: "2026-10-17" };
  const select = () => ({ first: () => ({ json: configuration }) });
  const items = await runCodeNode("Preparar consultas", [], select);
  const output = items.map(({ json }) => ({
    category: json.category,
    origin: json.origin,
    url: json.url,
  }));
  assert.deepEqual(output, reference("queries"));
});

test("Montar listas usa maior desconto e mantém categorias separadas", async () => {
  const previous = reference("workflow_results").preview.results;
  const national = previous["Resumo nacionais"][0];
  const international = previous["Resumo internacionais"][0];
  const addDiscount = (offer, discountPercent) => ({
    ...offer, discountPercent, referencePriceCents: null,
  });
  const reports = [
    {...national, offers: [addDiscount(national.offers[0], 10), addDiscount(national.offers[1], 50)]},
    {...international, offers: [addDiscount(international.offers[0], 25)]},
  ];
  const configuration = { chatId: "", dryRun: true };
  const select = () => ({ first: () => ({ json: configuration }) });
  const result = await runCodeNode("Montar listas", reports.map((json) => ({json})), select);
  assert.deepEqual(result.map((item) => item.json.category), ["nacionais", "internacionais"]);
  const text = result[0].json.text;
  assert.ok(text.indexOf("50% abaixo") < text.indexOf("10% abaixo"));
  assert.match(text, /Maiores descontos percentuais/);
});

test("probe gerado é autossuficiente e mantém os pedidos e o formato da saída", async () => {
  const requestedUrls = [];
  const output = [];
  const fetch = async (url) => {
    requestedUrls.push(url);
    return { status: 200, text: async () => "fixture" };
  };
  const runtime = {
    Buffer,
    AbortSignal,
    fetch,
    process: { exitCode: 0 },
    console: { log: (line) => output.push(line), error: assert.fail },
  };
  await new Script(assembleProbe()).runInNewContext(runtime);
  const results = JSON.parse(output[0]);

  assert.deepEqual(requestedUrls, reference("queries").map((query) => query.url));
  assert.equal(results.length, 4);
  assert.ok(results.every((result) => result.statusCode === 200 && result.attempt === 1));
  assert.ok(results.every((result) => result.html === "fixture"));
});

test("migração preserva configuração e move só a referência da credencial Telegram", async () => {
  const { prepareWorkflowUpdate } = await import("../scripts/workflow/update.mjs");
  const generated = createWorkflows();
  const installed = reference("workflow_shape");
  installed.id = "existing-workflow";
  installed.active = true;
  installed.settings.customSetting = "preserve";
  const configuration = installed.nodes.find((node) => node.name === "Configuração");
  configuration.parameters.jsCode = "return [{json:{chatId:'test-chat',dryRun:false}}];";
  const telegram = installed.nodes.find((node) => node.name === "Telegram");
  telegram.credentials = { telegramApi: { id: "test-credential", name: "Existing" } };
  const before = structuredClone(installed);

  const updated = prepareWorkflowUpdate(installed, generated);
  assert.equal(updated.main.id, installed.id);
  assert.equal(updated.main.active, true);
  assert.deepEqual(updated.main.settings, installed.settings);
  assert.deepEqual(updated.main.connections, generated.main.connections);
  const assignments = updated.main.nodes.find((node) => node.name === "Configuração")
    .parameters.assignments.assignments;
  assert.equal(assignments.find((item) => item.name === "chatId").value, "test-chat");
  assert.equal(assignments.find((item) => item.name === "dryRun").value, false);
  assert.deepEqual(updated.main.nodes.find((node) => node.name === "Receber comandos").credentials,
    telegram.credentials);
  const migratedTelegram = updated.delivery.nodes.find((node) => node.name === "Telegram");
  assert.deepEqual(migratedTelegram.credentials, telegram.credentials);
  assert.deepEqual(migratedTelegram.parameters, telegram.parameters);
  assert.deepEqual(installed, before, "não deve modificar o backup recebido");
});

test("subworkflow de consulta retorna ofertas sem aplicar o limite de dez", async () => {
  const { query } = createWorkflows();
  const source = query.nodes.find((node) => node.name === "Retornar ofertas").parameters.jsCode;
  const execute = new Script("(async function($input, $, $now) {\n" + source + "\n})")
    .runInNewContext({ Buffer });
  const { card, context } = await import("./helpers/examples.mjs");
  const metadata = { ...context, status: "complete", warnings: [], attempt: 1 };
  const input = Array.from({ length: 12 }, (_, index) => ({
    json: card({ destination: "Destino " + index }),
  }));
  const select = () => ({ itemMatching: () => ({ json: { meta: metadata, hasCard: true } }) });
  const result = plainObject(await execute({ all: () => input }, select, {}));
  assert.equal(result.length, 1);
  assert.equal(result[0].json.offers.length, 12);
  assert.ok(!Object.hasOwn(result[0].json, "data"), "não deve retornar o HTML original");
});

test("fontes preservadas, exceto alterações autorizadas para desconto", () => {
  const files = reference("business_hashes");
  const approvedChanges = {
    ...reference("discount_business_hashes"), ...reference("command_business_hashes"),
  };
  for (const file of files) {
    const contents = readFileSync(new URL("../" + file.path, import.meta.url));
    assert.equal(createHash("sha256").update(contents).digest("hex"), approvedChanges[file.path] || file.sha256, file.path);
  }
});
