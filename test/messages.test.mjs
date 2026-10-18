import { test } from "node:test";
import assert from "node:assert/strict";
import { createModules } from "../src/modules.mjs";
import { card, context, flightLink } from "./helpers/examples.mjs";

const { offerParser, messages } = createModules();

test("mensagens longas mantêm limite e nacionais primeiro", () => {
  const example = offerParser.parseOffer(card(), context);
  const report = {
    ...context,
    status: "partial",
    warnings: ["consulta incompleta"],
    offers: Array.from({ length: 10 }, (_, index) => ({
      ...example,
      destination: "Destino " + index,
      url: flightLink() + "&x=" + "a".repeat(500),
    })),
  };
  const input = [{ ...report, category: "internacionais" }, report];
  const result = messages.formatReports(input);

  assert.equal(result[0].category, "nacionais");
  assert.ok(result.every((message) => message.text.length <= 4096));
  assert.ok(result[0].text.includes("parcial"));
  assert.ok(result.every((message) => message.text.includes("Parte ")));
  assert.match(result[0].text, /25% abaixo da média do Google/);
  assert.match(result[0].text, /referência: R\$/);
});

test("falha não é anunciada como pesquisa sem ofertas", () => {
  const emptyReport = { ...context, offers: [], warnings: [] };
  const failedMessage = messages.formatReports([{ ...emptyReport, status: "failed" }])[0];
  const emptyMessage = messages.formatReports([{ ...emptyReport, status: "complete" }])[0];

  assert.match(failedMessage.text, /Falha/);
  assert.match(emptyMessage.text, /Nenhuma oferta válida com desconto/);
});
