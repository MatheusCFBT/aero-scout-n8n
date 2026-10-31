import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const expectedImage = "n8nio/n8n:2.43.7@sha256:3db21366be1d3c77c1708963129c051948573019659e8873e0294be035ffc1b2";

function runValidator(script, pullExit = 0, runExit = 0, preparationFailure = false) {
  const folder = mkdtempSync(join(tmpdir(), "aero-ci-test-"));
  const log = join(folder, "docker.jsonl");
  writeFileSync(join(folder, "docker"), `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.AERO_FAKE_DOCKER_LOG, JSON.stringify(args) + "\\n");
process.exit(Number(args[0] === "pull" ? process.env.AERO_PULL_EXIT : process.env.AERO_RUN_EXIT));
`, { mode: 0o700 });
  let validator = join(root, "scripts", script);
  if (preparationFailure) {
    const isolatedRoot = join(folder, "isolated");
    mkdirSync(join(isolatedRoot, "scripts"), { recursive: true });
    mkdirSync(join(isolatedRoot, "test/integration"), { recursive: true });
    for (const file of [script, "test_image.cjs"]) {
      copyFileSync(join(root, "scripts", file), join(isolatedRoot, "scripts", file));
    }
    writeFileSync(join(isolatedRoot, "test/integration/prepare_suite.cjs"),
      'throw Error("Simulated preparation failure");\n');
    validator = join(isolatedRoot, "scripts", script);
  }
  try {
    const result = spawnSync(process.execPath, [validator], {
      cwd: root,
      encoding: "utf8",
      timeout: 30000,
      env: {
        ...process.env,
        PATH: folder + ":" + dirname(process.execPath) + ":" + process.env.PATH,
        AERO_SCENARIOS: "preview",
        AERO_FAKE_DOCKER_LOG: log,
        AERO_PULL_EXIT: String(pullExit),
        AERO_RUN_EXIT: String(runExit),
      },
    });
    assert.ifError(result.error);
    const calls = existsSync(log)
      ? readFileSync(log, "utf8").trim().split("\n").map(JSON.parse) : [];
    return { status: result.status, calls };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

for (const script of ["validate_workflows.cjs", "validate_receiver.cjs"]) {
  test(script + " pulls the pinned image before running isolated tests", () => {
    const result = runValidator(script);
    assert.equal(result.status, 0);
    assert.deepEqual(result.calls[0], ["pull", expectedImage]);
    const args = result.calls[1];
    assert.equal(args[0], "run");
    assert.equal(args[args.indexOf("--network") + 1], "none");
    assert.ok(args.includes(expectedImage));
    assert.ok(args.includes("--tmpfs"));
    assert.ok(args.some(value => value.endsWith("target=/work,readonly")));
    assert.ok(!args.some(value => value.includes("docker.sock")));
    assert.equal(result.calls.length, 2);
  });
  test(script + " stops on image pull failure", () => {
    const result = runValidator(script, 17);
    assert.notEqual(result.status, 0);
    assert.deepEqual(result.calls, [["pull", expectedImage]]);
  });
  test(script + " propagates container failure", () => {
    assert.notEqual(runValidator(script, 0, 23).status, 0);
  });
}

test("the actual required-check gate accepts only three successful jobs", () => {
  const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  const gate = workflow.split("      - name: Require successful test jobs\n")[1];
  assert.ok(gate, "required-check gate must exist");
  const body = gate.split("        run: |\n")[1]
    .split("\n").filter(line => line.startsWith("          "))
    .map(line => line.slice(10)).join("\n");
  assert.ok(body.length > 0);
  for (const unit of ["success", "failure", "cancelled", "skipped", ""]) {
    for (const workflows of ["success", "failure", "cancelled", "skipped", ""]) {
      for (const receiver of ["success", "failure", "cancelled", "skipped", ""]) {
        const result = spawnSync("sh", ["-c", body], {
          env: { UNIT_RESULT: unit, WORKFLOWS_RESULT: workflows, RECEIVER_RESULT: receiver },
        });
        assert.ifError(result.error);
        assert.equal(result.status === 0,
          [unit, workflows, receiver].every(value => value === "success"));
      }
    }
  }
});

test("workflow preparation failure stops validation before any Docker call", () => {
  const result = runValidator("validate_workflows.cjs", 0, 0, true);
  assert.notEqual(result.status, 0);
  assert.deepEqual(result.calls, []);
});
