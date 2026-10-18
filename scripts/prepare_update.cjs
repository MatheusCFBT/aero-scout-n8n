const fs = require("node:fs");
const { randomUUID } = require("node:crypto");

async function main() {
  const [installedPath, outputPath] = process.argv.slice(2);
  if (!installedPath || !outputPath) {
    throw Error("Uso: node scripts/prepare_update.cjs backup.json atualização.json");
  }
  const installed = JSON.parse(fs.readFileSync(installedPath, "utf8"));
  const { createWorkflows } = await import("./workflow/definition.mjs");
  const { prepareWorkflowUpdate } = await import("./workflow/update.mjs");
  const updated = prepareWorkflowUpdate(installed, createWorkflows());
  const ordered = [updated.query, updated.delivery, updated.main];
  for (const workflow of ordered) {
    workflow.versionId = randomUUID();
  }
  fs.writeFileSync(outputPath, JSON.stringify(ordered, null, 2) + "\n", { mode: 0o600 });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
