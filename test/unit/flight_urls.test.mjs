import { test } from "node:test";
import assert from "node:assert/strict";
import { createFlightProtocol } from "../../src/google_flights/protocol.mjs";
import { createFlightDateParser } from "../../src/google_flights/flight_dates.mjs";
import { createFlightQueries } from "../../src/google_flights/queries.mjs";
import { createDateHelpers } from "../../src/shared/dates.mjs";

const protocol = createFlightProtocol();
const dates = createDateHelpers();
// Tiny wire-format inputs, independent of the production encoder and search templates.
const leg = date => [26, 12, 18, 10, ...Buffer.from(date)];
const url = bytes => "https://www.google.com/travel/flights?tfs=" + Buffer.from(bytes).toString("base64url");

test("codec lê campos de texto e inteiros e preserva bytes desconhecidos", () => {
  const fields = protocol.fields(Buffer.from([8, 150, 1, 18, 3, 71, 82, 85]));
  assert.deepEqual(fields.map(field => field.key), [8, 18]);
  assert.deepEqual([...fields[0].raw], [8, 150, 1]);
  assert.equal(fields[1].data.toString(), "GRU");
  assert.deepEqual([...protocol.field(18, Buffer.from("GRU"))], [18, 3, 71, 82, 85]);
  assert.deepEqual([...protocol.integerField(8, 150)], [8, 150, 1]);
  assert.deepEqual([...protocol.airportLocation("GRU")], [8, 1, 18, 3, 71, 82, 85]);
});

test("codec rejeita truncamento, formato desconhecido e inteiros inválidos", () => {
  for (const bytes of [[18, 5, 71], [128], [13, 0], [11], Array(11).fill(128)]) {
    assert.throws(() => protocol.fields(Buffer.from(bytes)));
  }
  for (const number of [-1, 1.5, NaN, Infinity]) {
    assert.throws(() => protocol.integerField(8, number), /Inteiro inválido/);
  }
});

test("datas do voo são extraídas de ida e volta sem depender da ordem dos parâmetros", () => {
  const { flightDates } = createFlightDateParser({ protocol, dates });
  assert.deepEqual(flightDates(url([...leg("2027-01-01"), ...leg("2027-01-08")]) + "&hl=pt-BR"),
    ["2027-01-01", "2027-01-08"]);
});

test("links sem comprovação de ida e volta ou com datas impossíveis são rejeitados", () => {
  const { flightDates } = createFlightDateParser({ protocol, dates });
  for (const link of ["https://www.google.com/travel/flights?hl=pt-BR", url(leg("2027-01-01")),
    url([...leg("2027-02-29"), ...leg("2027-03-03")]),
    url([26, 24, ...leg("2027-01-01").slice(2), ...leg("2027-01-02").slice(2), ...leg("2027-01-08")])]) {
    assert.throws(() => flightDates(link));
  }
});

// A round trip carrying two distinct destination bytes, an old date and an unknown field.
const template = { tfs: Buffer.from([8, 6, 26, 15, 18, 10, ...Buffer.from("2026-01-01"), 114, 1, 65,
  26, 15, 18, 10, ...Buffer.from("2026-01-08"), 106, 1, 66]).toString("base64url") };
const { makeQuery } = createFlightQueries({ protocol, dates, templates: { nacionais: template },
  settings: { origins: ["GRU", "CGH"] } });

test("consulta diária aplica origem à ida e volta, remove datas e preserva destinos", () => {
  const query = new URL(makeQuery("nacionais", "CGH"));
  assert.equal(query.origin, "https://www.google.com");
  assert.equal(query.searchParams.get("curr"), "BRL");
  assert.equal(query.searchParams.get("hl"), "pt-BR");
  const fields = protocol.fields(Buffer.from(query.searchParams.get("tfs"), "base64url"));
  assert.deepEqual([...fields[0].raw], [8, 6]);
  const legs = fields.filter(field => field.key === 26).map(field => protocol.fields(field.data));
  assert.equal(legs.length, 2);
  assert.ok(legs.every(fields => !fields.some(field => field.key === 18)));
  assert.equal(legs[0].find(field => field.key === 114).data.toString(), "A");
  assert.equal(legs[1].find(field => field.key === 106).data.toString(), "B");
  assert.deepEqual([...legs[0].find(field => field.key === 106).data], [8, 1, 18, 3, 67, 71, 72]);
  assert.deepEqual([...legs[1].find(field => field.key === 114).data], [8, 1, 18, 3, 67, 71, 72]);
});

test("consulta por comando codifica a janela e duração pedidas", () => {
  const context = { mode: "command", startDate: "2027-06-01", endDate: "2027-06-30",
    departureEndDate: "2027-06-29", minimumTripDays: 1, maximumTripDays: 29 };
  const query = new URL(makeQuery("nacionais", "GRU", context));
  const fields = protocol.fields(Buffer.from(query.searchParams.get("tfs"), "base64url"));
  const wrapper = protocol.fields(fields.find(field => field.key === 218).data);
  const window = protocol.fields(wrapper[0].data);
  assert.deepEqual(protocol.fields(window.find(field => field.key === 18).data).map(field => field.data.toString()),
    ["2027-06-01", "2027-06-29"]);
  assert.deepEqual([...window.find(field => field.key === 42).data], [8, 1, 16, 29]);
  assert.throws(() => makeQuery("nacionais", "GRU", { ...context, maximumTripDays: 3 }), /Janela inválida/);
});

test("consulta não configurada é rejeitada antes de gerar uma URL", () => {
  assert.throws(() => makeQuery("nacionais", "VCP"), /Pesquisa não configurada/);
  assert.throws(() => makeQuery("desconhecida", "GRU"), /Pesquisa não configurada/);
});
