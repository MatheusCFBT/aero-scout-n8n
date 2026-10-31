import { test } from "node:test";
import assert from "node:assert/strict";
import { createPageInspector } from "../../src/google_flights/page_inspection.mjs";
import { createTextHelpers } from "../../src/shared/text.mjs";

const { inspectPage } = createPageInspector({ text: createTextHelpers(), settings: { currency: "BRL", horizonMonths: 6 } });
const context = { origin: "GRU", category: "nacionais", statusCode: 200 };
const page = { headings: "1 oferta saindo de GRU para viagem de 3–14 dias nos próximos 6 meses",
  cards: ["<div>Recife</div>"], bodyText: "Ofertas", tripType: "Ida e volta", cabin: "Econômica",
  passengers: "1 passageiro", currency: "BRL", originLabel: "GRU" };

test("página confirmada preserva cards e contexto sem modificar as entradas", () => {
  const before = structuredClone(page);
  const result = inspectPage(page, context);
  assert.equal(result.status, "complete");
  assert.deepEqual(result.cards, ["<div>Recife</div>"]);
  assert.equal(result.origin, "GRU");
  assert.equal(result.horizonMonths, 6);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(page, before);
});

test("contagem incompleta preserva os cards disponíveis com aviso", () => {
  const result = inspectPage({ ...page, headings: page.headings.replace("1 oferta", "2 ofertas") }, context);
  assert.equal(result.status, "partial");
  assert.deepEqual(result.cards, page.cards);
  assert.match(result.warnings.join(" "), /1 de 2/);
});

test("ausência de cards só é sucesso quando a fonte confirma resultado vazio", () => {
  const empty = { ...page, cards: [], headings: page.headings.replace("1 oferta", "0 ofertas"),
    bodyText: "Nenhuma oferta encontrada para sua pesquisa" };
  assert.equal(inspectPage(empty, context).status, "complete");
  assert.equal(inspectPage({ ...empty, bodyText: "Carregando" }, context).status, "failed");
});

test("erro HTTP ou bloqueio não se transforma em pesquisa vazia", () => {
  for (const changes of [{ statusCode: 503 }, { statusCode: 0 }, { error: "timeout" }]) {
    const result = inspectPage(page, { ...context, ...changes });
    assert.equal(result.status, "failed");
    assert.deepEqual(result.cards, []);
    assert.ok(result.warnings.length > 0);
  }
  assert.equal(inspectPage({ ...page, bodyText: "CAPTCHA" }, context).status, "failed");
});

test("critérios, horizonte ou resumo não confirmados rejeitam a página", () => {
  for (const changes of [{ tripType: "Só ida" }, { cabin: "Executiva" }, { passengers: "2 passageiros" },
    { currency: "USD" }, { originLabel: "CGH" }, { headings: "Ofertas" },
    { headings: page.headings.replace("6 meses", "3 meses") }]) {
    assert.equal(inspectPage({ ...page, ...changes }, context).status, "failed");
  }
});

test("comando exige confirmação da sua janela em vez do horizonte diário", () => {
  const command = { ...context, mode: "command", startDate: "2027-05-14", departureEndDate: "2027-05-19", maximumTripDays: 6 };
  const custom = { ...page, headings: "1 oferta saindo de GRU para viagem de 1–6 dias com ida entre 14 de mai. e 19 de mai." };
  assert.equal(inspectPage(custom, command).status, "complete");
  assert.equal(inspectPage(custom, command).horizonMonths, null);
  assert.equal(inspectPage(page, command).status, "failed");
});
