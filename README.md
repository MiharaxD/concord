# Concord

App pessoal para Windows: você e um amigo usam o mesmo executável, sem conta e sem navegador. Feito em Electron + JavaScript.

## Como usar

1. Abra `Concord-0.1.0-Windows.exe`. Passe uma cópia desse mesmo arquivo para seu amigo.
2. Em **Compartilhar tela**, escolha um monitor ou uma janela. Defina qualidade, som do computador e microfone.
3. Clique em **Compartilhar tela**. Você vê uma prévia silenciosa para evitar eco.
4. Clique em **Criar convite pela internet**, copie o convite e mande para seu amigo.
5. Ele abre o Concord, entra em **Assistir ao amigo**, cola o convite e clica em **Entrar na sala**.

Qualquer um pode ser o transmissor. Nesta versão, uma pessoa transmite e uma assiste por sala. O microfone acompanha a tela; não há chamada de voz nos dois sentidos.

O executável é portátil: não precisa instalar Node, npm, Electron ou Cloudflared. Mantenha o app aberto enquanto usa; fechar encerra a tela e o convite. **Trocar convite** expulsa o espectador atual e invalida o convite antigo. **Fechar acesso** desliga o túnel e invalida o convite.

## Conexão e limites

- Primeiro tenta WebRTC direto entre os PCs, com STUN. Se não conectar em 9 segundos ou a conexão falhar, usa vídeo WebM por WebSocket através do túnel. Também é possível escolher **Compatibilidade** antes de transmitir.
- O modo de compatibilidade geralmente tem mais atraso e usa seu upload. Comece com **720p · 30 FPS** se a internet estiver apertada.
- O convite público usa um Quick Tunnel gratuito da Cloudflare, criado somente quando você clica no botão. Não exige conta, domínio, IP público ou abertura de porta. Depende da disponibilidade desse serviço; não há garantia de uptime. O endereço muda quando o túnel é recriado. Documentação: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
- O app espera o túnel registrar a conexão, o DNS publicar o endereço e o HTTPS responder antes de liberar o convite. Isso pode levar cerca de dois minutos; após 150 segundos sem sucesso, mostra um erro e permite tentar novamente.
- WebRTC cifra a transmissão entre os participantes. No modo de compatibilidade, o transporte é HTTPS/WSS, com terminação TLS na Cloudflare; não é criptografia de ponta a ponta. O app não grava a tela em disco.
- O convite contém uma chave aleatória de 256 bits. Quem tiver o convite pode ocupar a única vaga; compartilhe com cuidado. A página pública sozinha não dá acesso à transmissão nem à administração.
- **Som do computador captura todo o áudio de saída do Windows**, inclusive outros apps, mesmo ao selecionar só uma janela. O som de conteúdo protegido e algumas janelas com DRM podem não ser capturáveis.
- Tela cheia, minimizar, terminar, reconectar e entrar depois do início são suportados. Trocar de janela/qualidade/áudio requer encerrar e começar novamente.
- A versão atual foi preparada para Windows x64. O executável não tem assinatura digital; o Windows pode mostrar um aviso de editor desconhecido. Não há atualização automática.

## Desenvolvimento

Node 22+ e pnpm. Versões de dependências fixadas no `package.json` e `pnpm-lock.yaml`.

```powershell
pnpm install --frozen-lockfile
node scripts/prepare.mjs
pnpm start
pnpm test
pnpm build
```

`scripts/prepare.mjs` baixa o Cloudflared do repositório oficial e confere o SHA-256 publicado no release antes de usar o binário. `pnpm build` produz o executável portátil em `dist/` e embute o Cloudflared. A pasta `dist/win-unpacked` também pode ser usada como distribuição sem compactação.

`tests/desktop.mjs` testa o app real via Playwright para Electron; recebe o caminho do Playwright em `PLAYWRIGHT_MODULE` quando ele não estiver instalado no projeto. Os testes de mídia usam uma tela sintética para comparar quadros em movimento e áudio recebido. Não substituem um teste em dois PCs físicos com redes diferentes.

## Organização

- `desktop/main.cjs`: janela nativa, seleção de monitor/janela, áudio do Windows e permissões.
- `desktop/preload.cjs`: API mínima entre a interface isolada e o app.
- `server.mjs`: sala, autenticação, sinalização WebRTC, relay WebSocket e túnel.
- `public/`: interface e captura/reprodução.
- `tests/`: validação de autenticação, reconexão, vídeo e áudio.

O servidor escuta somente em loopback e usa porta dinâmica dentro do app. Administração exige uma chave do transmissor e requisição local sem cabeçalhos de proxy. Não há banco de dados, login, controle remoto, acesso à câmera ou transmissão automática ao abrir.
