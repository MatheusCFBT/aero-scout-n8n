import { Script } from "node:vm";

/** Migrate the graph while preserving local configuration and credential references. */
export function prepareWorkflowUpdate(installed, generated) {
  const snapshots = Array.isArray(installed) ? installed : [installed];
  const previousMain = snapshots.find((item) => item.id === generated.main.id) ||
    snapshots.find((item) => item.nodes?.some((node) => node.name === "Configuração"));
  if (!previousMain) {
    throw Error("Workflow principal não encontrado no backup; a migração foi interrompida.");
  }
  const previousDelivery = snapshots.find((item) => item.id === generated.delivery.id);
  const previousConfiguration = previousMain.nodes.find((node) => node.name === "Configuração");
  const previousTelegram = (previousDelivery || previousMain).nodes.find(
    (node) => node.type === "n8n-nodes-base.telegram",
  );
  if (!previousConfiguration) {
    throw Error("Configuração instalada não encontrada; a migração foi interrompida.");
  }

  const result = structuredClone(generated);
  result.main = {
    ...structuredClone(previousMain),
    nodes: result.main.nodes,
    connections: result.main.connections,
    pinData: {},
    nodeGroups: [],
  };
  for (const node of result.main.nodes) {
    const previous = previousMain.nodes.find(item => item.name === node.name);
    if (previous) { node.id = previous.id; }
  }
  const configuration = result.main.nodes.find((node) => node.name === "Configuração");
  configuration.id = previousConfiguration.id;
  let local;
  if (previousConfiguration.type === "n8n-nodes-base.set") {
    local = Object.fromEntries(previousConfiguration.parameters.assignments.assignments
      .map(({ name, value }) => [name, value]));
  } else {
    // Read only the owner's backed-up configuration, without filesystem/network APIs.
    local = new Script("(function(){" + previousConfiguration.parameters.jsCode + "})()")
      .runInNewContext({
        $input: { all: () => [] },
        $now: { setZone: () => ({ toISODate: () => "2000-01-01" }) },
      }, { timeout: 1000 })[0].json;
  }
  for (const assignment of configuration.parameters.assignments.assignments) {
    if (["chatId", "dryRun"].includes(assignment.name)) {
      assignment.value = local[assignment.name];
    }
  }
  const receiver = result.main.nodes.find((node) => node.name === "Receber comandos");
  receiver.parameters.allowedChatId = String(local.chatId || "");

  for (const key of ["query", "delivery"]) {
    const previous = snapshots.find((item) => item.id === result[key].id);
    if (previous) {
      result[key] = {
        ...structuredClone(previous),
        nodes: result[key].nodes,
        connections: result[key].connections,
        pinData: {},
        nodeGroups: [],
      };
    }
  }
  if (previousTelegram) {
    const telegram = result.delivery.nodes.find((node) => node.name === "Telegram");
    telegram.parameters = structuredClone(previousTelegram.parameters);
    if (previousTelegram.credentials) {
      telegram.credentials = structuredClone(previousTelegram.credentials);
      receiver.credentials = structuredClone(previousTelegram.credentials);
    }
  }
  return result;
}
