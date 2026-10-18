const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const receivers = new Set();

/** Commit accepted updates before dispatch: failed commands are never automatically replayed. */
async function startReceiver({ api, emit, emitError, warn, chatId, stateDirectory,
  intervalSeconds = 15, now = Date.now }) {
  const bot = await api("getMe", {});
  const botId = String(bot.id);
  if (!/^\d+$/.test(botId)) {
    throw Error("Identidade do bot inválida");
  }
  if (receivers.has(botId)) {
    throw Error("Já existe um receptor local para este bot");
  }
  receivers.add(botId);
  let timer;
  let closed = false;
  let running;
  let retryAt = 0;
  try {
    const webhook = await api("getWebhookInfo", {});
    if (webhook.url) {
      throw Error("Webhook existente: receptor local não iniciado");
    }
    await fs.mkdir(stateDirectory, { recursive: true, mode: 0o700 });
    const file = path.join(stateDirectory, "bot-" + botId + ".json");
    async function save(value) {
      const temporary = file + "." + crypto.randomUUID() + ".tmp";
      try {
        const handle = await fs.open(temporary, "wx", 0o600);
        try {
          await handle.writeFile(JSON.stringify(value));
          await handle.sync();
        } finally {
          await handle.close();
        }
        await fs.rename(temporary, file);
      } finally {
        await fs.unlink(temporary).catch(() => {});
      }
    }
    let state;
    try {
      state = JSON.parse(await fs.readFile(file, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw Error("Estado do receptor inválido; início interrompido");
      }
      state = { lastUpdateId: -1, activatedAt: Math.floor(now() / 1000) };
      await save(state);
    }
    if (!Number.isSafeInteger(state.lastUpdateId) || state.lastUpdateId < -1 ||
        !Number.isSafeInteger(state.activatedAt)) {
      throw Error("Estado do receptor inválido");
    }
    function stop(error) {
      closed = true;
      clearInterval(timer);
      if (error) {
        emitError(error);
      }
    }
    async function poll() {
      if (closed || now() < retryAt) {
        return;
      }
      let updates;
      try {
        updates = await api("getUpdates", {
          offset: state.lastUpdateId + 1, limit: 100, timeout: 0, allowed_updates: ["message"],
        });
      } catch (error) {
        if ([401, 409].includes(error.statusCode)) {
          stop(Error(error.statusCode === 409
            ? "Conflito com outro consumidor Telegram" : "Credencial Telegram recusada"));
        } else {
          retryAt = now() + Math.max(15, Number(error.retryAfter) || 15) * 1000;
          warn("Falha de comunicação Telegram; nova consulta no próximo intervalo");
        }
        return;
      }
      if (!Array.isArray(updates)) {
        stop(Error("Resposta Telegram inválida"));
        return;
      }
      for (const update of updates.sort((a, b) => a.update_id - b.update_id)) {
        if (closed) {
          break;
        }
        if (!Number.isSafeInteger(update.update_id) || update.update_id <= state.lastUpdateId) {
          continue;
        }
        const next = { ...state, lastUpdateId: update.update_id };
        try {
          await save(next);
          state = next;
        } catch {
          stop(Error("Não foi possível persistir o cursor Telegram"));
          break;
        }
        const message = update.message;
        if (!message || message.date < state.activatedAt ||
            String(message.chat?.id) !== String(chatId)) {
          continue;
        }
        const command = String(message.text || "").trim()
          .match(/^\/(ofertas|start|ajuda)(?:@([a-z0-9_]+))?(?:\s|$)/i);
        if (!command || (command[2] &&
            command[2].toLowerCase() !== String(bot.username).toLowerCase())) {
          continue;
        }
        if (closed) {
          break;
        }
        try {
          emit({ mode: "telegram", text: message.text, updateId: update.update_id,
            requestChatId: String(message.chat.id), messageId: message.message_id });
        } catch {
          warn("Comando aceito não pôde ser despachado; não será repetido automaticamente");
        }
      }
    }
    function tick() {
      if (closed || running) {
        return;
      }
      running = poll().finally(() => { running = null; });
    }
    timer = setInterval(tick, Math.max(15, intervalSeconds) * 1000);
    tick();
    return {
      close: async () => {
        stop();
        if (running) {
          await running;
        }
        receivers.delete(botId);
      },
    };
  } catch (error) {
    receivers.delete(botId);
    throw error;
  }
}
module.exports = { startReceiver };
