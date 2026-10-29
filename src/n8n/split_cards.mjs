export function execute({ input, nodes }, { pageInspector }) {
  return input.all().flatMap((item, index) => {
    // The response body must not be copied into every card metadata payload.
    const { data, ...context } = nodes.response.itemMatching(index).json;
    const report = pageInspector.inspectPage(item.json, context);
    const { cards, ...metadata } = report;
    // Keep one sentinel item for empty/failed queries, otherwise HTML nodes would drop the report.
    const cardsOrEmpty = cards.length ? cards : [""];
    return cardsOrEmpty.map((card) => ({
      json: { data: card, meta: metadata, hasCard: !!card },
      pairedItem: { item: index },
    }));
  });
}

export const dependencies = { pageInspector: "pageInspector" };

export const nodeReferences = { response: "Ler resposta" };
