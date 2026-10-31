import { test } from "node:test";
import assert from "node:assert/strict";
import { createTelegramCommands } from "../../src/telegram/commands.mjs";
import { createDateHelpers } from "../../src/shared/dates.mjs";
import { createTextHelpers } from "../../src/shared/text.mjs";

const { parse } = createTelegramCommands({ dates: createDateHelpers(), text: createTextHelpers(),
  settings: { origins: ["GRU", "CGH"] } });
const configuration = { mode: "telegram", chatId: "-123", requestChatId: "-123",
  today: "2026-10-18", updateId: 42, dryRun: false };
const command = text => parse({ ...configuration, text });

test("comando válido define a janela sem modificar a configuração", () => {
  const input = { ...configuration, text: "/ofertas Brasil 14/05/27 - 20/05/27" };
  const before = structuredClone(input);
  const result = parse(input);
  assert.equal(result.action, "search");
  assert.equal(result.mode, "command");
  assert.equal(result.startDate, "2027-05-14");
  assert.equal(result.endDate, "2027-05-20");
  assert.equal(result.departureEndDate, "2027-05-19");
  assert.equal(result.minimumTripDays, 1);
  assert.equal(result.maximumTripDays, 6);
  assert.equal(result.requestId, "42");
  assert.equal(result.chatId, "-123");
  assert.equal(result.dryRun, false);
  assert.deepEqual(input, before);
});

test("BR, caixa diferente, sufixo do bot e travessão são aceitos", () => {
  const result = command(" /OFERTAS@DetectiveFlightBot br 01/06/27 — 30/06/27 ");
  assert.equal(result.action, "search");
  assert.equal(result.startDate, "2027-06-01");
  assert.equal(result.maximumTripDays, 29);
});

test("comandos sucessivos não reutilizam as datas anteriores", () => {
  const first = command("/ofertas BR 14/05/27 - 20/05/27");
  const second = command("/ofertas BR 31/12/27 - 01/01/28");
  assert.equal(second.startDate, "2027-12-31");
  assert.equal(second.maximumTripDays, 1);
  assert.equal(first.startDate, "2027-05-14");
});

test("ano bissexto e início no dia atual são aceitos", () => {
  assert.equal(command("/ofertas BR 28/02/28 - 01/03/28").maximumTripDays, 2);
  assert.equal(command("/ofertas BR 18/10/26 - 19/10/26").action, "search");
});

test("ajuda e start orientam o usuário sem iniciar busca", () => {
  for (const text of ["/start", "/ajuda"]) {
    const result = command(text);
    assert.equal(result.action, "reply");
    assert.match(result.text, /\/ofertas Brasil/);
    assert.match(result.text, /GRU e CGH/);
  }
});

test("parâmetros inválidos recebem orientação em vez de busca", () => {
  for (const text of ["/ofertas", "/ofertas USA 14/05/27 - 20/05/27",
    "/ofertas BR 29/02/27 - 03/03/27", "/ofertas BR 17/10/26 - 20/10/26",
    "/ofertas BR 20/05/27 - 20/05/27", "/ofertas BR 21/05/27 - 20/05/27"]) {
    const result = command(text);
    assert.equal(result.action, "reply", text);
    assert.match(result.text, /Use \/ofertas/, text);
  }
});

test("outro chat, outro bot e mensagens comuns não disparam ações", () => {
  assert.equal(parse({ ...configuration, requestChatId: "999", text: "/start" }), null);
  for (const text of ["olá", "/desconhecido", "/ofertas@OutroBot BR 14/05/27 - 20/05/27"]) {
    assert.equal(command(text), null);
  }
});

test("execução agendada preserva configuração e inicia pesquisa diária", () => {
  const input = { today: "2026-10-18", dryRun: true };
  assert.deepEqual(parse(input), { ...input, action: "search", mode: "daily" });
  assert.deepEqual(input, { today: "2026-10-18", dryRun: true });
});
