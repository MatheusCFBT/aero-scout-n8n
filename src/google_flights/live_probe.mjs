/** Explicit network probe; not used during tests or the daily workflow. */
export async function execute({ fetchRequest }, { queries, settings }) {
  const results = [];
  for (const category of settings.categories) {
    for (const origin of settings.origins) {
      const url = queries.makeQuery(category, origin);
      let result;
      for (let attempt = 1; attempt <= settings.maximumAttempts; attempt += 1) {
        try {
          const response = await fetchRequest(url, {
            headers: {
              "User-Agent": settings.userAgent,
              "Accept-Language": settings.acceptLanguage,
            },
            signal: AbortSignal.timeout(settings.requestTimeoutMs),
          });
          result = {
            category,
            origin,
            statusCode: response.status,
            html: await response.text(),
            attempt,
          };
          if (response.status !== 429 && response.status < 500) {
            break;
          }
        } catch (error) {
          result = { category, origin, error: error.message, attempt };
        }
      }
      results.push(result);
    }
  }
  return results;
}
