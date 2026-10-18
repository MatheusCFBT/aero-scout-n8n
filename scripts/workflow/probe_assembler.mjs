import { assembleFunctions } from "./code_assembler.mjs";
import { execute } from "../../src/google_flights/live_probe.mjs";

export function assembleProbe() {
  const { code } = assembleFunctions(
    execute,
    { queries: "queries", settings: "settings" },
    "{ fetchRequest: fetch }",
    "src/google_flights/live_probe.mjs",
  );
  return [
    "(async function runProbe() {",
    code,
    "})().then((results) => console.log(JSON.stringify(results))).catch((error) => {",
    "  console.error(error.message);",
    "  process.exitCode = 1;",
    "});",
    "",
  ].join("\n");
}
