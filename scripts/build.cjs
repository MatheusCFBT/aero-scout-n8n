const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const { createWorkflows } = await import("./workflow/definition.mjs");
  const { WORKFLOW_FILES } = await import("./workflow/ids.mjs");
  for (const [key, workflow] of Object.entries(createWorkflows())) {
    const outputPath = path.resolve(__dirname, "../workflows", WORKFLOW_FILES[key]);
    fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2) + "\n");
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
