import { createFlightProtocol } from "../../src/google_flights/protocol.mjs";
import { readFileSync } from "node:fs";

export const SCENARIOS = [
  "commandPreview", "commandLong", "commandInvalid", "windowReplay",
  "preview", "send", "empty", "invalid", "partial", "failed", "recovered", "timeout", "deliveryFailure",
];

function emptyPage(origin) {
  return [
    '<html><body><input role="combobox" aria-label="Cidade ou aeroporto ' + origin + '">',
    '<button aria-label="Ida e volta, Tipo de passagem">Ida e volta</button>',
    '<button aria-label="Econômica, Classe do assento">Econômica</button>',
    '<button aria-label="1 passageiro">1</button><button aria-label="Moeda BRL">BRL</button>',
    "<h2>0 oferta saindo de " + origin + " para uma viagem de 3-14 dia nos próximos 6 meses</h2>",
    "<p>Nenhuma oferta encontrada para sua pesquisa</p></body></html>",
  ].join("");
}

export function fixtureData(root) {
  const data = {};
  for (const category of ["nacionais", "internacionais"]) {
    for (const origin of ["GRU", "CGH"]) {
      const key = category + "_" + origin;
      data[key] = readFileSync(root + "/test/fixtures/" + key + ".html", "utf8");
      data["empty_" + key] = emptyPage(origin);
    }
  }
  const original = data.nacionais_GRU;
  data.invalid_nacionais_GRU = original.replace(
    'class="ViT5Db"> Brasil</span>',
    'class="ViT5Db"> País desconhecido</span>',
  );
  if (original === data.invalid_nacionais_GRU) {
    throw Error("A fixture de card inválido não foi aplicada.");
  }
  const protocol = createFlightProtocol();
  for (const category of ["nacionais", "internacionais"]) {
    for (const origin of ["GRU", "CGH"]) {
      const key = category + "_" + origin;
      for (const [name, start, end, heading] of [
        ["commandPreview", "2027-05-14", "2027-05-20", "1-6 dia com ida entre 14 de mai. e 19 de mai."],
        ["commandLong", "2027-06-01", "2027-06-30", "1-29 dia com ida entre 1 de jun. e 29 de jun."],
      ]) {
        data[name + "_" + key] = data[key]
          .replace(/3-14 dia nos próximos 6 meses/g, heading)
          .replace(/([?&]tfs=)([A-Za-z0-9_-]+)/g, (all, prefix, encoded) => {
            let index = 0;
            const bytes = Buffer.concat(protocol.fields(Buffer.from(encoded, "base64url"))
              .map(({ key, data, raw }) => {
                if (key !== protocol.tags.FLIGHT_LEG) { return raw; }
                const date = index++ === 0 ? start : end;
                return protocol.field(key, Buffer.concat(protocol.fields(data).map(field =>
                  field.key === protocol.tags.DATE
                    ? protocol.field(field.key, Buffer.from(date)) : field.raw)));
              }));
            return prefix + bytes.toString("base64url");
          });
      }
    }
  }
  return data;
}

export function fixedConfiguration(runtime, { preview, scenario }) {
  return [{
    json: {
      ...(scenario?.startsWith("command") || scenario === "windowReplay" ? {
        mode: "telegram", requestChatId: "123", updateId: 123,
        text: scenario === "commandLong" ? "/ofertas BR 01/06/27 - 30/06/27"
          : scenario === "commandInvalid" ? "/ofertas BR 29/02/27 - 03/03/27"
            : "/ofertas Brasil 14/05/27 - 20/05/27",
      } : {}),
      chatId: preview && !scenario?.startsWith("command") && scenario !== "windowReplay"
        ? "" : "123",
      dryRun: preview,
      searchedAt: "2026-10-17T14:00:00Z",
      today: "2026-10-17",
    },
  }];
}

export function controlledResponse({ input }, { fixtures, scenario }) {
  return input.all().map((item, index) => {
    const query = item.json;
    const key = query.category + "_" + query.origin;
    let statusCode = 200;
    let body = fixtures[(scenario.startsWith("command") ? scenario + "_" : "") + key];
    let error;
    if (scenario === "partial" && query.category === "nacionais") {
      statusCode = 503;
      body = "";
    } else if (scenario === "failed") {
      statusCode = 403;
      body = "";
    } else if (scenario === "recovered" && query.attempt < 3) {
      statusCode = 503;
      body = "";
    } else if (scenario === "timeout" && query.category === "nacionais") {
      statusCode = 0;
      body = "";
      error = { message: "ETIMEDOUT" };
    } else if (scenario === "empty") {
      body = fixtures["empty_" + key];
    } else if (scenario === "invalid" && key === "nacionais_GRU") {
      body = fixtures["invalid_" + key];
    }
    return { json: { statusCode, body, ...(error ? { error } : {}) }, pairedItem: { item: index } };
  });
}

export function replaceCode(node, execute, data) {
  node.type = "n8n-nodes-base.code";
  node.typeVersion = 2;
  node.parameters = {
    jsCode: "return (" + execute.toString() + ")({ input: $input }, " + JSON.stringify(data) + ");\n",
  };
  delete node.onError;
  delete node.retryOnFail;
  delete node.maxTries;
  delete node.waitBetweenTries;
}

export function simulateTelegram(node) {
  node.credentials = {
    telegramApi: { id: "aeroLocalTelegram", name: "Local simulated Telegram" },
  };
}
