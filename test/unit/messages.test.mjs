import { test } from "node:test";
import assert from "node:assert/strict";
import { createTelegramMessages } from "../../src/telegram/messages.mjs";
import { createTextHelpers } from "../../src/shared/text.mjs";

const { formatReports } = createTelegramMessages({ text: createTextHelpers(), settings: {
  categories: ["nacionais", "internacionais"], origins: ["GRU", "CGH"], currency: "BRL",
  timezone: "America/Sao_Paulo", telegram: { messageBudget: 3800, partLabelReserve: 40, warningLimit: 6, warningLength: 240 },
} });
const offer = { category: "nacionais", destination: "Recife", country: "Brasil", priceCents: 123456,
  discountPercent: 25, origin: "GRU", destinationAirport: "REC", departure: "2026-12-28",
  returnDate: "2027-01-04", url: "https://example.test/voo" };
const report = { category: "nacionais", status: "complete", horizonMonths: 6,
  searchedAt: "2026-10-18T12:00:00Z", warnings: [], offers: [offer] };

test("mensagem apresenta preço, desconto, rota, datas e horário de São Paulo", () => {
  const before = structuredClone(report);
  const [message] = formatReports([report]);
  assert.match(message.text, /Recife/);
  assert.match(message.text, /R\$\s1\.234,56 · 25% abaixo da média/);
  assert.match(message.text, /GRU → REC · 28\/12\/26 a 04\/01\/27/);
  assert.match(message.text, /18\/10\/26 às 09:00/);
  assert.match(message.text, /href="https:\/\/example.test\/voo"/);
  assert.deepEqual(report, before);
});

test("categorias são apresentadas separadamente, com nacionais primeiro", () => {
  const international = { ...report, category: "internacionais", offers: [{ ...offer,
    category: "internacionais", destination: "Lisboa", country: "Portugal" }] };
  const result = formatReports([international, report]);
  assert.deepEqual(result.map(item => item.category), ["nacionais", "internacionais"]);
  assert.match(result[1].text, /Lisboa<\/b>, Portugal/);
  assert.doesNotMatch(result[0].text, /Lisboa/);
});

test("comando apresenta sua janela sem anunciar o horizonte diário", () => {
  const [message] = formatReports([{ ...report, mode: "command", startDate: "2027-05-14", endDate: "2027-05-20" }]);
  assert.match(message.text, /14\/05\/27 a 20\/05\/27/);
  assert.doesNotMatch(message.text, /Próximos 6 meses/);
});

test("resultado vazio, falha e resultado parcial são distinguíveis", () => {
  const empty = formatReports([{ ...report, offers: [] }])[0].text;
  assert.match(empty, /Nenhuma oferta com desconto/);
  for (const [status, label] of [["failed", /Falha na pesquisa/], ["partial", /Resultado parcial/]]) {
    const message = formatReports([{ ...report, status, offers: [], warnings: ["timeout"] }])[0].text;
    assert.match(message, label);
    assert.match(message, /timeout/);
    assert.doesNotMatch(message, /Nenhuma oferta com desconto/);
  }
});

test("destino, país, avisos e URL são escapados para HTML", () => {
  const [message] = formatReports([{ ...report, category: "internacionais", status: "partial",
    warnings: ['falha <script> & "aviso"'], offers: [{ ...offer, category: "internacionais",
      destination: "A&B <Centro>", country: "País <X>", url: 'https://example.test/?a=1&b="2"' }] }]);
  assert.match(message.text, /A&amp;B &lt;Centro&gt;/);
  assert.match(message.text, /País &lt;X&gt;/);
  assert.match(message.text, /falha &lt;script&gt; &amp; &quot;aviso&quot;/);
  assert.match(message.text, /a=1&amp;b=&quot;2&quot;/);
  assert.doesNotMatch(message.text, /<script>/);
});

test("lista longa é dividida preservando ordem, ofertas inteiras e limite do Telegram", () => {
  const offers = Array.from({ length: 8 }, (_, index) => ({ ...offer, destination: "Cidade " + index,
    url: "https://example.test/" + "a".repeat(500) }));
  const messages = formatReports([{ ...report, offers }]);
  assert.ok(messages.length > 1);
  assert.deepEqual([...messages.map(item => item.text).join("\n").matchAll(/<b>Cidade (\d+)<\/b>/g)]
    .map(match => Number(match[1])), [0, 1, 2, 3, 4, 5, 6, 7]);
  for (const [index, message] of messages.entries()) {
    assert.ok(message.text.length <= 4096);
    assert.ok(message.text.includes("Parte " + (index + 1) + "/" + messages.length));
    assert.equal([...message.text.matchAll(/<b>Cidade \d+<\/b>/g)].length,
      [...message.text.matchAll(/>Consultar voo<\/a>/g)].length);
  }
});

test("uma oferta grande demais é rejeitada em vez de truncada", () => {
  assert.throws(() => formatReports([{ ...report, offers: [{ ...offer, url: "x".repeat(5000) }] }]), /limite/);
});
