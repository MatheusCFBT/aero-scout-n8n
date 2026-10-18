const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const checkOnly = process.argv.includes("--check");

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(file);
    }
    return /\.(?:cjs|mjs|js)$/.test(entry.name) ? [file] : [];
  });
}

function normalizeWhitespace(source) {
  return source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n*$/, "\n");
}

async function main() {
  let failed = false;
  const files = ["src", "scripts", "test"].flatMap((name) => sourceFiles(path.join(root, name)));
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const normalized = normalizeWhitespace(source);
    const label = path.relative(root, file);
    if (source !== normalized) {
      if (checkOnly) {
        console.error(label + ": espaços ou fim de linha inconsistentes");
        failed = true;
      } else {
        fs.writeFileSync(file, normalized);
      }
    }
    if (/^\t/m.test(normalized)) {
      console.error(label + ": use espaços para indentação");
      failed = true;
    }
    const syntax = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (syntax.status !== 0) {
      console.error(syntax.stderr);
      failed = true;
    }
  }

  const { createWorkflows } = await import("./workflow/definition.mjs");
  const { WORKFLOW_FILES } = await import("./workflow/ids.mjs");
  for (const [key, workflow] of Object.entries(createWorkflows())) {
    const workflowFile = path.join(root, "workflows", WORKFLOW_FILES[key]);
    const generated = JSON.stringify(workflow, null, 2) + "\n";
    if (checkOnly && fs.readFileSync(workflowFile, "utf8") !== generated) {
      console.error(WORKFLOW_FILES[key] + " desatualizado: execute npm run build.");
      failed = true;
    } else if (!checkOnly) {
      fs.writeFileSync(workflowFile, generated);
    }
  }

  console.log(
    checkOnly ? "Verificação de fonte concluída." : "Espaços normalizados e workflow gerado.",
  );
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
