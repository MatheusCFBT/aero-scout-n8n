# Validação — 17/10/2026

## Executado

- 14 testes de comportamento aprovados com Node.js 24.19.0: conversão de preços brasileiros; datas com ano e virada de ano; rejeição de datas inválidas/duração/horizonte; origem e país; links; ranking e consolidação; limite por categoria; vazio versus falha; preservação de resultados parciais; divisão de mensagens; URLs sem datas fixas; rota extraída por card.
- Quatro consultas públicas diretamente a partir do contêiner existente `n8n-n8n-1`, usando User-Agent de navegador: HTTP 200 e **24 cards nacionais para cada origem**, **18 internacionais para cada origem**. As URLs finais não contêm datas fixas nos trechos.
- Workflow importado e executado integralmente em contêiner temporário com a mesma imagem do servidor, **n8nio/n8n:2.43.7**, banco temporário e nenhuma credencial. Runner JavaScript interno apenas para esse teste.
- Resultado real da execução: **10 destinos nacionais**, status `complete`; **10 destinos internacionais**, status `partial`, pois uma oferta de CGH tinha datas fora do horizonte confirmado. Ela foi descartada com aviso.
- Quatro mensagens de prévia: nacionais com 3367 e 2352 caracteres; internacionais com 3447 e 2426 caracteres. Ordem por categoria e menor preço preservada. Valores são uma captura, não preços garantidos.
- Teste de falha offline no motor real do n8n, com rede desativada e HTMLs controlados: todos os pedidos nacionais retornaram 503, cada aeroporto foi tentado exatamente três vezes; internacionais continuaram com uma tentativa por aeroporto. O resultado nacional foi `failed`, distinto de pesquisa vazia. Telegram simulado registrou mensagem nacional seguida das partes internacionais, sem interromper a outra categoria.
- Os testes não alteraram os workflows ativos nem a configuração dos runners do servidor.

## Teste real do Telegram e estado da instalação

- Workflow importado na instância existente e vinculado à credencial Telegram cadastrada, sem copiar token para o repositório.
- Bot confirmado: `@DetectiveFlightBot`. Destino configurado na instância, sem versionar o chat ID.
- Execução real concluída em `Verificar envios`, sem erro. Telegram confirmou quatro mensagens: duas partes nacionais e duas internacionais, com dez ofertas por categoria.
- Nacionais: `complete`. Internacionais: `partial`, com uma oferta de CGH descartada por datas fora do horizonte confirmado.
- **Agendamento ainda inativo.** A configuração instalada está pronta para envio (`dryRun: false`); publicar/ativar no n8n é a etapa pendente para o disparo diário às 22h de São Paulo.
- O artefato distribuído no Git permanece seguro para importação: `active: false`, `dryRun: true`, sem IDs de credenciais, token ou chat.

## Limites comprovados

O horizonte retornado foi de seis meses, com duração de 3–14 dias. O conjunto de destinos vem dos parâmetros públicos resolvidos pela busca do Google e versionados no repositório: 24 nacionais e 18 internacionais. O workflow atualiza os preços/datas desses destinos, mas não reexecuta diariamente a interpretação por IA para descobrir novos destinos. A fonte pode mudar seletores, resultados e interpretação; validação real permanece necessária após mudanças.

O retorno em HTML não usa execução de navegador no servidor. Uma URL contendo apenas `q=` retornou a tela intermediária sem cards. Sem User-Agent compatível, o Google redirecionou para a página de navegador não suportado. Os dois casos são tratados como falha, nunca como ausência legítima de ofertas.

## Refatoração JavaScript — 17/10/2026

- Código dividido em módulos ESM por responsabilidade, com programas dos Code nodes em arquivos próprios e contratos documentados por JSDoc.
- A pedido do usuário, nenhuma dependência foi adicionada. O gerador inclui fábricas JavaScript com dependências explícitas, sem alterar imports/exports por expressões regulares. `.editorconfig` e checagem local de sintaxe/espaços substituem a proposta de Prettier; não há necessidade de lockfile de dependências.
- 20 testes locais aprovados: os 14 comportamentos anteriores e verificações de URLs de referência, estrutura nativa do workflow, execução autossuficiente dos Code nodes/probe, prévia exata e preservação da configuração instalada.
- Referências registradas **antes** da refatoração usando os HTMLs controlados e data fixa: prévia, envio simulado e falha nacional com HTTP 503.
- Os mesmos três cenários foram executados depois da refatoração em n8nio/n8n:2.43.7, contêiner isolado, rede desativada e Telegram simulado. Os resumos completos foram **idênticos** à referência, incluindo ofertas, ranking, avisos, mensagens, ordem de envio e tentativas por aeroporto.
- Prévia encerrou em `Prévia sem envio`. Envio simulado encerrou em `Verificar envios`, com quatro partes. Falha nacional tentou GRU/CGH três vezes cada e manteve as partes internacionais; também encerrou sem erro de envio simulado.
- Referências a outros nodes são geradas como chamadas literais de `$` para permitir a análise de dependências do runner n8n. O comportamento foi validado no motor real, além dos testes locais.
- JSON gerado reduzido de 182.326 para aproximadamente 100 mil bytes. IDs, nomes, parâmetros dos nodes nativos e conexões preservados.
- Nenhuma consulta real de voos nem novo envio real de Telegram foi necessário para esta refatoração.

### Atualização da instalação

A atualização preserva o node `Configuração` personalizado, as referências de credenciais, layout, conexões, configurações e estado de ativação. Um backup local recuperável, sem exportar tokens, fica em `.local_backups/`, fora do versionamento. O JSON distribuído continua inativo e em prévia.

Atualização concluída e conferida por nova exportação da instância: **16 programas de Code nodes substituídos** no workflow existente. O node `Configuração`, a credencial Telegram, IDs, nomes, layout, conexões e configurações permaneceram iguais. O workflow continuou **inativo**, conforme o estado anterior. A cópia recuperável anterior à atualização está em `.local_backups/refactor_20261017/installed_workflow.json`, ignorada pelo Git; ela não contém o token da credencial. Não houve novo envio real de mensagens.

## Simplificação com subworkflows — 17/10/2026

- Principal reduzido de 36 para **sete nodes**, com subworkflow de consulta de dez nodes e subworkflow de envio de quatro nodes. IDs estáveis definidos nos três JSONs; importação documentada na ordem consulta, envio, principal.
- 22 testes locais aprovados, incluindo os 14 comportamentos originais. As quatro URLs e a prévia são idênticas às referências anteriores. As implementações de negócio, os templates, países e seletores foram preservados; hashes protegem os módulos e dados de negócio.
- **Nove cenários**, cada um executado com o grafo anterior e com os três novos workflows, em `n8nio/n8n:2.43.7`: prévia, envio, vazio válido, card inválido, falha parcial, falha total, recuperação na terceira tentativa, timeout e falha de entrega. Foram 18 execuções principais, sem rede externa, com banco descartável e relógio de pesquisa fixo.
- Prévia e corpos das mensagens comparados integralmente, incluindo links, avisos, divisão, ordem e valores. Os resultados foram idênticos. Sucesso: quatro mensagens; vazio/falha total: duas; falha nacional/timeout: três. Vazio conclui com `complete` e zero ofertas; falha retorna `failed`; cards inválidos preservam as ofertas válidas com aviso e `partial`.
- Recuperação transitória confirmou três tentativas por aeroporto; timeout e HTTP 503 nacionais confirmaram três tentativas para GRU e CGH sem impedir internacionais. HTTP 403 terminou na primeira tentativa. O intervalo nativo de três segundos foi mantido.
- O node Telegram **nativo** apontou para um servidor HTTP local, com credencial fictícia. Uma falha na primeira mensagem não impediu as outras três: quatro pedidos foram tentados, na ordem original, e o principal terminou com erro. Nenhum reenvio automático foi habilitado.
- O teste publica os subworkflows pelo servidor descartável. Nesta versão, a publicação pela CLI não foi suficiente para a chamada interna; o procedimento pela interface/servidor funcionou. O teste aguarda a prontidão completa e reutiliza a sessão local, sem desabilitar autenticação.
- JSONs autossuficientes: aproximadamente 55 KB no total, sem dependências externas nos Code nodes. O subworkflow de consulta retorna todas as ofertas válidas; a consolidação e o limite de dez permanecem no principal.
- Resultado detalhado: `validation/subworkflows_20261017.json`. Referências anteriores mantidas sem alterações. `build`, `test`, `probe`, `build --probe` e checagem de fonte preservados; `test:workflow` reproduz a suíte isolada. Nenhuma dependência nova.

### Instalação desta simplificação

Fontes e três artefatos gerados atualizados no repositório. Backup recuperável dos fontes anteriores em `.local_backups/simplification_20261017/source/`, ignorado pelo Git. Migração conferida sobre a cópia anterior da instalação: ID do principal, configuração, chat, referência da credencial, parâmetros de envio e estado inativo preservados.

A atualização da instância ainda depende de backup da versão atual e publicação dos dois subworkflows. A aba interna continua na tela de login. O principal instalado permanece inalterado e inativo; não houve consulta real nem envio real durante esta simplificação.

## Ordenação por desconto percentual — 17/10/2026

Alteração de regra solicitada após a simplificação: agora vence o **maior percentual abaixo da média informado no card do Google**, inclusive ao consolidar GRU e CGH por destino. O menor preço passa a ser apenas desempate. Nacionais e internacionais continuam separados, com até dez destinos cada.

- Extraídos do mesmo card: percentual e preço normal, além do preço atual e demais campos já existentes. O percentual exibido pelo Google é preservado, sem recalculá-lo a partir de preços arredondados. Referência monetária ausente é permitida se houver percentual explícito; referência presente precisa superar o preço atual.
- Cards sem percentual informado ficam fora da lista. Percentuais malformados, não positivos, iguais/acima de 100 ou referências inválidas produzem aviso. O texto deixa claro o critério do ranking e apresenta percentual e referência, quando disponível.
- 25 testes locais aprovados, incluindo prioridade de desconto sobre preço, consolidação pelo maior percentual, desempates, referência opcional/inválida, rótulos sem espaços entre elementos HTML e divisão de mensagens.
- Prévia e envio simulado aprovados no motor real dos três workflows em `n8nio/n8n:2.43.7`, sem rede externa. A extração nativa confirma **Cuiabá / CGH, 44%**, primeiro entre nacionais, e **Cidade do Panamá / CGH, 33%**, primeiro entre internacionais. As listas têm percentuais decrescentes e destinos distintos; o Telegram nativo preservou os textos e a ordem preparados pelo principal.
- Nova referência: `test/reference/discount_workflow_results.json`. As referências antigas continuam intactas e documentam a regra anterior de preço. Somente os três módulos de negócio autorizados (parser, ranking e mensagens) usam hashes novos em `discount_business_hashes.json`; os demais permanecem protegidos pela referência anterior.
- Os nove cenários registrados na seção de simplificação referem-se à regra anterior. A suíte reproduzível foi adaptada ao novo critério; nesta alteração foram executados novamente os dois cenários que verificam a extração e o envio completo. Não houve consulta de voos nem envio Telegram reais.

A instalação continua pendente de acesso autenticado à interface do n8n. O workflow instalado não foi alterado nem ativado nesta mudança.


## 18/10/2026 — Comandos locais e janelas personalizadas

Implementação JavaScript sem dependências novas. O receptor local substitui o manual;
o agendamento diário permanece às 22h em America/Sao_Paulo. Configuração passou para Set,
e a validação de cada mensagem é executada antes das consultas. Os dois subworkflows
continuam compartilhados. JSONs gerados inativos, sem token ou chat de produção.

- Testes unitários: calendário real, 20AA, passado, ano bissexto, virada de ano, um dia,
  janelas acima de 14 dias, dois comandos sucessivos com datas diferentes, filtros de card,
  respostas inválidas, chat, bot, cursor, histórico, duplicatas, reinício, falha no despacho,
  webhook, conflito 409, comunicação transitória e proteção do token nos erros.
- Nove cenários diários executados no n8n 2.43.7 isolado, com Telegram nativo simulado:
  prévia, envio, vazio, card inválido, falha parcial, falha total, recuperação, timeout e
  falha de envio. Mensagens comparadas integralmente às referências existentes. Três
  tentativas por consulta transitória e continuação das mensagens após erro confirmadas.
- Comandos de maio (6 dias), junho (29 dias) e data inválida executados no n8n isolado.
  O inválido responde sem consultar. Os válidos retornam quatro relatórios, datas dentro
  da respectiva janela e ofertas nas duas categorias. Nenhuma data de exemplo é configuração
  de produção; apenas as fixtures têm datas e relógio fixos.
- Quatro consultas HTTP públicas confirmaram viagens de 1–6 dias com partidas entre
  14 e 19/05/2027. Cards recebidos: nacionais GRU 24, CGH 24; internacionais GRU 18, CGH 17.
  Replay das páginas reais nos HTML/Code nodes nativos confirmou classificação e ofertas
  utilizáveis nas duas categorias. Retornos fora da janela foram descartados com aviso.
- Comparação compacta dos títulos é necessária porque o HTML node pode unir palavras
  ao remover quebras de linha. A falta de confirmação da janela é tratada como falha.

Evidências sem credenciais reais: `validation/commands_20261018/`. Nenhuma mensagem real
foi enviada. A instalação e a validação final do receptor são registradas abaixo quando
concluídas; resultados anteriores não substituem a nova execução após a reconstrução.


Receptor nativo validado no Docker isolado: custom node carregado, Configuração Set nativo,
duas mensagens com janelas diferentes geraram exatamente duas execuções com sucesso;
reativação não repetiu comandos aceitos. Telegram simulado, zero envios reais. Resultado:
`validation/commands_20261018/receiver.json`. Total final: **39 testes unitários aprovados**;
verificação de sintaxe/formatação e artefatos gerados aprovada.


Instalação de 18/10/2026 concluída: três workflows inativos; ID do principal, configurações, chat, prévia e referência Telegram conferidos após importação. Node local instalado no volume. Nenhuma mensagem real enviada. Backup recuperável: `/home/matheuscfbt/src/aero-scout-n8n/.local_backups/commands_20261018`.
