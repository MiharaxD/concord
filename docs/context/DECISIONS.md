# Decisões

## Desktop para ambos

Decisão: Electron/JavaScript em instalador NSIS Windows x64, com a mesma aplicação para transmitir ou assistir. Build portátil continua disponível; releases anteriores ficam preservadas.
Motivo: o usuário rejeitou a versão em navegador e quer passar o programa ao amigo.
Consequência: não exigir instalação de Node ou ferramentas de desenvolvimento no PC do destinatário.

## Conectividade sem configuração do roteador

Decisão: tentar WebRTC com STUN; quando falhar, transmitir WebM/Opus por WebSocket através de Quick Tunnel Cloudflare.
Motivo: não depender de abertura de portas, IP público, conta de serviço TURN ou infraestrutura paga para uso pessoal.
Consequência: o fallback costuma ter mais atraso; TLS termina na Cloudflare e não equivale a criptografia de ponta a ponta. Convite só fica pronto após confirmação de acessibilidade pública.

Decisão: recusa 429 na criação do Quick Tunnel mostra o motivo e bloqueia novos pedidos por 1/2/4/5 minutos entre recusas consecutivas. Prazo local persistido sem chaves, respeitado ao reabrir; sucesso limpa. Não contornar limites do provedor nem prometer que o prazo equivale à liberação externa. Ao terminar, usuário pode tentar novamente; não há loop automático. Preparação continua em segundo plano e configurações/entrada na sala não ficam bloqueadas. Mensagens de erro vêm de classificação segura, sem saída bruta ou exceção de IPC.

## Compartilhamento explícito e privado

Decisão: preparar acesso público em segundo plano ao abrir, conforme solicitado pelo usuário; captura continua dependendo de escolha explícita. Sala com até 8 pessoas e chave aleatória revogável.
Consequência: preparar não captura tela/áudio. Cancelar/fechar acesso interrompe o preparo e não reinicia automaticamente na mesma execução. Sem gravação de mídia em disco, controle remoto ou câmera. Nunca ampliar silenciosamente uma captura de áudio para todo o sistema.

## Convite curto sem serviço extra

Decisão: convites públicos usam `concord:<nome do túnel>:<chave de 22 caracteres>`. O receptor reconstrói localmente o endereço HTTPS Cloudflare. Chave curta independente, aleatória de 128 bits; administração e links legados continuam usando suas chaves de 256 bits.
Motivo: reduzir 45 caracteres sem conta, serviço de encurtamento, banco externo ou divulgação da chave para outro provedor.
Consequência: código pode ser colado no dialog ou aberto pelo protocolo `concord:` registrado pelo instalador Windows. Abertura fria/segunda instância preenchem e pedem confirmação; nunca entram nem interrompem captura sozinhas. URL antiga continua aceita. Renovar revoga as duas chaves e remove todos os convidados. Loopback preserva origem/porta no formato URL.

## Sala com várias transmissões e perfil local

Decisão: Painel inicial com Criar sala/Entrar em uma sala e pop-up de convite. Sala mantém compartilhar e assistir na mesma interface. Até 8 participantes podem compartilhar; grade adaptável, clique alterna foco e grade, com “Ver todas”. Grade habilita sons recebidos; foco só o selecionado. Própria prévia sempre muda; volume/mute permanecem respeitados. M/F/Esc controlam som recebido/tela cheia/grade, sem atalhos ao digitar.
Decisão: nome obrigatório na primeira execução e foto opcional, salvos no PC e editáveis pelo perfil. Miniatura JPEG 128×128 enviada aos participantes da sala, sem guardar fotos online. Nomes/fotos são descritivos, não autenticação.
Decisão: navegar entre Painel/sala atual preserva captura/conexão; Criar sala quando já é dono preserva sua sala. Criar sala enquanto convidado muda para a sala própria. Sair da sala encerra a própria captura e retorna ao Painel; parar só a transmissão mantém a sala. Nenhuma ação de criar/entrar começa a capturar automaticamente.
Motivo: usuário descartou lista de amigos e tags e não quer servidor próprio/domínio. Entrar continua sendo por convite; participantes aparecem no menu lateral, removendo o bloco “Sua sala particular”.
Consequência: todos precisam de 0.3.0 ou mais nova para o protocolo de sala. 0.3.1 muda somente a interação com foco, mantendo compatibilidade com 0.3.0. WebRTC negocia por dupla; falhas usam relay com streams separadas. Upload/CPU crescem com participantes. Microfone acompanha a tela, sem chamada de voz independente.

## Consulta de perfil na sala

Decisão: consultar perfil somente de participantes presentes na sala, pelo nome/avatar na lista lateral. Cartão com faixa roxa fixa, foto sobreposta ou mesmas iniciais e nome; nenhum apelido, descrição, status ou dado novo. Modal nativo acessível por teclado, com fechar visível/clique fora/Esc e retorno de foco à linha. Abrir/fechar não altera foco das streams nem áudio/captura/conexão. Perfil acompanha dados atuais e fecha quando o participante sai; não cria lista de amigos, armazenamento ou serviço.

## Releases preservadas

Decisão: preservar binários anteriores; novas versões usam nome e diretório próprios. `dist/` continua ignorada pelo Git.
Motivo: permitir retorno à versão funcional e evitar grandes binários no histórico. O executável 0.1.0 excede o limite normal por arquivo do repositório GitHub.
Consequência: distribuir via anexos de Releases, sem publicar automaticamente nem alegar que mudança de hospedagem resolve alertas de antivírus.

## Instalação e atualizações

Interface: Painel minimalista, “Compartilhamento de tela” no vazio, relógio somente enquanto transmite e crédito Yuri Mihara no rodapé inferior direito. Removidos texto orientativo no rodapé e aviso de sucesso ao encerrar a transmissão; avisos de erro permanecem. Minha sala usa SVG transparente de cômodo; Entrar em uma sala compartilha o mesmo SVG de tomada no menu e no Painel, baseados nas referências fornecidas. Código em painel pequeno na sala: “Código sendo carregado…”, Copiar código, erro/tentar novamente e gerenciamento recolhido. Preparo continua ao abrir, sem bloquear controles. Reconexão/compatibilidade têm aviso curto quando necessário.

Decisão: Qualidade e FPS separados; bitrate automático/manual existente em Opções avançadas. Transporte automático, sem seletor; compatibilidade interna e protocolo preservados. Salvar resolução/FPS/bitrate/modo de áudio localmente, sem restaurar tela/janela ou iniciar captura. Medidor usa somente áudio autorizado da fonte; teste prévio do app exige clique, enquanto áudio do computador só mede durante transmissão. Microfone segue controle separado, desligado ao abrir.

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
