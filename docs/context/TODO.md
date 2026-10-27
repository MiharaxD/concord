# Trabalho de curto prazo

## Agora

0.5.2 local concluída em 27/10/2026: preparo só em Criar sala, com duas instâncias/fluxos de convite testados no instalador extraído e zero provisionamentos reais. Usuário solicitou push e edição da mesma Release publicada (ID 425643743), sem criar outra entrada. Em preparação: atualizar a entrada para v0.5.2 e seus quatro anexos, preservando cópia local dos anexos 0.5.1 e a tag antiga. Confirmar identidade da Release, download e checksums antes de registrar conclusão.

## Depois

- [ ] Para ampliar distribuição dos convites por Discord, atender requisitos e solicitar aumento da cota do Social SDK. Desenvolvimento limita o app inteiro a 100 DMs/2h; não contornar/repetir envios automaticamente.
- [ ] Validar instalação completa e abertura de concord: pelo shell numa máquina/VM de QA, sem substituir a instalação pessoal. Macros NSIS de registro/aspas/remoção passaram em chave isolada; argumentos de abertura fria/segunda instância e confirmação passaram no app extraído 0.4.0.
- [ ] Confirmar instalação/reinício do update público numa máquina de teste. Na 0.3.4, CI/publicação e cliente 0.3.3 consultando/baixando GitHub público sem token passaram; aplicação/reinício anteriores via feed local passaram na 0.3.3. Preservar a instalação/sala pessoal aberta.
- [ ] Investigar instabilidade ao reiniciar múltiplas transmissões em compatibilidade: testes locais voltaram a falhar em movimento/áudio na 0.3.1 e no pacote preservado 0.3.0. Causa ainda não identificada; transporte não mudou na 0.3.1.
- [ ] Validar desempenho e conexão em duas máquinas físicas e redes distintas quando houver acesso a esse cenário.

## Se voltar a ocorrer

- [ ] Falha pública: Cloudflare provisionou em 27/10 (`test-results/discord-live-1793112149649/result.json`), depois usuário relatou novo bloqueio. Não fazer pedidos reais só para diagnosticar esse limite. Distinguir sala/túnel fechado (1033), limite 429 e falha com app ativo. Respeitar prazo; testes comuns de convite usam cache/IPC controlado.
- [ ] Bloqueio de download: obter texto exato/nome da ameaça e antivírus antes de diagnosticar ou alterar distribuição. Varredura local limpa não comprova falso positivo.
