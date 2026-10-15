# Contratos da arquitetura

Consulte apenas para captura, mídia, perfis, transporte, permissões ou empacotamento.

## Autoridade e sala

- Electron principal possui seleção nativa, helper de áudio e túnel. Interface em loopback, sandbox/context isolation e preload restrito; IPC valida janela e URL próprias.
- Administração HTTP exige chave do dono, conexão local e ausência de cabeçalhos de proxy. Convidados entram com chave curta de 128 bits ou legada de 256 bits; renovação revoga ambas e remove todos os convidados.
- Sala admite até 8 pessoas contando o dono. Cada socket autenticado recebe ID próprio, nome/foto e estado de transmissão. Nome/foto são descrições escolhidas pelo participante, não autenticação.
- Participantes podem compartilhar somente sua própria captura. Sinalização é direcionada ao ID do destinatário; servidor sobrescreve a origem com o ID do socket autenticado. Mídia sem stream ativa é recusada.
- Convite é preparado ao carregar a interface, inclusive durante escolha inicial de nome. Não bloquear abertura em DNS/HTTPS. Promises concorrentes compartilham um único processo; cancelar/fechar acesso cancela a promise, mata o processo e impede conclusão tardia de restaurar a URL.
- Após cancelamento não retomar automaticamente na mesma execução. Fechar app encerra processos/servidor e a sala hospedada; encerrar só a própria captura mantém a sala.
- `desktop/invite-retry.cjs` classifica a falha do Cloudflared após close (stdout/stderr drenados). Provisionamento 429 ativa espera local de 60/120/240/300 s, sem nova tentativa automática. Prazo/contador são gravados atomicamente, sem chaves/log bruto, em userData/tunnel/invite-retry.json; leitura valida prazo/contador, falhas de cache não impedem o app, sucesso limpa e intervalo longo reinicia escalada. Sessão administrativa inclui inviteError com código/mensagem segura/retryAt; renderer lê após rejeição de IPC e exibe motivo/contagem. API impede novos processos durante o prazo, inclusive ao reabrir. Cancelamento também cobre a leitura assíncrona anterior ao spawn; shutdown espera promise e gravações. Falha durante preparo não emite tunnel-closed que sobrescreva seu motivo. Sala/protocolo e transportes não mudam.

## Perfis locais e interface

- Nome obrigatório na primeira execução, editável; foto opcional via seletor nativo. Perfil JSON salvo atomicamente em `%APPDATA%\Concord\profile.json`; gravações são serializadas, mesclando os campos atuais. Fechamento espera operações de perfil pendentes. Para testes isolados, CONCORD_DATA_DIR define outro diretório; o reinício NSIS pelo shell usa o perfil normal do Windows.
- Foto selecionada é recortada ao centro e reduzida localmente a JPEG 128×128. Apenas miniatura é enviada à sala; arquivo original/caminho local não são expostos. Servidor mantém perfil em memória durante a conexão, sem armazenamento online.
- Nome exibido via textContent; foto aceita somente data URI JPEG base64 com tamanho limitado. Permissão de câmera não é concedida.
- Participantes aparecem no menu lateral, em lugar do bloco “Sua sala particular”. Layout de vídeos usa grade dimensionada por quantidade e área disponível, sem sobrepor células.
- Cada linha de participante é um botão nativo de nome/avatar com aria-haspopup/controls/expanded. Abre `member-profile` via dialog modal, usando somente nome/textContent e foto/miniatura do roster atual, ou avatar de iniciais existente. Faixa roxa é decorativa fixa. Sem novo IPC, requisição, persistência ou campo de perfil. Botão, clique fora (pressionar/soltar fora) e cancel/Esc fecham e devolvem foco do teclado à linha atual; saída/desconexão limpa cartão e impede reabrir ID antigo. Atualizações do roster renovam nome/foto abertos sem substituir o controle focado. Estado do cartão é separado do foco de streams; não chama captura, mídia, mute ou transporte. Guard existente de atalhos bloqueia comandos da chamada enquanto dialog estiver aberto.
- Painel inicial oferece Criar sala/Entrar em sala. Só criar/confirmar entrada conecta o participante; preparo do túnel continua ao carregar. Sala reúne captura e participantes; entrada usa dialog com cancelar/validação/timeout. Navegar ao Painel/sala atual preserva conexão/captura; sair explicitamente desconecta, libera a própria captura e retorna ao Painel. Criar enquanto convidado muda para a sala própria.
- `desktop/preferences.cjs` mantém preferences.json com resolução/FPS/modo e valor de bitrate/modo de áudio/áudio habilitado. Whitelist, valores validados, gravação atômica serializada e espera no shutdown. Arquivo ausente usa padrão; inválido não bloqueia o app. Fonte de vídeo/áudio e microfone não persistem. Não usar localStorage da origem loopback com porta variável.
- Clique em uma tela alterna entre foco e grade; “Ver todas” também retorna à grade. Grade habilita som das streams recebidas; foco habilita só a escolhida. Volume/mute globais permanecem respeitados e própria prévia sempre muda.
- M/F/Esc controlam som recebido/tela cheia/grade somente na sala, sem repetição/modificadores, campos editáveis/seletores ou dialog aberto. Dicas dos controles mostram os atalhos; Esc dos diálogos preserva cancelamento nativo/controlado.

## Mídia e recuperação

- RoomMedia mantém um RTCPeerConnection bidirecional por dupla. Apenas o menor ID inicia a oferta; o outro cria transceivers ao receber a oferta, evitando duplicação. Tracks são substituídas para começar/encerrar captura sem refazer a sala.
- Cada publicador tem no máximo um MediaRecorder compartilhado por seus destinatários de fallback. Novo destinatário exige encoder/cabeçalho novo para todos os destinatários daquele fluxo; não descartar chunks de fluxo ativo.
- Relay usa WebM/Opus por WebSocket: cada mensagem enviada pelo servidor recebe prefixo de comprimento e ID do publicador autenticado. Chunks até 1 MiB preservam ordem; receptores mantêm MediaSource/SourceBuffer separados por origem.
- Buffers: socket 32 MiB, receptor 48 MiB por stream, poda de mídia antiga após 12 segundos. Espectador atrasado é desconectado sem bloquear os demais. Fechar/remover peer limpa RTC, timers, MediaSource, object URLs e encoder.
- Bitrate WebRTC é teto por conexão; MediaRecorder recebe alvo. Não prometer consumo/FPS constantes, detalhe inventado de fonte menor ou upload único para muitos participantes.
- Resolução/FPS separados recompõem a chave dos presets existentes; bitrate fica recolhido em Opções avançadas. Interface sempre pede rota automática, mantendo fallback interno e protocolo existentes. RoomMedia comunica uso de relay para aviso curto; reconexão tem feedback sem detalhes técnicos. Aviso desaparece quando não há stream usando a rota.
- Relay termina TLS na Cloudflare, sem criptografia de ponta a ponta. Mais participantes usam mais CPU/upload, especialmente no PC que hospeda a sala.

## Captura e áudio

- Captura começa após seleção explícita, inclusive para quem entrou pelo convite. Escolha de fonte expira em 15 segundos. Encerrar/mudar de sala/fechar deve liberar tracks, contexto de áudio e helper.
- Áudio de computador inteiro é opção explícita. Modo somente jogo/app usa helper C# WASAPI process-loopback, incluindo filhos, em Windows build 20348+; falha não amplia captura.
- Helper envia PCM estéreo 48 kHz por pipe/IPC; AudioWorklet com buffer limitado gera uma track usada no mesmo RTC/relay. Microfone pode ser misturado, sem voz independente de uma stream.
- Captura ao vivo fica em memória, sem gravação automática em disco.
- AudioMeter somente observa track já autorizada da fonte escolhida, antes de misturar microfone, com saída local silenciosa. Não pede nem encerra captura. Teste prévio somente por botão explícito do jogo/app, usando o helper existente; computador inteiro mede somente durante transmissão. Parar/trocar fonte/modo/navegar/sair libera preview, worklet, contextos e helper. Gerações invalidam inicializações tardias, inclusive enumeração nativa cancelada e captura de tela pendente.
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
- NSIS inclui `build/protocol.nsh` e registra HKCU\Software\Classes\concord com executável instalado e `%1` entre aspas. Desinstalar remove só se o comando ainda pertence a esse executável. Não registrar dev/staging/portátil. Principal usa singleInstanceLock após userData, recebe argumento `concord:` frio/second-instance, limita tamanho, entrega por preload/IPC e só preenche dialog; validação parseInvite existente e confirmação explícita antes de qualquer entrada/troca de sala. Inicialização aguarda nome sem perder convite. Referência: https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app.
- tests/updater.mjs altera apenas o feed da instalação descartável para HTTP local, usa updater/NSIS reais, confere restart e perfil normal do Windows. tests/release.mjs simula API, sem escrita externa. Na 0.3.4, publicação real pelo Actions e consulta/download público sem token foram confirmados com cliente 0.3.3 e cache isolado; instalação pessoal aberta não foi substituída.
- Build resolve somente a primeira aplicação Node/pnpm no PATH e usa SHA256 .NET sem depender de Get-FileHash do PowerShell. Execução manual do workflow permite retomar publicação sem mover tag, verificando que app/dependências/configuração continuam iguais à tag.
