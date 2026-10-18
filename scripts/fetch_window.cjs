const fs = require("node:fs");
async function main() {
  const { createModules } = await import("../src/modules.mjs");
  const { commands, queries, settings } = createModules();
  const context = commands.parse({
    mode: "telegram", text: process.argv[2], chatId: "123", requestChatId: "123",
    today: new Date().toLocaleDateString("en-CA", { timeZone: settings.timezone }),
    searchedAt: new Date().toISOString(), dryRun: true,
  });
  if (context?.action !== "search") {
    throw Error("Comando inválido para a prova HTTP");
  }
  const folder = process.argv[3];
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(folder + "/configuration.json", JSON.stringify(context));
  const results = [];
  for (const category of settings.categories) {
    for (const origin of settings.origins) {
      const response = await fetch(queries.makeQuery(category, origin, context), {
        signal: AbortSignal.timeout(settings.requestTimeoutMs),
        headers: { "User-Agent": settings.userAgent, "Accept-Language": settings.acceptLanguage },
      });
      const html = await response.text();
      fs.writeFileSync(folder + "/" + category + "_" + origin + ".html", html);
      results.push({ category, origin, status: response.status, bytes: html.length });
    }
  }
  fs.writeFileSync(folder + "/responses.json", JSON.stringify(results));
  console.log(JSON.stringify(results));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
