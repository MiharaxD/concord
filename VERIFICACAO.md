# Verificação do Concord 0.5.2

27/10/2026, Windows x64. Build local, sem commit/push/Release nesta alteração. Última versão pública: 0.5.1; instaladores/relatórios anteriores preservados.

## Mudança

- Convite começa a ser preparado em segundo plano somente quando o usuário clica em Criar sala e passa a hospedar sua sala própria, sem convite/pedido existente.
- Abrir o programa, escolher nome, ficar no Painel ou entrar na sala de outra pessoa não inicia preparo próprio.
- Repetir Criar sala enquanto já hospeda, navegar ao Painel/Minha sala ou retornar após cancelamento não repete o pedido automaticamente. Retry continua explícito e respeita os limites atuais.
- Captura continua exigindo escolha/clique. Entrada por convite, cópia do link, erro/contagem/cancelamento permanecem no fluxo atual.
- Alteração focada em public/app.js; versão 0.5.2, documentação e testes de fluxo atualizados. Não modifica protocolo, transporte, captura ou integração Discord.

## Instalador

`dist/installer/0.5.2/Concord-0.5.2-Setup.exe`, **138.029.638 bytes**.
SHA-256: `ae9117702e4ff03d977b1ae1a4ffcf790917c4aa5afe9d000c2681d7e3d5060a`.
Build terminou com código 0, gerando Setup, blockmap, checksum e latest.yml. Conteúdo extraído em `test-results/installer-0.5.2-verified/` e executado em QA, sem instalar sobre a cópia pessoal.

## Validação

- 35 testes de unidade passaram: sala, parser, perfil/Discord, preferências, bitrate, retry e controlador do updater.
- `tests/invite-start.mjs` passou no desenvolvimento e no app extraído. Evidência final: `test-results/invite-start-1793116988451/result.json`.
- Primeiro nome e Painel sem preparo; renderer observado desde bootstrap em uma recarga completa, com zero chamadas de tunnel ao abrir.
- Criar sala faz um pedido; fonte/qualidade continuam disponíveis e captura permanece desligada.
- Cliques repetidos/Painel/Minha sala não duplicam pedido. Duas instâncias entram na mesma sala e copiam o convite correto; convidada faz zero pedidos próprios.
- Convidada só inicia preparo ao criar sala própria. Cancelar e tentar novamente continuam explícitos; navegar após cancelar não reinicia preparo.
- app.js lido do ASAR corresponde ao fonte, e versão 0.5.2 conferida. Sem pageerror.
- `tests/invite-retry.mjs` passou no app extraído: erro/classificação/contagem, controles disponíveis, cancelamento sem resultado tardio, retry e cópia. Evidência `test-results/invite-ui-1793116992596/result.json`.
- Testes de convite usaram cache de segurança e respostas controladas de IPC: nenhum novo túnel público real foi provisionado. A disponibilidade/desbloqueio da Cloudflare não foi testada nem garantida.

## Incidente do teste

Uma primeira versão do novo teste recarregava a janela antes de o loadURL inicial terminar, causando ERR_ABORTED e diálogo nativo na janela de QA. A porta 57988 mostrada pelo usuário foi identificada como processo de desenvolvimento com perfil test-results/invite-start; somente essa janela de teste foi encerrada. O teste foi corrigido para concluir nome/carga inicial antes da recarga instrumentada e passou nas duas execuções seguintes. Não foi atribuído esse erro à Cloudflare nem alterado o tratamento de falhas do app para ocultá-lo.

Não houve envio real de convite Discord, captura pessoal, reinstalação, teste de oito streams ou publicação. Regressões de mídia e validação pública anteriores continuam nos relatórios da 0.5.0/0.5.1; não foram repetidas para mudar o gatilho do convite.
