# Estado atual

## Objetivo

App desktop pessoal para uma sala de até oito pessoas compartilharem tela/janela e áudio, sem navegador externo nem cadastro. Todos usam o mesmo executável Windows x64.

## Estado entregue e verificado

- Versão local atual 0.3.4: `dist/installer/0.3.4/Concord-0.3.4-Setup.exe`, 134.778.731 bytes. SHA-256: `adea918179b6470a4980af2759434745b85e41fcd90079fcc2fb6bfa515ac892`. Instaladores 0.3.2/0.3.3 e portáteis anteriores preservados; Release pública em envio autorizado.
- Interface 0.3.4 simplificada: sem cabeçalho/indicador visual de conexão, estado vazio “Compartilhamento de tela”, menu “PAINEL”, versão sem “pessoal”, crédito Yuri Mihara e “Link de convite” sem mensagem redundante quando pronto. Relógio aparece só ao transmitir. 19 unidades, smoke e revisão visual/captura da própria janela passaram.
- Distribuição principal agora é NSIS por usuário, sem administrador, com menu Iniciar, atalho opcional e desinstalador. Runtime/dependências/helper/Cloudflared embutidos; nome/foto em `%APPDATA%\Concord` preservados ao atualizar/desinstalar e na migração do portátil.
- Atualização automática no app instalado: consulta pública GitHub MiharaxD/concord uma vez após bootstrap, download/progresso em segundo plano e clique “Reiniciar e atualizar”. Fechar normalmente não instala; desenvolvimento/portátil não consultam. Versão e botão manual no menu lateral. Erros só em log, sem bloquear abertura.
- Pacote final confirmado correspondente ao fonte; 19 testes de unidade, instalação/reinstalação/uso fora do projeto com PATH só Windows/helpers/bloqueio com app aberto/desinstalação e atualização real HTTP/NSIS 0.3.2 de QA → 0.3.3 passaram. Reinício automático, fechamento de auxiliares, nome/foto e dados pessoais preservados. Evidência em VERIFICACAO.md.
- Builder gera Setup, blockmap, latest.yml e checksum. `pnpm release` / `npm run release` e workflow por tag preparados; publicação completa/retomada/falha testadas contra API simulada. GitHub público e execução real de Actions ainda não testados com uma nova Release; nenhuma publicação/push/commit real efetuado.
- Convite curto da sala preparado automaticamente ao abrir, inclusive durante a escolha inicial do nome. Captura é opcional; participantes podem entrar, assistir e transmitir na mesma interface.
- Sala com até sete convidados e o dono. Nome obrigatório na primeira execução e foto opcional PNG/JPG, reduzida a JPEG 128×128 e salva no PC. Perfil compartilhado somente com participantes conectados.
- Participantes com nome, foto e estado no menu lateral. Sem lista de amigos ou tags; bloco antigo da sala e separação entre compartilhar/assistir removidos.
- Múltiplas transmissões simultâneas; grid adaptável, clique alterna foco e retorno à grade, também disponível por “Ver todas”. Grid reproduz todas as telas recebidas; foco reproduz somente a selecionada. Prévia própria sempre silenciosa.
- Monitor/janela, áudio apenas do jogo/app ou computador inteiro, microfone opcional, convite revogável, WebRTC direto entre participantes e compatibilidade multiplexada por WebSocket.
- Qualidade 720p/1080p/1440p/4K em 30/60 FPS; bitrate automático ou manual de 1–60 Mbps. Configuração antes de transmitir; fonte menor não ganha detalhe.
- Parar a transmissão do dono mantém a sala e outras telas. Fechar o programa do dono encerra a sala.
- Na 0.3.1, etapa de foco com duas telas recebidas verificou segundo clique, restauração da grade/estados de áudio e botão “Ver todas” no app empacotado. Portátil final abriu, autenticou sala, enumerou fontes, entregou PCM pelo helper e encerrou normalmente. Teste completo de chamadas não passou; ver limitação abaixo.
- Na 0.3.0, 16 testes de unidade, três instâncias, túnel público, persistência e revogação passaram. Áudio automático, qualidade 1440p/4K e isolamento de processos sonoros medidos nessa versão. Captura/transporte não mudaram na 0.3.1; capturador embutido preservado.
- O usuário publicou o código em `https://github.com/MiharaxD/concord.git`. `dist/` é ignorada; binários devem ser anexados a Releases. Não houve commit, push ou publicação nesta tarefa.

## Trabalho em andamento

Em andamento: enviar código/tag e confirmar Release 0.3.4 no GitHub com autorização expressa. Interface/pacote local verificados; 0.3.3 permanece preservada. Não encerrar ou substituir a instalação pessoal atualmente aberta para executar testes de instalação.

## Limitações e questões abertas

- Túnel depende do serviço gratuito Cloudflare. Preparação espera DNS/HTTPS e pode demorar até 150 segundos; começar ao abrir antecipa essa espera.
- A sala depende do PC do dono ligado e com o app aberto. Múltiplas telas aumentam upload/CPU; limite de oito membros validado no servidor, mas oito transmissões reais simultâneas não foram medidas.
- Repetições dos testes de chamadas apresentaram travamento de movimento/áudio ao reiniciar várias telas, sobretudo em compatibilidade. Reproduzido também no pacote preservado 0.3.0; causa não identificada. Pendência em TODO.md; não considerar a chamada completa estável em todos os cenários.
- Microfone acompanha a transmissão; não há chamada de voz independente da tela.
- Executável sem assinatura digital. Defender local não detectou ameaças no pacote final 0.3.3. Alerta antigo de download não teve texto/nome da ameaça informado; não foi confirmado falso positivo.
- Atualizações futuras dependem de Release pública com instalador e metadados completos. Portáteis antigos e instalador 0.3.2 original precisam instalar 0.3.3 uma vez; diferencial preservado, mas economia efetiva não medida (QA confirmou fallback completo). Fluxo via GitHub/Actions aguarda primeira publicação autorizada.
- Áudio por app exige Windows build 20348+ (Windows 11), inclui processos filhos e pode incluir outras janelas/abas do mesmo app. Falha não troca silenciosamente para áudio global.
- Testes em uma máquina física; desempenho/conexão entre PCs e operadoras diferentes ainda precisam de uso real. FPS e bitrate configurados não garantem desempenho constante.

## Próxima validação útil

Uso real em dois PCs/redes diferentes e primeira publicação GitHub/Actions quando solicitada. Comandos e teste de updates estão em BUILD_WINDOWS.md.
