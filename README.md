# Aero Scout n8n

Workflow diário de ofertas de voos, com listas separadas de nacionais e internacionais no Telegram, ordenadas pelo maior desconto percentual informado pelo Google. A consulta e o envio usam nodes nativos; o receptor local usa um node próprio sem dependências; não requer serviço Python, pacotes externos nos Code nodes ou API paga.


## Comandos locais do Telegram

O exemplo abaixo contém datas ilustrativas. Cada mensagem define seu próprio período:

```text
/ofertas Brasil 14/05/27 - 20/05/27
/ofertas@DetectiveFlightBot BR 01/06/27 - 30/06/27
```

Aceita somente Brasil ou BR e o chat configurado. `/start` e `/ajuda` explicam o formato.
Os anos são interpretados como 20AA. As duas datas devem ser reais; a inicial não pode estar
no passado em São Paulo e a final precisa ser posterior. Ida e volta devem caber inteiramente
na janela. A duração permitida vai de um dia até o total de dias da janela, inclusive acima
de 14 dias. As partidas são consultadas do início ao penúltimo dia; cada card é conferido
pelas suas datas reais. Uma fonte que não confirma a janela produz falha/limitação, nunca
uma falsa pesquisa vazia.

O diário continua às 22h de São Paulo, com seis meses e duração de 3–14 dias. Comandos não
alteram sua configuração. Categorias, ranking por desconto, desempate por preço, limite de
destinos e sequência de envio permanecem compartilhados com o diário.

Instale os dois arquivos de `src/custom` no volume persistente do n8n:

```sh
docker exec n8n-n8n-1 mkdir -p /home/node/.n8n/custom/aero-scout
docker cp -a src/custom/. n8n-n8n-1:/home/node/.n8n/custom/aero-scout/
docker restart n8n-n8n-1
```

Selecione a mesma credencial `telegramApi` em **Receber comandos** e no **Telegram** do
subworkflow de envio. Informe o mesmo chat em **Receber comandos** e **Configuração**.
O token fica apenas na credencial. A migração de uma instalação existente preserva esses
valores automaticamente. Não há serviço extra, dependências novas ou exposição pública.

O receptor consulta novas mensagens a cada 15 segundos e inicia uma execução por comando.
O cursor fica em `/home/node/.n8n/aero-scout/bot-ID.json`, gravado por arquivo temporário,
sincronização e renomeação atômica. Não apague esse estado ao reiniciar. Mensagens anteriores
à primeira ativação são ignoradas. O cursor avança antes do despacho: uma queda entre gravar
e iniciar a execução pode perder aquele comando, mas não o repete; nesse caso envie um novo
comando explicitamente. Receptores duplicados no mesmo processo são recusados. Webhook
existente ou conflito 409 interrompem o receptor; nada é removido automaticamente.

Importe consulta, envio e principal nesta ordem. Os três JSONs são gerados inativos.
**Publicar o principal habilita tanto os comandos quanto o agendamento diário.**
Nenhum envio real é necessário para os testes, que usam Telegram simulado e contêineres
isolados. O workflow instalado deve permanecer inativo até a ativação desejada.

## Importar e configurar

1. Importe primeiro `workflows/aero_scout_query.json` e depois `workflows/aero_scout_delivery.json`, no mesmo projeto do principal. Vincule a credencial Telegram no subworkflow de envio (configuração abaixo) e publique os dois subworkflows: eles não têm agendamento e só executam quando chamados.
2. Importe `workflows/aero_scout_daily.json`. Confira as referências por ID nos nodes **Buscar ofertas** e **Enviar listas**. IDs estáveis: `AeroScoutFlightQuery`, `AeroScoutTelegramDelivery` e `AeroScoutDaily20261017`. Se a interface atribuir outros IDs ao importar, selecione os subworkflows correspondentes nesses dois nodes antes de salvar.
3. O principal vem **inativo** e com `dryRun: true` em **Configuração**. Depois de publicar, envie um comando ao bot para conferir a prévia: **Buscar ofertas** retorna quatro relatórios (categoria × origem), **Montar listas** produz as mensagens e **Enviar listas** devolve a prévia sem Telegram.
4. Configure o chat no principal e vincule a credencial ao node **Telegram** do subworkflow **Aero Scout — enviar listas**. Altere `dryRun` para `false` somente para enviar.
5. Para uma instalação nova, confira uma execução completa antes de ativar o principal. Ao atualizar uma instalação existente, preserve seu estado de ativação; a simplificação não exige novo envio real.

O principal contém nove nodes: **Comando / Agendamento → Configuração → Interpretar pedido → Pesquisar? → Preparar consultas → Buscar ofertas → Montar listas → Enviar listas**. Entradas inválidas seguem diretamente para a resposta. O subworkflow de consulta tem dez nodes e recebe todo o contexto pela entrada. O de envio tem quatro nodes e usa o processamento sequencial nativo do Telegram. As quatro consultas compartilham a mesma implementação; o ranking só acontece depois de reunir GRU e CGH por categoria.

O gatilho usa `0 22 * * *` e o workflow define `America/Sao_Paulo`: inicia às **22h de São Paulo**. O envio acontece ao terminar as buscas. Mantenha o Docker ligado. Defina também `GENERIC_TIMEZONE=America/Sao_Paulo` no serviço n8n para consistência com outros workflows. A importação não altera o workflow anterior; evite ativar os dois para não duplicar envios.

## Bot e credencial Telegram

1. Abra [@BotFather](https://t.me/BotFather), envie `/newbot` e escolha nome e username.
2. No n8n, abra **Credentials → Add credential → Telegram API**. Cole o token em **Access Token**, dê o nome **Aero Scout Telegram** e salve.
3. Abra o bot que você criou e envie `/start`. Bots não conseguem iniciar uma conversa privada antes disso.
4. Para descobrir o chat ID usando o próprio n8n, crie um workflow temporário com **Telegram Trigger**, selecione a credencial e o evento **Message**, clique em **Listen for test event** e envie uma nova mensagem ao bot. Copie `message.chat.id` do resultado. Esse método exige que a instância tenha um webhook HTTPS público configurado e substitui o webhook desse bot enquanto o teste estiver ativo; use o bot dedicado ao Aero Scout.
5. Se a instância não tiver webhook HTTPS, use a alternativa local abaixo. O workflow diário apenas envia mensagens e **não precisa de webhook público**.
6. No subworkflow de envio, selecione **Aero Scout Telegram** no node **Telegram**. Informe o ID no node **Configuração**, incluindo o sinal negativo se for um grupo. Mantenha o ID como string.

Alternativa para descobrir o ID sem webhook, com Node.js 22+ e após enviar `/start`:

```bash
read -rsp 'Token do bot: ' AERO_TELEGRAM_TOKEN
printf '\n'
printf '%s' "$AERO_TELEGRAM_TOKEN" | node scripts/telegram_chat_id.cjs
unset AERO_TELEGRAM_TOKEN
```

O token é lido pelo stdin, não é salvo nem impresso. A chamada `getUpdates` é somente leitura e não avança o offset. Se houver webhook ativo, o script informa a incompatibilidade; não o apaga automaticamente. Não coloque token no Code node, URL de navegador, `.env` versionado ou JSON exportado.

[Documentação oficial da credencial](https://docs.n8n.io/integrations/builtin/credentials/telegram/).

## Pesquisa e cobertura

- Duas pesquisas independentes, cada uma consultando **GRU e CGH separadamente**.
- **1 adulto, econômica, ida e volta, BRL, duração de 3 a 14 dias**.
- A interface pública de **Google Flights Deals** confirmou o intervalo completo de **3–14 dias**, sem precisar enumerar fim de semana/uma/duas semanas. Confirmou também **próximos seis meses**, maior horizonte observado nesta modalidade em 17/10/2026.
- Não há datas de viagem fixas nas URLs geradas. As datas de ida/volta dos cards são lidas dos dois trechos do link público, incluindo o ano. Não se infere o ano a partir do texto abreviado.
- A página HTTP precisa confirmar origem, ida e volta, econômica, passageiro, BRL, duração e horizonte. Mudança da fonte provoca aviso/falha, não uma lista falsamente válida.
- A pesquisa em linguagem natural é resolvida com JavaScript na interface do Google. Enviar apenas `q=` por HTTP retorna uma página intermediária. Por isso, `data/search_templates.json` versiona os parâmetros públicos resolvidos pela interface, utilizados pelo workflow sem endpoints privados.
- **Limitação concreta:** os templates atuais incluem os **24 destinos nacionais e 18 internacionais sugeridos pela fonte** na captura. Preços e datas são atualizados em cada execução; o conjunto de destinos não é redescoberto diariamente. Não representam todos os destinos nacionais/internacionais. Para ampliar/atualizar a cobertura, refaça as pesquisas na interface pública e atualize os templates. Não se afirma encontrar o menor preço absoluto do mercado.
- O país vem do campo explícito de país de cada card (`.ViT5Db`), validado contra nomes de países/territórios em português. Um país desconhecido nunca vira internacional por exclusão: o card é descartado com aviso. `data/countries.json` contém nomes de regiões ISO gerados por `Intl.DisplayNames('pt-BR')` (CLDR), sem dependência de consulta externa.
- Consolidação por nome do destino + país dentro da categoria, escolhendo o maior desconto percentual entre as origens. Em empate, vence o menor preço; depois destino, data e origem dão uma ordem estável. O limite continua sendo dez destinos por categoria. A origem realmente mostrada no card deve corresponder à consulta.
- Cobertura parcial (menos cards do que o resumo da página) aparece como aviso. O workflow não aciona “Mostrar mais”; considera apenas o HTML recebido.

### Atualizar os templates

Na interface pública do Google Flights Deals, selecione GRU, 1 adulto, econômica e ida e volta. Pesquise separadamente “Viagens para o Brasil de 3 a 14 dias em qualquer data disponível” e “Viagens internacionais para fora do Brasil de 3 a 14 dias em qualquer data disponível”. Aguarde as ofertas e confira a interpretação. Copie **somente o parâmetro `tfs` da URL pública final** para a respectiva entrada de `data/search_templates.json`, atualizando `captured_at` e `query`. Não copie cookies, IDs de sessão ou respostas de endpoints internos. Execute `npm run build`, os testes e a validação real antes de reimportar. O gerador remove datas dos trechos e substitui a origem por GRU/CGH; mantém os filtros flexíveis observados. Reimportar um arquivo local pode substituir a configuração local do chat/credencial: revise-a.

## Envio e falhas

As mensagens são HTML com links, nacionais primeiro e internacionais depois. Listas grandes são divididas em partes numeradas por categoria, abaixo do limite de 4096 caracteres. Os valores representam preço total de ida e volta por pessoa. Cada oferta mostra o percentual abaixo da média informado no próprio card do Google e o preço normal de referência, quando disponível. Ofertas sem percentual informado ficam fora do ranking; rótulos inválidos ou referências incompatíveis são descartados com aviso. Não se calcula desconto em relação ao menor preço de outra viagem.

Cada aeroporto é processado individualmente. Consulta HTTP tem timeout de 60 segundos e no máximo três tentativas (inicial + duas), com espera de 3 segundos, apenas para falha de conexão/timeout, HTTP 429 e 5xx. HTTP 4xx diferentes de 429 não são repetidos. Bloqueio, página incompatível ou mudança de seletor resultam em aviso. CAPTCHA não é resolvido automaticamente.

Uma categoria com falha não impede a outra. `complete` vazio é diferente de `partial` ou `failed`. O fluxo preserva ofertas válidas ao descartar cards inválidos e identifica pesquisas parciais. O limite total da execução é 20 minutos.

O Telegram envia uma mensagem de cada vez. Uma falha de envio é registrada em **Registrar envio**, as mensagens seguintes são tentadas e esse mesmo node marca a execução como falha ao final. Não há reenvio automático de Telegram, pois um timeout pode ocorrer depois da entrega. Antes de repetir uma execução, confira as mensagens já entregues para evitar duplicatas. Não há histórico de preços nem deduplicação entre dias.

## Organização e manutenção

O código usa módulos ESM (`.mjs`), Node.js 22+ e nenhuma dependência externa:

- `src/shared`: critérios compartilhados, texto, datas e preços.
- `src/google_flights`: protocolo da URL pública, montagem das consultas, datas dos links e validação de páginas.
- `src/offers`: interpretação de cards, ordenação e relatórios.
- `src/telegram`: cabeçalhos, ofertas, avisos e divisão das mensagens.
- `src/n8n`: um programa legível para cada tipo de Code node; nacionais e internacionais compartilham esses programas.
- `scripts/workflow`: construção dos três workflows, seletores HTML, montagem dos programas e preparação de validação/atualização.
- `test`: testes por comportamento, HTMLs controlados e saídas de referência anteriores à refatoração.

`src/types.mjs` documenta com JSDoc os formatos de contexto, oferta e relatório. Não há migração para TypeScript.

### Como o código chega ao n8n

Cada módulo exporta uma fábrica que recebe suas dependências explicitamente. `src/modules.mjs` registra essas dependências e os dados JSON necessários. O gerador monta cada Code node com a mesma função que os testes executam, usando `Function.prototype.toString()` e incluindo somente os módulos necessários, sem manipular imports/exports por expressões regulares. O resultado é JavaScript legível e autossuficiente: o contêiner n8n não precisa acessar os arquivos deste repositório.

Ao adicionar uma função ao módulo, mantenha seus helpers dentro da fábrica ou declare outro módulo como dependência. Não capture variáveis/imports externos implicitamente: eles não existem no Code node gerado.

Os programas de `src/n8n` recebem `input`, `now` e `nodes`, além dos módulos de negócio necessários. Quando um programa consulta outro node, declare a referência em `nodeReferences`. O gerador transforma essa declaração em chamadas literais como `$("Configuração")`: o runner do n8n analisa essas chamadas para carregar os dados necessários. Esconder a chamada `$` atrás de uma função genérica impede essa análise.

Edite os fontes e execute `npm run build`; não mantenha alterações apenas nos Code nodes do JSON gerado.

## Desenvolvimento e validação

```bash
npm test
npm run build
npm run format:check
# Normalizar espaços/fins de linha e regenerar o workflow:
npm run format
# Opcional: consulta real, com saída HTML volumosa:
npm run probe > /tmp/aero-live.json
# Gerar uma versão autossuficiente da consulta para outro runtime:
node scripts/build.cjs --probe > /tmp/aero-probe.cjs
```

Nenhum download de pacotes é necessário. A pedido do usuário, a refatoração não adicionou esbuild nem Prettier. `.editorconfig` define dois espaços, ponto de partida para linhas de até 100 caracteres e finais de linha LF. `format` normaliza espaços e fins de linha e regenera o JSON; **não é um formatador completo de JavaScript**. `format:check` verifica sintaxe, espaços, indentação com espaços e se o workflow gerado está atualizado. A organização dos blocos é mantida no fonte.

Os testes cobrem os comportamentos existentes, as quatro URLs inalteradas, a migração e o novo ranking por desconto. As referências anteriores ficam preservadas como histórico da ordenação por preço. As alterações autorizadas de interpretação, ranking e mensagem têm hashes próprios; os demais módulos e dados continuam protegidos pelos hashes anteriores.

Para validar os três workflows no motor real, sem tocar na instância existente:

```bash
npm run test:workflow
```

Esse comando prepara nove cenários controlados e inicia `n8nio/n8n:2.43.7` com banco temporário e `--network none`. Exige Docker e a imagem local. Confere a prévia, os corpos das mensagens, a ordenação dos descontos e os resultados de envio: sucesso, vazio, card inválido, falha parcial, falha total, recuperação na terceira tentativa, timeout e falha de envio. O Telegram nativo aponta exclusivamente para um servidor HTTP local com credencial fictícia. O teste confirma ordem, divisão e continuação após falha; não acessa Google nem Telegram reais.

Os subworkflows são publicados pelo servidor descartável usando uma conta local criada apenas nesse banco. O runner interno é exclusivo do teste. Nenhuma dependência ou configuração da instância de destino é alterada. Para executar somente alguns cenários, use `AERO_SCENARIOS=preview,send npm run test:workflow`. Veja `VALIDATION.md` para resultados.

### Atualizar uma instalação existente

Exporte primeiro o workflow instalado, sem exportar credenciais, para um backup local. A pasta `.local_backups/` está ignorada pelo Git, pois o node de configuração pode conter o chat ID. Para preparar a atualização:

```bash
node scripts/prepare_update.cjs .local_backups/anterior.json /tmp/aero-update.json
```

Esse comando gera um array ordenado com consulta, envio e principal. Preserva ID, nome, estado, configurações do principal e os valores de chat e prévia de **Configuração**, convertendo o Code antigo para um Set. Substitui o grafo antigo pelo principal de nove nodes. Migra os parâmetros de envio para o subworkflow e compartilha a referência da credencial com o receptor local; não exporta tokens. Se o backup incluir subworkflows já existentes, preserva também seus metadados.

Guarde o backup recuperável antes de importar. Importe e publique os dois subworkflows primeiro, depois atualize o principal existente, mantendo seu ID e estado inativo. Confirme que a versão instalada não mudou desde o backup. O JSON público distribuído continua inativo e em prévia; o arquivo de atualização preserva o chat e a opção de envio locais e deve ficar fora do Git.

### Critério de desconto percentual

O ranking usa o percentual explícito “abaixo da média” do Google Flights Deals, associado à oferta no próprio card. O percentual exibido pode ter arredondamento diferente do cálculo com os preços arredondados; por isso não é recalculado. O preço normal serve para dar contexto ao desconto, quando fornecido, e deve ser maior que o preço atual. Não se inventa referência nem se usa a passagem mais barata como base.

O Google descreve sua referência como o preço típico de viagem semelhante e também usa o menor preço como desempate de percentuais iguais: [explicação oficial do Flights Deals](https://support.google.com/travel/answer/16497283?hl=en-CA).

## Validar comandos e receptor

`npm test` valida datas, intervalo, ranking, mensagens, cursor e conflitos.
`npm run test:workflow` executa doze cenários controlados no n8n isolado, sem rede externa.
`npm run test:receiver` carrega e publica o node local somente no contêiner descartável,
usa Telegram simulado e confere comandos sucessivos e ausência de repetição após reativação.
Nenhum desses testes usa tokens reais.

Para verificar explicitamente a fonte com outro período:

```sh
node scripts/fetch_window.cjs '/ofertas BR 01/06/27 - 30/06/27' /tmp/aero-window-http
AERO_SCENARIOS=windowReplay AERO_WINDOW_CAPTURE=/tmp/aero-window-http npm run test:workflow
```

O primeiro comando faz quatro consultas públicas e salva HTML e metadados sem credenciais.
O segundo reproduz as respostas no HTML node nativo, em Docker sem rede, e exige ofertas
válidas das duas categorias, período confirmado e datas reais dentro da janela. Para mudar
a janela de replay, ajuste a configuração controlada `fixedConfiguration` ao período da
captura; os exemplos fixos existem somente nas fixtures de teste.
