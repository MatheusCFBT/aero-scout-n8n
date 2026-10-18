const fs = require("node:fs");
const { spawn } = require("node:child_process");

const BASE_URL = "http://127.0.0.1:5678";

async function startLocalN8n() {
  if (process.env.AERO_DISPOSABLE_TEST !== "1" ||
      fs.existsSync("/home/node/.n8n/database.sqlite")) {
    throw Error("Este teste exige um contêiner descartável com banco vazio.");
  }
  const log = fs.openSync("/tmp/n8n-server.log", "w", 0o600);
  const server = spawn("n8n", ["start"], { stdio: ["ignore", log, log] });
  fs.closeSync(log);
  let cookie = "";
  const browserId = "aero-validation-local-browser";
  try {
    let ready = false;
    for (let attempt = 0; attempt < 180; attempt += 1) {
      try {
        ready = (await fetch(BASE_URL + "/healthz/readiness")).ok;
      } catch {
        ready = false;
      }
      if (ready) {
        break;
      }
      if (server.exitCode !== null) {
        throw Error(fs.readFileSync("/tmp/n8n-server.log", "utf8").slice(-3000));
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!ready) {
      throw Error("O servidor n8n de teste não iniciou.");
    }
    const setup = await fetch(BASE_URL + "/rest/owner/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json", "browser-id": browserId },
      body: JSON.stringify({
        email: "validation@example.test",
        firstName: "Local",
        lastName: "Validation",
        password: "LocalValidation123!",
      }),
    });
    if (!setup.ok) {
      throw Error("Falha no setup do servidor descartável: " + await setup.text());
    }
    const setupText = await setup.text();

    JSON.parse(setupText);

    cookie = setup.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    const check = await fetch(BASE_URL + "/rest/login", { headers: {Cookie:cookie, "browser-id":browserId} });
    if (!check.ok) {
      throw Error("A sessão do servidor descartável não foi criada.");
    }
    return {
      async request(path, method = "GET", body) {
        const response = await fetch(BASE_URL + path, {
          method, headers: { Cookie: cookie, "browser-id": browserId,
            "Content-Type": "application/json" },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const payload = await response.json();
        if (!response.ok) { throw Error("Teste REST falhou: " + JSON.stringify(payload)); }
        return payload.data;
      },
      async publish(id) {
        const get = await fetch(BASE_URL + "/rest/workflows/" + id, {
          headers: { Cookie: cookie, "browser-id": browserId },
        });
        const payload = await get.json();
        const workflow = payload.data;
        if (!get.ok || !workflow) {
          throw Error("Não foi possível ler o subworkflow no servidor de teste: " +
            JSON.stringify({ status: get.status, payload }));
        }
        const response = await fetch(BASE_URL + "/rest/workflows/" + id + "/activate", {
          method: "POST",
          headers: { Cookie: cookie, "Content-Type": "application/json", "browser-id": browserId },
          body: JSON.stringify({ versionId: workflow.versionId }),
        });
        if (!response.ok) {
          throw Error("Publicação no servidor de teste falhou: " + await response.text());
        }
      },
      close() { server.kill("SIGTERM"); },
    };
  } catch (error) {
    server.kill("SIGTERM");
    throw error;
  }
}

module.exports = { startLocalN8n };
