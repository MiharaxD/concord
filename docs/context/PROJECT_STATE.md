# Estado atual

## Objetivo

App desktop pessoal para duas pessoas compartilharem tela/janela e áudio, sem navegador externo nem cadastro. Ambas usam o mesmo executável Windows x64.

## Estado entregue e verificado

- Versão atual 0.2.1: `dist/0.2.1/Concord-0.2.1-Windows.exe`, 124.445.684 bytes. Portátil e capturador embutido verificados; 0.1.0 e 0.2.0 preservadas em `dist/`.
- Convite público curto `concord:<túnel>:<chave>`, 45 caracteres menor que o link anterior. Cópia nativa e entrada com vídeo pelo túnel público verificadas no app empacotado: 58 contra 103 caracteres no teste. Ambos precisam de 0.2.1; app atualizado também aceita links antigos.
- Chave curta independente de 128 bits, revogada junto com a chave legada de 256 bits; 15 testes passaram, incluindo rejeição de convites inválidos e impedimento de usar o convite como administrador.
- Monitor/janela, áudio apenas do jogo/app ou computador inteiro, microfone opcional, convite revogável, WebRTC direto e compatibilidade por WebSocket.
- Qualidade 720p/1080p/1440p/4K em 30/60 FPS; bitrate automático por qualidade ou manual de 1–60 Mbps. Configuração antes de transmitir; fonte menor não ganha detalhe.
- Som automático corrigido e testado na 0.2.0 com cancelamento tardio de reprodução. Mute e volume zero escolhidos pelo espectador continuam respeitados; áudio direto/compatibilidade foi novamente decodificado na 0.2.1.
- Na 0.2.0, dois processos sonoros confirmaram isolamento do app escolhido e áudio decodificado no receptor. Captura/qualidade não mudaram na 0.2.1; portátil atualizado verificou execução do mesmo helper embutido.
- O usuário publicou o código em `https://github.com/MiharaxD/concord.git`. `dist/` é ignorada; binários devem ser anexados a Releases.

## Trabalho em andamento

Nenhuma implementação solicitada pendente. Não houve commit, push ou publicação automática da release 0.2.1.

## Limitações e questões abertas

- Uma pessoa transmite e uma assiste por sala; microfone acompanha a transmissão, sem chamada de voz nos dois sentidos.
- Túnel depende do serviço gratuito Cloudflare. Criação espera DNS/HTTPS e pode demorar até 150 segundos.
- Executável sem assinatura digital. Relato anterior de bloqueio não teve texto/nome da ameaça informado; não foi confirmado falso positivo. Defender local não detectou ameaças no pacote 0.2.1.
- Áudio por app exige Windows build 20348+ (Windows 11), inclui processos filhos e pode incluir outras janelas/abas do mesmo app. Falha não troca silenciosamente para áudio global.
- Nenhum teste independente em duas máquinas físicas com operadoras diferentes; captura nativa de tela/áudio do Windows foi verificada por metadados.

## Próxima validação útil

Teste de uso real em dois PCs/redes diferentes quando disponível. Atualizar ambos para 0.2.1 para usar convites curtos; publicação no GitHub depende de solicitação do usuário.
