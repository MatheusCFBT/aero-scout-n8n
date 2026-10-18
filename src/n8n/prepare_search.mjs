export function execute({ nodes }, { queries, settings }) {
  const configuration = nodes.configuration.first().json;
  return settings.categories.flatMap((category) =>
    settings.origins.map((origin) => ({
      json: {
        ...configuration,
        category,
        origin,
        searchedAt: configuration.searchedAt,
        today: configuration.today,
        url: queries.makeQuery(category, origin, configuration),
      },
    })),
  );
}

export const dependencies = { queries: "queries", settings: "settings" };
export const nodeReferences = { configuration: "Interpretar pedido" };
