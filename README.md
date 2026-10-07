# Concord

Instalador atual: [Concord 0.3.4 para Windows](https://github.com/MiharaxD/concord/releases/download/v0.3.4/Concord-0.3.4-Setup.exe). [Todos os arquivos da Release](https://github.com/MiharaxD/concord/releases/tag/v0.3.4).

App pessoal para Windows: até 8 pessoas na mesma sala, sem conta, domínio ou servidor próprio. Todos usam o mesmo executável Electron + JavaScript.

## Como usar

1. Abra `Concord-0.3.4-Setup.exe`, escolha se quer um atalho na Área de Trabalho e clique em **Instalar**. Depois abra o Concord pelo menu Iniciar. Na primeira vez, escolha seu nome; foto é opcional. Eles ficam salvos no PC. Clique no perfil, no menu lateral, para editar depois.
2. O convite começa a ser preparado automaticamente, inclusive durante a escolha do nome. Enquanto isso, escolha tela/janela, qualidade, taxa de bits e áudio.
3. Quando o convite estiver pronto, copie e mande para as pessoas. Elas colam o convite em **Entrar na sala de um amigo**, na mesma tela dos controles de transmissão, e clicam em **Entrar na sala**.
4. Compartilhar e assistir ficam na mesma interface, sem alternar menus. Qualquer participante pode escolher uma tela e clicar em **Compartilhar tela**, inclusive quem entrou pelo convite. Cada um controla sua própria captura.
5. As transmissões aparecem numa grade que ajusta colunas e linhas para caber. Clique numa tela para dar foco; clique nela novamente ou em **Ver todas** para retornar à grade. **Tela cheia** amplia a grade ou a tela em foco.

Na grade, o som de todas as transmissões recebidas fica habilitado. Em foco, só o som daquela tela fica habilitado. Silenciar/volume zero continuam sendo escolhas do usuário; a própria prévia fica sempre muda para evitar eco. Nomes e fotos dos participantes ficam no menu lateral, no lugar do antigo bloco “Sua sala particular”. Microfone acompanha a tela de quem o ativou; não há câmera nem voz independente de uma transmissão.

O convite curto começa com `concord:`, é colado no app e não usa encurtador externo. Formato URL com `#join=` também é aceito; **todos na sala precisam usar 0.3.0 ou mais nova** para o protocolo com múltiplas transmissões. Não há lista de amigos ou descoberta por tag.

**Cancelar preparação** interrompe o processo em segundo plano; **Preparar convite** tenta novamente. **Trocar convite** remove todos os convidados e invalida o convite anterior. **Fechar acesso** encerra o túnel e revoga o convite. O app não volta a abrir esse acesso automaticamente na mesma execução. Fechar o app que criou a sala encerra a sala inteira; encerrar apenas a sua transmissão mantém os outros participantes conectados.

A foto escolhida em PNG/JPG é recortada e reduzida localmente para JPEG de 128×128. Nome e foto ficam em `%APPDATA%\Concord\profile.json`, separados da instalação. Atualizações e desinstalação normal preservam esse perfil, inclusive se você usava o portátil. Essa miniatura é enviada aos participantes autorizados durante a sala; não há armazenamento online de fotos ou cópia do arquivo original. Nomes/fotos são identificações escolhidas pelo usuário, não prova de identidade.

O instalador inclui todos os componentes e cria a entrada em **Aplicativos instalados**. Não precisa instalar Node.js, Python ou ferramentas de desenvolvimento. Instala somente para seu usuário, normalmente em `%LOCALAPPDATA%\Programs\Concord`, sem pedir administrador. Feche o Concord antes de instalar manualmente ou desinstalar; uma sala aberta não é encerrada à força pelo instalador.

## Atualizações

Depois da instalação inicial, o app consulta `MiharaxD/concord` uma vez por abertura. Uma versão mais nova publicada com seus metadados é baixada em segundo plano; o menu lateral mostra o progresso e **Reiniciar e atualizar** quando estiver pronta. O clique encerra sua sala, salva alterações do perfil, fecha áudio/túnel, instala e reabre o programa. Nome/foto permanecem no PC.

A versão instalada e **Verificar atualizações** ficam abaixo do perfil. Sem internet ou com falha no GitHub, o app continua funcionando; erros ficam em `%APPDATA%\\Concord\\updates.log`. O desenvolvimento e o portátil não tentam instalar atualizações. Versões portáteis antigas precisam instalar este Setup uma vez para receber esse recurso.

Para publicar próximas versões, há `pnpm release` / `npm run release` e workflow por tags `v<versão>`. Instalação local não publica nada; veja [BUILD_WINDOWS.md](BUILD_WINDOWS.md). O instalador, `.blockmap` e `latest.yml` precisam estar na Release pública.

## Qualidade e taxa de bits

Escolha 720p, 1080p, 1440p ou 4K, em 30 ou 60 FPS. O modo **Automática** usa uma referência por qualidade; **Personalizada** permite de **1 a 60 Mbps**, em passos de 0,5, pelo controle deslizante ou campo numérico. Configure antes de iniciar; para mudar durante o uso, encerre e comece novamente.

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

## Conexão e limites

- Cada dupla de participantes negocia WebRTC bidirecional com STUN. Rotas que não conectam usam WebM por WebSocket através da sala; também é possível escolher **Compatibilidade** antes de transmitir. Streams de participantes diferentes são identificadas e decodificadas separadamente.
- Mais espectadores e transmissores usam mais upload, memória e processamento. WebRTC configura bitrate por conexão; no fallback, o PC que criou a sala encaminha as streams e pode exigir mais banda. Comece com **720p · 30 FPS** em salas maiores ou conexão apertada.
- O convite público usa um Quick Tunnel gratuito da Cloudflare, preparado em segundo plano ao abrir o app. Não exige conta, domínio, IP público ou abertura de porta. Depende da disponibilidade desse serviço; não há garantia de uptime. O endereço muda quando o túnel é recriado. Documentação: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
- O app espera o túnel registrar a conexão, o DNS publicar o endereço e o HTTPS responder antes de liberar o convite. O preparo agora acontece enquanto você configura o app; se você abrir e copiar imediatamente, ainda pode haver espera. Após 150 segundos sem sucesso, mostra erro e permite tentar novamente.
- WebRTC cifra a transmissão entre os participantes. No modo de compatibilidade, o transporte é HTTPS/WSS, com terminação TLS na Cloudflare; não é criptografia de ponta a ponta. O app não grava a tela em disco.
- O convite curto contém uma chave aleatória própria de 128 bits, revogada junto com a chave de 256 bits dos links antigos. Quem tiver qualquer convite válido pode entrar na sala; compartilhe com cuidado. A página pública sozinha não dá acesso à transmissão nem à administração.
- **Todo o computador captura todo o áudio de saída do Windows**, inclusive outros apps, mesmo ao selecionar só uma janela. O som de conteúdo protegido e algumas janelas com DRM podem não ser capturáveis.
- Tela cheia, grade, foco, minimizar, encerrar só sua transmissão, reconectar e entrar depois do início são suportados. Trocar de janela/qualidade/áudio requer encerrar e começar novamente.
- A versão atual foi preparada para Windows x64. O executável não tem assinatura digital; o Windows pode mostrar um aviso de editor desconhecido. A versão instalada verifica atualizações públicas no GitHub após abrir, baixa em segundo plano e oferece **Reiniciar e atualizar**. Fechar normalmente não aplica a atualização.

## Desenvolvimento

Node 22+ e pnpm. Versões de dependências fixadas no `package.json` e `pnpm-lock.yaml`.

```powershell
pnpm install --frozen-lockfile
node scripts/prepare.mjs
pnpm build:audio
pnpm start
pnpm test
pnpm build
```

Para gerar o instalador completo, execute **`build-installer.bat`** ou `pnpm build:installer`. O script instala dependências pelo lockfile, prepara o Cloudflared oficial com checksum/licença, compila o helper e empacota. A saída atual fica em `dist/installer/0.3.4/Concord-0.3.4-Setup.exe`. `pnpm build` também pode gerar o portátil em `dist/0.3.4/`. Os executáveis anteriores ficam preservados em `dist/`. Configuração e assinatura futura estão em [BUILD_WINDOWS.md](BUILD_WINDOWS.md).

`tests/call.mjs` testa três instâncias do app real via Playwright; recebe o caminho do Playwright em `PLAYWRIGHT_MODULE`. Verifica nomes/fotos, streams simultâneas, grade, foco, áudio decodificado, persistência e revogação. `CONCORD_TEST_TUNNEL=1` inclui entrada pelo convite preparado automaticamente e transporte público. Não substitui um teste em PCs físicos com redes diferentes.

`tests/quality-audio.mjs` verifica bitrate no encoder, vídeo de maior resolução, som automático após cancelamento de reprodução e isolamento de dois processos sonoros reais. `tests/smoke.mjs` verifica o app descompactado e `tests/portable.mjs` abre o portátil final; seguem a versão de `package.json` e a configuração em `build/`. `tests/installer.mjs` verifica instalação, atualização/reinstalação, perfil, assets, helpers e desinstalação; recusa substituir uma instalação/atalho pessoal preexistente. `tests/updater.mjs` exercita o download HTTP, instalação NSIS, reinício automático e preservação do perfil com duas versões reais; o feed de teste fica somente na instalação descartável. `tests/release.mjs` verifica a publicação contra uma API simulada, sem escrever no GitHub. Os testes de chamada continuam tendo uma instabilidade ao reiniciar múltiplas telas registrada em `docs/context/TODO.md`.

## Organização

- `desktop/main.cjs`: janela nativa, seleção de monitor/janela, áudio do Windows e permissões.
- `desktop/updater.cjs`: eventos do electron-updater, estado, log limitado e reinício solicitado pelo usuário.
- `desktop/preload.cjs`: API mínima entre a interface isolada e o app.
- `server.mjs`: sala, autenticação, sinalização WebRTC, relay WebSocket e túnel.
- `public/`: interface e captura; `room-media.js` mantém conexões WebRTC e receptores WebM independentes por participante.
- `tests/`: validação de autenticação, reconexão, vídeo e áudio.
- `build/`: configuração comum de empacotamento, configuração do instalador e personalização NSIS.
- `scripts/build-windows.ps1` e `build-installer.bat`: preparação e geração reproduzível do pacote Windows.

O servidor escuta somente em loopback e usa porta dinâmica dentro do app. Administração exige uma chave do transmissor e requisição local sem cabeçalhos de proxy. Nome/foto são os únicos dados de perfil persistidos localmente. Não há login, controle remoto, acesso à câmera ou captura automática ao abrir. Para testes isolados, `CONCORD_DATA_DIR` pode apontar para outro diretório de dados.
