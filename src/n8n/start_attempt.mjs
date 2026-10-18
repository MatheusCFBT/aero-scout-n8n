export function execute({ input }) {
  return input.all().map((item, index) => ({
    json: { ...item.json, attempt: (item.json.attempt || 0) + 1 },
    pairedItem: { item: index },
  }));
}

export const dependencies = {};
