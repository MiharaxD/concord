# Contratos da arquitetura

Consulte apenas para captura, mídia, perfis, transporte, permissões ou empacotamento.

## Autoridade e sala

- Electron principal possui seleção nativa, helper de áudio e túnel. Interface em loopback, sandbox/context isolation e preload restrito; IPC valida janela e URL próprias.
- Administração HTTP exige chave do dono, conexão local e ausência de cabeçalhos de proxy. Convidados entram com chave curta de 128 bits ou legada de 256 bits; renovação revoga ambas e remove todos os convidados.
- Sala admite até 8 pessoas contando o dono. Cada socket autenticado recebe ID próprio, nome/foto e estado de transmissão. Nome/foto são descrições escolhidas pelo participante, não autenticação.
- Participantes podem compartilhar somente sua própria captura. Sinalização é direcionada ao ID do destinatário; servidor sobrescreve a origem com o ID do socket autenticado. Mídia sem stream ativa é recusada.
- Convite é preparado ao carregar a interface, inclusive durante escolha inicial de nome. Não bloquear abertura em DNS/HTTPS. Promises concorrentes compartilham um único processo; cancelar/fechar acesso cancela a promise, mata o processo e impede conclusão tardia de restaurar a URL.
- Após cancelamento não retomar automaticamente na mesma execução. Fechar app encerra processos/servidor e a sala hospedada; encerrar só a própria captura mantém a sala.

## Perfis locais e interface

- Nome obrigatório na primeira execução, editável; foto opcional via seletor nativo. Perfil JSON salvo atomicamente em `%APPDATA%\Concord\profile.json`; gravações são serializadas, mesclando os campos atuais. Fechamento espera operações de perfil pendentes. Para testes isolados, CONCORD_DATA_DIR define outro diretório; o reinício NSIS pelo shell usa o perfil normal do Windows.
- Foto selecionada é recortada ao centro e reduzida localmente a JPEG 128×128. Apenas miniatura é enviada à sala; arquivo original/caminho local não são expostos. Servidor mantém perfil em memória durante a conexão, sem armazenamento online.
- Nome exibido via textContent; foto aceita somente data URI JPEG base64 com tamanho limitado. Permissão de câmera não é concedida.
- Participantes aparecem no menu lateral, em lugar do bloco “Sua sala particular”. Layout de vídeos usa grade dimensionada por quantidade e área disponível, sem sobrepor células.
- Compartilhar e entrar por convite permanecem na mesma tela; não há menu separado de assistir. Controles de captura continuam disponíveis para convidados da sala.
- Clique em uma tela alterna entre foco e grade; “Ver todas” também retorna à grade. Grade habilita som das streams recebidas; foco habilita só a escolhida. Volume/mute globais permanecem respeitados e própria prévia sempre muda.

## Mídia e recuperação

- RoomMedia mantém um RTCPeerConnection bidirecional por dupla. Apenas o menor ID inicia a oferta; o outro cria transceivers ao receber a oferta, evitando duplicação. Tracks são substituídas para começar/encerrar captura sem refazer a sala.
- Cada publicador tem no máximo um MediaRecorder compartilhado por seus destinatários de fallback. Novo destinatário exige encoder/cabeçalho novo para todos os destinatários daquele fluxo; não descartar chunks de fluxo ativo.
- Relay usa WebM/Opus por WebSocket: cada mensagem enviada pelo servidor recebe prefixo de comprimento e ID do publicador autenticado. Chunks até 1 MiB preservam ordem; receptores mantêm MediaSource/SourceBuffer separados por origem.
- Buffers: socket 32 MiB, receptor 48 MiB por stream, poda de mídia antiga após 12 segundos. Espectador atrasado é desconectado sem bloquear os demais. Fechar/remover peer limpa RTC, timers, MediaSource, object URLs e encoder.
- Bitrate WebRTC é teto por conexão; MediaRecorder recebe alvo. Não prometer consumo/FPS constantes, detalhe inventado de fonte menor ou upload único para muitos participantes.
- Relay termina TLS na Cloudflare, sem criptografia de ponta a ponta. Mais participantes usam mais CPU/upload, especialmente no PC que hospeda a sala.

## Captura e áudio

- Captura começa após seleção explícita, inclusive para quem entrou pelo convite. Escolha de fonte expira em 15 segundos. Encerrar/mudar de sala/fechar deve liberar tracks, contexto de áudio e helper.
- Áudio de computador inteiro é opção explícita. Modo somente jogo/app usa helper C# WASAPI process-loopback, incluindo filhos, em Windows build 20348+; falha não amplia captura.
- Helper envia PCM estéreo 48 kHz por pipe/IPC; AudioWorklet com buffer limitado gera uma track usada no mesmo RTC/relay. Microfone pode ser misturado, sem voz independente de uma stream.
- Captura ao vivo fica em memória, sem gravação automática em disco.
- Eventos de áudio/vídeo separados podem cancelar play. Não reatribuir a mesma srcObject a cada track nem silenciar por AbortError; respeitar o mute escolhido.

## Distribuição e validação

- Instalador NSIS/portátil embutem Electron, dependências runtime, Cloudflared oficial com SHA/licença e helper compilado do fonte. NSIS por usuário, sem elevação, menu Iniciar/atalho opcional e desinstalador; dados fora da instalação e preservados. Identificador estável `local.concord.desktop`. Releases anteriores são preservadas, sem commit/push/publicação automáticos.
- Testes reais devem confirmar quadros em movimento e áudio decodificado, não só presença de track. Novo protocolo exige mesma versão entre participantes.
- App descompactado usa Playwright _electron.launch. Wrapper portátil usa processo normal + CDP. Dados e fotos dos testes são isolados em test-results.
- Encerramento do servidor fecha também preconexões TCP sem HTTP e espera saída de túneis interrompidos. Principal encerra helper via stdin, com kill limitado ao próprio filho após prazo; espera processos parados e recusa novas operações ao fechar, inclusive captura sonora após enumeração assíncrona.

## Atualizador

- `desktop/updater.cjs` usa electron-updater 6.8.9 no principal. Habilita só em Windows, app.isPackaged, metadado concordDistribution=installer, desinstalador na pasta e ausência do wrapper portátil. `resources/app-update.yml` é gerado pelo builder com GitHub público MiharaxD/concord; sem token no cliente e sem override de feed por IPC/env.
- Interface chama updatesReady após bootstrap; uma verificação por execução, não bloqueante, sem loops. Consulta manual agrupada com existente. Eventos publicam apenas estado/version/progresso pelo preload restrito e IPC com validação de origem existentes.
- autoDownload=true, autoInstallOnAppQuit=false, allowPrerelease=false, allowDowngrade=false. Download em segundo plano, progresso no menu lateral, clique explícito para reiniciar. Sem update automático silencioso; erro da consulta automática somente no log, sem diálogo técnico.
- Clique espera dados/auxiliares e chama quitAndInstall(true,true). NSIS em --updated espera brevemente a saída do Electron; instalação/desinstalação manual com app aberto pede fechamento ou retorna código 2 em modo silencioso, sem matar a sala.
- Checksum/download diferencial/cache e fallback completo pertencem ao electron-updater. Log updates.log em userData, limitado por rotação após 1 MB. Reinício termina sala hospedada; nome/foto persistem.
- Builder gera Setup.exe, .blockmap e latest.yml. Publisher de desenvolvimento cria rascunho, envia todos mais .sha256 e só então publica; não sobrescreve release pública. Workflow valida tag v<package.version>, usa GITHUB_TOKEN contents:write. Scripts/workflow/tokens não são arquivos runtime empacotados.
- tests/updater.mjs altera apenas o feed da instalação descartável para HTTP local, usa updater/NSIS reais, confere restart e perfil normal do Windows. tests/release.mjs simula API, sem escrita externa. Publicação e fluxo GitHub real ainda requerem execução autorizada, distintos da validação local.
