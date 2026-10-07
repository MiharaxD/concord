# Decisões

## Desktop para ambos

Decisão: Electron/JavaScript em instalador NSIS Windows x64, com a mesma aplicação para transmitir ou assistir. Build portátil continua disponível; releases anteriores ficam preservadas.
Motivo: o usuário rejeitou a versão em navegador e quer passar o programa ao amigo.
Consequência: não exigir instalação de Node ou ferramentas de desenvolvimento no PC do destinatário.

## Conectividade sem configuração do roteador

Decisão: tentar WebRTC com STUN; quando falhar, transmitir WebM/Opus por WebSocket através de Quick Tunnel Cloudflare.
Motivo: não depender de abertura de portas, IP público, conta de serviço TURN ou infraestrutura paga para uso pessoal.
Consequência: o fallback costuma ter mais atraso; TLS termina na Cloudflare e não equivale a criptografia de ponta a ponta. Convite só fica pronto após confirmação de acessibilidade pública.

## Compartilhamento explícito e privado

Decisão: preparar acesso público em segundo plano ao abrir, conforme solicitado pelo usuário; captura continua dependendo de escolha explícita. Sala com até 8 pessoas e chave aleatória revogável.
Consequência: preparar não captura tela/áudio. Cancelar/fechar acesso interrompe o preparo e não reinicia automaticamente na mesma execução. Sem gravação de mídia em disco, controle remoto ou câmera. Nunca ampliar silenciosamente uma captura de áudio para todo o sistema.

## Convite curto sem serviço extra

Decisão: convites públicos usam `concord:<nome do túnel>:<chave de 22 caracteres>`. O receptor reconstrói localmente o endereço HTTPS Cloudflare. Chave curta independente, aleatória de 128 bits; administração e links legados continuam usando suas chaves de 256 bits.
Motivo: reduzir 45 caracteres sem conta, serviço de encurtamento, banco externo ou divulgação da chave para outro provedor.
Consequência: código é colado no app; participantes usam a mesma versão atual. Formato URL também é aceito. Renovar revoga as duas chaves e remove todos os convidados. Loopback preserva origem/porta no formato URL.

## Sala com várias transmissões e perfil local

Decisão: compartilhar e assistir na mesma interface, com entrada por convite junto dos controles. Até 8 participantes podem compartilhar ao mesmo tempo; grade adaptável, clique alterna foco da tela e retorno à grade, com “Ver todas” também disponível. Grade habilita todos os sons recebidos; foco habilita apenas o selecionado. Própria prévia sempre muda; volume/mute escolhidos permanecem respeitados.
Decisão: nome obrigatório na primeira execução e foto opcional, salvos no PC e editáveis pelo perfil. Miniatura JPEG 128×128 enviada aos participantes da sala, sem guardar fotos online. Nomes/fotos são descritivos, não autenticação.
Motivo: usuário descartou lista de amigos e tags e não quer servidor próprio/domínio. Entrar continua sendo por convite; participantes aparecem no menu lateral, removendo o bloco “Sua sala particular”.
Consequência: todos precisam de 0.3.0 ou mais nova para o protocolo de sala. 0.3.1 muda somente a interação com foco, mantendo compatibilidade com 0.3.0. WebRTC negocia por dupla; falhas usam relay com streams separadas. Upload/CPU crescem com participantes. Microfone acompanha a tela, sem chamada de voz independente.

## Releases preservadas

Decisão: preservar binários anteriores; novas versões usam nome e diretório próprios. `dist/` continua ignorada pelo Git.
Motivo: permitir retorno à versão funcional e evitar grandes binários no histórico. O executável 0.1.0 excede o limite normal por arquivo do repositório GitHub.
Consequência: distribuir via anexos de Releases, sem publicar automaticamente nem alegar que mudança de hospedagem resolve alertas de antivírus.

## Instalação e atualizações

Interface simplificada conforme pedido: sem cabeçalho/indicador visual de conexão, “Compartilhamento de tela” no estado vazio, “PAINEL”, crédito Yuri Mihara e versão sem “pessoal”. Convite pronto usa “Link de convite” / “CONVITE DA SALA”, sem mensagem redundante; erros/progresso permanecem. Relógio somente enquanto transmite. Estado de conexão interno serve à aplicação/QA, sem bloco visual extra.

Decisão: instalar por usuário em `%LOCALAPPDATA%\Programs\Concord`, sem administrador, com menu Iniciar, opção de atalho e desinstalador. Manter `appId: local.concord.desktop` e perfil em `%APPDATA%\Concord`, inclusive na migração do portátil. Desinstalação preserva os dados.
Decisão: electron-updater de runtime consulta GitHub público `MiharaxD/concord` uma vez após carregar, baixa em segundo plano e aplica somente no clique “Reiniciar e atualizar”. Fechar normalmente não instala. Desenvolvimento/portátil não consultam. Falhas não bloqueiam o app.
Consequência: reiniciar encerra a sala atual, espera perfil e auxiliares, usa quitAndInstall/NSIS e reabre. Instalador 0.3.3 é necessário uma vez para quem vinha de portáteis ou 0.3.2 sem updater. Cliente sem token, canais estáveis, sem downgrade.
Decisão: `pnpm release` / `npm run release` e workflow por tag publicam Setup, blockmap, checksum e latest.yml. Release só sai de rascunho após os anexos completos; versão pública não é sobrescrita. Token fica somente no desenvolvimento/CI. Gerar localmente não publica; executar publicação/push continua dependendo de solicitação.
Motivo: distribuição para usuários comuns, atualização simples e dados locais preservados, conforme solicitado.

## Isolamento de áudio sem driver

Decisão: capturador C# próprio sobre WASAPI por processo, compilado localmente e embutido; modo somente do jogo/app como padrão, áudio do computador inteiro como opção explícita.
Motivo: excluir Discord e outros apps sem instalar driver de áudio virtual nem depender de addon Node sem manutenção.
Consequência: requer Windows 11/build 20348+, captura processos filhos e pode incluir outras janelas do mesmo aplicativo. Em monitor inteiro, o usuário escolhe separadamente o app sonoro. Falhas não ampliam a captura para o sistema.

## Memória pequena

Decisão: manter somente estes documentos de contexto e atualizar o estado vigente; sem diário ou novo arquivo de histórico a cada tarefa.
Motivo: reduzir contexto necessário e permitir continuidade entre conversas com fatos confirmados.
