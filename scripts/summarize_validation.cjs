const fs = require("node:fs");

function main() {
  const log = fs.readFileSync(process.argv[2], "utf8");
  const jsonStart = log.indexOf("\n{");
  if (jsonStart < 0) {
    console.error(log.slice(-4000));
    process.exitCode = 1;
    return;
  }
  const execution = JSON.parse(log.slice(jsonStart + 1).split("\nError executing workflow.")[0]);
  const result = execution.data.resultData;
  const summary = {
    lastNode: result.lastNodeExecuted,
    error: result.error,
    results: {},
  };

  function itemsFrom(nodeName) {
    return (result.runData[nodeName] || []).flatMap(
      (run) => run.data?.main?.[0]?.map((item) => item.json) || [],
    );
  }

  const reportNodes = ["Buscar ofertas", "Montar listas", "Enviar listas"];
  for (const name of reportNodes) {
    summary.results[name] = itemsFrom(name);
  }
  summary.attempts = itemsFrom("Buscar ofertas").map(({ category, origin, attempt }) => ({
    category, origin, attempt,
  }));
  console.log(JSON.stringify(summary, null, 2));
  if (result.error) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
