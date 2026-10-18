export function createOfferParser({ text, dates, prices, flightDateParser, countries, settings }) {
  function readRoute(details) {
    const routes = [...text.normalize(details).matchAll(/\b([A-Z]{3})\s*[–—-]\s*([A-Z]{3})\b/g)];
    if (routes.length !== 1) {
      throw Error("Rota ausente ou ambígua");
    }
    const [, origin, destinationAirport] = routes[0];
    return { origin, destinationAirport };
  }

  function readFlightUrl(link) {
    let url = text.normalize(link);
    if (url.startsWith("/")) {
      url = "https://www.google.com" + url;
    }
    if (!/^https:\/\/www\.google\.com(?:\.br)?\/travel\/flights\?[^\s<>"']+$/.test(url)) {
      throw Error("Link de voo inválido");
    }
    return url;
  }

  function readDiscount(raw, priceCents) {
    const label = text.normalize(raw.discountLabel);
    if (!label) {
      return null;
    }
    const match = label.match(/^(\d+(?:[.,]\d+)?)%\s*abaixo da média$/i);
    const discountPercent = match ? Number(match[1].replace(",", ".")) : NaN;
    if (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent >= 100) {
      throw Error("Percentual de desconto ausente ou inválido");
    }
    const referencePriceCents = text.normalize(raw.referencePrice)
      ? prices.priceCents(raw.referencePrice)
      : null;
    if (referencePriceCents !== null && referencePriceCents <= priceCents) {
      throw Error("Preço de referência incompatível com o desconto");
    }
    // Preserve Google's displayed percentage: its reference and current prices are rounded.
    return { discountPercent, referencePriceCents };
  }

  function validateTripDates(departure, returnDate, context) {
    const duration = dates.tripDuration(departure, returnDate);
    if (context.mode === "command") {
      if (duration < 1 || duration > context.maximumTripDays ||
          departure < context.startDate || returnDate > context.endDate) {
        throw Error("Datas fora da janela solicitada");
      }
      return;
    }
    if (duration < settings.minimumTripDays || duration > settings.maximumTripDays) {
      throw Error("Duração fora de 3–14 dias");
    }
    const horizonEnd = dates.addMonths(context.today, context.horizonMonths);
    const departureIsPast = dates.day(departure) < dates.day(context.today);
    const returnIsOutsideHorizon = dates.day(returnDate) > dates.day(horizonEnd);
    if (departureIsPast || returnIsOutsideHorizon) {
      throw Error("Datas fora do horizonte confirmado");
    }
  }

  /**
   * @param {object} raw Extracted fields from a single card.
   * @param {import("../types.mjs").SearchContext} context
   * @returns {import("../types.mjs").Offer | null} Null means a different category or origin.
   */
  function parseOffer(raw, context) {
    const destination = text.normalize(raw.destination);
    const country = text.normalize(raw.country);
    if (!destination || destination.length > 180) {
      throw Error("Destino ausente ou inválido");
    }
    if (!countries.includes(country)) {
      throw Error("País do destino não reconhecido");
    }

    const category = country === "Brasil" ? "nacionais" : "internacionais";
    if (category !== context.category) {
      return null;
    }
    const { origin, destinationAirport } = readRoute(raw.details);
    if (origin !== context.origin) {
      return null;
    }

    const url = readFlightUrl(raw.link);
    const [departure, returnDate] = flightDateParser.flightDates(url);
    validateTripDates(departure, returnDate, context);
    const priceCents = prices.priceCents(raw.price);
    const discount = readDiscount(raw, priceCents);
    if (!discount) {
      return null;
    }
    return {
      category,
      destination,
      country,
      origin,
      destinationAirport,
      departure,
      returnDate,
      priceCents,
      ...discount,
      currency: settings.currency,
      url,
    };
  }

  return { parseOffer };
}
