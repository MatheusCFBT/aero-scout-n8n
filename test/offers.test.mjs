import { test } from "node:test";
import assert from "node:assert/strict";
import { createModules } from "../src/modules.mjs";
import { card, context, flightLink } from "./helpers/examples.mjs";

const { prices, offerParser, ranking } = createModules();

test("preço brasileiro usa centavos e rejeita ambiguidade", () => {
  assert.equal(prices.priceCents("R$\u00a01.234,56"), 123456);
  assert.equal(prices.priceCents("R$ 400"), 40000);
  for (const price of ["US$ 400", "R$ -30", "R$ 1,234.56", "R$ 0", "abc"]) {
    assert.throws(() => prices.priceCents(price));
  }
});

test("datas reais incluem virada de ano", () => {
  const offer = offerParser.parseOffer(card(), context);
  assert.equal(offer.departure, "2026-12-28");
  assert.equal(offer.returnDate, "2027-01-04");
  assert.equal(offer.priceCents, 123456);
});

test("rejeita datas inválidas e duração fora dos limites", () => {
  const invalidTrips = [
    ["2026-02-30", "2026-03-06"],
    ["2026-12-28", "2026-12-29"],
    ["2026-12-01", "2026-12-20"],
  ];
  for (const trip of invalidTrips) {
    assert.throws(() => offerParser.parseOffer(card({ link: flightLink(...trip) }), context));
  }
});

test("exclui origem diferente, país desconhecido e categoria oposta", () => {
  assert.equal(offerParser.parseOffer(card({ details: "VCP–REC" }), context), null);
  assert.equal(offerParser.parseOffer(card({ country: "Portugal" }), context), null);
  assert.throws(() => offerParser.parseOffer(card({ country: "" }), context));

  const internationalCard = card({
    country: "Portugal",
    destination: "Lisboa",
    details: "GRU–LIS",
  });
  const internationalContext = { ...context, category: "internacionais" };
  const offer = offerParser.parseOffer(internationalCard, internationalContext);
  assert.equal(offer.country, "Portugal");
});

test("não aceita link externo nem datas fora do horizonte", () => {
  const externalLink = card({ link: "https://example.com" });
  const outsideHorizon = card({ link: flightLink("2027-07-01", "2027-07-08") });
  assert.throws(() => offerParser.parseOffer(externalLink, context));
  assert.throws(() => offerParser.parseOffer(outsideHorizon, context));
});

test("ranking desempata desconto igual pelo menor preço e consolida destinos", () => {
  const first = offerParser.parseOffer(card(), context);
  const offers = [
    first,
    { ...first, origin: "CGH", priceCents: 40000 },
    { ...first, destination: "Natal", priceCents: 90000 },
  ];
  const result = ranking.rank(offers, 10);
  assert.deepEqual(result.map((offer) => offer.priceCents), [40000, 90000]);
});

test("ranking mantém até dez destinos por categoria", () => {
  const example = offerParser.parseOffer(card(), context);
  const offers = Array.from({ length: 15 }, (_, index) => ({
    ...example,
    destination: "Cidade " + index,
    priceCents: 100000 - index * 100,
  }));
  assert.equal(ranking.rank(offers).length, 10);
});

test("país não reconhecido não vira internacional por exclusão", () => {
  const unknownCountry = card({ country: "Localidade" });
  const internationalContext = { ...context, category: "internacionais" };
  assert.throws(() => offerParser.parseOffer(unknownCountry, internationalContext));
});

test("rota extraída como array preserva separação dos campos HTML", () => {
  const extractedCard = card({ details: ["Sem escalas", "1h", "GRU–REC"] });
  const offer = offerParser.parseOffer(extractedCard, context);
  assert.equal(offer.destinationAirport, "REC");
});

test("maior desconto vence preço menor, inclusive no mesmo destino", () => {
  const offer = offerParser.parseOffer(card(), context);
  const input = [
    {...offer, destination: "Recife", discountPercent: 25, priceCents: 30000},
    {...offer, destination: "Recife", origin: "CGH", discountPercent: 40, priceCents: 90000},
    {...offer, destination: "Natal", discountPercent: 35, priceCents: 20000},
  ];
  const result = ranking.rank(input);
  assert.deepEqual(result.map((item) => item.discountPercent), [40, 35]);
  assert.equal(result[0].origin, "CGH");
  assert.equal(result[0].priceCents, 90000);
});

test("usa percentual explícito do card e aceita referência opcional", () => {
  const offer = offerParser.parseOffer(card({discountLabel: "35% abaixo da média", price: "R$ 449", referencePrice: "R$ 688"}), context);
  assert.equal(offer.discountPercent, 35);
  assert.equal(offerParser.parseOffer(card({discountLabel: "35%abaixo da média"}), context).discountPercent, 35);
  assert.equal(offer.referencePriceCents, 68800);
  assert.equal(offerParser.parseOffer(card({referencePrice: ""}), context).referencePriceCents, null);
});

test("ofertas sem percentual não entram; descontos inválidos geram aviso por erro", () => {
  assert.equal(offerParser.parseOffer(card({discountLabel: ""}), context), null);
  for (const label of ["abc", "0% abaixo da média", "100% abaixo da média", "-20% abaixo da média"]) {
    assert.throws(() => offerParser.parseOffer(card({discountLabel: label}), context));
  }
  assert.throws(() => offerParser.parseOffer(card({referencePrice: "R$ 100"}), context));
  const valid = offerParser.parseOffer(card(), context);
  assert.deepEqual(ranking.rank([{...valid, discountPercent: null}, {...valid, discountPercent: NaN}]), []);
});
