export function createTelegramMessages({ text, settings }) {
  function shortDate(isoDate) {
    const [year, month, day] = isoDate.split("-");
    return day + "/" + month + "/" + year.slice(-2);
  }

  function reportHeader(report) {
    const title = report.category === "nacionais"
      ? "🇧🇷 Voos nacionais" : "🌎 Voos internacionais";
    const period = report.mode === "command"
      ? shortDate(report.startDate) + " a " + shortDate(report.endDate)
      : report.horizonMonths
        ? "Próximos " + report.horizonMonths + " meses · Viagens de 3–14 dias"
        : "Período não confirmado";
    const status = {
      failed: "❌ <b>Falha na pesquisa.</b>",
      partial: "⚠️ <b>Resultado parcial.</b>",
    }[report.status];
    return [
      "<b>" + title + "</b>",
      "📅 " + period,
      "✈️ " + settings.origins.join(" e ") + " · Ida e volta · 1 adulto · Econômica",
      ...(status ? [status] : []),
      "",
    ].join("\n");
  }

  function offerBlock(offer, index) {
    const country = offer.category === "internacionais"
      ? ", " + text.escapeHtml(offer.country) : "";
    const price = (offer.priceCents / 100).toLocaleString("pt-BR", {
      style: "currency", currency: settings.currency,
    });
    return [
      "",
      (index + 1) + ". <b>" + text.escapeHtml(offer.destination) + "</b>" + country,
      "<b>" + price + " · " + offer.discountPercent.toLocaleString("pt-BR") +
        "% abaixo da média</b>",
      offer.origin + " → " + offer.destinationAirport + " · " +
        shortDate(offer.departure) + " a " + shortDate(offer.returnDate),
      '🔗 <a href="' + text.escapeHtml(offer.url) + '">Consultar voo</a>',
      "",
    ].join("\n");
  }

  function reportFooter(report) {
    const notes = report.warnings.slice(0, settings.telegram.warningLimit).map((warning) =>
      text.escapeHtml(text.normalize(warning).slice(0, settings.telegram.warningLength)),
    ).join("; ");
    const timestamp = new Date(report.searchedAt);
    const date = timestamp.toLocaleDateString("pt-BR", {
      timeZone: settings.timezone, day: "2-digit", month: "2-digit", year: "2-digit",
    });
    const time = timestamp.toLocaleTimeString("pt-BR", {
      timeZone: settings.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    return [
      "",
      ...(notes ? ["⚠️ Avisos: " + notes] : []),
      "Atualizado em " + date + " às " + time + " — São Paulo",
      "Descontos em relação à média do Google. Valores por pessoa.",
      "Cobertura limitada; preços sujeitos a alteração.",
    ].join("\n");
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
      blocks.push(report.status === "complete"
        ? "\nNenhuma oferta com desconto encontrada na cobertura pesquisada.\n"
        : "\nNão há ofertas para apresentar; veja os avisos.\n");
    }
    const footer = reportFooter(report);
    // Include escaped HTML and URLs in the conservative budget; never split an offer.
    const budget = settings.telegram.messageBudget - header.length - footer.length -
      settings.telegram.partLabelReserve;
    const chunks = splitBlocks(blocks, budget);
    return chunks.map((chunk, index) => ({
      category: report.category,
      status: report.status,
      text: header + (chunks.length > 1
        ? "Parte " + (index + 1) + "/" + chunks.length + "\n" : "") + chunk + footer,
    }));
  }

  /** @param {import("../types.mjs").SearchReport[]} reports */
  function formatReports(reports) {
    const orderedReports = [...reports].sort((first, second) =>
      settings.categories.indexOf(first.category) - settings.categories.indexOf(second.category),
    );
    return orderedReports.flatMap(formatReport);
  }

  return { formatReports };
}
