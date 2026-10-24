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
  assert.match(result[0].text, /25% abaixo da média/);
  assert.doesNotMatch(result[0].text, /referência:/);
});

test("falha não é anunciada como pesquisa sem ofertas", () => {
  const emptyReport = { ...context, offers: [], warnings: [] };
  const failedMessage = messages.formatReports([{ ...emptyReport, status: "failed" }])[0];
  const emptyMessage = messages.formatReports([{ ...emptyReport, status: "complete" }])[0];

  assert.match(failedMessage.text, /Falha/);
  assert.match(emptyMessage.text, /Nenhuma oferta com desconto/);
});

test("lista compacta destaca preço e desconto, preservando dados e omitindo referência", () => {
  const offer = offerParser.parseOffer(card(), context);
  const before = structuredClone(offer);
  const report = { ...context, status: "complete", warnings: [], offers: [offer] };
  const message = messages.formatReports([report])[0];
  assert.match(message.text, /🇧🇷 Voos nacionais/);
  assert.match(message.text, /<b>R\$\s1\.234,56 · 25% abaixo da média<\/b>/);
  assert.match(message.text, /GRU → REC · 28\/12\/26 a 04\/01\/27/);
  assert.match(message.text, /Próximos 6 meses · Viagens de 3–14 dias/);
  assert.match(message.text, /Atualizado em 17\/10\/26 às 09:00 — São Paulo/);
  assert.doesNotMatch(message.text, /Parte |referência:|Pesquisa concluída|\(Brasil\)/);
  assert.deepEqual(offer, before);
  assert.equal(offer.referencePriceCents, 164608);
});

test("internacionais mostram país e janela personalizada com ano", () => {
  const offer = { ...offerParser.parseOffer(card(), context), category: "internacionais",
    destination: "Lisboa", country: "Portugal" };
  const message = messages.formatReports([{ ...context, mode: "command", category: "internacionais",
    startDate: "2027-05-14", endDate: "2027-05-20", maximumTripDays: 6,
    status: "complete", warnings: [], offers: [offer] }])[0];
  assert.match(message.text, /🌎 Voos internacionais/);
  assert.match(message.text, /<b>Lisboa<\/b>, Portugal/);
  assert.match(message.text, /📅 14\/05\/27 a 20\/05\/27/);
  assert.match(message.text, /GRU e CGH/);
  assert.doesNotMatch(message.text, /Próximos|Parte /);
});

test("HTML especial é escapado em destino, país, avisos e link", () => {
  const offer = { ...offerParser.parseOffer(card(), context), category: "internacionais",
    destination: 'A&B <Centro>', country: 'País <X>', url: 'https://example.test/?a=1&b="2"' };
  const text = messages.formatReports([{ ...context, category: "internacionais", status: "partial",
    warnings: ['erro <script> & "aviso"'], offers: [offer] }])[0].text;
  assert.match(text, /A&amp;B &lt;Centro&gt;/);
  assert.match(text, /País &lt;X&gt;/);
  assert.match(text, /a=1&amp;b=&quot;2&quot;/);
  assert.match(text, /⚠️ <b>Resultado parcial/);
  assert.doesNotMatch(text, /<script>/);
});

test("partes repetem contexto, preservam ordem e nunca dividem uma oferta", () => {
  const offer = offerParser.parseOffer(card(), context);
  const offers = Array.from({ length: 10 }, (_, index) => ({ ...offer,
    destination: "Destino " + index, url: flightLink() + "&q=" + "a".repeat(700) }));
  const parts = messages.formatReports([{ ...context, status: "complete", warnings: [], offers }]);
  assert.ok(parts.length > 1);
  for (const [index, part] of parts.entries()) {
    assert.ok(part.text.length <= 3800);
    assert.match(part.text, /🇧🇷 Voos nacionais/);
    assert.match(part.text, /Próximos 6 meses/);
    assert.ok(part.text.includes("Parte " + (index + 1) + "/" + parts.length));
    const destinations = [...part.text.matchAll(/\d+\. <b>Destino \d+<\/b>/g)];
    assert.equal(destinations.length, [...part.text.matchAll(/>Consultar voo<\/a>/g)].length);
  }
  assert.deepEqual([...parts.map(part => part.text).join("\n").matchAll(/\d+\. <b>Destino (\d+)<\/b>/g)]
    .map(match => Number(match[1])), Array.from({ length: 10 }, (_, index) => index));
});
