# Aero Scout n8n

Find flight deals departing from **GRU and CGH** and send separate domestic and international lists to Telegram. Each list includes up to ten destinations, ranked by the **highest discount percentage reported by Google**, with lower prices breaking ties.

## How it works

- **Command:** `/ofertas Brasil DD/MM/YY - DD/MM/YY`. Also accepts `BR` and `/ofertas@DetectiveFlightBot`. Use `/start` or `/ajuda` for instructions. Bot commands remain in Portuguese.
- **Travel window:** dates come from each message; years are interpreted as `20YY`. Departure and return must fall within the window, with a minimum trip duration of one day. Invalid or past dates and end dates on or before the start date are rejected.
- **Daily search:** at **10 PM São Paulo time**, searches the next six months for trips lasting 3–14 days. Commands do not change the schedule.
- **Criteria:** one adult, economy, round trip, prices in BRL. Displayed prices are the round-trip total per person.

Coverage depends on the destinations in the search templates and the cards returned by Google; it does not cover the entire market. Offers without an explicit discount percentage are excluded from the ranking. Failures and partial results are distinguished from successful searches with no offers. The source must confirm the requested travel window.

## Docker setup

Use n8n with a persistent volume at `/home/node/.n8n`. Install the local receiver and restart the service, adjusting the container name if needed:

```sh
docker exec n8n-n8n-1 mkdir -p /home/node/.n8n/custom/aero-scout
docker cp -a src/custom/. n8n-n8n-1:/home/node/.n8n/custom/aero-scout/
docker restart n8n-n8n-1
```

Import the JSON files into the same project in this order:

| File in `workflows/` | Purpose | ID |
| --- | --- | --- |
| `aero_scout_query.json` | Search for offers | `AeroScoutFlightQuery` |
| `aero_scout_delivery.json` | Deliver lists | `AeroScoutTelegramDelivery` |
| `aero_scout_daily.json` | Main workflow | `AeroScoutDaily20261017` |

Node names below match the Portuguese labels in the workflows.

1. In the main workflow, check the subworkflows selected in **Buscar ofertas** and **Enviar listas**, especially if importing changes their IDs.
2. Configure Telegram as described below. Distributed JSON files are **inactive**, with `dryRun: true` in **Configuração**.
3. Publish the search and delivery subworkflows first, then the main workflow. **Publishing the main workflow enables both bot commands and the daily schedule.**
4. With `dryRun: true`, inspect the preview in the n8n execution. Set it to `false` and publish the change when you want to send messages to Telegram.

Keep Docker running and only one main workflow published. The workflow uses `America/Sao_Paulo`; also set `GENERIC_TIMEZONE=America/Sao_Paulo` in the n8n service.

## Telegram

1. Create a bot through [@BotFather](https://t.me/BotFather) using `/newbot`, then send `/start` to your bot.
2. In n8n, create a **Telegram API** credential and enter the token in **Access Token**. Never store the token in source code or workflow JSON files.
3. Select that credential in **Receber comandos** and in the delivery subworkflow's **Telegram** node.
4. Enter the same chat ID, as a string, in **Receber comandos** and **Configuração**. Keep the negative sign for group IDs.

To find the chat ID locally before publishing the receiver, use Node.js 22+:

```bash
read -rsp 'Bot token: ' AERO_TELEGRAM_TOKEN
printf '\n'
printf '%s' "$AERO_TELEGRAM_TOKEN" | node scripts/telegram_chat_id.cjs
unset AERO_TELEGRAM_TOKEN
```

The token is read from stdin and is neither saved nor printed. The receiver polls Telegram every 15 seconds without a public webhook. An existing webhook or a conflict with another consumer stops the receiver; nothing is removed automatically.

The cursor is stored at `/home/node/.n8n/aero-scout/bot-ID.json`; preserve it across restarts. Messages sent before the first activation are ignored. Accepted commands are not automatically replayed; a crash before dispatch may require you to send a new command.

## Failures and delivery

Search requests have a 60-second timeout and up to three attempts, with a three-second delay for transient failures. A failed query does not prevent the remaining queries from running.

Domestic lists are sent first, followed by international lists, with numbered parts when needed. All messages are attempted; delivery failures cause the execution to finish with an error. Messages are not automatically resent: check the chat before repeating an execution to avoid duplicates.

## Maintenance

Requires **Node.js 22+**, with no external dependencies. Edit the source files and regenerate the JSON files; do not keep changes only in the n8n editor.

- `src/`: queries, parsing, ranking, messages, Code node programs, and the local receiver.
- `data/`: search templates and recognized countries. Updating templates changes coverage.
- `scripts/`: generation, migration, and checks.
- `test/`: tests, fixtures, and references.

```sh
npm run build          # Generate the three workflow JSON files
npm test               # Run local tests
npm run format:check   # Check syntax, whitespace, and generated artifacts
npm run test:workflow  # Test the complete flow in isolated Docker
npm run test:receiver  # Test the receiver with simulated Telegram
```

Docker tests require the local `n8nio/n8n:2.43.7` image and use neither external networking nor real credentials. `npm run format` normalizes whitespace and line endings; it is not a full JavaScript formatter. `npm run probe` queries the real source; `node scripts/build.cjs --probe` generates a standalone query program.

To update an installation, back up the workflows without exporting credentials, then prepare the migration:

```sh
node scripts/prepare_update.cjs .local_backups/previous.json /tmp/aero-update.json
```

The migration preserves IDs, settings, chat, preview mode, credential references, and activation state. The prepared file contains local configuration and must stay out of Git. If the receiver files change, update them too and restart n8n. Import subworkflows before the main workflow and preserve the existing activation state.
