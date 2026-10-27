# Trabalho de curto prazo

## Agora

0.5.1 publicada em 27/10/2026, commit/tag `1e111d2773789c96c21c789e92338d8d21fd6b1b`. Actions 40531442838 passou; Setup, blockmap, checksum e latest.yml públicos baixados e conferidos. App extraído público confirma versão/logo/runtime/SDK. Descrição inclui Discord/perfil/banner/amigos/DM/links e novo logo. Instaladores anteriores preservados. Pendências abaixo continuam independentes da publicação concluída.

## Depois

- [ ] Para ampliar distribuição dos convites por Discord, atender requisitos e solicitar aumento da cota do Social SDK. Desenvolvimento limita o app inteiro a 100 DMs/2h; não contornar/repetir envios automaticamente.
- [ ] Validar instalação completa e abertura de concord: pelo shell numa máquina/VM de QA, sem substituir a instalação pessoal. Macros NSIS de registro/aspas/remoção passaram em chave isolada; argumentos de abertura fria/segunda instância e confirmação passaram no app extraído 0.4.0.
- [ ] Confirmar instalação/reinício do update público numa máquina de teste. Na 0.3.4, CI/publicação e cliente 0.3.3 consultando/baixando GitHub público sem token passaram; aplicação/reinício anteriores via feed local passaram na 0.3.3. Preservar a instalação/sala pessoal aberta.
- [ ] Investigar instabilidade ao reiniciar múltiplas transmissões em compatibilidade: testes locais voltaram a falhar em movimento/áudio na 0.3.1 e no pacote preservado 0.3.0. Causa ainda não identificada; transporte não mudou na 0.3.1.
- [ ] Validar desempenho e conexão em duas máquinas físicas e redes distintas quando houver acesso a esse cenário.

## Se voltar a ocorrer

- [ ] Falha pública: Cloudflare voltou a provisionar em 27/10 (`test-results/discord-live-1793112149649/result.json`). Distinguir sala/túnel fechado (1033), limite 429 e falha com app ativo. Respeitar prazo e não usar testes comuns para criar túneis repetidamente.
- [ ] Bloqueio de download: obter texto exato/nome da ameaça e antivírus antes de diagnosticar ou alterar distribuição. Varredura local limpa não comprova falso positivo.
