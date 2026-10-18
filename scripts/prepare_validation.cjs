const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const root = path.resolve(__dirname, "..");
  const { createWorkflows } = await import("./workflow/definition.mjs");
  const { prepareValidation } = await import("./workflow/validation.mjs");
  const args = process.argv.slice(2);
  if (args.includes("--live")) {
    throw Error("Use npm run probe para consultas reais; esta preparação usa apenas fixtures.");
  }
  const index = args.indexOf("--scenario");
  let scenario = index >= 0 ? args[index + 1] : "preview";
  if (args.includes("--retry-test")) {
    scenario = "partial";
  } else if (args.includes("--send-test")) {
    scenario = "send";
  }
  const validation = prepareValidation(createWorkflows(), root, { scenario });
  const outputPath = path.join(root, "validation_workflows.json");
  fs.writeFileSync(outputPath, JSON.stringify(validation, null, 2) + "\n");
  console.log("Validação offline preparada: " + scenario);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
