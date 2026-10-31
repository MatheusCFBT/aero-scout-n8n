import { test } from "node:test";
import assert from "node:assert/strict";
import { execute as start } from "../../src/n8n/start_attempt.mjs";
import { execute as read } from "../../src/n8n/read_response.mjs";
import { execute as split } from "../../src/n8n/split_cards.mjs";
import { execute as collect } from "../../src/n8n/collect_offers.mjs";
import { execute as configure } from "../../src/n8n/configuration.mjs";
import { execute as prepare } from "../../src/n8n/prepare_search.mjs";
import { execute as format } from "../../src/n8n/format_messages.mjs";
import { execute as verify } from "../../src/n8n/verify_delivery.mjs";

const input = values => ({ all: () => values.map(json => ({ json })) });
const node = values => ({ itemMatching: index => ({ json: values[index] }) });

test("tentativa inicia em um, incrementa por consulta e descarta resposta anterior", () => {
  const queries = [{ url: "consulta A", origin: "GRU", startDate: "2027-01-01", attempt: 2,
    data: "<html>anterior</html>", statusCode: 503, error: "timeout" }, { url: "consulta B" }];
  const before = structuredClone(queries);
  assert.deepEqual(start({ input: input(queries) }), [
    { json: { url: "consulta A", origin: "GRU", startDate: "2027-01-01", attempt: 3 }, pairedItem: { item: 0 } },
    { json: { url: "consulta B", attempt: 1 }, pairedItem: { item: 1 } },
  ]);
  assert.deepEqual(queries, before);
});

test("leitura mantém o contexto de cada resposta e não vaza detalhes de erro HTTP", () => {
  const output = read({ input: input([{ body: "página A", statusCode: 200 },
    { data: "página B", error: { message: "token secreto" } }, { body: { invalid: true } }]),
    nodes: { attempt: node([{ origin: "GRU" }, { origin: "CGH" }, { origin: "GRU" }]) } });
  assert.deepEqual(output.map(item => item.json), [
    { origin: "GRU", statusCode: 200, error: null, data: "página A" },
    { origin: "CGH", statusCode: 0, error: "Falha HTTP", data: "página B" },
    { origin: "GRU", statusCode: 0, error: null, data: "" },
  ]);
  assert.deepEqual(output.map(item => item.pairedItem.item), [0, 1, 2]);
});

test("separar cards transporta somente cada card, mantendo avisos e associação", () => {
  const context = { origin: "GRU", attempt: 2, data: "<html>PÁGINA COMPLETA</html>" };
  const before = structuredClone(context);
  const output = split({ input: input([{}]), nodes: { response: node([context]) } }, {
    pageInspector: { inspectPage: (_page, received) => {
      assert.equal(Object.hasOwn(received, "data"), false);
      return { ...received, cards: ["card A", "card B"], status: "partial", warnings: ["cobertura"] };
    } },
  });
  assert.deepEqual(output.map(item => item.json.data), ["card A", "card B"]);
  for (const item of output) {
    assert.equal(item.json.hasCard, true);
    assert.equal(item.json.meta.origin, "GRU");
    assert.deepEqual(item.json.meta.warnings, ["cobertura"]);
    assert.equal(Object.hasOwn(item.json.meta, "cards"), false);
    assert.equal(Object.hasOwn(item.json.meta, "data"), false);
    assert.equal(item.pairedItem.item, 0);
  }
  assert.deepEqual(context, before);
});

for (const status of ["complete", "failed"]) {
  test("consulta sem cards mantém sentinela e status " + status, () => {
    const output = split({ input: input([{}]), nodes: { response: node([{ origin: "GRU", data: "página" }]) } },
      { pageInspector: { inspectPage: () => ({ cards: [], status, warnings: status === "failed" ? ["falha"] : [] }) } });
    assert.equal(output.length, 1);
    assert.equal(output[0].json.hasCard, false);
    assert.equal(output[0].json.data, "");
    assert.equal(output[0].json.meta.status, status);
    assert.deepEqual(output[0].json.meta.warnings, status === "failed" ? ["falha"] : []);
  });
}

test("coleta conserva ofertas válidas, ignora descartadas e registra card inválido", () => {
  const metadata = { origin: "GRU", category: "nacionais", status: "complete", attempt: 2,
    warnings: ["aviso original"], data: "não retornar" };
  const before = structuredClone(metadata);
  const output = collect({ input: input(["válido", "ignorado", "inválido"]),
    nodes: { cards: node(Array(3).fill({ meta: metadata, hasCard: true })) } },
    { offerParser: { parseOffer: value => {
      if (value === "inválido") { throw Error("preço inválido"); }
      return value === "ignorado" ? null : { destination: "Recife" };
    } } });
  assert.equal(output.length, 1);
  assert.deepEqual(output[0].json.offers, [{ destination: "Recife" }]);
  assert.equal(output[0].json.status, "partial");
  assert.deepEqual(output[0].json.warnings, ["aviso original", "GRU: preço inválido"]);
  assert.equal(Object.hasOwn(output[0].json, "data"), false);
  assert.deepEqual(metadata, before);
});

test("coleta de sentinela preserva falha e avisos sem tentar interpretar um card", () => {
  const result = collect({ input: input([{}]), nodes: { cards: node([
    { hasCard: false, meta: { origin: "GRU", status: "failed", warnings: ["timeout"] } },
  ]) } }, { offerParser: { parseOffer: () => assert.fail("sentinela não é oferta") } });
  assert.equal(result[0].json.status, "failed");
  assert.deepEqual(result[0].json.offers, []);
  assert.deepEqual(result[0].json.warnings, ["timeout"]);
});

test("configuração não emite item para comandos ignorados", () => {
  assert.deepEqual(configure({ input: input(["ignorar", "aceitar"]) },
    { commands: { parse: value => value === "ignorar" ? null : { action: "reply" } } }),
    [{ json: { action: "reply" } }]);
});

test("preparação gera uma consulta por categoria e origem preservando o pedido", () => {
  const config = { startDate: "2027-01-01", dryRun: true };
  const result = prepare({ nodes: { configuration: { first: () => ({ json: config }) } } }, {
    settings: { categories: ["nacionais", "internacionais"], origins: ["GRU", "CGH"] },
    queries: { makeQuery: (category, origin, received) => {
      assert.equal(received.startDate, "2027-01-01");
      return category + "/" + origin;
    } },
  });
  assert.deepEqual(result.map(item => item.json.url), ["nacionais/GRU", "nacionais/CGH", "internacionais/GRU", "internacionais/CGH"]);
  assert.ok(result.every(item => item.json.dryRun === true));
});

test("formatação rejeita chat inválido para envio e permite simulação sem chat", () => {
  const deps = { settings: { categories: ["nacionais"] },
    reports: { summarize: values => ({ category: values[0].category }) },
    messages: { formatReports: () => [{ text: "mensagem", category: "nacionais" }] } };
  const context = (dryRun, chatId) => ({ input: input([{ category: "nacionais" }]),
    nodes: { configuration: { first: () => ({ json: { dryRun, chatId } }) } } });
  assert.throws(() => format(context(false, "inválido"), deps), /chat ID/);
  assert.deepEqual(format(context(true, ""), deps), [{ json: {
    text: "mensagem", category: "nacionais", dryRun: true, chatId: "",
  } }]);
  assert.equal(format(context(false, "-123"), deps)[0].json.chatId, "-123");
});

test("verificação confirma entregas e falha se qualquer mensagem não foi entregue", () => {
  const nodes = { messages: node([{ category: "nacionais" }, { category: "internacionais" }]) };
  const result = verify({ input: input([{}, {}]), nodes });
  assert.deepEqual(result.map(item => item.json), [
    { category: "nacionais", sent: true, error: null },
    { category: "internacionais", sent: true, error: null },
  ]);
  assert.throws(() => verify({ input: input([{}, { error: "segredo" }]), nodes }), /não foram entregues/);
});
