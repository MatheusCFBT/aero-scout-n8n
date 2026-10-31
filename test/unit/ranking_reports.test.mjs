import { test } from "node:test";
import assert from "node:assert/strict";
import { createOfferRanking } from "../../src/offers/ranking.mjs";
import { createSearchReports } from "../../src/offers/reports.mjs";
import { createTextHelpers } from "../../src/shared/text.mjs";

const ranking = createOfferRanking({ text: createTextHelpers(), settings: { offerLimit: 2 } });
const offer = { destination: "Recife", country: "Brasil", origin: "GRU", departure: "2027-01-01",
  discountPercent: 25, priceCents: 10000 };

test("ranking prioriza desconto e desempata pelo menor preço, sem modificar entrada", () => {
  const input = [{ ...offer, destination: "Natal", discountPercent: 30, priceCents: 20000 },
    { ...offer, destination: "Maceió", discountPercent: 30, priceCents: 15000 },
    { ...offer, priceCents: 1000 }];
  const before = structuredClone(input);
  assert.deepEqual(ranking.rank(input).map(item => item.destination), ["Maceió", "Natal"]);
  assert.deepEqual(input, before);
});

test("mesmo destino entre origens mantém a melhor oferta e normaliza espaços e caixa", () => {
  const result = ranking.rank([offer, { ...offer, destination: "  RECIFE ", origin: "CGH", discountPercent: 40 }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].origin, "CGH");
  assert.equal(result[0].discountPercent, 40);
});

test("destinos homônimos em países diferentes continuam distintos", () => {
  assert.equal(ranking.rank([offer, { ...offer, country: "Portugal" }]).length, 2);
});

test("ranking exclui descontos inválidos e respeita limite padrão ou explícito", () => {
  const input = [null, NaN, Infinity, 0, 100, -1].map(discountPercent => ({ ...offer, discountPercent }));
  assert.deepEqual(ranking.rank(input), []);
  const valid = ["A", "B", "C"].map(destination => ({ ...offer, destination }));
  assert.deepEqual(ranking.rank(valid).map(item => item.destination), ["A", "B"]);
  assert.equal(ranking.rank(valid, 1).length, 1);
  assert.deepEqual(ranking.rank(valid, 0), []);
});

const summary = createSearchReports({ ranking: { rank: offers => offers } });
const report = { category: "nacionais", today: "2026-10-18", searchedAt: "2026-10-18T12:00:00Z",
  horizonMonths: 6, status: "complete", offers: [], warnings: [] };

for (const [statuses, expected] of [[ ["complete", "complete"], "complete" ],
  [ ["failed", "failed"], "failed" ], [ ["complete", "failed"], "partial" ],
  [ ["partial", "complete"], "partial" ]]) {
  test("resumo combina " + statuses.join(" + ") + " como " + expected, () => {
    assert.equal(summary.summarize(statuses.map(status => ({ ...report, status }))).status, expected);
  });
}

test("resumo reúne ofertas e avisos únicos e preserva o contexto sem alterar consultas", () => {
  const input = [{ ...report, mode: "command", startDate: "2027-01-01", endDate: "2027-01-10",
    maximumTripDays: 9, offers: [offer], warnings: ["aviso"] },
    { ...report, offers: [{ ...offer, destination: "Natal" }], warnings: ["aviso", "timeout"] }];
  const before = structuredClone(input);
  const result = summary.summarize(input);
  assert.deepEqual(result.offers.map(item => item.destination), ["Recife", "Natal"]);
  assert.deepEqual(result.warnings, ["aviso", "timeout"]);
  assert.equal(result.startDate, "2027-01-01");
  assert.equal(result.endDate, "2027-01-10");
  assert.equal(result.maximumTripDays, 9);
  assert.deepEqual(input, before);
});

test("resumo sem consultas é rejeitado em vez de parecer uma pesquisa vazia", () => {
  assert.throws(() => summary.summarize([]), /Consultas ausentes/);
});
