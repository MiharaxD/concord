# Decisões

## Desktop para ambos

Decisão: Electron/JavaScript em instalador NSIS Windows x64, com a mesma aplicação para transmitir ou assistir. Build portátil continua disponível; releases anteriores ficam preservadas.
Motivo: o usuário rejeitou a versão em navegador e quer passar o programa ao amigo.
Consequência: não exigir instalação de Node ou ferramentas de desenvolvimento no PC do destinatário.

## Painel, Convidar e Compartilhar (0.8.9)

Decisão: mocks aprovados pelo usuário em 30/10/2026 (revisão com a skill impeccable). Painel com Criar sala em destaque, convite colado no próprio Painel com validação ao digitar ("Convite reconhecido"/"Convite inválido") e resumo de como você entra (microfone, câmera, perfil; sem medidor, porque fora de sala o microfone fica fechado); em sala, cartão da sala atual (miniatura da transmissão, quem transmite, pessoas, Voltar/Sair). Cabeçalho da sala com um único Convidar que abre menu: link visível + Copiar, Enviar por DM no Discord, até 5 favoritos do Discord logo abaixo com Convidar direto (pedido do usuário), Fechar acesso e Trocar link com a consequência escrita. Compartilhar tela lista janelas/telas no próprio pop-up (abas Janelas/Telas inteiras, nada pré-selecionado), qualidade em Leve/Nítida/Máxima (720p30, 1080p30, 1440p60) e som em Automático/Só do app, Do PC, Sem som; resolução, FPS, taxa de bits e fonte do áudio ficam em Avançado. Rótulos em caixa alta acima dos títulos saíram. Página de convite do site com dois caminhos (Abrir no Concord / baixar em 3 passos) e print real do app com uma janela de teste ilustrada (não o vídeo falso verde).
Pedido do usuário (0.8.10): a engrenagem ao lado do perfil na lateral abre as Configurações de voz e vídeo; foto e nome abrem o perfil. Pedido do usuário (0.8.11): janela sem a barra do Windows (barra de título própria de 32 px com os botões nativos por cima), barras de rolagem próprias no app todo, carregando nos favoritos/lista do Discord e porcentagem do volume da dock no hover/arraste. Consequência: o item "Entrar em uma sala" da lateral continua (atalho de dentro da sala). A página do site só muda no GitHub Pages depois de push na main.

## Voz e cor tema (0.8.3)

Decisão: pedido do usuário em 30/10/2026. Chamada igual ao Discord: ao entrar na sala o microfone já funciona; o botão só muta, e o mute fica salvo. Microfone e câmera saem do menu de transmissão e ficam nas setinhas dos botões de microfone e câmera (0.8.5, pedido do usuário, como no Discord; o fone ganhou setinha para a saída de áudio e a engrenagem saiu da barra); câmera desligada aparece vermelha e riscada. Substitui "microfone desligado ao abrir". Cor tema escolhida no perfil (roxo, verde, azul, rosa, vermelho ou seletor livre), só neste PC, aplicada a tudo que era roxo, inclusive o logo da barra lateral.
Consequência: microfone aberto enquanto estiver numa sala (indicador do Windows aceso), mesmo mutado. Salas cujo dono está em versão anterior à 0.8.3 não têm voz. Relay de voz tem mais atraso que a rota direta. Cores muito escuras no seletor livre reduzem o contraste de textos em destaque.

## Visualizador de mídia do chat (0.8.8)

Decisão: pedido do usuário em 30/10/2026. Clicar em imagem/vídeo abre grande dentro da janela (não tela cheia), X em cima, Baixar embaixo, botão de tela cheia; imagem com zoom. Vídeo do chat vira miniatura e toca só no visualizador; a tela cheia do vídeo é a do player.

## Aviso de mensagem (0.8.7)

Decisão: pedido do usuário em 30/10/2026. Só com o chat recolhido: aviso visual com nome e texto + som curto sintetizado (o arquivo enviado foi só referência, não é empacotado). Sem notificação do Windows.

## Sala estilo Discord (0.8.3)

Decisão: pedido do usuário em 29/10/2026 ("bater o olho e entender"). Todo participante aparece como cartão no palco; com transmissão, quem não transmite vira faixa embaixo. Convite no cabeçalho; dono sozinho vê o cartão Chame alguém no lugar do antigo vazio "Compartilhamento de tela". Barra num dock único (revisão de design aprovada em 30/10/2026): Microfone, Câmera, Transmitir tela (único botão com texto, ação principal), fone + volume geral, Chat (com contador de não lidas) e Sair por último, separado; volume por pessoa no quadro. Chat numa coluna à direita que começa fechada e abre pelo dock ou pela tecla C; substitui o chat embaixo dos vídeos para o palco ganhar a altura toda. Microfone mutado com fundo vermelho; câmera desligada continua riscada, mas sem vermelho (desligada é o estado normal). Lateral com coroa do dono, AO VIVO, painel de conexão e perfil com engrenagem. Roxo só na ação principal e em Tela/Câmera ligadas; vermelho para ao vivo/sair; verde para conectado/som.
Consequência: o pulso verde segue só a voz (desde a voz independente); microfone mutado aparece riscado na lista e no cartão.

## Barra de controles e chat da sala (0.8.0)

Decisão: pedido do usuário em 29/10/2026. Controles principais numa barra estilo Discord (Tela abre pop-up com o menu de compartilhamento; Câmera; Microfone ao vivo; Chat; Sair); código da sala continua na área principal. Chat de texto, imagens e arquivos dentro da sala, sem limite de tamanho (o usuário pediu sem limite se o sistema não tiver um; o P2P não tem).
Consequência: arquivos grandes demoram e usam o upload de quem criou a sala; conversa só existe com a sala aberta e não é salva. Texto da interface aumentado para legibilidade.

## Câmera junto ou no lugar da tela (0.7.0)

Decisão: pedido do usuário em 29/10/2026. Webcam opcional por botão Ligar câmera, sozinha ou junto com a tela. Para quem assiste, a câmera aparece no canto da tela do publicador (picture-in-picture) com dois botões: tela cheia só da câmera e separar em quadro próprio (com volta ao canto). Sem tela, a câmera ocupa o quadro.
Consequência: segundo vídeo por pessoa (mais upload, ~1,5 Mbps); salas com câmera precisam do host 0.7.0+; participantes 0.6.x continuam vendo só a tela. Permissão de câmera só por clique explícito.

## Acesso P2P com Cloudflare como plano B (0.6.0)

Decisão: pedido do usuário em 29/10/2026 (opção B híbrida). Convites passam a ser P2P: brokers MQTT públicos (EMQX, HiveMQ) levam ofertas WebRTC cifradas com a chave do convite, e um DataChannel direto leva o protocolo de sala até o host, que faz ponte ao servidor local. Página do link estática no GitHub Pages (`site/`). Quick Tunnel só é criado quando um convidado não consegue conexão direta e pede o plano B.
Motivo: acabar com quase todos os 429 da Cloudflare, ter link que não "morre" (1033) e mídia direta criptografada de ponta a ponta, sem servidor/domínio/conta próprios.
Consequência: depende de brokers públicos de terceiros (sem garantia) e do GitHub Pages; prévia do Discord fica genérica, sem nome do dono. Sem TURN: NAT restritivo continua caindo na Cloudflare. Clientes < 0.6.0 não entram em salas novas. Sem push/publicação até o usuário testar.

## Conectividade sem configuração do roteador

Decisão: tentar WebRTC com STUN; quando falhar, transmitir WebM/Opus por WebSocket através de Quick Tunnel Cloudflare.
Motivo: não depender de abertura de portas, IP público, conta de serviço TURN ou infraestrutura paga para uso pessoal.
Consequência: o fallback costuma ter mais atraso; TLS termina na Cloudflare e não equivale a criptografia de ponta a ponta. Convite só fica pronto após confirmação de acessibilidade pública.

Decisão: recusa 429 na criação do Quick Tunnel mostra o motivo e bloqueia novos pedidos por 1/2/4/5 minutos entre recusas consecutivas. Prazo local persistido sem chaves, respeitado ao reabrir; sucesso limpa. Não contornar limites do provedor nem prometer que o prazo equivale à liberação externa. Ao terminar, usuário pode tentar novamente; não há loop automático. Preparação continua em segundo plano e configurações/entrada na sala não ficam bloqueadas. Mensagens de erro vêm de classificação segura, sem saída bruta ou exceção de IPC.

## Compartilhamento explícito e privado

Decisão atual (0.5.2): preparar acesso público somente ao clicar em Criar sala, em segundo plano e sem bloquear controles. Abrir o app, escolher nome ou entrar em outra sala não solicita túnel próprio. Substitui o preparo ao abrir, conforme novo pedido do usuário para reduzir pedidos à Cloudflare. Cliques repetidos/navegação na sala própria reutilizam o preparo/convite; erro ou cancelamento mantêm Tentar novamente explícito. Captura continua dependendo de escolha explícita. Sala com até 8 pessoas e chave aleatória revogável.
Consequência: preparar não captura tela/áudio. Cancelar/fechar acesso interrompe o preparo e não reinicia automaticamente na mesma execução. Sem gravação de mídia em disco ou controle remoto. Câmera (0.7.0+) só por clique explícito em Ligar câmera. Nunca ampliar silenciosamente uma captura de áudio para todo o sistema.

## Convite curto sem serviço extra

Decisão: convites públicos usam `concord:<nome do túnel>:<chave de 22 caracteres>`. O receptor reconstrói localmente o endereço HTTPS Cloudflare. Chave curta independente, aleatória de 128 bits; administração e links legados continuam usando suas chaves de 256 bits.
Motivo: manter um código compacto sem conta, serviço de encurtamento ou banco externo.
Consequência: código pode ser colado no dialog ou aberto pelo protocolo `concord:` registrado pelo instalador Windows. Desde 0.6.1, a pedido do usuário, abertura fria/segunda instância entram direto quando o app está parado; dentro de uma sala ou transmitindo preenchem e pedem confirmação, para nunca interromper sessão/captura sozinhas. URL antiga continua aceita. Renovar revoga as duas chaves e remove todos os convidados. Loopback preserva origem/porta no formato URL.

Decisão atual (0.5.0): ação principal **Copiar link**, com aviso exato **Link copiado.**, copia URL HTTPS normal `/invite?join=<chave>`. Não há botão Copiar código; caixa continua selecionável. Página pública oferece Abrir no Concord e Baixar Concord (última Release pública). Discord recebe um cartão clicável com logo/nome da sala, sem bot ou botão nativo de jogo. Chave na consulta é necessária porque a prévia do Discord remove fragmentos do destino; passa pelo provedor do túnel e serviço de prévia. Não inserir chave no HTML/OG/logs nem expor participantes. Link funciona enquanto o app hospedeiro/túnel estiver aberto; sem infraestrutura própria para manter uma página após fechar.

## Sala com várias transmissões e perfil local

Decisão: Painel inicial com Criar sala/Entrar em uma sala e pop-up de convite. Sala mantém compartilhar e assistir na mesma interface. Até 8 participantes podem compartilhar; grade adaptável, clique alterna foco e grade, com “Ver todas”. Grade habilita sons recebidos; foco só o selecionado. Própria prévia sempre muda; volume/mute permanecem respeitados. M/F/Esc controlam som recebido/tela cheia/grade, sem atalhos ao digitar.
Decisão: nome obrigatório na primeira execução, foto e banner opcionais, salvos no PC e editáveis pelo perfil. Miniaturas JPEG 128×128 e 512×192 enviadas aos participantes da sala, sem hospedar perfis online. Aparência é descritiva, não autenticação.
Decisão: navegar entre Painel/sala atual preserva captura/conexão; Criar sala quando já é dono preserva sua sala. Criar sala enquanto convidado muda para a sala própria. Sair da sala encerra a própria captura e retorna ao Painel; parar só a transmissão mantém a sala. Nenhuma ação de criar/entrar começa a capturar automaticamente.
Motivo: usuário não quer cadastro, tags ou rede de amigos própria do Concord, nem servidor/domínio próprios. Entrar continua sendo por convite; participantes aparecem no menu lateral. Pedido posterior autorizou a importação opcional de amigos do Discord, conforme seção abaixo.
Consequência: todos precisam de 0.3.0 ou mais nova para o protocolo de sala. 0.3.1 muda somente a interação com foco, mantendo compatibilidade com 0.3.0. WebRTC negocia por dupla; falhas usam relay com streams separadas. Upload/CPU crescem com participantes. Microfone acompanha a tela, sem chamada de voz independente.

## Consulta de perfil na sala

Decisão: consultar perfil somente de participantes presentes na sala, pelo nome/avatar na lista lateral. Cartão com banner/cor quando presentes, faixa roxa padrão, foto sobreposta ou mesmas iniciais e nome; sem descrição/status inventados. Modal nativo acessível por teclado, com fechar visível/clique fora/Esc e retorno de foco à linha. Abrir/fechar não altera foco das streams nem áudio/captura/conexão. Perfil acompanha dados atuais e fecha quando o participante sai. Modal do próprio perfil (30/10/2026, mock aprovado pelo usuário): prévia igual a esse cartão, edição de foto/banner por menu na própria prévia, cor do app separada como preferência local; todos os modais abrem e fecham com a mesma transição e fecham ao clicar fora.

## Discord opcional

Decisão: vincular pelo OAuth oficial de cliente público com PKCE, sem Client Secret/backend. Importar nome/foto/banner/cor para o perfil local; atualizar explicitamente e permitir desvincular sem apagar aparência. Banner manual continua disponível e é preservado quando o Discord não tem banner. Sem replicar descrição, badges, decorações, assinatura Nitro ou dados que o app não usa.

Decisão: amigos/convites usam somente o Social SDK oficial habilitado pelo titular. Modal **Convidar pelo Discord** mostra amigos da conta autorizada, busca e **Convidar** por pessoa. Clique envia o link da sala via DM; não há mensagens automáticas ao autorizar/abrir. **Enviado** exige confirmação do SDK; falha/timeout não é prova de entrega e não dispara retry automático. Não usar token de usuário copiado, selfbot ou scraping.

Consequência: Discord apresenta permissões sociais em pacote; o Concord usa perfil/amigos/envio solicitado. Credenciais criptografadas pelo Windows em arquivo separado, somente no principal e no stdin privado do auxiliar; nunca em perfil/roster/renderer/linha de comando. Lista e avatares de amigos ficam em memória. Limite de desenvolvimento atual: 100 DMs/2h para toda a aplicação; expansão depende do Discord. Vinculação não é requisito para criar/entrar/transmitir.

Exceção pedida pelo usuário (30/10/2026): favoritos (estrela no modal) e até 8 amigos que receberam convite ficam salvos **só como IDs** em `preferences.json`; nomes e fotos continuam vindo do SDK em RAM. Sem favoritos, o topo do modal mostra os enviados recentemente; o mesmo amigo não aparece duas vezes.

## Sala: avisos, conexão e configurações

Decisão (30/10/2026, propostas aprovadas pelo usuário): entrada/saída/início de transmissão viram avisos empilhados no estilo do aviso do chat (com Assistir); `#notice` flutua no topo e some ao clicar. Detalhes da conexão aparecem ao passar o mouse no sinal da barra lateral (rota, ms, envio). Configurações (microfone, saída, câmera, teste de microfone, qualidade padrão, versão/atualização) abrem pela engrenagem à esquerda da dock; os carets de dispositivo continuam na dock. O Painel oferece convite válido da área de transferência ao ganhar foco (o principal devolve só convites válidos; próprios, usados e ignorados não voltam) e tem campo para colar. Copiar link confirma no próprio botão. Rejeitados: checklist de sala vazia, folha de atalhos e ajuste de contraste.

## Releases preservadas

Decisão: preservar binários anteriores; novas versões usam nome e diretório próprios. `dist/` continua ignorada pelo Git.
Motivo: permitir retorno à versão funcional e evitar grandes binários no histórico. O executável 0.1.0 excede o limite normal por arquivo do repositório GitHub.
Consequência: distribuir via anexos de Releases, sem publicar automaticamente nem alegar que mudança de hospedagem resolve alertas de antivírus.

Exceção autorizada em 27/10/2026: para esta correção 0.5.2, o usuário pediu editar a mesma entrada da Release 0.5.1, sem criar outra. Manter ID da Release, atualizar sua versão/tag para v0.5.2 (para o updater reconhecer a correção) e substituir anexos após conferir backup local dos anteriores. Preservar a tag v0.5.1 no commit original; não mover tags antigas. Esta autorização não torna edição de futuras releases automática.

Exceção autorizada em 29/10/2026: a correção 0.6.1 (entrada direta pelo link e aviso que some) edita a mesma entrada da Release 0.6.0 (ID 428460958) em vez de criar outra. O Actions faz a edição a partir de `build/replace-release.json` (uso único, removido depois): novos anexos, tag/nome/notas para v0.6.1, tag v0.6.0 preservada, anexos 0.6.0 com cópia em `dist/installer/0.6.0/github/`. Não torna edição de releases futuras automática.

Exceção autorizada em 29/10/2026 (de novo): a 0.7.0 (câmera) edita a mesma entrada da Release 0.6.1 (ID 428460958) em vez de criar outra, pelo mesmo arquivo de uso único ; tag v0.6.1 preservada.

Exceção autorizada em 29/10/2026 (terceira): a 0.7.1 (áudio automático) também edita a mesma entrada (ID 428460958), de v0.7.0 para v0.7.1, com tag v0.7.0 preservada.

Exceção autorizada em 29/10/2026 (quarta): a 0.8.1 (prévia de mídia no chat) edita a entrada da Release 0.8.0 (ID 428529679), de v0.8.0 para v0.8.1, com tag v0.8.0 preservada.

Exceção autorizada em 30/10/2026: a 0.8.4 (correções da voz após revisão) edita a entrada da Release 0.8.3 (ID 428657362), de v0.8.3 para v0.8.4, com tag v0.8.3 preservada.

Exceção autorizada em 29/10/2026 (quinta): a 0.8.2 (blindagem) edita a entrada da Release 0.8.1 (ID 428529679), de v0.8.1 para v0.8.2, com tag v0.8.1 preservada.

## Instalação e atualizações

Interface: linguagem neutra e direta, sem “galera”, “bora” ou frases promocionais. Painel minimalista, relógio somente enquanto transmite e “Desenvolvido por Yuri Mihara” no rodapé inferior direito. Sem texto orientativo no rodapé ou aviso de sucesso ao encerrar transmissão; erros permanecem. Minha sala usa SVG de cômodo; Entrar em uma sala usa o mesmo SVG de tomada no menu e no Painel. Código em painel pequeno: “Código sendo carregado…”, Copiar link, erro/tentar novamente e gerenciamento recolhido. Preparo começa em Criar sala, sem bloquear controles. Reconexão/compatibilidade têm aviso curto quando necessário.

Identidade visual (0.5.1): usar exatamente o SVG de câmera fornecido em `icone_camera_vetor.svg`, mantendo desenho/cores/transparência em `public/icon.svg`. ICO Windows e PNG 512 da prévia derivam do mesmo vetor. Logo substituído na interface, favicon, executável, instalador e página/prévia de convite; URL da imagem Open Graph com revisão para não reutilizar a imagem antiga em cache. Mensagens já enviadas no Discord podem manter a prévia em cache.

Decisão: Qualidade e FPS separados; bitrate automático/manual recolhido em "Taxa de bits" (mostra o valor atual); fonte do áudio fica visível na seção Áudio, sem precisar abrir avançado (30/10/2026). Transporte automático, sem seletor; compatibilidade interna e protocolo preservados. Salvar resolução/FPS/bitrate/modo de áudio localmente, sem restaurar tela/janela ou iniciar captura. Medidor usa somente áudio autorizado da fonte; teste prévio do app exige clique, enquanto áudio do computador só mede durante transmissão. Microfone segue controle separado, desligado ao abrir.

Decisão: instalar por usuário em `%LOCALAPPDATA%\Programs\Concord`, sem administrador, com menu Iniciar, opção de atalho e desinstalador. Manter `appId: local.concord.desktop` e perfil em `%APPDATA%\Concord`, inclusive na migração do portátil. Desinstalação preserva os dados.
Decisão: electron-updater de runtime consulta GitHub público `MiharaxD/concord` uma vez após carregar, baixa em segundo plano e aplica somente no clique “Reiniciar e atualizar”. Fechar normalmente não instala. Desenvolvimento/portátil não consultam. Falhas não bloqueiam o app.
Consequência: reiniciar encerra a sala atual, espera perfil e auxiliares, usa quitAndInstall/NSIS e reabre. Instalador 0.3.3 é necessário uma vez para quem vinha de portáteis ou 0.3.2 sem updater. Cliente sem token, canais estáveis, sem downgrade.
Decisão: `pnpm release` / `npm run release` e workflow por tag publicam Setup, blockmap, checksum e latest.yml. Release só sai de rascunho após os anexos completos; versão pública não é sobrescrita. Token fica somente no desenvolvimento/CI. Gerar localmente não publica; executar publicação/push continua dependendo de solicitação.
Motivo: distribuição para usuários comuns, atualização simples e dados locais preservados, conforme solicitado.

## Isolamento de áudio sem driver

Decisão: capturador C# próprio sobre WASAPI por processo, compilado localmente e embutido; desde 0.7.1 o padrão é Automático (janela compartilhada → só o som daquele app; tela inteira → som do computador, pois o Windows não separa áudio por monitor); escolha manual de app ou computador inteiro fica em Opções avançadas.
Motivo: excluir Discord e outros apps sem instalar driver de áudio virtual nem depender de addon Node sem manutenção.
Consequência: requer Windows 11/build 20348+, captura processos filhos e pode incluir outras janelas do mesmo aplicativo. Em monitor inteiro, o usuário escolhe separadamente o app sonoro. Falhas não ampliam a captura para o sistema.

## Memória pequena

Decisão: manter somente estes documentos de contexto e atualizar o estado vigente; sem diário ou novo arquivo de histórico a cada tarefa.
Motivo: reduzir contexto necessário e permitir continuidade entre conversas com fatos confirmados.
