export function execute({ input, nodes }, { messages, reports, settings }) {
  const configuration = nodes.configuration.first().json;
  if (!configuration.dryRun && !/^-?\d+$/.test(String(configuration.chatId))) {
    throw Error("Configure o chat ID do Telegram");
  }
  const queryReports = input.all().map((item) => item.json);
  const categoryReports = settings.categories.map((category) => {
    const queries = queryReports.filter((report) => report.category === category);
    return reports.summarize(queries);
  });
  return messages.formatReports(categoryReports).map((message) => ({
    json: {
      ...message,
      chatId: configuration.chatId,
      dryRun: configuration.dryRun,
    },
  }));
}

export const dependencies = { messages: "messages", reports: "reports", settings: "settings" };

export const nodeReferences = { configuration: "Interpretar pedido" };
