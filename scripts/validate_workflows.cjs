const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { N8N_TEST_IMAGE, pullTestImage } = require("./test_image.cjs");

const root = path.resolve(__dirname, "..");
const folder = fs.mkdtempSync(path.join(os.tmpdir(), "aero-scout-validation-"));

function run(program, args) {
  const result = spawnSync(program, args, { stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw Error("Validação interrompida: " + program + " (" + result.status + ").");
  }
}

try {
  run(process.execPath, [path.join(root, "test/integration/prepare_suite.cjs"), folder]);
  pullTestImage();
  const args = [
    "run", "--rm", "--name", "aero-scout-workflow-validation", "--network", "none",
    "--mount", "type=bind,source=" + root + ",target=/work,readonly",
    "--mount", "type=bind,source=" + folder + ",target=/suite,readonly",
    "--tmpfs", "/home/node/.n8n:uid=1000,gid=1000",
    "-e", "N8N_DIAGNOSTICS_ENABLED=false", "-e", "N8N_VERSION_NOTIFICATIONS_ENABLED=false",
    "-e", "N8N_RUNNERS_MODE=internal", "-e", "GENERIC_TIMEZONE=America/Sao_Paulo",
    "-e", "AERO_DISPOSABLE_TEST=1",
  ];
  if (process.env.AERO_SCENARIOS) {
    args.push("-e", "AERO_SCENARIOS=" + process.env.AERO_SCENARIOS);
  }
  args.push("--entrypoint", "node", N8N_TEST_IMAGE,
    "/work/test/integration/run_suite.cjs", "/suite");
  // Files contain only controlled fixtures and a fake credential; Docker has no external network.
  fs.chmodSync(folder, 0o755);
  run("docker", args);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  fs.rmSync(folder, { recursive: true, force: true });
}
