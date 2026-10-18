// Explicit network access: npm run probe, or node scripts/fetch_live.cjs > /tmp/aero-live.json.
async function main() {
  const { createModules } = await import("../src/modules.mjs");
  const { execute } = await import("../src/google_flights/live_probe.mjs");
  const { queries, settings } = createModules();
  const results = await execute({ fetchRequest: fetch }, { queries, settings });
  console.log(JSON.stringify(results));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
