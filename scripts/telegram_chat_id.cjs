// Explicit utility: never print the token, request URL, or raw network errors.
async function readToken() {
  let token = "";
  for await (const chunk of process.stdin) {
    token += chunk;
  }
  return token.trim();
}

function recentChats(updates) {
  const chats = new Map();
  for (const update of updates) {
    const chat = update.message?.chat || update.channel_post?.chat;
    if (chat) {
      chats.set(String(chat.id), {
        id: String(chat.id),
        type: chat.type,
        title: chat.title || chat.first_name || "",
      });
    }
  }
  return [...chats.values()];
}

async function main() {
  const token = await readToken();
  if (!/^\d+:[\w-]+$/.test(token)) {
    console.error("Token ausente ou inválido no stdin.");
    process.exitCode = 1;
    return;
  }
  try {
    const response = await fetch("https://api.telegram.org/bot" + token + "/getUpdates", {
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!data.ok) {
      console.error(
        response.status === 409
          ? "O bot tem webhook ativo. Use o Telegram Trigger para obter message.chat.id."
          : "Telegram recusou a consulta. Confira a credencial e tente novamente.",
      );
      process.exitCode = 1;
      return;
    }
    const chats = recentChats(data.result || []);
    console.log(JSON.stringify(chats, null, 2));
    if (!chats.length) {
      console.log("Nenhuma mensagem recente. Envie /start ao bot e repita.");
    }
  } catch {
    console.error("Não foi possível consultar o Telegram. Verifique conexão e token.");
    process.exitCode = 1;
  }
}

main();
