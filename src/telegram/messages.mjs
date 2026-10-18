export function createTelegramMessages({ text, settings }) {
  function reportHeader(report) {
    const title = report.category === "nacionais" ? "Voos nacionais" : "Voos internacionais";
    const searchedAt = new Date(report.searchedAt).toLocaleString("pt-BR", {
      timeZone: settings.timezone,
    });
    const horizon = report.mode === "command"
      ? "Período solicitado: " + report.startDate.split("-").reverse().join("/") +
        " a " + report.endDate.split("-").reverse().join("/") +
        ". Origens: " + settings.origins.join(" e ") + "."
      : report.horizonMonths
      ? "Próximos " + report.horizonMonths + " meses (janela confirmada na fonte)."
      : "Horizonte não confirmado: consulta falhou.";
    const statusMessages = {
      failed: "Falha na pesquisa.",
      partial: "Resultado parcial: parte da pesquisa não pôde ser concluída.",
      complete: "Pesquisa concluída na cobertura disponível.",
    };
    const status = statusMessages[report.status] || statusMessages.complete;
    return [
      "<b>" + title + "</b>",
      searchedAt + " — São Paulo",
      "Maiores descontos percentuais encontrados",
      horizon,
      report.mode === "command"
        ? "1 adulto • econômica • ida e volta • BRL • 1–" + report.maximumTripDays + " dias"
        : "1 adulto • econômica • ida e volta • BRL • 3–14 dias",
      status,
      "",
    ].join("\n");
  }

  function offerBlock(offer, index) {
    const departure = offer.departure.split("-").reverse().join("/");
    const returnDate = offer.returnDate.split("-").reverse().join("/");
    const price = (offer.priceCents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: settings.currency,
    });
    return [
      "",
      `${index + 1}. <b>${text.escapeHtml(offer.destination)}</b> (${text.escapeHtml(offer.country)})`,
      offer.origin + " → " + offer.destinationAirport,
      "Ida: " + departure + " | Volta: " + returnDate,
      price + " por pessoa",
      offer.discountPercent.toLocaleString("pt-BR") + "% abaixo da média do Google" +
        (offer.referencePriceCents === null ? "" : " (referência: " +
          (offer.referencePriceCents / 100).toLocaleString("pt-BR", {
            style: "currency", currency: settings.currency,
          }) + ")"),
      '<a href="' + text.escapeHtml(offer.url) + '">Consultar voo</a>',
      "",
    ].join("\n");
  }

  function reportFooter(warnings) {
    const notes = warnings
      .slice(0, settings.telegram.warningLimit)
      .map((warning) => {
        const shortenedWarning = text.normalize(warning).slice(0, settings.telegram.warningLength);
        return text.escapeHtml(shortenedWarning);
      })
      .join("; ");
    return (
      "\n" +
      (notes ? "Avisos: " + notes + "\n" : "") +
      "Apenas ofertas com desconto percentual informado pelo Google. " +
      "Cobertura limitada aos destinos e cards retornados pelo Google. " +
      "Preços e disponibilidade podem mudar."
    );
  }

  function splitBlocks(blocks, budget) {
    const chunks = [];
    let current = "";
    for (const block of blocks) {
      if (block.length > budget) {
        throw Error("Oferta excede o limite seguro de mensagem");
      }
      if (current.length + block.length > budget) {
        chunks.push(current);
        current = "";
      }
      current += block;
    }
    if (current) {
      chunks.push(current);
    }
    return chunks;
  }

  function formatReport(report) {
    const header = reportHeader(report);
    const blocks = report.offers.map(offerBlock);
    if (!blocks.length) {
      blocks.push(
        report.status === "complete"
          ? "\nNenhuma oferta válida com desconto percentual informado.\n"
          : "\nNenhuma oferta disponível para apresentar; consulte os avisos.\n",
      );
    }
    const footer = reportFooter(report.warnings);
    // Count escaped HTML and URLs too, preserving the conservative existing Telegram limit.
    const budget =
      settings.telegram.messageBudget -
      header.length -
      footer.length -
      settings.telegram.partLabelReserve;
    const chunks = splitBlocks(blocks, budget);
    return chunks.map((chunk, index) => ({
      category: report.category,
      status: report.status,
      text: header + "Parte " + (index + 1) + "/" + chunks.length + "\n" + chunk + footer,
    }));
  }

  /** @param {import("../types.mjs").SearchReport[]} reports */
  function formatReports(reports) {
    const orderedReports = [...reports].sort(
      (first, second) =>
        settings.categories.indexOf(first.category) - settings.categories.indexOf(second.category),
    );
    return orderedReports.flatMap(formatReport);
  }

  return { formatReports };
}
