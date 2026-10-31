const fs = require('node:fs');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { page } = require('./fixtures.cjs');
const config = JSON.parse(fs.readFileSync('/test/config.json', 'utf8'));
const base = 'http://127.0.0.1:5678';
let server, cookie = '';
const browserId = 'integration-browser';
const calls = [], messages = [], offsets = [];
let updates = [];
const attempts = new Map();

function command(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('n8n', args, { env: { ...process.env, N8N_RUNNERS_BROKER_PORT: '5689' },
      stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, output }));
  });
}

async function successful(args) {
  const result = await command(args);
  if (result.code !== 0) { throw Error(args[0] + ': ' + result.output.slice(-5000)); }
  return result;
}

async function until(check, label, timeout = 90000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) { return; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw Error('Timeout: ' + label);
}

async function api(path, method = 'GET', body) {
  const response = await fetch(base + path, { method,
    headers: { Cookie: cookie, 'browser-id': browserId, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  if (!response.ok) { throw Error(path + ': ' + JSON.stringify(result)); }
  return result.data;
}

async function startN8n() {
  const log = fs.openSync('/tmp/n8n.log', 'a');
  server = spawn('n8n', ['start'], { stdio: ['ignore', log, log] });
  fs.closeSync(log);
  await until(async () => {
    if (server.exitCode !== null) { throw Error(fs.readFileSync('/tmp/n8n.log', 'utf8').slice(-5000)); }
    try { return (await fetch(base + '/healthz/readiness')).ok; } catch { return false; }
  }, 'n8n readiness');
}

async function publish(id) {
  const workflow = await api('/rest/workflows/' + id);
  await api('/rest/workflows/' + id + '/activate', 'POST', { versionId: workflow.versionId });
}

async function execution(id) {
  const detail = await api('/rest/executions/' + id + '?includeData=true');
  const data = typeof detail.data === 'string'
    ? require('/usr/local/lib/node_modules/n8n/node_modules/flatted').parse(detail.data) : detail.data;
  return { id, status: detail.status, result: data.resultData };
}

function cliExecution(output) {
  const start = output.indexOf('\n{');
  if (start < 0) { throw Error(output.slice(-5000)); }
  let json = output.slice(start + 1);
  const trailer = json.indexOf('\nError executing workflow.');
  if (trailer >= 0) { json = json.slice(0, trailer); }
  return JSON.parse(json.trim()).data.resultData;
}

async function control(path, body) {
  if (path === '/control/state') {
    const listing = await api('/rest/executions?filter=' + encodeURIComponent(JSON.stringify({ workflowId: config.main })));
    return { calls, messages, offsets, executions: listing.results.map(({ id, status }) => ({ id, status })) };
  }
  if (path === '/control/details') {
    const listing = await api('/rest/executions');
    return Promise.all(listing.results.filter(item => ['success', 'error', 'crashed'].includes(item.status))
      .map(item => execution(item.id)));
  }
  if (path === '/control/updates') { updates = body; return { queued: updates.length }; }
  if (path === '/control/run') {
    const result = await command(['execute', '--id=' + config.main, '--rawOutput']);
    return { code: result.code, result: cliExecution(result.output) };
  }
  if (path === '/control/restart') {
    const stopped = new Promise(resolve => server.once('exit', resolve));
    server.kill('SIGTERM');
    await stopped;
    await startN8n();
    return { restarted: true };
  }
  if (path === '/control/logs') { return { log: fs.readFileSync('/tmp/n8n.log', 'utf8').slice(-10000) }; }
  throw Error('Unknown control endpoint: ' + path);
}

const local = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1:3456');
    let raw = '';
    for await (const chunk of request) { raw += chunk; }
    const body = raw ? JSON.parse(raw) : {};
    if (url.pathname.startsWith('/control/')) {
      const result = await control(url.pathname, body);
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(result));
      return;
    }
    const query = config.queries.find(item => item.path === request.url);
    if (query) {
      const attempt = (attempts.get(request.url) || 0) + 1;
      attempts.set(request.url, attempt);
      calls.push({ category: query.category, origin: query.origin, path: request.url, attempt });
      if (config.scenario === 'retry' && attempt < 3) {
        response.writeHead(503); response.end('PREVIOUS_RESPONSE_BODY'); return;
      }
      if (config.scenario === 'partial' && query.category === 'nacionais') {
        response.writeHead(403); response.end('Unavailable'); return;
      }
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(page(query, config.scenario)); return;
    }
    const method = url.pathname.split('/').at(-1);
    let result;
    if (method === 'getMe') { result = { id: 123, username: 'DetectiveFlightBot' }; }
    else if (method === 'getWebhookInfo') { result = { url: '' }; }
    else if (method === 'getUpdates') {
      offsets.push(body.offset);
      result = updates.filter(update => update.update_id >= body.offset);
    } else if (method === 'sendMessage') {
      messages.push(body);
      if (config.scenario === 'delivery-failure' && messages.length === 1) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: false, error_code: 400, description: 'Controlled send failure' })); return;
      }
      result = { message_id: messages.length, date: Math.floor(Date.now() / 1000), chat: { id: 123 }, text: body.text };
    } else {
      calls.push({ unexpected: request.url }); response.writeHead(404); response.end('Unexpected URL'); return;
    }
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ ok: true, result }));
  } catch (error) {
    console.error(error.stack);
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: error.message }));
  }
});

async function main() {
  if (fs.existsSync('/home/node/.n8n/database.sqlite')) { throw Error('Integration requires a fresh database'); }
  await new Promise(resolve => local.listen(3456, '127.0.0.1', resolve));
  await startN8n();
  const setup = await fetch(base + '/rest/owner/setup', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'browser-id': browserId },
    body: JSON.stringify({ email: 'integration@example.test', firstName: 'Integration', lastName: 'Test', password: 'TestOnly123!abc' }) });
  if (!setup.ok) { throw Error(await setup.text()); }
  cookie = setup.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  await successful(['import:credentials', '--input=/test/credential.json']);
  await successful(['import:workflow', '--input=/test/workflows.json']);
  for (const id of config.children) { await publish(id); }
  if (config.polling) {
    await publish(config.main);
    await until(() => offsets.length > 0, 'polling activation');
  }
  console.log('AERO_INTEGRATION_READY');
}

process.on('SIGTERM', () => { server?.kill('SIGTERM'); local.close(); });
main().catch(error => { console.error(error.stack); server?.kill('SIGTERM'); local.close(); process.exitCode = 1; });
