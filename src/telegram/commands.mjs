/** Validate one Telegram message without changing the scheduled search configuration. */
export function createTelegramCommands({ dates, text, settings }) {
  const help = "Use /ofertas Brasil DD/MM/AA - DD/MM/AA ou BR.\nAs datas definem a janela completa da viagem. Origens: " + settings.origins.join(" e ") + ".";

  function parseDate(value) {
    const [day, month, year] = value.split("/");
    const iso = "20" + year + "-" + month + "-" + day;
    dates.day(iso);
    return iso;
  }

  function parse(configuration) {
    if (configuration.mode !== "telegram") {
      return { ...configuration, action: "search", mode: "daily" };
    }
    if (String(configuration.requestChatId) !== String(configuration.chatId)) {
      return null;
    }
    const command = String(configuration.text || "").trim();
    const match = command.match(/^\/(ofertas|start|ajuda)(?:@([a-z0-9_]+))?(?:\s+([\s\S]*))?$/i);
    if (!match || (match[2] && match[2].toLowerCase() !== "detectiveflightbot")) {
      return null;
    }
    function reply(error = "") {
      return {
        ...configuration,
        action: "reply",
        category: "controle",
        status: "complete",
        text: (error ? text.escapeHtml(error) + "\n\n" : "") + help,
      };
    }
    if (match[1].toLowerCase() !== "ofertas") {
      return reply();
    }
    try {
      const parameters = (match[3] || "").match(
        /^(Brasil|BR)\s+(\d{2}\/\d{2}\/\d{2})\s*[-–—]\s*(\d{2}\/\d{2}\/\d{2})$/i,
      );
      if (!parameters) {
        throw Error("Comando inválido. Informe Brasil ou BR e duas datas no padrão DD/MM/AA.");
      }
      const startDate = parseDate(parameters[2]);
      const endDate = parseDate(parameters[3]);
      if (startDate < configuration.today) {
        throw Error("A data inicial não pode estar no passado.");
      }
      const maximumTripDays = dates.tripDuration(startDate, endDate);
      if (maximumTripDays <= 0) {
        throw Error("O término deve ser posterior ao início.");
      }
      const departureEndDate = new Date(dates.day(endDate) - 86_400_000)
        .toISOString().slice(0, 10);
      return {
        ...configuration,
        action: "search",
        mode: "command",
        originCountry: "Brasil",
        startDate,
        endDate,
        departureEndDate,
        minimumTripDays: 1,
        maximumTripDays,
        requestId: String(configuration.updateId),
      };
    } catch (error) {
      return reply(error.message);
    }
  }
  return { parse };
}
