import { test } from "node:test";
import assert from "node:assert/strict";
import { createTextHelpers } from "../../src/shared/text.mjs";
import { createPriceHelpers } from "../../src/shared/prices.mjs";
import { createDateHelpers } from "../../src/shared/dates.mjs";

const text = createTextHelpers();
const prices = createPriceHelpers({ text });
const dates = createDateHelpers();

test("normalização aceita ausentes, espaços Unicode e caracteres equivalentes", () => {
  assert.equal(text.normalize(null), "");
  assert.equal(text.normalize(undefined), "");
  assert.equal(text.normalize("  ＢＲ\u00a0  Recife\n"), "BR Recife");
  assert.equal(text.normalize(42), "42");
});

test("escape HTML protege texto e atributos sem perder o conteúdo", () => {
  assert.equal(text.escapeHtml('A&B <Centro> "Sul"'), "A&amp;B &lt;Centro&gt; &quot;Sul&quot;");
  assert.equal(text.escapeHtml("Recife"), "Recife");
});

test("preços BRL são convertidos em centavos sem arredondamento", () => {
  assert.equal(prices.priceCents("R$\u00a01.234,56"), 123456);
  assert.equal(prices.priceCents("R$ 400"), 40000);
  assert.equal(prices.priceCents("R$ 0,01"), 1);
});

test("preços inválidos, ambíguos e fora da precisão segura são rejeitados", () => {
  for (const price of ["US$ 20", "R$ -1", "R$ 0", "R$ 1,234.56", "R$ 1,2", "abc", "R$ 9007199254740992"]) {
    assert.throws(() => prices.priceCents(price), /Preço/, price);
  }
});

test("datas impossíveis e formatos ambíguos são rejeitados", () => {
  for (const date of ["2027-02-29", "2028-02-30", "2027-04-31", "01/01/2027", "2027-1-01"]) {
    assert.throws(() => dates.day(date), /Data inválida/, date);
  }
  assert.equal(dates.day("2028-02-29"), Date.UTC(2028, 1, 29));
});

test("somar meses respeita o último dia e a virada do ano", () => {
  assert.equal(dates.addMonths("2027-01-31", 1), "2027-02-28");
  assert.equal(dates.addMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(dates.addMonths("2027-12-31", 2), "2028-02-29");
});

test("duração considera dias de calendário, ano bissexto e ordem das datas", () => {
  assert.equal(dates.tripDuration("2028-02-28", "2028-03-01"), 2);
  assert.equal(dates.tripDuration("2027-12-31", "2028-01-01"), 1);
  assert.equal(dates.tripDuration("2027-01-01", "2027-01-01"), 0);
  assert.equal(dates.tripDuration("2027-01-02", "2027-01-01"), -1);
});
