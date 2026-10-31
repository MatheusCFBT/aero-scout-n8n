import { test } from "node:test";
import assert from "node:assert/strict";
import { createOfferParser } from "../../src/offers/parser.mjs";
import { createTextHelpers } from "../../src/shared/text.mjs";
import { createDateHelpers } from "../../src/shared/dates.mjs";
import { createPriceHelpers } from "../../src/shared/prices.mjs";

const text = createTextHelpers();
function parser(trip = ["2026-12-28", "2027-01-04"]) {
  return createOfferParser({ text, dates: createDateHelpers(), prices: createPriceHelpers({ text }),
    flightDateParser: { flightDates: () => trip }, countries: ["Brasil", "Portugal"],
    settings: { currency: "BRL", minimumTripDays: 3, maximumTripDays: 14 } });
}
const context = { category: "nacionais", origin: "GRU", today: "2026-10-18", horizonMonths: 6 };
const raw = { destination: " Recife ", country: "Brasil", details: "GRU–REC", price: "R$ 449",
  discountLabel: "35% abaixo da média", referencePrice: "R$ 688",
  link: "/travel/flights?tfs=example" };

test("card válido vira oferta normalizada com o desconto anunciado, sem alterar entrada", () => {
  const before = structuredClone(raw);
  assert.deepEqual(parser().parseOffer(raw, context), {
    category: "nacionais", destination: "Recife", country: "Brasil", origin: "GRU",
    destinationAirport: "REC", departure: "2026-12-28", returnDate: "2027-01-04",
    priceCents: 44900, discountPercent: 35, referencePriceCents: 68800, currency: "BRL",
    url: "https://www.google.com/travel/flights?tfs=example",
  });
  assert.deepEqual(raw, before);
});

test("categoria ou aeroporto diferente é ignorado", () => {
  assert.equal(parser().parseOffer({ ...raw, details: "CGH–REC" }, context), null);
  assert.equal(parser().parseOffer({ ...raw, country: "Portugal" }, context), null);
});

test("rota extraída em vários campos e destino internacional são aceitos", () => {
  const result = parser().parseOffer({ ...raw, country: "Portugal", destination: "Lisboa",
    details: ["Sem escalas", "GRU–LIS"] }, { ...context, category: "internacionais" });
  assert.equal(result.destinationAirport, "LIS");
  assert.equal(result.category, "internacionais");
});

test("destino, país e rota ausentes ou ambíguos são rejeitados", () => {
  for (const changes of [{ destination: "" }, { destination: "x".repeat(181) },
    { country: "Desconhecido" }, { details: "Sem rota" }, { details: "GRU–REC CGH–REC" }]) {
    assert.throws(() => parser().parseOffer({ ...raw, ...changes }, context));
  }
});

test("link externo ou que não identifica um voo é rejeitado", () => {
  for (const link of ["https://example.test/travel/flights?tfs=x", "http://www.google.com/travel/flights?tfs=x",
    "https://www.google.com.evil.test/travel/flights?tfs=x", "javascript:alert(1)"]) {
    assert.throws(() => parser().parseOffer({ ...raw, link }, context), /Link/);
  }
});

test("ausência de desconto ignora oferta; percentual decimal e referência opcional são aceitos", () => {
  assert.equal(parser().parseOffer({ ...raw, discountLabel: "" }, context), null);
  const offer = parser().parseOffer({ ...raw, discountLabel: "12,5% abaixo da média", referencePrice: "" }, context);
  assert.equal(offer.discountPercent, 12.5);
  assert.equal(offer.referencePriceCents, null);
});

test("desconto inválido ou preço de referência incompatível é rejeitado", () => {
  for (const discountLabel of ["abc", "0% abaixo da média", "100% abaixo da média", "-1% abaixo da média"]) {
    assert.throws(() => parser().parseOffer({ ...raw, discountLabel }, context), /desconto/);
  }
  assert.throws(() => parser().parseOffer({ ...raw, referencePrice: "R$ 449" }, context), /referência/);
});

test("busca diária aceita os limites de duração e rejeita datas fora do horizonte", () => {
  for (const trip of [["2026-10-18", "2026-10-21"], ["2027-04-04", "2027-04-18"]]) {
    assert.ok(parser(trip).parseOffer(raw, context));
  }
  for (const trip of [["2026-10-17", "2026-10-24"], ["2027-04-12", "2027-04-19"],
    ["2026-12-01", "2026-12-03"], ["2026-12-01", "2026-12-16"]]) {
    assert.throws(() => parser(trip).parseOffer(raw, context));
  }
});

test("busca por comando aceita viagem curta ou longa, respeitando a janela completa", () => {
  const command = { ...context, mode: "command", startDate: "2027-06-01", endDate: "2027-06-30", maximumTripDays: 29 };
  for (const trip of [["2027-06-01", "2027-06-02"], ["2027-06-01", "2027-06-30"]]) {
    assert.ok(parser(trip).parseOffer(raw, command));
  }
  for (const trip of [["2027-05-31", "2027-06-02"], ["2027-06-01", "2027-07-01"], ["2027-06-01", "2027-06-01"]]) {
    assert.throws(() => parser(trip).parseOffer(raw, command), /janela/);
  }
});
