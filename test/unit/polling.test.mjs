import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";

// Load the real receiver with only its I/O boundaries replaced. No real disk writes or timers.
function harness({ updates = [], failure, writeFailure = false } = {}) {
  const storage = new Map();
  let tick;
  let now = 2000000;
  let getUpdates = 0;
  const emitted = [], errors = [], warnings = [];
  const fs = {
    mkdir: async () => {},
    readFile: async path => {
      if (!storage.has(path)) { throw Object.assign(Error("missing"), { code: "ENOENT" }); }
      return storage.get(path);
    },
    open: async path => ({ writeFile: async data => {
      if (writeFailure && getUpdates > 0) { throw Error("disk full"); }
      storage.set(path, data);
    }, sync: async () => {}, close: async () => {} }),
    rename: async (from, to) => { storage.set(to, storage.get(from)); storage.delete(from); },
    unlink: async path => { storage.delete(path); },
  };
  const module = { exports: {} };
  runInNewContext(readFileSync(new URL("../../src/custom/telegram_poller.cjs", import.meta.url), "utf8"), {
    module, require: name => {
      if (name === "node:fs/promises") { return fs; }
      if (name === "node:path") { return { join: (...parts) => parts.join("/") }; }
      if (name === "node:crypto") { return { randomUUID: () => "temporary" }; }
      throw Error("Unexpected dependency: " + name);
    },
    setInterval: callback => { tick = callback; return 1; }, clearInterval: () => {},
  });
  const options = { chatId: "123", stateDirectory: "/fake", now: () => now,
    emit: value => emitted.push(JSON.parse(JSON.stringify(value))), emitError: error => errors.push(error),
    warn: value => warnings.push(value), api: async method => {
      if (method === "getMe") { return { id: 42, username: "MyBot" }; }
      if (method === "getWebhookInfo") { return { url: "" }; }
      getUpdates += 1;
      if (failure) { throw failure; }
      return structuredClone(updates);
    } };
  return { start: async overrides => {
    const receiver = await module.exports.startReceiver({ ...options, ...overrides });
    await new Promise(setImmediate);
    return receiver;
  },
    emitted, errors, warnings, tick: async () => { tick(); await new Promise(setImmediate); }, advance: ms => { now += ms; },
    calls: () => getUpdates };
}

const update = (id, text = "/start", chatId = 123, date = 2000) => ({ update_id: id,
  message: { message_id: id, text, chat: { id: chatId }, date } });

test("polling emite somente comandos novos do chat e bot autorizados, em ordem", async () => {
  const h = harness({ updates: [update(7, "/ajuda@MyBot"), update(1, "/start", 123, 1999),
    update(2, "/start", 456), update(3, "olá"), update(4, "/start@OutroBot"),
    update(6), update(6)] });
  const receiver = await h.start();
  await receiver.close();
  assert.deepEqual(h.emitted.map(value => value.updateId), [6, 7]);
  assert.equal(h.emitted[0].requestChatId, "123");
  assert.equal(h.emitted[0].mode, "telegram");
});

test("reinício não repete comando cujo cursor já foi persistido", async () => {
  const h = harness({ updates: [update(1)] });
  const first = await h.start();
  await first.close();
  const second = await h.start();
  await second.close();
  assert.deepEqual(h.emitted.map(value => value.updateId), [1]);
});

test("falha de despacho não repete comando após reinício", async () => {
  const h = harness({ updates: [update(1)] });
  const first = await h.start({ emit: () => { throw Error("dispatch"); } });
  await first.close();
  const second = await h.start();
  await second.close();
  assert.deepEqual(h.emitted, []);
  assert.ok(h.warnings.some(value => /não será repetido/.test(value)));
});

test("falha ao persistir impede despacho e comunica o problema", async () => {
  const h = harness({ updates: [update(1)], writeFailure: true });
  const receiver = await h.start();
  await receiver.close();
  assert.deepEqual(h.emitted, []);
  assert.match(h.errors[0].message, /persistir o cursor/);
});

test("webhook existente impede início e não é removido", async () => {
  const methods = [];
  const h = harness();
  await assert.rejects(h.start({ api: async method => {
    methods.push(method);
    return method === "getMe" ? { id: 42 } : { url: "https://example.test/webhook" };
  } }), /Webhook existente/);
  assert.deepEqual(methods, ["getMe", "getWebhookInfo"]);
});

test("conflito ou credencial recusada interrompem consultas sem vazar o erro original", async () => {
  for (const statusCode of [401, 409]) {
    const h = harness({ failure: Object.assign(Error("token secreto"), { statusCode }) });
    const receiver = await h.start();
    await receiver.close();
    assert.match(h.errors[0].message, statusCode === 401 ? /Credencial/ : /Conflito/);
    assert.doesNotMatch(h.errors[0].message, /secreto/);
    assert.equal(h.calls(), 1);
  }
});

test("erro transitório respeita retry_after e volta a consultar após o prazo", async () => {
  const h = harness({ failure: Object.assign(Error("limite"), { statusCode: 429, retryAfter: 30 }) });
  const receiver = await h.start();
  try {
    assert.equal(h.calls(), 1);
    h.advance(29000);
    await h.tick();
    assert.equal(h.calls(), 1);
    h.advance(1000);
    await h.tick();
    assert.equal(h.calls(), 2);
    assert.deepEqual(h.errors, []);
    assert.ok(h.warnings.length > 0);
  } finally { await receiver.close(); }
});

test("segundo receptor do mesmo bot é recusado e fechar libera novo início", async () => {
  const h = harness();
  const receiver = await h.start();
  try { await assert.rejects(h.start(), /Já existe/); }
  finally { await receiver.close(); }
  const restarted = await h.start();
  await restarted.close();
});

const require = createRequire(import.meta.url);
const { TelegramPollingTrigger } = require("../../src/custom/TelegramPollingTrigger.node.js");

test("trigger rejeita chat inválido antes de consultar o Telegram", async () => {
  await assert.rejects(new TelegramPollingTrigger().trigger.call({
    getCredentials: async () => ({ accessToken: "fake" }), getNodeParameter: () => "inválido",
    helpers: { httpRequest: () => assert.fail("não deve consultar") },
  }), /chat autorizado/);
});

test("trigger não expõe token, URL ou causa ao falhar a comunicação", async () => {
  const secret = "token-fictício-sensível";
  await assert.rejects(new TelegramPollingTrigger().trigger.call({
    getCredentials: async () => ({ accessToken: secret }), getNodeParameter: () => "123",
    helpers: { httpRequest: async () => { throw Error("https://example.test/bot" + secret); } },
  }), error => {
    assert.match(error.message, /Falha de comunicação Telegram/);
    assert.equal(error.cause, undefined);
    assert.ok(!String(error.stack).includes(secret));
    return true;
  });
});
