const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const output = process.argv[2];
  if (!output) {
    throw Error("Uso: node test/integration/prepare_suite.cjs saída");
  }
  const root = path.resolve(__dirname, "../..");
  const { createWorkflows } = await import("../../scripts/workflow/definition.mjs");
  const { prepareValidation } = await import("../../scripts/workflow/validation.mjs");
  const fixtures = await import("./fixtures.mjs");
  fs.mkdirSync(output, { recursive: true });
  for (const scenario of (process.env.AERO_SCENARIOS?.split(",") || fixtures.SCENARIOS.filter(s => s !== "windowReplay"))) {
    const current = prepareValidation(createWorkflows(), root, { scenario });
    if (scenario === "windowReplay") {
      const pages = {};
      for (const category of ["nacionais", "internacionais"]) {
        for (const origin of ["GRU", "CGH"]) {
          const key = category + "_" + origin;
          pages[key] = fs.readFileSync(process.env.AERO_WINDOW_CAPTURE + "/" + key + ".html", "utf8");
        }
      }
      const node = current[0].nodes.find(node => node.name === "Consultar Google Flights");
      fixtures.replaceCode(node, fixtures.controlledResponse, { fixtures: pages, scenario: "windowReplay" });
    }
    fs.writeFileSync(path.join(output, scenario + ".json"), JSON.stringify(current));

  }
  fs.writeFileSync(path.join(output, "credentials.json"), JSON.stringify([{
    id: "aeroLocalTelegram",
    name: "Local simulated Telegram",
    type: "telegramApi",
    data: { accessToken: "123:local_fake_token", baseUrl: "http://127.0.0.1:3456" },
  }]));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
