export function createSearchReports({ ranking }) {
  function combinedStatus(queries) {
    if (queries.every((query) => query.status === "failed")) {
      return "failed";
    }
    if (queries.every((query) => query.status === "complete")) {
      return "complete";
    }
    return "partial";
  }

  /**
   * @param {import("../types.mjs").SearchReport[]} queries Reports from one category.
   * @returns {import("../types.mjs").SearchReport}
   */
  function summarize(queries) {
    const first = queries[0];
    if (!first) {
      throw Error("Consultas ausentes");
    }
    const offers = ranking.rank(queries.flatMap((query) => query.offers || []));
    const warnings = [...new Set(queries.flatMap((query) => query.warnings || []))];
    return {
      ...Object.fromEntries([
        "mode", "startDate", "endDate", "maximumTripDays",
      ].filter((key) => first[key] !== undefined).map((key) => [key, first[key]])),
      category: first.category,
      searchedAt: first.searchedAt,
      today: first.today,
      horizonMonths: queries.find((query) => query.horizonMonths)?.horizonMonths || null,
      status: combinedStatus(queries),
      offers,
      warnings,
    };
  }

  return { summarize };
}
