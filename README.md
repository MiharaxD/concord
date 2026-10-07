# Concord

App pessoal para Windows: você e um amigo usam o mesmo executável, sem conta e sem navegador. Feito em Electron + JavaScript.

## Como usar

1. Abra `Concord-0.2.1-Windows.exe`. Passe uma cópia desse mesmo arquivo para seu amigo.
2. Em **Compartilhar tela**, escolha um monitor ou uma janela. Defina qualidade, taxa de bits, fonte do áudio e microfone.
3. Clique em **Compartilhar tela**. Você vê uma prévia silenciosa para evitar eco.
4. Clique em **Criar convite pela internet**, copie o convite e mande para seu amigo.
5. Ele abre o Concord, entra em **Assistir ao amigo**, cola o convite e clica em **Entrar na sala**.

Qualquer um pode ser o transmissor. Nesta versão, uma pessoa transmite e uma assiste por sala. O microfone acompanha a tela; não há chamada de voz nos dois sentidos.

O executável é portátil: não precisa instalar Node, npm, Electron ou Cloudflared. Mantenha o app aberto enquanto usa; fechar encerra a tela e o convite. **Trocar convite** expulsa o espectador atual e invalida o convite antigo. **Fechar acesso** desliga o túnel e invalida o convite.

O convite da internet agora começa com `concord:` e tem **45 caracteres a menos** que o link anterior para a mesma sala. É um código para colar no Concord; não precisa abrir no navegador nem passar por encurtador externo. Ambos precisam da versão 0.2.1 para usar o formato curto. Links antigos com `https://…/#join=…` continuam aceitos pelo app atualizado.

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

Essa captura específica exige Windows build 20348 ou mais recente, incluindo Windows 11, e o .NET Framework 4 já disponível nas instalações atuais do Windows. Não instala driver virtual nem grava áudio em disco. Falhas mostram erro e encerram a captura; o app não muda silenciosamente para o som de todo o computador.

O player inicia com áudio sem exigir clique no volume. Cancelamentos temporários de reprodução por mudança de fonte não ativam o mute; o botão de silenciar e volume zero continuam sendo escolhas do espectador.

## Conexão e limites

- Primeiro tenta WebRTC direto entre os PCs, com STUN. Se não conectar em 9 segundos ou a conexão falhar, usa vídeo WebM por WebSocket através do túnel. Também é possível escolher **Compatibilidade** antes de transmitir.
- O modo de compatibilidade geralmente tem mais atraso e usa seu upload. Comece com **720p · 30 FPS** se a internet estiver apertada.
- O convite público usa um Quick Tunnel gratuito da Cloudflare, criado somente quando você clica no botão. Não exige conta, domínio, IP público ou abertura de porta. Depende da disponibilidade desse serviço; não há garantia de uptime. O endereço muda quando o túnel é recriado. Documentação: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
- O app espera o túnel registrar a conexão, o DNS publicar o endereço e o HTTPS responder antes de liberar o convite. Isso pode levar cerca de dois minutos; após 150 segundos sem sucesso, mostra um erro e permite tentar novamente.
- WebRTC cifra a transmissão entre os participantes. No modo de compatibilidade, o transporte é HTTPS/WSS, com terminação TLS na Cloudflare; não é criptografia de ponta a ponta. O app não grava a tela em disco.
- O convite curto contém uma chave aleatória própria de 128 bits, revogada junto com a chave de 256 bits dos links antigos. Quem tiver qualquer convite válido pode ocupar a única vaga; compartilhe com cuidado. A página pública sozinha não dá acesso à transmissão nem à administração.
- **Todo o computador captura todo o áudio de saída do Windows**, inclusive outros apps, mesmo ao selecionar só uma janela. O som de conteúdo protegido e algumas janelas com DRM podem não ser capturáveis.
- Tela cheia, minimizar, terminar, reconectar e entrar depois do início são suportados. Trocar de janela/qualidade/áudio requer encerrar e começar novamente.
- A versão atual foi preparada para Windows x64. O executável não tem assinatura digital; o Windows pode mostrar um aviso de editor desconhecido. Não há atualização automática.

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

`scripts/prepare.mjs` baixa o Cloudflared do repositório oficial e confere o SHA-256 publicado no release antes de usar o binário. `scripts/build-audio.ps1` compila o capturador a partir de `native/AppAudio.cs`, usando o compilador .NET Framework do Windows. `pnpm build` produz o portátil em `dist/0.2.1/` e embute ambos. `dist/0.2.1/win-unpacked` também pode ser usada como distribuição sem compactação. Os executáveis anteriores ficam preservados em `dist/`.

`tests/desktop.mjs` testa o app real via Playwright para Electron; recebe o caminho do Playwright em `PLAYWRIGHT_MODULE` quando ele não estiver instalado no projeto. Os testes de mídia usam uma tela sintética para comparar quadros em movimento e áudio recebido. Não substituem um teste em dois PCs físicos com redes diferentes.

`tests/quality-audio.mjs` verifica bitrate no encoder, vídeo de maior resolução, som automático após cancelamento de reprodução e isolamento de dois processos sonoros reais. `tests/smoke.mjs` verifica o app descompactado e `tests/portable.mjs` abre o portátil final; ambos seguem a versão/saída de `package.json`.

## Organização

- `desktop/main.cjs`: janela nativa, seleção de monitor/janela, áudio do Windows e permissões.
- `desktop/preload.cjs`: API mínima entre a interface isolada e o app.
- `server.mjs`: sala, autenticação, sinalização WebRTC, relay WebSocket e túnel.
- `public/`: interface e captura/reprodução.
- `tests/`: validação de autenticação, reconexão, vídeo e áudio.

O servidor escuta somente em loopback e usa porta dinâmica dentro do app. Administração exige uma chave do transmissor e requisição local sem cabeçalhos de proxy. Não há banco de dados, login, controle remoto, acesso à câmera ou transmissão automática ao abrir.
