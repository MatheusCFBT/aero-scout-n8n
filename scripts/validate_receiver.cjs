const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { N8N_TEST_IMAGE, pullTestImage } = require("./test_image.cjs");
const root = path.resolve(__dirname, "..");
try {
  pullTestImage();
  const result = spawnSync("docker", [
    "run", "--rm", "--name", "aero-local-receiver-validation", "--network", "none",
    "--mount", "type=bind,source=" + root + ",target=/work,readonly",
    "--mount", "type=bind,source=" + path.join(root, "src/custom") +
      ",target=/home/node/.n8n/custom/aero-scout,readonly",
    "--tmpfs", "/home/node/.n8n:uid=1000,gid=1000",
    "-e", "N8N_DIAGNOSTICS_ENABLED=false",
    "-e", "N8N_VERSION_NOTIFICATIONS_ENABLED=false",
    "-e", "N8N_RUNNERS_MODE=internal",
    "-e", "AERO_DISPOSABLE_TEST=1",
    "--entrypoint", "node", N8N_TEST_IMAGE, "/work/test/integration/run_receiver.cjs",
  ], { stdio: "inherit" });
  if (result.error) { throw result.error; }
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
