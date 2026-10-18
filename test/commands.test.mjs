import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { createModules } from "../src/modules.mjs";
const require = createRequire(import.meta.url);
const { startReceiver } = require("../src/custom/telegram_poller.cjs");
const { commands, queries, protocol, offerParser, pageInspector, messages } = createModules();
const configuration = {
  mode: "telegram", chatId: "123", requestChatId: "123", today: "2026-10-18",
  searchedAt: "2026-10-18T15:00:00Z", dryRun: true, updateId: 1,
};
const parse = (text) => commands.parse({ ...configuration, text });

test("comandos sucessivos usam datas próprias, BR e sufixo do bot", () => {
  const first = parse("/ofertas Brasil 14/05/27 - 20/05/27");
  const second = parse("/ofertas@DetectiveFlightBot BR 01/06/27 - 30/06/27");
  assert.equal(first.startDate, "2027-05-14");
  assert.equal(first.maximumTripDays, 6);
  assert.equal(second.startDate, "2027-06-01");
  assert.equal(second.maximumTripDays, 29);
  assert.notEqual(queries.makeQuery("nacionais", "GRU", first),
    queries.makeQuery("nacionais", "GRU", second));
});

test("ajuda, país não suportado, calendário inválido, passado e janela invertida", () => {
  for (const command of ["/start", "/ajuda", "/ofertas USA 14/05/27 - 20/05/27",
    "/ofertas BR 29/02/27 - 03/03/27", "/ofertas BR 31/04/27 - 03/05/27",
    "/ofertas BR 17/10/26 - 20/10/26", "/ofertas BR 20/05/27 - 20/05/27",
    "/ofertas BR 21/05/27 - 20/05/27"]) {
    assert.equal(parse(command).action, "reply", command);
  }
});

test("ano bissexto, virada de ano, um dia e janela superior a 14 dias", () => {
  for (const [command, days] of [["28/02/28 - 01/03/28", 2],
    ["31/12/27 - 01/01/28", 1], ["01/06/27 - 30/06/27", 29]]) {
    const result = parse("/ofertas BR " + command);
    assert.equal(result.action, "search");
    assert.equal(result.maximumTripDays, days);
  }
});

test("outro chat, outro bot e texto comum são ignorados; diário mantém modo", () => {
  assert.equal(commands.parse({ ...configuration, requestChatId: "456", text: "/start" }), null);
  assert.equal(parse("/ofertas@OutroBot BR 14/05/27 - 20/05/27"), null);
  assert.equal(parse("oi"), null);
  assert.equal(commands.parse({ today: configuration.today }).mode, "daily");
});

test("URL codifica intervalo de partidas e duração sem substituir destinos", () => {
  const context = parse("/ofertas BR 01/06/27 - 30/06/27");
  const url = new URL(queries.makeQuery("internacionais", "CGH", context));
  const fields = protocol.fields(Buffer.from(url.searchParams.get("tfs"), "base64url"));
  const window = protocol.fields(protocol.fields(fields.find(f => f.key === 218).data)[0].data);
  const range = protocol.fields(window.find(f => f.key === 18).data);
  assert.deepEqual(range.map(f => f.data.toString()), ["2027-06-01", "2027-06-29"]);
  const duration = protocol.fields(window.find(f => f.key === 42).data);
  assert.deepEqual(duration.map(f => [...f.raw]), [[8, 1], [16, 29]]);
});

test("fonte que ignora janela falha em vez de informar pesquisa vazia", () => {
  const context = { ...parse("/ofertas BR 14/05/27 - 20/05/27"),
    origin: "GRU", category: "nacionais", statusCode: 200 };
  const raw = {
    headings: "0 ofertas saindo de GRU para uma viagem de 1–6 dia com ida entre 14 de mai. e 19 de mai.",
    bodyText: "Nenhuma oferta encontrada para sua pesquisa", cards: [], originLabel: "GRU",
    tripType: "Ida e volta", cabin: "Econômica", passengers: "1 passageiro", currency: "BRL",
  };
  assert.equal(pageInspector.inspectPage(raw, context).status, "complete");
  assert.equal(pageInspector.inspectPage({ ...raw,
    headings: "0 ofertas saindo de GRU nos próximos 6 meses" }, context).status, "failed");
  assert.equal(pageInspector.inspectPage({ ...raw,
    headings: raw.headings.replace("com ida entre", "comidaentre") }, context).status, "complete");
});

test("mensagens mostram janela e aeroportos, sem horizonte diário", () => {
  const context = parse("/ofertas BR 01/06/27 - 30/06/27");
  const result = messages.formatReports([{ ...context, category: "nacionais",
    status: "complete", offers: [], warnings: [] }])[0];
  assert.match(result.text, /01\/06\/2027 a 30\/06\/2027/);
  assert.match(result.text, /GRU e CGH/);
  assert.match(result.text, /1–29 dias/);
  assert.doesNotMatch(result.text, /Horizonte não confirmado/);
});

async function harness(overrides = {}) {
  const directory = await mkdtemp(tmpdir() + "/aero-receiver-test-");
  const emitted = [];
  const errors = [];
  let updates = [];
  const api = async (method) => method === "getMe"
    ? { id: 42, username: "DetectiveFlightBot" }
    : method === "getWebhookInfo" ? { url: "" } : updates;
  const options = { api, emit: value => emitted.push(value), emitError: error => errors.push(error),
    warn: () => {}, chatId: "123", stateDirectory: directory, now: () => 2000000, ...overrides };
  return { options, emitted, errors, setUpdates: value => { updates = value; },
    cleanup: () => rm(directory, { recursive: true, force: true }) };
}
const settled = () => new Promise(resolve => setTimeout(resolve, 80));
const update = (id, extra = {}) => ({ update_id: id,
  message: { date: 2000, chat: { id: 123 }, text: "/start", message_id: id, ...extra } });

test("receptor ignora histórico e outro chat e não repete após reinício", async () => {
  const h = await harness();
  h.setUpdates([update(1, { date: 1999 }), update(2, { chat: { id: 456 } }), update(3), update(4), update(4)]);
  let receiver;
  try {
    receiver = await startReceiver(h.options);
    await settled();
    await receiver.close();
    assert.deepEqual(h.emitted.map(x => x.updateId), [3, 4]);
    assert.equal(JSON.parse(await readFile(h.options.stateDirectory + "/bot-42.json")).lastUpdateId, 4);
    receiver = await startReceiver(h.options);
    await settled();
    assert.equal(h.emitted.length, 2);
  } finally { await receiver?.close(); await h.cleanup(); }
});

test("receptor impede duplicado e detecta webhook sem removê-lo", async () => {
  const h = await harness();
  let receiver;
  try {
    receiver = await startReceiver(h.options);
    await assert.rejects(startReceiver(h.options), /Já existe/);
    await receiver.close();
    await assert.rejects(startReceiver({ ...h.options, api: async method =>
      method === "getMe" ? { id: 42 } : { url: "https://example.test" } }), /Webhook existente/);
  } finally { await receiver?.close(); await h.cleanup(); }
});

test("conflito 409 interrompe receptor sem expor requisição", async () => {
  const h = await harness();
  let receiver;
  const api = async method => {
    if (method === "getMe") { return { id: 42 }; }
    if (method === "getWebhookInfo") { return { url: "" }; }
    throw Object.assign(Error("secret-url"), { statusCode: 409 });
  };
  try {
    receiver = await startReceiver({ ...h.options, api });
    await settled();
    assert.match(h.errors[0].message, /Conflito/);
    assert.doesNotMatch(h.errors[0].message, /secret/);
  } finally { await receiver?.close(); await h.cleanup(); }
});

test("falha de despacho não repete comando aceito após reinício", async () => {
  const h = await harness();
  h.setUpdates([update(1)]);
  let receiver;
  try {
    receiver = await startReceiver({ ...h.options, emit: () => { throw Error("dispatch"); } });
    await settled();
    await receiver.close();
    receiver = await startReceiver(h.options);
    await settled();
    assert.equal(h.emitted.length, 0);
  } finally { await receiver?.close(); await h.cleanup(); }
});

test("falha transitória de comunicação não vira conflito", async () => {
  const h = await harness();
  let receiver;
  const api = async method => {
    if (method === "getMe") { return { id: 42 }; }
    if (method === "getWebhookInfo") { return { url: "" }; }
    throw Object.assign(Error("network"), { statusCode: 429, retryAfter: 30 });
  };
  try {
    receiver = await startReceiver({ ...h.options, api });
    await settled();
    assert.equal(h.errors.length, 0);
  } finally { await receiver?.close(); await h.cleanup(); }
});

test("cards aceitam um dia e mais de 14 dias, rejeitando retorno fora da janela", async () => {
  const { card, flightLink } = await import("./helpers/examples.mjs");
  const context = { ...parse("/ofertas BR 01/06/27 - 30/06/27"),
    category: "nacionais", origin: "GRU" };
  for (const [start, end] of [["2027-06-01", "2027-06-02"], ["2027-06-01", "2027-06-30"]]) {
    assert.ok(offerParser.parseOffer(card({ link: flightLink(start, end) }), context));
  }
  for (const [start, end] of [["2027-05-31", "2027-06-02"],
    ["2027-06-01", "2027-07-01"], ["2027-06-01", "2027-06-01"]]) {
    assert.throws(() => offerParser.parseOffer(card({ link: flightLink(start, end) }), context), /janela/);
  }
});

test("node local não propaga token, URL nem causa de erro HTTP", async () => {
  const { TelegramPollingTrigger } = require("../src/custom/TelegramPollingTrigger.node.js");
  const node = new TelegramPollingTrigger();
  const secret = "only-a-test-secret";
  const context = {
    getCredentials: async () => ({ accessToken: secret }),
    getNodeParameter: () => "123",
    helpers: { httpRequest: async () => { throw Error("https://example.test/bot" + secret); } },
  };
  await assert.rejects(node.trigger.call(context), error => {
    assert.equal(error.message, "Falha de comunicação Telegram");
    assert.equal(error.cause, undefined);
    assert.ok(!String(error.stack).includes(secret));
    return true;
  });
});
