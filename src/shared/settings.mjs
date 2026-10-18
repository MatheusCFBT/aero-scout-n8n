/** Shared search policy. Factories have no implicit dependencies so they can run in a Code node. */
export function createSettings() {
  return {
    categories: ["nacionais", "internacionais"],
    origins: ["GRU", "CGH"],
    timezone: "America/Sao_Paulo",
    currency: "BRL",
    horizonMonths: 6,
    minimumTripDays: 3,
    maximumTripDays: 14,
    offerLimit: 10,
    maximumAttempts: 3,
    retryDelaySeconds: 3,
    requestTimeoutMs: 60_000,
    executionTimeoutSeconds: 1_200,
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    acceptLanguage: "pt-BR,pt;q=0.9",
    telegram: {
      messageBudget: 3_800,
      partLabelReserve: 40,
      warningLimit: 6,
      warningLength: 240,
    },
  };
}
