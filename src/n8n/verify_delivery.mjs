export function execute({ input, nodes }) {
  const results = input.all().map((item, index) => ({
    json: {
      category: nodes.messages.itemMatching(index).json.category,
      sent: !item.json.error,
      error: item.json.error ? "Falha de envio no Telegram" : null,
    },
    pairedItem: { item: index },
  }));
  if (results.some((item) => !item.json.sent)) {
    throw Error(
      "Uma ou mais mensagens não foram entregues. " +
      "Consulte Registrar envio antes de repetir para evitar duplicatas.",
    );
  }
  return results;
}

export const dependencies = {};
export const nodeReferences = { messages: "Receber mensagens" };
