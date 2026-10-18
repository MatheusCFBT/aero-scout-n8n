# Aero Scout n8n

Busca ofertas de voos saindo de **GRU e CGH** e envia listas separadas de nacionais e internacionais ao Telegram. Cada lista contém até dez destinos, ordenados pelo **maior desconto percentual informado pelo Google**, com menor preço como desempate.

## Como funciona

- **Comando:** `/ofertas Brasil DD/MM/AA - DD/MM/AA`. Aceita `BR` e `/ofertas@DetectiveFlightBot`. `/start` e `/ajuda` mostram instruções.
- **Período:** as datas vêm de cada mensagem; o ano é interpretado como `20AA`. Ida e volta devem caber na janela, com duração mínima de um dia. Rejeita datas inválidas, passadas e término igual ou anterior ao início.
- **Diário:** às **22h de São Paulo**, pesquisa nos próximos seis meses, com duração de 3–14 dias. Comandos não alteram o agendamento.
- **Critérios:** um adulto, econômica, ida e volta e preços em BRL. O valor mostrado é o total por pessoa.

A cobertura depende dos destinos dos templates e dos cards retornados pelo Google; não representa todo o mercado. Ofertas sem desconto percentual explícito ficam fora do ranking. Falhas e resultados parciais são informados separadamente de pesquisas válidas sem ofertas. A fonte precisa confirmar o período consultado.

## Instalação no Docker

Use n8n com volume persistente em `/home/node/.n8n`. Instale o receptor local e reinicie o serviço, ajustando o nome do contêiner se necessário:

```sh
docker exec n8n-n8n-1 mkdir -p /home/node/.n8n/custom/aero-scout
docker cp -a src/custom/. n8n-n8n-1:/home/node/.n8n/custom/aero-scout/
docker restart n8n-n8n-1
```

Importe os JSONs no mesmo projeto, nesta ordem:

| Arquivo em `workflows/` | Função | ID |
| --- | --- | --- |
| `aero_scout_query.json` | Consultar ofertas | `AeroScoutFlightQuery` |
| `aero_scout_delivery.json` | Enviar listas | `AeroScoutTelegramDelivery` |
| `aero_scout_daily.json` | Principal | `AeroScoutDaily20261017` |

1. No principal, confira os subworkflows selecionados em **Buscar ofertas** e **Enviar listas**, especialmente se a importação mudar seus IDs.
2. Configure o Telegram conforme abaixo. Os JSONs distribuídos vêm **inativos** e com `dryRun: true` em **Configuração**.
3. Publique consulta e envio primeiro; publique o principal por último. **Publicar o principal habilita os comandos e o agendamento diário.**
4. Com `dryRun: true`, confira a prévia na execução do n8n. Altere para `false` e publique a alteração quando quiser enviar ao Telegram.

Mantenha o Docker ligado e apenas um principal publicado. O workflow define `America/Sao_Paulo`; use também `GENERIC_TIMEZONE=America/Sao_Paulo` no serviço n8n.

## Telegram

1. Crie o bot no [@BotFather](https://t.me/BotFather), usando `/newbot`, e envie `/start` ao bot criado.
2. No n8n, crie uma credencial **Telegram API** e coloque o token em **Access Token**. Nunca salve o token no código ou nos JSONs.
3. Selecione essa credencial em **Receber comandos** e no **Telegram** do subworkflow de envio.
4. Informe o mesmo chat ID, como string, em **Receber comandos** e **Configuração**. Preserve o sinal negativo para grupos.

Para descobrir o chat ID localmente, antes de publicar o receptor, use Node.js 22+:

```bash
read -rsp 'Token do bot: ' AERO_TELEGRAM_TOKEN
printf '\n'
printf '%s' "$AERO_TELEGRAM_TOKEN" | node scripts/telegram_chat_id.cjs
unset AERO_TELEGRAM_TOKEN
```

O token é recebido pelo stdin e não é salvo nem impresso. O receptor consulta o Telegram a cada 15 segundos, sem webhook público. Webhook existente ou conflito com outro consumidor interrompem o receptor; nada é removido automaticamente.

O cursor fica em `/home/node/.n8n/aero-scout/bot-ID.json`: preserve esse arquivo ao reiniciar. Mensagens anteriores à primeira ativação são ignoradas. Comandos aceitos não são repetidos automaticamente; uma queda antes do despacho pode exigir que você envie um novo comando.

## Falhas e envio

Consultas têm timeout de 60 segundos e até três tentativas, com espera de três segundos, para falhas transitórias. Uma consulta com falha não impede as demais.

O Telegram recebe nacionais primeiro, depois internacionais, com partes numeradas quando necessário. Todas as mensagens são tentadas; falhas de entrega fazem a execução terminar com erro. Não há reenvio automático: confira o chat antes de repetir uma execução para evitar duplicatas.

## Manutenção

Requer **Node.js 22+**, sem dependências externas. Edite os fontes e regenere os JSONs; não mantenha mudanças somente no editor do n8n.

- `src/`: consultas, interpretação, ranking, mensagens, Code nodes e receptor local.
- `data/`: templates de busca e países reconhecidos. A cobertura muda ao atualizar os templates.
- `scripts/`: geração, atualização e verificações.
- `test/`: testes, fixtures e referências. O histórico das verificações está em [VALIDATION.md](VALIDATION.md).

```sh
npm run build          # Gerar os três JSONs
npm test               # Testes locais
npm run format:check   # Sintaxe, espaços e artefatos atualizados
npm run test:workflow  # Fluxo completo no Docker isolado
npm run test:receiver  # Receptor com Telegram simulado
```

Os testes Docker exigem a imagem local `n8nio/n8n:2.43.7` e não usam rede externa ou credenciais reais. `npm run format` normaliza espaços e fins de linha; não é um formatador completo de JavaScript. `npm run probe` consulta a fonte real; `node scripts/build.cjs --probe` gera uma consulta autossuficiente.

Para atualizar uma instalação, guarde um backup dos workflows, sem exportar credenciais, e prepare a migração:

```sh
node scripts/prepare_update.cjs .local_backups/anterior.json /tmp/aero-update.json
```

A migração preserva IDs, configurações, chat, prévia, referências de credencial e estado de ativação. O arquivo preparado contém configuração local e deve ficar fora do Git. Atualize também os arquivos do receptor se mudarem e reinicie o n8n. Importe os subworkflows antes do principal e preserve o estado de ativação existente.
