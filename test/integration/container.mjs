import { GenericContainer, Wait } from 'testcontainers';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createModules } from '../../src/modules.mjs';

export const IMAGE = 'n8nio/n8n:2.43.7@sha256:3db21366be1d3c77c1708963129c051948573019659e8873e0294be035ffc1b2';
const root = new URL('../../', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL('workflows/' + name, root), 'utf8'));

export async function startEnvironment(scenario) {
  const main = read('aero_scout_daily.json');
  const query = read('aero_scout_query.json');
  const delivery = read('aero_scout_delivery.json');
  const polling = ['command', 'commands-invalid', 'restart'].includes(scenario);
  const configuration = { chatId: '123', dryRun: scenario === 'preview',
    today: '2026-10-18', searchedAt: '2026-10-18T12:00:00Z' };
  for (const assignment of main.nodes.find(node => node.name === 'Configuração').parameters.assignments.assignments) {
    assignment.value = configuration[assignment.name];
  }
  main.nodes.find(node => node.type === 'n8n-nodes-base.scheduleTrigger').disabled = true;
  // n8n CLI cannot start schedule/custom triggers. Add a native test ingress;
  // preserve every original node, Code program and connection.
  if (!polling) {
    main.nodes.push({ id: 'integration-manual', name: 'Integration CLI ingress',
      type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [-240, 0], parameters: {} });
    main.connections['Integration CLI ingress'] = {
      main: [[{ node: 'Configuração', type: 'main', index: 0 }]],
    };
  }
  const credential = { telegramApi: { id: 'integrationTelegram', name: 'Integration only' } };
  const receiver = main.nodes.find(node => node.type === 'CUSTOM.telegramPollingTrigger');
  receiver.parameters.allowedChatId = '123';
  receiver.credentials = credential;
  delivery.nodes.find(node => node.type === 'n8n-nodes-base.telegram').credentials = credential;
  query.nodes.find(node => node.type === 'n8n-nodes-base.httpRequest').parameters.url =
    "={{ $json.url.replace('https://www.google.com', 'http://127.0.0.1:3456') }}";
  const modules = createModules();
  const context = polling && scenario !== 'commands-invalid'
    ? modules.commands.parse({ ...configuration, mode: 'telegram', requestChatId: '123', updateId: 1,
      text: '/ofertas Brasil 14/05/27 - 20/05/27' }) : configuration;
  const queries = ['nacionais', 'internacionais'].flatMap(category => ['GRU', 'CGH'].map(origin => {
    const url = new URL(modules.queries.makeQuery(category, origin, context));
    return { category, origin, path: url.pathname + url.search };
  }));
  const credentials = [{ id: 'integrationTelegram', name: 'Integration only', type: 'telegramApi',
    data: { accessToken: '123:fake', baseUrl: 'http://127.0.0.1:3456' } }];
  const contents = [
    ['config.json', { scenario, polling, main: main.id, children: [query.id, delivery.id], queries }],
    ['workflows.json', [query, delivery, main]], ['credential.json', credentials],
  ].map(([name, value]) => ({ content: JSON.stringify(value), target: '/test/' + name, mode: 0o644 }));
  let startupLog = '';
  const container = await new GenericContainer(IMAGE)
    .withLogConsumer(stream => stream.on('data', chunk => { startupLog = (startupLog + chunk).slice(-12000); }))
    .withNetworkMode('none')
    .withEntrypoint(['node']).withCommand(['/test/runtime.cjs'])
    .withEnvironment({ N8N_DIAGNOSTICS_ENABLED: 'false', N8N_VERSION_NOTIFICATIONS_ENABLED: 'false',
      N8N_RUNNERS_MODE: 'internal', N8N_RUNNERS_GRANT_TOKEN_TTL: '120',
      GENERIC_TIMEZONE: 'America/Sao_Paulo', EXECUTIONS_DATA_PRUNE: 'false' })
    .withCopyFilesToContainer(['runtime.cjs', 'fixtures.cjs'].map(name => ({
      source: fileURLToPath(new URL(name, import.meta.url)), target: '/test/' + name, mode: 0o644,
    })))
    .withCopyDirectoriesToContainer([{ source: fileURLToPath(new URL('src/custom', root)),
      target: '/home/node/.n8n/custom/aero-scout', mode: 0o755 }])
    .withCopyContentToContainer(contents)
    .withWaitStrategy(Wait.forLogMessage('AERO_INTEGRATION_READY'))
    .withStartupTimeout(180000).start().catch(error => {
      throw Error(error.message + '\nContainer startup log:\n' + startupLog, { cause: error });
    });
  return {
    async request(path, body) {
      const script = `const r=await fetch('http://127.0.0.1:3456'+process.argv[1],{
        method:process.argv[2]?'POST':'GET',headers:{'Content-Type':'application/json'},
        ...(process.argv[2]?{body:process.argv[2]}:{}),signal:AbortSignal.timeout(200000)});
        const text=await r.text();if(!r.ok)throw Error(text);console.log(text);`;
      const result = await container.exec(['node', '--input-type=module', '-e', script, path,
        body === undefined ? '' : JSON.stringify(body)]);
      if (result.exitCode !== 0) { throw Error(result.output); }
      return JSON.parse(result.stdout);
    },
    close: () => container.stop(),
  };
}

export async function until(read, check, label, timeout = 90000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await read();
    if (check(last)) { return last; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw Error('Timeout: ' + label + ': ' + JSON.stringify(last));
}

export function items(result, name) {
  return (result.runData?.[name] || []).flatMap(run => run.data?.main?.[0]?.map(item => item.json) || []);
}
