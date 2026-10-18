export function createPageInspector({ text, settings }) {
  function failedPage(context, message) {
    return { ...context, status: "failed", warnings: [message], cards: [], horizonMonths: null };
  }

  function hasExpectedCriteria(raw, context) {
    return (
      text.normalize(raw.tripType).includes("Ida e volta") &&
      text.normalize(raw.cabin).includes("Econômica") &&
      /^1 passageiro$/.test(text.normalize(raw.passengers)) &&
      text.normalize(raw.currency).includes(settings.currency) &&
      text.normalize(raw.originLabel).includes(context.origin)
    );
  }

  /** Validate the search page before treating missing cards as a legitimate empty result. */
  function inspectPage(raw, context) {
    const headings = text.normalize(
      Array.isArray(raw.headings) ? raw.headings.join(" ") : raw.headings,
    );
    const body = text.normalize(raw.bodyText);
    const cards = Array.isArray(raw.cards) ? raw.cards : [];

    if (context.error || context.statusCode < 200 || context.statusCode >= 300) {
      return failedPage(context, "Falha HTTP na consulta " + context.origin);
    }
    const sourceUnavailable =
      /captcha|tráfego incomum|unusual traffic|algo deu errado|navegador não.*suportado/i;
    if (sourceUnavailable.test(body)) {
      return failedPage(context, "Fonte bloqueada ou indisponível");
    }

    const horizon = headings.match(/próximos\s+(\d+)\s+meses/i);
    if (context.mode === "command") {
      const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
      function label(iso) {
        const [, month, day] = iso.split("-");
        return Number(day) + "de" + months[Number(month) - 1];
      }
      // Native HTML extraction may join wrapped words; compare compact source headings.
      const compact = headings.toLowerCase().replace(/\s/g, "").replace(/\./g, "");
      const duration = context.maximumTripDays === 1
        ? /viagemde1dia/
        : new RegExp("viagemde1[-–]" + context.maximumTripDays + "dia");
      const range = context.startDate === context.departureEndDate
        ? "comidaem" + label(context.startDate)
        : "comidaentre" + label(context.startDate) + "e" + label(context.departureEndDate);
      if (!duration.test(compact) || !compact.includes(range)) {
        return failedPage(context,
          "Período solicitado não confirmado na fonte; consulta não suportada ou falhou");
      }
    }
    if (context.mode !== "command" && (
      !horizon ||
      Number(horizon[1]) !== settings.horizonMonths ||
      !/3\s*[-–]\s*14\s*dia/.test(headings)
    )) {
      return failedPage(context, "Não foi possível confirmar datas flexíveis e duração na fonte");
    }
    if (!hasExpectedCriteria(raw, context)) {
      return failedPage(
        context,
        "Critérios de origem, passageiros, cabine ou moeda não confirmados",
      );
    }

    const countMatch = headings.match(/\b(\d+)\s+ofertas? saindo/);
    if (!countMatch) {
      return failedPage(context, "Resumo de resultados ausente");
    }
    const expectedCount = Number(countMatch[1]);
    const confirmedEmpty =
      expectedCount === 0 && /Nenhuma oferta encontrada para sua pesquisa/i.test(body);
    if (!cards.length && !confirmedEmpty) {
      return failedPage(context, "HTML sem cards e sem confirmação de pesquisa vazia");
    }

    const warnings = [];
    if (expectedCount !== cards.length) {
      warnings.push(
        "Cobertura parcial: " + cards.length + " de " + expectedCount + " cards recebidos",
      );
    }
    return {
      ...context,
      status: warnings.length ? "partial" : "complete",
      warnings,
      cards,
      horizonMonths: context.mode === "command" ? null : Number(horizon[1]),
    };
  }

  return { inspectPage };
}
