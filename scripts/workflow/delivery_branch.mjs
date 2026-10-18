import { booleanCondition } from "./builder.mjs";

export function addDeliveryBranch(builder) {
  const { addNode, addCodeNode, connect } = builder;
  addNode("Receber mensagens", "executeWorkflowTrigger", { inputSource: "passthrough" }, [0, 0]);
  addNode("Somente prévia?", "if", booleanCondition("dry-run", "={{ $json.dryRun }}"), [240, 0]);
  addNode("Telegram", "telegram", {
    resource: "message",
    operation: "sendMessage",
    chatId: "={{ $json.chatId }}",
    text: "={{ $json.text }}",
    additionalFields: {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      appendAttribution: false,
    },
  }, [480, 160], { onError: "continueRegularOutput" });
  addCodeNode("Registrar envio", "verifyDelivery", [720, 160]);
  connect("Receber mensagens", "Somente prévia?");
  // Output 0 ends the child with the original message items in dry-run mode.
  connect("Somente prévia?", "Telegram", 1);
  // Telegram itself processes items sequentially and continues on per-item errors.
  connect("Telegram", "Registrar envio");
}
