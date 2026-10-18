export function execute({ input, nodes }, { offerParser }) {
  const reportsByOrigin = new Map();
  for (const [index, item] of input.all().entries()) {
    const { meta: metadata, hasCard } = nodes.cards.itemMatching(index).json;
    let report = reportsByOrigin.get(metadata.origin);
    if (!report) {
      report = { ...metadata, offers: [], warnings: [...metadata.warnings] };
      reportsByOrigin.set(metadata.origin, report);
    }
    if (!hasCard) {
      continue;
    }
    try {
      const offer = offerParser.parseOffer(item.json, metadata);
      if (offer) {
        report.offers.push(offer);
      }
    } catch (error) {
      report.status = "partial";
      report.warnings.push(metadata.origin + ": " + error.message);
    }
  }
  // A child execution handles one query; return useful data, not the original HTML payload.
  return [...reportsByOrigin.values()].map((report) => ({
    json: {
      ...Object.fromEntries([
        "mode", "startDate", "endDate", "departureEndDate",
        "minimumTripDays", "maximumTripDays", "requestId",
      ].filter((key) => report[key] !== undefined).map((key) => [key, report[key]])),
      category: report.category,
      origin: report.origin,
      searchedAt: report.searchedAt,
      today: report.today,
      horizonMonths: report.horizonMonths,
      status: report.status,
      offers: report.offers,
      warnings: report.warnings,
      attempt: report.attempt,
    },
  }));
}

export const dependencies = { offerParser: "offerParser" };

export const nodeReferences = { cards: "Separar cards" };
