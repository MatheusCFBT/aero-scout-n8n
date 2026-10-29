export function execute({ input }) {
  return input.all().map((item, index) => {
    // Retry only the search context, never the previous response body or status.
    const { data, statusCode, error, ...context } = item.json;
    return {
      json: { ...context, attempt: (context.attempt || 0) + 1 },
      pairedItem: { item: index },
    };
  });
}

export const dependencies = {};
