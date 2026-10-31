const { spawnSync } = require("node:child_process");

// Registry digest recorded from the official n8n:2.43.7 image, not a mutable tag.
const N8N_TEST_IMAGE =
  "n8nio/n8n:2.43.7@sha256:3db21366be1d3c77c1708963129c051948573019659e8873e0294be035ffc1b2";

function pullTestImage() {
  const result = spawnSync("docker", ["pull", N8N_TEST_IMAGE], {
    stdio: "inherit", timeout: 120000,
  });
  if (result.error) { throw result.error; }
  if (result.status !== 0) {
    throw Error("Não foi possível baixar a imagem de teste (" + result.status + ").");
  }
}

module.exports = { N8N_TEST_IMAGE, pullTestImage };
