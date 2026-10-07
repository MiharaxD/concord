# Estado atual

## Produto e versão entregue

- App desktop pessoal Windows x64 para sala de até oito pessoas, sem navegador externo/cadastro. Compartilhar e assistir na mesma interface; entrada pelo convite, nome obrigatório e foto opcional local. Sem lista de amigos/tags.
- **0.3.4 publicada**: [Release](https://github.com/MiharaxD/concord/releases/tag/v0.3.4). Instalador público em `dist/installer/0.3.4/github/Concord-0.3.4-Setup.exe`, 125.193.971 bytes, SHA-256 `6c35d9efa6ab32a177247eed46913aa023a1b80cfb0bdf3a826f990bde7d014c`.
- Build local anterior da mesma versão preservado em `dist/installer/0.3.4/Concord-0.3.4-Setup.exe`, SHA-256 `adea918179b6470a4980af2759434745b85e41fcd90079fcc2fb6bfa515ac892`. Compressão/timestamps/recompilação diferem do CI. Instaladores 0.3.2/0.3.3, portáteis anteriores e relatórios específicos preservados.
- Interface simplificada: sem cabeçalho e indicador visual de conexão, vazio “Compartilhamento de tela”, menu “PAINEL”, versão sem “pessoal”, crédito Yuri Mihara, “Link de convite” / “CONVITE DA SALA” sem mensagem redundante quando pronto. Relógio só enquanto transmite.

## Funcionamento confirmado

- Convite curto preparado ao abrir, inclusive durante escolha do nome. Captura opcional depende de seleção explícita. Até sete convidados e dono; nome/foto/estado no menu lateral.
- Streams simultâneas em grid adaptável, clique alterna foco/grade e “Ver todas” também retorna. Grid reproduz sons recebidos; foco só o escolhido. Prévia própria sempre silenciosa.
- Monitor/janela, som apenas do jogo/app ou computador inteiro, microfone opcional, WebRTC por dupla e relay WebSocket via Quick Tunnel Cloudflare.
- 720p/1080p/1440p/4K em 30/60 FPS, bitrate automático/manual 1–60 Mbps antes de transmitir.
- Parar a tela do dono mantém sala/outras streams; fechar o app do dono encerra a sala. Protocolo compatível com 0.3.0+.
- NSIS por usuário, sem administrador, menu Iniciar/atalho opcional/desinstalador. Runtime/helper/conexão embutidos. Nome/foto em `%APPDATA%\Concord\profile.json`, preservados em update/desinstalação e migração do portátil.
- Updater consulta GitHub público uma vez após bootstrap, baixa/progride em segundo plano e aplica no clique “Reiniciar e atualizar”. Fecha normalmente sem instalar; dev/portátil não consultam. Versão/botão manual no menu lateral. Falhas não bloqueiam; log limitado em userData.

## Validação e publicação

- 19 unidades passaram localmente e no CI. Smoke passou nos pacotes local e **extraído do instalador público**; ASAR público corresponde ao fonte, inclui ws/updater e exclui dependências de desenvolvimento.
- Revisão visual e captura da própria janela de QA confirmaram UI, convite pronto e relógio durante/depois da transmissão. Instalação/reinstalação/desinstalação e update HTTP/NSIS completo com reinício/perfil preservados foram verificados na 0.3.3; relatório preservado naquela pasta.
- Cliente empacotado 0.3.3 detectou/baixou 0.3.4 pelo electron-updater via GitHub público, sem token, progresso e checksum conferidos. A instalação/reinício desse download público não foram acionados sobre o app pessoal aberto.
- Código/tag enviados com autorização expressa. Tag v0.3.4 aponta a c4b5abf; scripts de desenvolvimento corrigidos em commits posteriores, sem alterar app/package/configuração da tag.
- [Actions concluído com sucesso](https://github.com/MiharaxD/concord/actions/runs/37704240993): NSIS + blockmap + sha256 + latest.yml públicos, usando GITHUB_TOKEN. Build escolhe primeira ferramenta no PATH e calcula hash via .NET para funcionar em Windows PowerShell iniciado por pwsh.
- Workflow aceita tags e execução manual para retomar publicação; recusa retomar uma tag se app/dependências/configuração mudaram. Publisher não sobrescreve release pública. `dist/` continua ignorada no Git.
- Defender local não detectou ameaças no instalador público nem no pacote local 0.3.4. Binário sem assinatura; resultado não comprova falso positivo do alerta antigo do amigo.

## Trabalho em andamento

Nenhum pedido pendente. Publicação e mudanças visuais concluídas. Detalhes/limites em VERIFICACAO.md e BUILD_WINDOWS.md.

## Limitações e próxima validação

- Túnel gratuito depende de Cloudflare/DNS/HTTPS e pode levar até 150 segundos; preparo antecipado reduz espera percebida. Sala depende do PC do dono aberto.
- Reiniciar múltiplas telas apresentou instabilidade, sobretudo no relay, também reproduzida na 0.3.0; causa ainda pendente. Não tratar o conjunto como estável em todos os cenários.
- Upload/CPU crescem com participantes; oito transmissões reais simultâneas não foram medidas. Microfone acompanha stream, sem voz independente.
- Áudio por app exige build 20348+ (Windows 11), inclui filhos e pode incluir outras janelas do mesmo processo. Falha não amplia captura.
- Uso real entre PCs/redes distintas ainda necessário. Economia efetiva do diferencial não medida; primeira atualização pública de 0.3.3 utiliza fallback completo porque não há blockmap público anterior.
- Quem usa portátil antigo/instalador 0.3.2 sem updater precisa instalar a versão atual uma vez. Instalação/reinício de uma atualização pública ainda devem ser confirmados numa máquina de teste sem interferir numa sala pessoal.
