import {
  fixtureData, fixedConfiguration, controlledResponse, replaceCode, simulateTelegram,
} from "../../test/integration/fixtures.mjs";

/** Build an isolated import set. Native Telegram remains native and targets a local fake API. */
export function prepareValidation(workflows, root, { scenario = "preview", offline = true } = {}) {
  const copy = structuredClone(workflows);
  const fixtures = offline ? fixtureData(root) : {};
  for (const workflow of Object.values(copy)) {
    for (const node of workflow.nodes) {
      if (node.type === "CUSTOM.telegramPollingTrigger") {
        node.type = "n8n-nodes-base.manualTrigger";
        node.typeVersion = 1;
        node.parameters = {};
      }
      if (offline && node.type === "n8n-nodes-base.httpRequest") {
        replaceCode(node, controlledResponse, { fixtures, scenario });
      }
      if (offline && node.name === "Configuração") {
        replaceCode(node, fixedConfiguration, { preview: scenario === "preview" || scenario.startsWith("command") || scenario === "windowReplay", scenario });
      }
      if (node.type === "n8n-nodes-base.telegram") {
        simulateTelegram(node);
      }
    }
  }
  return [copy.query, copy.delivery, copy.main];
}
