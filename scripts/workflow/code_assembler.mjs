import { Script } from "node:vm";
import { moduleDefinitions } from "../../src/modules.mjs";
import * as configuration from "../../src/n8n/configuration.mjs";
import * as prepareSearch from "../../src/n8n/prepare_search.mjs";
import * as startAttempt from "../../src/n8n/start_attempt.mjs";
import * as readResponse from "../../src/n8n/read_response.mjs";
import * as splitCards from "../../src/n8n/split_cards.mjs";
import * as collectOffers from "../../src/n8n/collect_offers.mjs";
import * as formatMessages from "../../src/n8n/format_messages.mjs";
import * as verifyDelivery from "../../src/n8n/verify_delivery.mjs";

const entrypoints = {
  configuration, prepareSearch, startAttempt, readResponse, splitCards, collectOffers,
  formatMessages, verifyDelivery,
};

/** Assemble factories without rewriting source text or relying on packages in n8n. */
export function assembleFunctions(execute, dependencies, runtimeExpression, sourceName) {
  const statements = [
    "// Generated from " + sourceName + ". Edit the source, then run npm run build.",
  ];
  const included = new Set();
  const visiting = new Set();

  function includeModule(name) {
    if (included.has(name)) {
      return;
    }
    if (visiting.has(name)) {
      throw Error("Dependência circular: " + name);
    }
    const definition = moduleDefinitions[name];
    if (!definition) {
      throw Error("Módulo desconhecido: " + name);
    }
    visiting.add(name);
    for (const dependency of Object.values(definition.dependencies || {})) {
      includeModule(dependency);
    }

    const argumentsByName = [
      ...Object.entries(definition.dependencies || {}).map(([key, module]) => key + ": " + module),
      ...Object.entries(definition.data || {}).map(
        ([key, value]) => key + ": " + JSON.stringify(value, null, 2),
      ),
    ];
    statements.push(
      "const " + name + " = (" + definition.factory.toString() + ")({\n" +
      argumentsByName.join(",\n") + "\n});",
    );
    visiting.delete(name);
    included.add(name);
  }

  for (const module of Object.values(dependencies)) {
    includeModule(module);
  }
  const dependencyArguments = Object.entries(dependencies)
    .map(([key, module]) => key + ": " + module)
    .join(", ");
  statements.push(
    "return (" + execute.toString() + ")(" + runtimeExpression +
      ", { " + dependencyArguments + " });",
  );
  const code = statements.join("\n\n") + "\n";
  // Code nodes permit a top-level return; validate them in the same function-shaped scope.
  new Script("(async function() {\n" + code + "\n})");
  return { code, includedModules: [...included] };
}

export function assembleCodeNode(entrypoint, category) {
  const entry = entrypoints[entrypoint];
  if (!entry) {
    throw Error("Programa do node desconhecido: " + entrypoint);
  }
  // n8n's task runner discovers required node data from literal $("Node name") calls.
  // Resolving names behind an alias/function would hide them from that analysis.
  const references = Object.entries(entry.nodeReferences || {}).map(([key, reference]) => {
    const nodeName = typeof reference === "function" ? reference(category) : reference;
    return key + ": $(" + JSON.stringify(nodeName) + ")";
  });
  const context = [
    "input: $input",
    "now: $now",
    "nodes: { " + references.join(", ") + " }",
  ];
  if (category) {
    context.push("category: " + JSON.stringify(category));
  }
  return assembleFunctions(
    entry.execute,
    entry.dependencies,
    "{ " + context.join(", ") + " }",
    "src/n8n/" + entrypoint,
  ).code;
}
