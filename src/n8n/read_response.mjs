export function execute({ input, nodes }) {
  return input.all().map((item, index) => {
    const context = nodes.attempt.itemMatching(index).json;
    const response = item.json;
    let html = "";
    if (typeof response.body === "string") {
      html = response.body;
    } else if (typeof response.data === "string") {
      html = response.data;
    }
    return {
      json: {
        ...context,
        statusCode: response.statusCode || 0,
        error: response.error ? "Falha HTTP" : null,
        data: html,
      },
      pairedItem: { item: index },
    };
  });
}

export const dependencies = {};

export const nodeReferences = { attempt: "Iniciar tentativa" };
