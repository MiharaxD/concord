@AGENTS.md

# Concord — contexto para o Claude Code

Este arquivo é o ponto de entrada estável. Estado da versão, pendências e decisões ficam em `docs/context/` (ver mapa em AGENTS.md); não duplique aqui SHAs, tamanhos de binário ou resultados de teste.

## O que é

App desktop Windows x64 (Electron + JavaScript) de compartilhamento de tela e áudio em salas privadas de até 8 pessoas (dono + 7 convidados), com várias transmissões simultâneas. A mesma aplicação transmite e assiste. Sem cadastro, rede de amigos, servidor ou domínio próprios: o PC de quem cria a sala roda o servidor e expõe a sala por um Quick Tunnel da Cloudflare. Discord é opcional (perfil e convite por DM). Autor: Yuri Mihara (GitHub `MiharaxD/concord`), licença UNLICENSED.

## Stack

- Electron 44.5.1, Node 22+ (CI usa 24), pnpm 11.19.0, ESM (`"type": "module"`); arquivos do processo principal são `.cjs`.
- Runtime: só `ws` 8.22.0 e `electron-updater` 6.8.9. Dev: `electron-builder` 26.15.3 e `playwright` 1.62.1.
- Nativos em C# compilados com o `csc.exe` do .NET Framework 4: `native/AppAudio.cs` → `ConcordAudio.exe` (WASAPI process-loopback) e `native/DiscordSocial.cs` → `ConcordDiscord.exe` (ponte com o Discord Social SDK 1.10.19337, DLL em `vendor/`).
- Cloudflared 2026.10.0 baixado com checksum por `scripts/prepare.mjs` para `.runtime/` (ignorada pelo Git, assim como `dist/`, `test-results/` e `node_modules/`).
- Sem bundler, framework de UI, TypeScript, lint ou banco de dados.

## Mapa do código

| Caminho | Papel |
| --- | --- |
| `server.mjs` | HTTP + WebSocket em `127.0.0.1` (porta dinâmica no app). Serve `public/`, API admin (`/api/session`, `/api/tunnel`, `/api/invite`), autenticação de sala, roster, sinalização WebRTC e relay binário. Também sobe/derruba o `cloudflared`. |
| `desktop/main.cjs` | Processo principal: janela, permissões de mídia, seleção de fonte, IPC (`concord:*`), perfil (`profile.json`), helper de áudio, deep link `concord:`, single instance, shutdown ordenado. |
| `desktop/preload.cjs` | Ponte restrita `window.concord` (contextIsolation). Toda nova capacidade passa por aqui + `handle()` validado no main. |
| `desktop/discord.cjs` | OAuth público PKCE (loopback 41697), tokens criptografados com safeStorage/DPAPI em `discord-link.bin`. |
| `desktop/discord-social.cjs` | Processo filho `ConcordDiscord.exe` via stdin/stdout JSON (amigos, envio de DM). |
| `desktop/invite-retry.cjs` | Classifica falhas do cloudflared e aplica espera 60/120/240/300 s após 429 (`invite-retry.json`). |
| `desktop/preferences.cjs` | `preferences.json` (resolução, FPS, bitrate, modo de áudio) com whitelist. |
| `desktop/updater.cjs` | electron-updater contra GitHub Releases, só no instalador empacotado. |
| `desktop/discord-config.json` | Application ID público, porta de retorno e escopos. Sem segredos. |
| `public/app.js` | Toda a UI do renderer (Painel, sala, convite, perfil, Discord, captura, atalhos). Arquivo grande com muito estado em `let` de módulo: mudanças aqui exigem cuidado com gerações (`*Generation`) e flags de pendência. |
| `public/room-media.js` | `RoomMedia`: um RTCPeerConnection por dupla (menor ID oferta) e fallback WebM/Opus via MediaRecorder/MediaSource pelo WebSocket. |
| `public/p2p.js` | Acesso P2P: `Signal` (MQTT cifrado AES-GCM), `connectRoom` (convidado, com plano B), `P2PHost` (ponte DataChannel ↔ servidor local), `RoomSocket` (imita WebSocket). |
| `public/chat.js`, `public/chat.css` | Chat da sala (`RoomChat`): texto, imagens e arquivos em chunks com ack; nada salvo. |
| `public/mqtt.js` | Cliente MQTT 3.1.1 mínimo sobre WSS (QoS 0) para os brokers públicos. |
| `public/invites.js` | Parser/gerador de convites (`concord:p2p:<chave>`, página do GitHub Pages, `concord:<túnel>:<chave>`, `/invite?join=`, `#join=` legado). Compartilhado com o servidor. |
| `site/` | Página estática do convite e landing, publicada no GitHub Pages por `.github/workflows/pages.yml`. |
| `public/profile.js` | `visualProfile()`: whitelist de nome/foto/banner/cor. Compartilhado com o servidor. |
| `public/stream-settings.js`, `audio-meter.js`, `app-audio-worklet.js` | Presets/bitrate, medidor de nível, worklet do PCM do helper. |
| `public/invite.html/js/css` | Página pública do link (Abrir no Concord / Baixar). Sem conexão à sala; o servidor injeta Open Graph. |
| `build/` | Config do electron-builder e macros NSIS (`protocol.nsh` registra `concord:` em HKCU). |
| `scripts/` | `build-windows.ps1` (portable/installer/publish), `build-audio.ps1`, `build-discord.ps1`, `prepare.mjs`, `publish-release.mjs`. |
| `.github/workflows/release.yml` | Em tag `v*`: valida versão, roda `pnpm test` e `pnpm release`. |

## Fluxo principal

1. Main sobe `createConcord()` em loopback, cria a janela e entrega `hostToken` só via bootstrap.
2. **Criar sala** conecta o dono ao WebSocket local e inicia o `P2PHost` (0.6.0+). O convite `concord:p2p:<chave 128 bits>` fica pronto na hora; o link é `https://miharaxd.github.io/concord/invite/?join=<chave>` (página estática em `site/`). Nada é capturado.
3. Convidado abre o link → página → `concord:p2p:` → app parado entra direto; se já estiver numa sala ou transmitindo, **pede confirmação**.
4. Convidado manda oferta WebRTC cifrada por brokers MQTT públicos; abre DataChannel direto com o host, que faz ponte para `ws://127.0.0.1/socket?via=p2p`. Daí em diante é o protocolo de sala de sempre.
5. **Plano B:** sem DataChannel em 15 s, o convidado pede o túnel; o host cria o Quick Tunnel (com a lógica de 429) e devolve o convite Cloudflare pelo canal cifrado.
6. Cada participante só transmite após escolher a fonte explicitamente. WebRTC de mídia (STUN) primeiro; se falhar, relay WebM pelo host.
7. Fechar o app do dono encerra sala, túnel e host P2P.

## Invariantes (não quebrar)

- **Segurança Electron:** `sandbox`, `contextIsolation`, sem `nodeIntegration`; IPC só aceita a janela própria com URL `${address}/`; janelas novas negadas; navegação externa bloqueada; câmera negada, exceto um único pedido logo após clicar em Ligar câmera (`concord:allow-camera`, 15 s).
- **Servidor:** escuta só em `127.0.0.1`; admin exige `x-concord-host` + conexão local + ausência de `x-forwarded-for`/`cf-connecting-ip`. Tokens comparados com `timingSafeEqual`. O servidor sempre sobrescreve `from` e prefixa o relay com o ID autenticado. Renovar convite revoga as duas chaves e derruba os convidados.
- **Captura explícita:** tela e câmera nunca começam sozinhas; nunca ampliar áudio de app para o sistema inteiro em caso de falha; fontes de tela não persistidas. Mídia só em memória.
- **Voz (0.8.3+, pedido do usuário):** como no Discord, o microfone abre ao entrar numa sala e o botão só muta (mute lembrado em `preferences.json`); fora de sala o microfone fica fechado. Testes E2E usam `--use-fake-device-for-media-stream` para não capturar o microfone real e `--mute-audio` para não tocar som no PC do usuário (inclusive scripts de print/QA).
- **Túnel:** só como plano B, quando um convidado com a chave pede. Sem loops automáticos; respeitar o prazo do 429. Testes comuns não devem provisionar túneis reais.
- **P2P:** conexões com `?via=p2p` nunca autenticam como dono. Mensagens nos brokers sempre cifradas; nada de chave em texto claro no tópico.
- **Convites/deep link:** entram direto só com o app parado; em sala/transmitindo pedem confirmação. Nunca iniciam captura. Protocolo de sala 0.3.0+ deve continuar compatível; campos novos de perfil são opcionais.
- **Discord:** sem Client Secret, bot, selfbot ou scraping. Tokens só no main e no stdin do helper, nunca no renderer, argumentos, env ou logs. Amigos (nomes/fotos) só em RAM; favoritos e enviados recentes ficam só como IDs em `preferences.json` (pedido do usuário). "Enviado" exige confirmação do SDK; sem retry automático (cota de 100 DMs/2h para o app inteiro).
- **Dados do usuário** em `%APPDATA%\Concord` (`profile.json`, `preferences.json`, `discord-link.bin`, `tunnel/`), gravados atomicamente e serializados; o shutdown espera essas gravações. Use `CONCORD_DATA_DIR` para isolar testes.
- **DOM:** nada de `innerHTML`/`eval`; texto do usuário sempre via `textContent`. CSP do servidor sem `unsafe-inline`.
- **UI:** português neutro e direto, sem "galera"/"bora"/frases promocionais; sem aviso de sucesso ao parar a transmissão; crédito "Desenvolvido por Yuri Mihara" no rodapé. Detalhes em `docs/context/DECISIONS.md`.

## Comandos

```powershell
pnpm install --frozen-lockfile
node scripts/prepare.mjs                 # baixa cloudflared para .runtime/
pnpm build:audio                         # compila ConcordAudio.exe
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-discord.ps1
pnpm start                               # app em modo dev (sem updater, sem registro de protocolo)
pnpm test                                # testes unitários (node --test), ~1 s
node tests/p2p.mjs                       # E2E P2P: 3 instâncias, brokers públicos reais, túnel simulado
node tests/camera.mjs                    # E2E câmera (dispositivo falso do Chromium)
node tests/chat.mjs                      # E2E chat por P2P real (texto, imagem, arquivo)
node tests/voice.mjs                     # E2E voz (microfone falso): mute, ensurdecer, troca de microfone, relay Opus
pnpm build:installer                     # dist/installer/<versão>/ (não publica)
```

Testes E2E (Playwright `_electron`, dados em `test-results/`): `test:desktop` (call.mjs), `test:navigation`, `test:profiles`, `test:discord`, `test:invitation`, `test:invite-start`, `test:experience`, `test:installer`, `test:updater`, `test:room-ux` (Painel/área de transferência, avisos, tile, conexão, configurações). Os testes de servidor simulam o cloudflared com os scripts em `tests/fixtures/tunnel*`.

Não rode sem pedido explícito:
- `tests/tunnel.mjs` e `CONCORD_TEST_TUNNEL=1 node tests/call.mjs`: criam um Quick Tunnel real (pode gerar 429).
- `tests/discord-live.mjs`: exige consentimento humano e conta real.
- `pnpm release` / `scripts/publish-release.mjs`: publica no GitHub.
- `tests/updater.mjs` e `tests/installer.mjs`: mexem em instalação; nunca substituir a instalação pessoal do usuário.

## Release e distribuição

- Versão em `package.json`; tag `v<versão>` dispara o workflow (testes + build + Release em rascunho, publicada só com todos os anexos).
- Anexos: `Concord-<v>-Setup.exe`, `.blockmap`, `.sha256`, `latest.yml` (necessário para o updater).
- `appId` `local.concord.desktop`, instalação por usuário em `%LOCALAPPDATA%\Programs\Concord`, sem admin. Builds anteriores ficam preservadas em `dist/`; não apagar.
- Commit, push, tag e publicação só com pedido explícito. Editar uma Release existente foi exceção pontual autorizada na 0.5.2, não um padrão.
- Alertas de antivírus: não contornar com exclusões. Varredura local limpa não prova falso positivo em outro PC.

## Limitações conhecidas (resumo)

- Depende de brokers MQTT públicos (EMQX, HiveMQ) e do GitHub Pages; o Quick Tunnel virou plano B (sem SLA, 429). Relay pela Cloudflare sem criptografia de ponta a ponta e com custo de upload/CPU no PC do host.
- STUN sem TURN: NAT restritivo cai no relay. Não validado em duas máquinas físicas e redes distintas.
- Instabilidade ao reiniciar várias streams no modo compatibilidade (aberta desde a 0.3.1).
- Áudio por app exige Windows build 20348+ e pode incluir outras janelas do mesmo processo.
- Pendências atualizadas em `docs/context/TODO.md`.

## Como trabalhar aqui

- Antes de mexer em captura, mídia, transporte, permissões ou empacotamento, leia `docs/context/ARCHITECTURE.md`; para escolhas de produto, `DECISIONS.md`.
- Siga o estilo existente: código compacto, poucos comentários, mensagens ao usuário em português, nomes em inglês.
- Mudança no app → teste o comportamento alterado e gere o executável; não diga que o binário tem algo que só está no fonte.
- Ao terminar trabalho relevante, atualize só os documentos de `docs/context/` afetados, de forma compacta.
