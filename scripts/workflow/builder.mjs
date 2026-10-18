import { assembleCodeNode } from "./code_assembler.mjs";

const NODE_VERSIONS = {
  set: 3.4,
  code: 2,
  httpRequest: 4.2,
  html: 1.2,
  manualTrigger: 1,
  scheduleTrigger: 1.2,
  if: 2.2,
  telegram: 1.2,
  stickyNote: 1,
  wait: 1.1,
  executeWorkflow: 1.3,
  executeWorkflowTrigger: 1.1,
};

export function createWorkflowBuilder(prefix = "aero") {
  const nodes = [];
  const connections = {};

  function addNode(name, type, parameters, position, options = {}) {
    nodes.push({
      id: prefix + "-" + (nodes.length + 1),
      name,
      type: "n8n-nodes-base." + type,
      typeVersion: NODE_VERSIONS[type],
      position,
      parameters,
      ...options,
    });
  }

  function addCodeNode(name, entrypoint, position, category) {
    addNode(name, "code", { jsCode: assembleCodeNode(entrypoint, category) }, position);
  }

  function connect(source, destination, outputIndex = 0, inputIndex = 0) {
    connections[source] ??= { main: [] };
    connections[source].main[outputIndex] ??= [];
    connections[source].main[outputIndex].push({
      node: destination,
      type: "main",
      index: inputIndex,
    });
  }

  return { nodes, connections, addNode, addCodeNode, connect };
}

export function booleanCondition(id, expression) {
  return {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
      conditions: [{
        id,
        leftValue: expression,
        rightValue: true,
        operator: { type: "boolean", operation: "true", singleValue: true },
      }],
      combinator: "and",
    },
    options: {},
  };
}
