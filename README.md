# Concord

Instalador público: [Concord 0.5.1 para Windows](https://github.com/MiharaxD/concord/releases/download/v0.5.1/Concord-0.5.1-Setup.exe). [Todos os arquivos da Release](https://github.com/MiharaxD/concord/releases/tag/v0.5.1).

Versão 0.5.1 publicada em 27/10/2026: novo logo de câmera, conforme SVG fornecido, no app, Windows, instalador e página/prévia de convite no Discord. Vinculação opcional, nome/foto/banner, amigos/DM e **Copiar link** incluídos. A Release contém instalador e metadados do atualizador. Builds locais e versões anteriores preservados em `dist/`.

App pessoal para Windows: até 8 pessoas na mesma sala, sem cadastro no Concord, domínio ou servidor próprio. Todos usam o mesmo executável Electron + JavaScript; vincular o Discord é opcional.

## Como usar

1. Abra o Setup da versão desejada, escolha se quer um atalho na Área de Trabalho e clique em **Instalar**. Depois abra o Concord pelo menu Iniciar. Na primeira vez, escolha seu nome; foto é opcional. Clique no perfil, no menu lateral, para editar depois.
2. No **Painel**, escolha **Criar sala** ou **Entrar em uma sala**. Criar abre os controles e participantes sem iniciar captura. Entrar abre um pop-up: cole o convite e confirme em **Entrar na sala**, ou cancele.
3. O convite é preparado automaticamente, inclusive durante a escolha do nome e no Painel. Na sala, o painel **Código da sala** mostra **Código sendo carregado…**, o código pronto e **Copiar link**, ou uma explicação curta com **Tentar novamente**. O aviso de cópia é **Link copiado.** Para copiar só o código, selecione o texto da caixa e use Ctrl+C. Isso não bloqueia os controles. Quem entrou pelo convite compartilha o link da sala atual.
4. Compartilhar e assistir ficam juntos na sala. Qualquer participante escolhe sua tela e clica em **Compartilhar tela**. Voltar ao Painel e reabrir a sala atual preserva a transmissão; **Criar sala** enquanto estiver na sala de um amigo muda para a sala própria. **Sair da sala** encerra sua captura e volta ao Painel.
5. As transmissões aparecem numa grade que ajusta colunas e linhas para caber. Clique numa tela para dar foco; clique nela novamente ou em **Ver todas** para retornar à grade. **Tela cheia** amplia a grade ou a tela em foco.

Na grade, o som de todas as transmissões recebidas fica habilitado. Em foco, só o som daquela tela fica habilitado. Silenciar/volume zero continuam sendo escolhas do usuário; a própria prévia fica sempre muda para evitar eco. Nomes e fotos dos participantes ficam no menu lateral, no lugar do antigo bloco “Sua sala particular”. Microfone acompanha a tela de quem o ativou; não há câmera nem voz independente de uma transmissão.

**Copiar link** gera `https://<túnel>.trycloudflare.com/invite?join=<chave>`, utilizável em chats e navegadores. A página oferece **Abrir no Concord**, código selecionável e **Baixar Concord**, apontando para a última Release pública. No Discord, a prévia pode mostrar o logo e “Entrar na sala de <nome>”; é um cartão de link, sem bot ou botão nativo de jogo. As configurações/cache de prévias do Discord podem afetar sua exibição.

O código curto começa com `concord:` e não usa encurtador externo. O instalador registra esse protocolo no Windows para o usuário atual: abrir um convite inicia/traz o Concord, preenche o pop-up e **sempre pede confirmação antes de entrar**. Desenvolvimento/portátil não registram o protocolo. Códigos curtos e URLs antigas com `#join=` continuam aceitos. O protocolo de sala permanece compatível com 0.3.0+; para colar o novo link HTTPS diretamente no app, use 0.5.0+. O botão da página converte convites públicos normais no código curto aceito pelas versões anteriores.

A página e o link só funcionam enquanto o Concord que hospeda a sala mantiver o túnel aberto. Fechar esse app ou **Fechar acesso** torna o endereço indisponível; recriar o túnel gera outro link. Parar só a transmissão mantém o acesso. Erro 1033 da Cloudflare indica túnel desconectado, não uma página de convite válida.

**Cancelar preparação** interrompe o processo em segundo plano; **Tentar novamente** retoma. **Gerenciar convite** reúne **Trocar convite**, que remove os convidados e invalida o código anterior, e **Fechar acesso**, que encerra o túnel e revoga o código. O app não reabre esse acesso automaticamente na mesma execução. Fechar o app que hospeda encerra a sala inteira; encerrar só a transmissão mantém os participantes conectados.

Se a Cloudflare recusar a criação por limite de solicitações, o app explica e mostra **Tentar novamente em…**. A espera começa em um minuto; recusas consecutivas aumentam para dois, quatro e no máximo cinco minutos entre tentativas. A contagem é uma proteção local, não uma previsão de liberação pela Cloudflare. Não há nova tentativa automática ao terminar; o botão fica disponível. O prazo é salvo em `%APPDATA%\Concord\tunnel\invite-retry.json`, sem chaves ou dados de participantes. Fechar/reabrir não repete o pedido durante a espera. Configurações, captura e entrada pelo convite de outra pessoa continuam disponíveis. Outros erros distinguem serviço indisponível, localização/conexão e componente ausente.

A foto escolhida em PNG/JPG é recortada e reduzida localmente para JPEG de 128×128; o banner, para 512×192. Nome, foto, banner e cor opcional ficam em `%APPDATA%\Concord\profile.json`, separados da instalação. Atualizações e desinstalação normal preservam esse perfil. Só as miniaturas são enviadas aos participantes autorizados durante a sala; o Concord não hospeda perfis online nem envia o arquivo original. São identificações escolhidas pelo usuário, não prova de identidade.

Na lista lateral, nome e avatar de cada participante são um botão: clique ou use Tab e Enter/Espaço para abrir o cartão. Ele mostra nome/foto/banner atuais, com iniciais quando não houver foto e faixa padrão quando não houver banner. Feche no **×**, clicando fora ou por **Esc**; o foco do teclado volta à lista e a tela em foco, o som e as transmissões continuam iguais. O cartão acompanha as alterações do perfil e fecha se a pessoa sair da sala.

## Discord e banner

No perfil, use **Escolher banner** / **Remover banner**, ou **Vincular Discord**. A vinculação abre a autorização oficial no navegador; não solicita senha ou token dentro do Concord. Ela importa nome, foto, banner quando existir e cor de destaque. **Atualizar do Discord** repete a importação sem entrar na sala; se o Discord não tiver banner, mantém o banner manual. **Desvincular** remove/revoga a autorização, preservando a aparência já salva.

Na sala, **Convidar pelo Discord** abre a lista de amigos da conta autorizada, com busca e botão **Convidar** em cada linha. Cada clique envia apenas o link da sala por mensagem direta e mostra **Enviado** somente após confirmação do Discord. Não envia convites ao vincular ou abrir a lista. Erros aparecem na linha; se o envio não foi confirmado, confira a conversa antes de repetir. A lista e miniaturas dos amigos ficam apenas em memória durante o uso; não existe uma lista de amigos própria do Concord.

A integração usa o [Discord Social SDK](https://docs.discord.com/developers/discord-social-sdk/core-concepts/communication-features) oficial. O Discord apresenta as permissões sociais em um pacote; o Concord utiliza perfil, leitura de amigos e envio do convite solicitado. A autorização é guardada criptografada pelo Windows em `discord-link.bin`, separada do perfil, e nunca enviada aos participantes. A aplicação está no limite de desenvolvimento do SDK: **100 mensagens diretas a cada 2 horas, somadas entre os usuários do app**. Ampliação depende dos requisitos e aprovação do Discord. O restante do Concord funciona sem vinculação.

O instalador inclui todos os componentes e cria a entrada em **Aplicativos instalados**. Não precisa instalar Node.js, Python ou ferramentas de desenvolvimento. Instala somente para seu usuário, normalmente em `%LOCALAPPDATA%\Programs\Concord`, sem pedir administrador. Feche o Concord antes de instalar manualmente ou desinstalar; uma sala aberta não é encerrada à força pelo instalador.

## Atualizações

Depois da instalação inicial, o app consulta `MiharaxD/concord` uma vez por abertura. Uma versão mais nova publicada com seus metadados é baixada em segundo plano; o menu lateral mostra o progresso e **Reiniciar e atualizar** quando estiver pronta. O clique encerra sua sala, salva alterações do perfil, fecha áudio/túnel, instala e reabre o programa. Nome/foto permanecem no PC.

A versão instalada e **Verificar atualizações** ficam abaixo do perfil. Sem internet ou com falha no GitHub, o app continua funcionando; erros ficam em `%APPDATA%\\Concord\\updates.log`. O desenvolvimento e o portátil não tentam instalar atualizações. Versões portáteis antigas precisam instalar este Setup uma vez para receber esse recurso.

Para publicar próximas versões, há `pnpm release` / `npm run release` e workflow por tags `v<versão>`. Instalação local não publica nada; veja [BUILD_WINDOWS.md](BUILD_WINDOWS.md). O instalador, `.blockmap` e `latest.yml` precisam estar na Release pública.

## Qualidade e taxa de bits

Escolha **Qualidade** (720p, 1080p, 1440p ou 4K) e **FPS** (30 ou 60) separadamente. Em **Opções avançadas**, a taxa **Automática** considera os dois controles; **Personalizada** permite **1 a 60 Mbps**, em passos de 0,5. Configure antes de iniciar; para mudar durante o uso, encerre e comece novamente.

Resolução, FPS, modo/valor de bitrate, modo de áudio e sua opção de áudio ligado/desligado são salvos em `%APPDATA%\Concord\preferences.json`. Escolha de tela/janela, fonte sonora e autorização de captura não são restauradas. Microfone começa desligado a cada abertura.

| Qualidade | 30 FPS | 60 FPS |
| --- | --- | --- |
| 720p | 4 Mbps | 6 Mbps |
| 1080p | 8 Mbps | 12 Mbps |
| 1440p | 16 Mbps | 24 Mbps |
| 4K | 32 Mbps | 45 Mbps |

A taxa configura o limite do vídeo em WebRTC e a taxa alvo no modo de compatibilidade; o consumo real varia com conteúdo, encoder e rede. Áudio e protocolos acrescentam tráfego. A resolução/FPS escolhida é um teto: uma fonte menor não ganha detalhe, e o hardware pode produzir menos quadros. WebRTC prioriza preservar resolução quando precisa se adaptar.

## Som apenas do jogo

**Somente do jogo / app** é a fonte padrão. Ao escolher uma janela para vídeo, ela também é selecionada para áudio; você pode escolher outro app no botão da fonte sonora, inclusive ao compartilhar um monitor inteiro. **Todo o computador** continua disponível como opção explícita.

O áudio específico usa WASAPI por processo e inclui seus processos filhos. Não inclui Discord, notificações ou outros programas independentes. Se várias janelas/abas pertencem ao mesmo processo de um aplicativo, seus sons podem ser incluídos juntos. Deixe **Seu microfone** desligado se quiser transmitir apenas o som do jogo.

**Todo o computador** pode incluir também o som das streams que você está ouvindo na sala. Prefira **Somente do jogo / app** para compartilhar o jogo sem retransmitir a conversa ou as telas dos outros.

Essa captura específica exige Windows build 20348 ou mais recente, incluindo Windows 11, e o .NET Framework 4 já disponível nas instalações atuais do Windows. Não instala driver virtual nem grava áudio em disco. Falhas mostram erro e encerram a captura; o app não muda silenciosamente para o som de todo o computador.

O player inicia com áudio sem exigir clique no volume. Cancelamentos temporários de reprodução por mudança de fonte não ativam o mute; o botão de silenciar e volume zero continuam sendo escolhas do espectador.

O medidor mostra somente o nível da fonte sonora autorizada, antes de misturar o microfone. Durante a transmissão, usa a mesma track de áudio, sem ampliar captura nem tocar sua prévia. Em **Somente do jogo / app**, escolha a janela e clique explicitamente em **Testar áudio do app** para medir antes de transmitir; **Parar teste de áudio**, trocar fonte/modo ou sair libera o teste. Em **Todo o computador**, o nível aparece ao transmitir; não há captura prévia automática.

## Atalhos na sala

- **M**: silenciar/ativar o som recebido.
- **F**: alternar tela cheia.
- **Esc**: retornar da tela em foco para a grade; também fecha pop-ups e sai da tela cheia pelo comportamento nativo.

Dicas dos botões mostram os atalhos. Não atuam durante digitação, seletores, edição de texto ou pop-ups, nem com Ctrl/Alt/Shift/Win pressionados. Reconexão e mudança para compatibilidade mostram mensagens curtas na sala.

## Conexão e limites

- Cada dupla negocia WebRTC bidirecional com STUN. Rotas que não conectam usam automaticamente WebM por WebSocket através da sala. Não há seletor de transporte na interface; o modo de compatibilidade interno foi preservado. Streams diferentes são identificadas e decodificadas separadamente.
- Mais espectadores e transmissores usam mais upload, memória e processamento. WebRTC configura bitrate por conexão; no fallback, o PC que criou a sala encaminha as streams e pode exigir mais banda. Comece com **720p · 30 FPS** em salas maiores ou conexão apertada.
- O convite público usa um Quick Tunnel gratuito da Cloudflare, preparado em segundo plano ao abrir o app. Não exige conta, domínio, IP público ou abertura de porta. Depende da disponibilidade desse serviço; não há garantia de uptime. O endereço muda quando o túnel é recriado. Documentação: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
- O app espera o túnel registrar a conexão, o DNS publicar o endereço e o HTTPS responder antes de liberar o convite. O preparo agora acontece enquanto você configura o app; se você abrir e copiar imediatamente, ainda pode haver espera. Após 150 segundos sem sucesso, mostra erro e permite tentar novamente.
- WebRTC cifra a transmissão entre os participantes. No modo de compatibilidade, o transporte é HTTPS/WSS, com terminação TLS na Cloudflare; não é criptografia de ponta a ponta. O app não grava a tela em disco.
- O convite contém uma chave aleatória própria de 128 bits, revogada junto com a chave de 256 bits dos links antigos. Quem tiver um convite válido pode entrar na sala. O novo link HTTPS usa a chave na consulta da URL para preservar o destino da prévia do Discord; ela passa pela Cloudflare e pelo serviço que gerar a prévia. O app não registra acessos com a chave e a página usa `no-referrer`. O HTML da prévia não inclui a chave nem a lista da sala; a administração continua local.
- **Todo o computador captura todo o áudio de saída do Windows**, inclusive outros apps, mesmo ao selecionar só uma janela. O som de conteúdo protegido e algumas janelas com DRM podem não ser capturáveis.
- Tela cheia, grade, foco, minimizar, encerrar só sua transmissão, reconectar e entrar depois do início são suportados. Trocar de janela/qualidade/áudio requer encerrar e começar novamente.
- A versão atual foi preparada para Windows x64. O executável não tem assinatura digital; o Windows pode mostrar um aviso de editor desconhecido. A versão instalada verifica atualizações públicas no GitHub após abrir, baixa em segundo plano e oferece **Reiniciar e atualizar**. Fechar normalmente não aplica a atualização.

## Desenvolvimento

Node 22+ e pnpm. Versões de dependências fixadas no `package.json` e `pnpm-lock.yaml`.

```powershell
pnpm install --frozen-lockfile
node scripts/prepare.mjs
pnpm build:audio
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-discord.ps1
pnpm start
pnpm test
pnpm build
```

Para gerar o instalador completo, execute **`build-installer.bat`** ou `pnpm build:installer`. O script instala dependências pelo lockfile, prepara o Cloudflared oficial com checksum/licença, verifica o SDK do Discord, compila os auxiliares e empacota. A saída atual fica em `dist/installer/0.5.1/Concord-0.5.1-Setup.exe`. `pnpm build` também pode gerar o portátil em `dist/0.5.1/`. Executáveis anteriores ficam preservados em `dist/`. Configuração e assinatura futura estão em [BUILD_WINDOWS.md](BUILD_WINDOWS.md).

`pnpm test:discord` valida vinculação com provedor controlado, proteção real do Windows, imagens/banner entre duas instâncias, links/página/entrada confirmada, busca/envio/erro do modal de amigos e reabertura/desvinculação. Não envia mensagens reais. `tests/discord-live.mjs` é um teste interativo separado: exige autorização humana e escolha explícita do destinatário, usa perfil isolado e revoga a autorização de teste ao terminar. Veja `VERIFICACAO.md` para distinguir testes controlados de verificações reais.

`pnpm test:experience` valida a interface com duas instâncias isoladas: sala, entrada/cancelamento/erro de convite, preparo/cópia, preferências, qualidade/FPS/encoder, duas telas, grade/foco, atalhos, fallback/reconexão, medidor WASAPI real e convites por argumentos em abertura fria/segunda instância. `node tests/protocol.mjs` compila/executa as macros NSIS de registro/remoção numa chave de QA isolada, sem mudar o handler pessoal. O teste de estados de preparo usa respostas controladas de IPC, sem depender de DNS público. Use `CONCORD_EXE` para o app extraído do instalador.

`pnpm test:profiles` valida dois participantes e duas transmissões com vídeo/tom gerados: cartão por nome/avatar/teclado, foto/iniciais, fechamentos, foco do teclado, atualização/saída de perfil e preservação de mídia, conexão, mute, volume e tela em foco. Também compara os três arquivos de interface do app executado com o fonte. Use `CONCORD_EXE` para verificar o app extraído do instalador.

`pnpm test:invitation` valida aviso de limite, contagem/botão, controles disponíveis, cancelar sem resultado tardio e sucesso/cópia com respostas controladas. Usa cache isolado para não criar túneis públicos repetidamente. As unidades cobrem subprocesso 429, pedidos concorrentes, persistência/expiração e retomada; o teste de perfis também evita provisionar túneis reais. A disponibilidade da Cloudflare precisa de verificação pública separada.

`pnpm test:navigation` testa dois clientes com vídeo/tom gerados, preservação da captura/conexão/espectador ao clicar repetidamente na sala atual, retorno da sala de um amigo e saída explícita. `CONCORD_EXE` seleciona um executável empacotado; sem a variável, usa o app de desenvolvimento. Perfis de QA ficam em `test-results/`.

`tests/call.mjs` testa três instâncias do app real via Playwright; recebe o caminho do Playwright em `PLAYWRIGHT_MODULE`. Verifica nomes/fotos, streams simultâneas, grade, foco, áudio decodificado, persistência e revogação. `CONCORD_TEST_TUNNEL=1` inclui entrada pelo convite preparado automaticamente e transporte público. Não substitui um teste em PCs físicos com redes diferentes.

`tests/quality-audio.mjs` verifica bitrate no encoder, vídeo de maior resolução, som automático após cancelamento de reprodução e isolamento de dois processos sonoros reais. `tests/smoke.mjs` verifica o app descompactado e `tests/portable.mjs` abre o portátil final; seguem a versão de `package.json` e a configuração em `build/`. `tests/installer.mjs` verifica instalação, atualização/reinstalação, perfil, assets, helpers e desinstalação; recusa substituir uma instalação/atalho pessoal preexistente. `tests/updater.mjs` exercita o download HTTP, instalação NSIS, reinício automático e preservação do perfil com duas versões reais; o feed de teste fica somente na instalação descartável. `tests/release.mjs` verifica a publicação contra uma API simulada, sem escrever no GitHub. Os testes de chamada continuam tendo uma instabilidade ao reiniciar múltiplas telas registrada em `docs/context/TODO.md`.

## Organização

- `desktop/main.cjs`: janela nativa, seleção de monitor/janela, áudio do Windows e permissões.
- `desktop/updater.cjs`: eventos do electron-updater, estado, log limitado e reinício solicitado pelo usuário.
- `desktop/preload.cjs`: API mínima entre a interface isolada e o app.
- `desktop/preferences.cjs`: validação e persistência atômica das preferências locais.
- `public/audio-meter.js`: análise de uma track já autorizada, sem pedir captura.
- `build/protocol.nsh`: registro por usuário do convite no Windows e remoção com conferência do executável proprietário.
- `server.mjs`: sala, autenticação, sinalização WebRTC, relay WebSocket e túnel.
- `public/`: interface e captura; `room-media.js` mantém conexões WebRTC e receptores WebM independentes por participante.
- `tests/`: validação de autenticação, reconexão, vídeo e áudio.
- `build/`: configuração comum de empacotamento, configuração do instalador e personalização NSIS.
- `scripts/build-windows.ps1` e `build-installer.bat`: preparação e geração reproduzível do pacote Windows.

O servidor escuta somente em loopback e usa porta dinâmica dentro do app. Administração exige uma chave do transmissor e requisição local sem cabeçalhos de proxy. Perfil visual e preferências são locais; a autorização opcional do Discord fica separada e criptografada. Não há cadastro próprio, controle remoto, acesso à câmera ou captura automática ao abrir. Para testes isolados, `CONCORD_DATA_DIR` pode apontar para outro diretório de dados.
