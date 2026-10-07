# Decisões

## Desktop para ambos

Decisão: Electron/JavaScript em executável portátil Windows x64, com a mesma aplicação para transmitir ou assistir.
Motivo: o usuário rejeitou a versão em navegador e quer passar o programa ao amigo.
Consequência: não exigir instalação de Node ou ferramentas de desenvolvimento no PC do destinatário.

## Conectividade sem configuração do roteador

Decisão: tentar WebRTC com STUN; quando falhar, transmitir WebM/Opus por WebSocket através de Quick Tunnel Cloudflare.
Motivo: não depender de abertura de portas, IP público, conta de serviço TURN ou infraestrutura paga para uso pessoal.
Consequência: o fallback costuma ter mais atraso; TLS termina na Cloudflare e não equivale a criptografia de ponta a ponta. Convite só fica pronto após confirmação de acessibilidade pública.

## Compartilhamento explícito e privado

Decisão: iniciar captura e acesso público somente por ação do usuário; sala com um espectador e chave aleatória revogável.
Consequência: sem gravação automática em disco, controle remoto ou captura de câmera. Nunca trocar silenciosamente uma captura de áudio específica por áudio de todo o sistema.

## Convite curto sem serviço extra

Decisão: convites públicos usam `concord:<nome do túnel>:<chave de 22 caracteres>`. O receptor reconstrói localmente o endereço HTTPS Cloudflare. Chave curta independente, aleatória de 128 bits; administração e links legados continuam usando suas chaves de 256 bits.
Motivo: reduzir 45 caracteres sem conta, serviço de encurtamento, banco externo ou divulgação da chave para outro provedor.
Consequência: código é colado no app, ambos precisam de 0.2.1. App atualizado aceita links antigos. Renovar revoga as duas chaves e remove o visitante. Domínios personalizados e loopback mantêm formato URL com chave curta para preservar origem/porta.

## Releases preservadas

Decisão: preservar binários anteriores; novas versões usam nome e diretório próprios. `dist/` continua ignorada pelo Git.
Motivo: permitir retorno à versão funcional e evitar grandes binários no histórico. O executável 0.1.0 excede o limite normal por arquivo do repositório GitHub.
Consequência: distribuir via anexos de Releases, sem publicar automaticamente nem alegar que mudança de hospedagem resolve alertas de antivírus.

## Isolamento de áudio sem driver

Decisão: capturador C# próprio sobre WASAPI por processo, compilado localmente e embutido; modo somente do jogo/app como padrão, áudio do computador inteiro como opção explícita.
Motivo: excluir Discord e outros apps sem instalar driver de áudio virtual nem depender de addon Node sem manutenção.
Consequência: requer Windows 11/build 20348+, captura processos filhos e pode incluir outras janelas do mesmo aplicativo. Em monitor inteiro, o usuário escolhe separadamente o app sonoro. Falhas não ampliam a captura para o sistema.

## Memória pequena

Decisão: manter somente estes documentos de contexto e atualizar o estado vigente; sem diário ou novo arquivo de histórico a cada tarefa.
Motivo: reduzir contexto necessário e permitir continuidade entre conversas com fatos confirmados.
