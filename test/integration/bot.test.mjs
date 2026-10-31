import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startEnvironment, until, items } from './container.mjs';

async function scenario(name, verify) {
  const env = await startEnvironment(name);
  try { await verify(env); }
  catch (error) {
    console.error('Scenario: ' + name);
    console.error(await env.request('/control/logs').catch(() => 'n8n log unavailable'));
    throw error;
  } finally { await env.close(); }
}

function lists(result) { return items(result, 'Montar listas'); }
function destinations(text) { return [...text.matchAll(/\d+\. <b>(.*?)<\/b>/g)].map(match => match[1]); }
function checkLists(result) {
  const messages = lists(result);
  assert.deepEqual(messages.map(item => item.category), ['nacionais', 'internacionais']);
  assert.deepEqual(destinations(messages[0].text), ['Natal', 'Recife', 'Maceió']);
  assert.deepEqual(destinations(messages[1].text), ['Lisboa']);
  assert.match(messages[0].text, /35% abaixo da média/);
  assert.doesNotMatch(messages[0].text, /30% abaixo da média/);
}

async function runDaily(env) {
  const execution = await env.request('/control/run', {});
  const state = await env.request('/control/state');
  assert.ok(state.calls.every(call => !call.unexpected), JSON.stringify(state.calls));
  return { execution, state };
}

test('busca diária atravessa consulta HTTP, extração, ranking e entrega reais', { timeout: 420000 }, async () => {
  await scenario('daily', async env => {
    const { execution, state } = await runDaily(env);
    assert.equal(execution.code, 0);
    assert.equal(execution.result.error, undefined);
    assert.equal(state.calls.length, 4);
    assert.deepEqual(new Set(state.calls.map(call => call.category + '/' + call.origin)),
      new Set(['nacionais/GRU', 'nacionais/CGH', 'internacionais/GRU', 'internacionais/CGH']));
    checkLists(execution.result);
    assert.deepEqual(state.messages.map(message => message.text), lists(execution.result).map(message => message.text));
    assert.ok(state.messages.every(message => String(message.chat_id) === '123'));
    const details = await env.request('/control/details');
    const cards = details.flatMap(detail => items(detail.result, 'Separar cards'));
    assert.ok(cards.length > 0);
    assert.ok(cards.every(card => !Object.hasOwn(card.meta, 'data') && !Object.hasOwn(card.meta, 'cards')));
  });
});

test('modo de simulação percorre a busca sem chamar sendMessage', { timeout: 420000 }, async () => {
  await scenario('preview', async env => {
    const { execution, state } = await runDaily(env);
    assert.equal(execution.code, 0);
    checkLists(execution.result);
    assert.equal(state.calls.length, 4);
    assert.deepEqual(state.messages, []);
    assert.deepEqual(items(execution.result, 'Enviar listas'), lists(execution.result));
  });
});

test('respostas HTTP transitórias repetem a mesma consulta e descartam o corpo anterior', { timeout: 420000 }, async () => {
  await scenario('retry', async env => {
    const { execution, state } = await runDaily(env);
    assert.equal(execution.code, 0);
    assert.equal(state.calls.length, 12);
    assert.equal(new Set(state.calls.map(call => call.path)).size, 4);
    assert.ok(items(execution.result, 'Buscar ofertas').every(report => report.attempt === 3));
    const details = await env.request('/control/details');
    const attempts = details.flatMap(detail => items(detail.result, 'Iniciar tentativa'));
    assert.ok(attempts.length >= 12);
    assert.ok(attempts.every(attempt => !Object.hasOwn(attempt, 'data') &&
      !Object.hasOwn(attempt, 'error') && !Object.hasOwn(attempt, 'statusCode')));
    checkLists(execution.result);
  });
});

test('resultado vazio confirmado é entregue sem anunciar uma falha', { timeout: 420000 }, async () => {
  await scenario('empty', async env => {
    const { execution, state } = await runDaily(env);
    assert.equal(execution.code, 0);
    const reports = items(execution.result, 'Buscar ofertas');
    assert.equal(reports.length, 4);
    assert.ok(reports.every(report => report.status === 'complete' && report.offers.length === 0));
    assert.equal(state.messages.length, 2);
    assert.ok(state.messages.every(message => /Nenhuma oferta com desconto/.test(message.text) && !/Falha na pesquisa/.test(message.text)));
  });
});

test('falha nas consultas nacionais preserva a entrega das ofertas internacionais', { timeout: 420000 }, async () => {
  await scenario('partial', async env => {
    const { execution, state } = await runDaily(env);
    assert.equal(execution.code, 0);
    assert.equal(state.messages.length, 2);
    assert.match(state.messages[0].text, /Falha na pesquisa/);
    assert.doesNotMatch(state.messages[0].text, /Nenhuma oferta com desconto/);
    assert.match(state.messages[1].text, /Lisboa/);
    const reports = items(execution.result, 'Buscar ofertas');
    assert.ok(reports.filter(report => report.category === 'nacionais').every(report => report.status === 'failed'));
    assert.ok(reports.filter(report => report.category === 'internacionais').every(report => report.offers.length > 0));
  });
});

test('falha no primeiro envio não impede o seguinte e termina a execução com erro', { timeout: 420000 }, async () => {
  await scenario('delivery-failure', async env => {
    const { execution, state } = await runDaily(env);
    assert.ok(execution.code !== 0 || execution.result.error);
    assert.ok(execution.result.error);
    assert.equal(state.messages.length, 2);
    assert.match(state.messages[1].text, /Lisboa/);
  });
});

function update(id, text, chat = 123) {
  return { update_id: id, message: { message_id: id, date: Math.floor(Date.now() / 1000), chat: { id: chat }, text } };
}
async function completed(env, count = 1) {
  return until(() => env.request('/control/state'), state => state.executions.length === count &&
    state.executions.every(execution => ['success', 'error', 'crashed'].includes(execution.status)), 'main execution completion');
}

test('polling real propaga comando, janela e ofertas até a entrega', { timeout: 420000 }, async () => {
  await scenario('command', async env => {
    await env.request('/control/updates', [update(1, '/ofertas Brasil 14/05/27 - 20/05/27')]);
    const state = await completed(env);
    assert.equal(state.executions[0].status, 'success');
    assert.equal(state.calls.length, 4);
    assert.equal(state.messages.length, 2);
    assert.ok(state.messages.every(message => /14\/05\/27 a 20\/05\/27/.test(message.text)));
    const details = await env.request('/control/details');
    const main = details.find(detail => detail.id === state.executions[0].id);
    checkLists(main.result);
    const reports = items(main.result, 'Buscar ofertas');
    assert.equal(reports.length, 4);
    assert.ok(reports.every(report => report.mode === 'command' && report.startDate === '2027-05-14'));
    assert.ok(reports.flatMap(report => report.offers).every(offer => offer.departure >= '2027-05-14' && offer.returnDate <= '2027-05-20'));
    assert.ok(reports.some(report => report.status === 'partial' && report.warnings.some(warning => /janela/.test(warning))));
    assert.ok(state.messages.every(message => !message.text.includes('<b>Salvador</b>')));
  });
});

test('polling ignora outro chat e responde comando inválido sem fazer consultas', { timeout: 420000 }, async () => {
  await scenario('commands-invalid', async env => {
    await env.request('/control/updates', [update(1, '/ofertas BR 14/05/27 - 20/05/27', 456), update(2, '/ofertas errado')]);
    const state = await completed(env);
    assert.equal(state.executions[0].status, 'success');
    assert.deepEqual(state.calls, []);
    assert.equal(state.messages.length, 1);
    assert.match(state.messages[0].text, /Comando inválido/);
    await until(() => env.request('/control/state'), current => current.offsets.includes(3), 'cursor advanced past both updates');
  });
});

test('reiniciar o n8n preserva cursor e não repete comando, aceitando o próximo', { timeout: 420000 }, async () => {
  await scenario('restart', async env => {
    await env.request('/control/updates', [update(1, '/ofertas BR 14/05/27 - 20/05/27')]);
    const first = await completed(env);
    assert.equal(first.executions[0].status, 'success');
    assert.equal(first.messages.length, 2);
    await env.request('/control/restart', {});
    await env.request('/control/updates', [update(1, '/ofertas BR 14/05/27 - 20/05/27'), update(2, '/ofertas BR 14/05/27 - 20/05/27')]);
    const state = await completed(env, 2);
    assert.ok(state.executions.every(execution => execution.status === 'success'));
    assert.equal(state.messages.length, 4);
    assert.equal(state.calls.length, 8);
    assert.ok(state.offsets.some(offset => offset === 2));
  });
});
