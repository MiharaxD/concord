# Trabalho de curto prazo

## Agora

0.8.4 (correções da voz após revisão) publicada editando a Release da 0.8.3.
- [ ] Testar voz entre duas máquinas reais (eco, atraso, relay de voz) e com microfone/câmera físicos trocados no modal.

0.8.3 (sala estilo Discord, voz, perfil e modais) publicada em 30/10/2026 como Release nova.
0.8.2 (blindagem contra aberturas externas) publicada em 29/10/2026 editando a Release da 0.8.1.
- [ ] Confirmar com o usuário como o vídeo foi enviado (clipe/arrastar/Ctrl+V), em qual PC as abas do Teams abriram e se continuaram com o Concord fechado.

0.8.1 (prévia de mídia no chat) publicada em 29/10/2026 editando a Release da 0.8.0.

0.8.0 (barra de controles, pop-up de transmissão e chat) publicada em 29/10/2026 como Release nova.
- [ ] Testar envio de arquivo grande (centenas de MB/GB) entre duas máquinas e o microfone ligado no meio da transmissão com microfone real.

0.7.1 (áudio automático) publicada em 29/10/2026 editando a mesma Release.

0.7.0 (câmera) publicada em 29/10/2026 editando a mesma Release.
- [ ] Testar com webcam física real e com outra pessoa (PiP, separar, tela cheia).

0.6.1 publicada em 29/10/2026 (P2P + Cloudflare como plano B; link entra direto). Usuário relatou o P2P funcionando.
- [ ] Conferir a prévia do link do GitHub Pages no Discord (página já no ar e validada em 29/10).
- [ ] Ainda não confirmado: plano B com túnel Cloudflare real entre redes diferentes.

## Depois

- [ ] Para ampliar distribuição dos convites por Discord, atender requisitos e solicitar aumento da cota do Social SDK. Desenvolvimento limita o app inteiro a 100 DMs/2h; não contornar/repetir envios automaticamente.
- [ ] Validar instalação completa e abertura de concord: pelo shell numa máquina/VM de QA, sem substituir a instalação pessoal. Macros NSIS de registro/aspas/remoção passaram em chave isolada; argumentos de abertura fria/segunda instância e confirmação passaram no app extraído 0.4.0.
- [ ] Confirmar instalação/reinício do update público numa máquina de teste. Na 0.3.4, CI/publicação e cliente 0.3.3 consultando/baixando GitHub público sem token passaram; aplicação/reinício anteriores via feed local passaram na 0.3.3. Preservar a instalação/sala pessoal aberta.
- [ ] Investigar instabilidade ao reiniciar múltiplas transmissões em compatibilidade: testes locais voltaram a falhar em movimento/áudio na 0.3.1 e no pacote preservado 0.3.0. Causa ainda não identificada; transporte não mudou na 0.3.1.
- [ ] Validar desempenho e conexão em duas máquinas físicas e redes distintas quando houver acesso a esse cenário (agora também a taxa de sucesso do P2P direto vs. plano B).
- [ ] Considerar assinatura do host nas mensagens P2P (hoje qualquer portador da chave pode se passar pelo host perante outro convidado) e um terceiro broker de reserva.

## Se voltar a ocorrer

- [ ] Falha pública: Cloudflare provisionou em 27/10 (`test-results/discord-live-1793112149649/result.json`), depois usuário relatou novo bloqueio. Não fazer pedidos reais só para diagnosticar esse limite. Distinguir sala/túnel fechado (1033), limite 429 e falha com app ativo. Respeitar prazo; testes comuns de convite usam cache/IPC controlado.
- [ ] Bloqueio de download: obter texto exato/nome da ameaça e antivírus antes de diagnosticar ou alterar distribuição. Varredura local limpa não comprova falso positivo.
