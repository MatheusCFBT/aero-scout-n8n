import { createSettings } from "../../src/shared/settings.mjs";
import { createWorkflowBuilder, booleanCondition } from "./builder.mjs";
import { addSearchBranch } from "./search_branch.mjs";
import { addDeliveryBranch } from "./delivery_branch.mjs";
import { WORKFLOW_IDS } from "./ids.mjs";

function workflow(id, name, builder, settings) {
  return {
    id,
    name,
    nodes: builder.nodes,
    connections: builder.connections,
    active: false,
    settings: {
      executionOrder: "v1",
      timezone: settings.timezone,
      executionTimeout: settings.executionTimeoutSeconds,
      saveDataErrorExecution: "all",
      saveDataSuccessExecution: "all",
    },
    pinData: {},
    tags: [],
  };
}

function childCall(id, mode) {
  return {
    source: "database",
    workflowId: { __rl: true, value: id, mode: "id" },
    mode,
    options: { waitForSubWorkflow: true },
  };
}

export function createWorkflows() {
  const settings = createSettings();
  const main = createWorkflowBuilder();
  main.addNode("Receber comandos", "manualTrigger", {
    allowedChatId: "", intervalSeconds: 15,
  }, [0, 0], { type: "CUSTOM.telegramPollingTrigger", typeVersion: 1 });
  main.addNode("Todos os dias às 22h", "scheduleTrigger", {
    rule: { interval: [{ field: "cronExpression", expression: "0 22 * * *" }] },
  }, [0, 200]);
  main.addNode("Configuração", "set", {
    assignments: { assignments: [
      { id: "chat", name: "chatId", type: "string", value: "" },
      { id: "preview", name: "dryRun", type: "boolean", value: true },
      { id: "time", name: "searchedAt", type: "string", value: "={{ $now.toISO() }}" },
      { id: "today", name: "today", type: "string",
        value: "={{ $now.setZone('America/Sao_Paulo').toISODate() }}" },
    ] }, includeOtherFields: true, options: {},
  }, [240, 80]);
  main.addCodeNode("Interpretar pedido", "configuration", [480, 80]);
  main.addNode("Pesquisar?", "if",
    booleanCondition("search", "={{ $json.action === 'search' }}"), [680, 80]);
  main.addCodeNode("Preparar consultas", "prepareSearch", [900, 80]);
  main.addNode("Buscar ofertas", "executeWorkflow", childCall(WORKFLOW_IDS.query, "each"), [1140, 80]);
  main.addCodeNode("Montar listas", "formatMessages", [1380, 80]);
  main.addNode("Enviar listas", "executeWorkflow", childCall(WORKFLOW_IDS.delivery, "once"), [1620, 80]);
  main.connect("Receber comandos", "Configuração");
  main.connect("Todos os dias às 22h", "Configuração");
  main.connect("Configuração", "Interpretar pedido");
  main.connect("Interpretar pedido", "Pesquisar?");
  main.connect("Pesquisar?", "Preparar consultas");
  main.connect("Pesquisar?", "Enviar listas", 1);
  main.connect("Preparar consultas", "Buscar ofertas");
  main.connect("Buscar ofertas", "Montar listas");
  main.connect("Montar listas", "Enviar listas");

  const query = createWorkflowBuilder("query");
  addSearchBranch(query, settings);
  const delivery = createWorkflowBuilder("delivery");
  addDeliveryBranch(delivery);
  return {
    query: workflow(WORKFLOW_IDS.query, "Aero Scout — consultar ofertas", query, settings),
    delivery: workflow(WORKFLOW_IDS.delivery, "Aero Scout — enviar listas", delivery, settings),
    main: workflow(WORKFLOW_IDS.main, "Aero Scout — ofertas diárias e Telegram", main, settings),
  };
}

export function createWorkflow() {
  return createWorkflows().main;
}
