const { startReceiver } = require("./telegram_poller.cjs");

class TelegramPollingTrigger {
  constructor() {
    this.description = {
      displayName: "Telegram local — comandos",
      name: "telegramPollingTrigger",
      group: ["trigger"], version: 1,
      description: "Recebe comandos localmente por polling",
      defaults: { name: "Receber comandos" }, inputs: [], outputs: ["main"],
      credentials: [{ name: "telegramApi", required: true }],
      properties: [
        { displayName: "Chat autorizado", name: "allowedChatId", type: "string",
          default: "", required: true },
        { displayName: "Intervalo (segundos)", name: "intervalSeconds", type: "number",
          default: 15, typeOptions: { minValue: 15 } },
        { displayName: "Diretório persistente", name: "stateDirectory", type: "string",
          default: "/home/node/.n8n/aero-scout" },
      ],
    };
  }

  async trigger() {
    const credential = await this.getCredentials("telegramApi");
    const chatId = String(this.getNodeParameter("allowedChatId"));
    if (!/^-?\d+$/.test(chatId)) {
      throw Error("Configure o chat autorizado");
    }
    const api = async (method, body) => {
      let response;
      try {
        response = await this.helpers.httpRequest({
          method: "POST",
          url: (credential.baseUrl || "https://api.telegram.org").replace(/\/$/, "") +
            "/bot" + credential.accessToken + "/" + method,
          body, json: true, timeout: 10000, ignoreHttpStatusErrors: true,
        });
      } catch {
        // Do not propagate URLs, original causes or response bodies containing credentials.
        throw Error("Falha de comunicação Telegram");
      }
      if (!response?.ok) {
        const error = Error("Consulta Telegram recusada");
        error.statusCode = response?.error_code;
        error.retryAfter = response?.parameters?.retry_after;
        throw error;
      }
      return response.result;
    };
    const receiver = await startReceiver({
      api, chatId,
      stateDirectory: this.getNodeParameter("stateDirectory"),
      intervalSeconds: this.getNodeParameter("intervalSeconds"),
      emit: (json) => this.emit([[{ json }]]),
      emitError: (error) => this.emitError(error),
      warn: (message) => this.logger.warn(message),
    });
    return { closeFunction: () => receiver.close() };
  }
}
module.exports = { TelegramPollingTrigger };
