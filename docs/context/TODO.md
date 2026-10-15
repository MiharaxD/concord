# Trabalho de curto prazo

## Agora

0.4.3 local trata falha de convite com motivo seguro e espera persistente para 429, sem bloquear controles ou repetir pedidos ao reabrir. 26 unidades, fluxo de convite controlado e duas instâncias com duas streams/perfis passaram no app extraído. Criação pública real ainda recusada pela Cloudflare (429 em 15/10/2026); não considerar resolvida a disponibilidade externa. Instaladores/relatórios anteriores preservados, sem push/Release; última publicação registrada é 0.3.4.

## Depois

- [ ] Revalidar criação pública quando a Cloudflare deixar de devolver 429 ao provisionamento. Não repetir pedidos durante o prazo nem usar testes comuns para criar túneis reais. Última evidência: test-results/public-invite-1792101579758/result.json.
- [ ] Validar instalação completa e abertura de concord: pelo shell numa máquina/VM de QA, sem substituir a instalação pessoal. Macros NSIS de registro/aspas/remoção passaram em chave isolada; argumentos de abertura fria/segunda instância e confirmação passaram no app extraído 0.4.0.
- [ ] Confirmar instalação/reinício do update público numa máquina de teste. Na 0.3.4, CI/publicação e cliente 0.3.3 consultando/baixando GitHub público sem token passaram; aplicação/reinício anteriores via feed local passaram na 0.3.3. Preservar a instalação/sala pessoal aberta.
- [ ] Investigar instabilidade ao reiniciar múltiplas transmissões em compatibilidade: testes locais voltaram a falhar em movimento/áudio na 0.3.1 e no pacote preservado 0.3.0. Causa ainda não identificada; transporte não mudou na 0.3.1.
- [ ] Validar desempenho e conexão em duas máquinas físicas e redes distintas quando houver acesso a esse cenário.

## Se voltar a ocorrer

- [ ] Bloqueio de download: obter texto exato/nome da ameaça e antivírus antes de diagnosticar ou alterar distribuição. Varredura local limpa não comprova falso positivo.
