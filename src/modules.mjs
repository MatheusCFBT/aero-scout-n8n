import { readFileSync } from "node:fs";
import { createTelegramCommands } from "./telegram/commands.mjs";
import { createSettings } from "./shared/settings.mjs";
import { createTextHelpers } from "./shared/text.mjs";
import { createDateHelpers } from "./shared/dates.mjs";
import { createPriceHelpers } from "./shared/prices.mjs";
import { createFlightProtocol } from "./google_flights/protocol.mjs";
import { createFlightQueries } from "./google_flights/queries.mjs";
import { createFlightDateParser } from "./google_flights/flight_dates.mjs";
import { createPageInspector } from "./google_flights/page_inspection.mjs";
import { createOfferParser } from "./offers/parser.mjs";
import { createOfferRanking } from "./offers/ranking.mjs";
import { createSearchReports } from "./offers/reports.mjs";
import { createTelegramMessages } from "./telegram/messages.mjs";

function readData(name) {
  return JSON.parse(readFileSync(new URL("../data/" + name + ".json", import.meta.url), "utf8"));
}

// Factories receive all dependencies explicitly. The assembler serializes the same functions
// that tests execute, without parsing or rewriting JavaScript imports/exports.
export const moduleDefinitions = {
  commands: {
    factory: createTelegramCommands,
    dependencies: { dates: "dates", text: "text", settings: "settings" },
  },
  settings: { factory: createSettings },
  text: { factory: createTextHelpers },
  dates: { factory: createDateHelpers },
  prices: { factory: createPriceHelpers, dependencies: { text: "text" } },
  protocol: { factory: createFlightProtocol },
  queries: {
    factory: createFlightQueries,
    dependencies: { protocol: "protocol", settings: "settings", dates: "dates" },
    data: { templates: readData("search_templates") },
  },
  flightDateParser: {
    factory: createFlightDateParser,
    dependencies: { protocol: "protocol", dates: "dates" },
  },
  pageInspector: {
    factory: createPageInspector,
    dependencies: { text: "text", settings: "settings" },
  },
  offerParser: {
    factory: createOfferParser,
    dependencies: {
      text: "text",
      dates: "dates",
      prices: "prices",
      flightDateParser: "flightDateParser",
      settings: "settings",
    },
    data: { countries: readData("countries") },
  },
  ranking: {
    factory: createOfferRanking,
    dependencies: { text: "text", settings: "settings" },
  },
  reports: { factory: createSearchReports, dependencies: { ranking: "ranking" } },
  messages: {
    factory: createTelegramMessages,
    dependencies: { text: "text", settings: "settings" },
  },
};

export function createModules() {
  const instances = {};

  function resolve(name) {
    if (Object.hasOwn(instances, name)) {
      return instances[name];
    }
    const definition = moduleDefinitions[name];
    if (!definition) {
      throw Error("Módulo desconhecido: " + name);
    }
    const dependencies = Object.fromEntries(
      Object.entries(definition.dependencies || {}).map(([key, module]) => [key, resolve(module)]),
    );
    instances[name] = definition.factory({ ...dependencies, ...definition.data });
    return instances[name];
  }

  for (const name of Object.keys(moduleDefinitions)) {
    resolve(name);
  }
  return instances;
}
