import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createModules } from "../src/modules.mjs";
import { card, context } from "./helpers/examples.mjs";

const { pageInspector, offerParser, reports, queries, protocol } = createModules();

test("página sem cards exige evidência explícita de vazio", () => {
  const validEmptyPage = {
    headings: "0 oferta saindo de GRU para uma viagem de 3-14 dia nos próximos 6 meses",
    bodyText: "Nenhuma oferta encontrada para sua pesquisa",
    cards: [],
    tripType: "Ida e volta",
    cabin: "Econômica",
    passengers: "1 passageiro",
    currency: "Moeda BRL",
    originLabel: "Cidade ou aeroporto GRU",
  };
  const intermediatePage = { ...validEmptyPage, bodyText: "Entendendo seus planos", headings: "" };
  const blockedPage = { ...validEmptyPage, bodyText: "CAPTCHA" };

  assert.equal(pageInspector.inspectPage(validEmptyPage, context).status, "complete");
  assert.equal(pageInspector.inspectPage(intermediatePage, context).status, "failed");
  assert.equal(pageInspector.inspectPage(blockedPage, context).status, "failed");
});

test("parcial preserva ofertas e separa categorias", () => {
  const offer = offerParser.parseOffer(card(), context);
  const queriesByOrigin = [
    { ...context, status: "complete", offers: [offer], warnings: [] },
    { ...context, origin: "CGH", status: "failed", offers: [], warnings: ["timeout"] },
  ];
  const result = reports.summarize(queriesByOrigin);
  assert.equal(result.status, "partial");
  assert.equal(result.offers.length, 1);
});

test("URLs flexíveis não carregam datas e usam somente a origem solicitada", () => {
  for (const category of ["nacionais", "internacionais"]) {
    for (const origin of ["GRU", "CGH"]) {
      const url = queries.makeQuery(category, origin);
      const bytes = Buffer.from(url.split("tfs=")[1], "base64url");
      const legs = protocol.fields(bytes).filter((field) => field.key === protocol.tags.FLIGHT_LEG);
      assert.ok(!/20\d\d-\d\d-\d\d/.test(bytes.toString()));
      assert.equal(legs.length, 2);

      legs.forEach((leg, index) => {
        const fields = protocol.fields(leg.data);
        const originTag = index === 0 ? protocol.tags.ORIGIN : protocol.tags.DESTINATION;
        const originFields = fields.filter((field) => field.key === originTag);
        assert.equal(fields.filter((field) => field.key === protocol.tags.DATE).length, 0);
        assert.equal(originFields.length, 1);
        assert.ok(originFields[0].data.toString().endsWith(origin));
      });
    }
  }
});

test("URLs são idênticas à referência anterior à refatoração", () => {
  const reference = JSON.parse(readFileSync(new URL("./reference/queries.json", import.meta.url)));
  for (const query of reference) {
    assert.equal(queries.makeQuery(query.category, query.origin), query.url);
  }
});
