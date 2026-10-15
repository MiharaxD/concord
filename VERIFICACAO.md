# Verificação do Concord 0.4.3

Data: 15/10/2026, Windows x64. Build local e publicação da versão 0.4.3.

## Publicação GitHub

Release: https://github.com/MiharaxD/concord/releases/tag/v0.4.3. Commit/tag: `a6708d06eb587c7cca5f27d3e8f877444a51efda`. O Actions concluiu com sucesso os testes, build Windows e publicação. A descrição lista as mudanças e registra que a criação pública de convites ainda depende da Cloudflare após o 429 observado.

O Setup público foi gerado pelo Actions e tem 125.200.210 bytes, SHA-256 `0238a3c0e024a613fc2ff2984d014ade31ff1d794b1bb0c4c13c98405900b3b4`. A Release contém Setup, `.blockmap`, `.sha256` e `latest.yml`. O instalador local abaixo é um build separado e permanece preservado.

Instalador: `dist/installer/0.4.3/Concord-0.4.3-Setup.exe`, **134.785.084 bytes**.
SHA-256: `68bd2dd27d15c5982393ab1a5f7a04fa95884de9071d7afc9ee88f62dd51daf2`.

## Diagnóstico confirmado e limite externo

Cloudflared 2026.10.0 oficial retornou `quick tunnel provisioning failed with status 429`, antes de gerar endereço público. Log em `test-results/tunnel-diagnosis-1792101277466/cloudflared.log`.

Nova tentativa real com backend corrigido às 21:59 UTC de 15/10 continuou recusada em 230 ms. Código/mensagem/prazo classificados e persistidos em `test-results/public-invite-1792101579758/result.json`. HTTP administrativo local retorna 503 com mensagem segura; 429 é o status upstream. **Criação/entrada pública não foram confirmadas nesta rodada.** Atualização corrige tratamento no app; não remove o limite externo nem garante hora de liberação.

Referência: [fonte oficial do Cloudflared 2026.10.0](https://github.com/cloudflare/cloudflared/blob/2026.10.0/cmd/cloudflared/tunnel/quick_tunnel.go), que retorna o status da falha de provisionamento. [Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) não têm garantia de disponibilidade. O limite documentado de 200 requisições em andamento é de tráfego do túnel; não foi usado para inferir a cota de criação atingida aqui.

## Alteração

- Saída do Cloudflared drenada até close para classificar motivo real. Mensagens seguras para 429, 5xx, 403, DNS/conexão, timeout e componente ausente; interface consulta metadados administrativos, sem expor exceção de IPC.
- 429 bloqueia novos processos por 60/120/240/300 s entre recusas consecutivas. Prazo/contador persistidos atomicamente em userData/tunnel/invite-retry.json, sem chaves, URL ou log bruto. Cache inválido não impede o app. Sucesso limpa; longo intervalo reinicia escalada.
- Contagem no botão, liberação ao expirar e nenhuma tentativa automática ao terminar. Reabrir respeita prazo; configurações, captura e sala não são bloqueadas.
- Cancelamento também cobre leitura do cache anterior ao spawn. Shutdown espera tentativa e gravações; falha durante preparo não sobrescreve a causa com túnel encerrado.
- Mantidos protocolo de salas, captura/áudio/transporte, perfis/cartões e atualizador. Testes comuns de UI evitam criar túneis públicos repetidamente.

## Validação no instalador final

App extraído sem instalar em `dist/installer/0.4.3/qa/win-unpacked/`; dados de QA isolados. Instalação pessoal não substituída.

**26 unidades: PASS.** Classificação, espera crescente, expiração, persistência/reabertura, reset/cache inválido; fixture via subprocesso real com stderr 429, chamadas concorrentes/repetidas sem novos processos e sala conectada. Também passaram unidades existentes de convites, preferências, autenticação/roster/mídia e controlador de atualização.

**Convite: PASS**, no desenvolvimento e no app extraído, em `test-results/invite-ui-1792101739820/result.json`:

- Cache isolado com prazo curto exercita bloqueio real do backend, mensagem/contagem, botão desabilitado/liberado ao expirar, sem pedido automático.
- Qualidade/FPS e seleção nativa de fontes disponíveis; captura não inicia sozinha.
- IPC controlado exercita serviço indisponível, nova tentativa/preparo, cancelar sem falha tardia e sucesso/cópia nativa sem alterar área de transferência pessoal.
- Sala segue conectada, sem pageerror. server.mjs/app.js/invite-retry.cjs lidos do ASAR correspondem ao fonte normalizando CRLF; screenshot conferido visualmente. Sucesso controlado não comprova disponibilidade pública.

**Duas instâncias/perfis/mídia: PASS**, app extraído, `test-results/member-profile-1792101749376/result.json`:

- Dois participantes entram pelo convite loopback e transmitem canvas em movimento/tom gerados; sem capturar tela/áudio pessoais.
- Cartão por nome/avatar/teclado, foto atual/iniciais, fechar por botão/fora/Esc, Tab/foco devolvido, atualizações e saída limpando cartão.
- Players/tracks/sockets, volume/mute, foco de stream e captura preservados. Quadros com cartão aberto **120/66 → 150/97**; depois **188/132 → 218/162**. RMS recebido **0,02839 / 0,02837**. Sem pageerror.

## Artefatos e preservação

Setup, SHA-256, SHA-512/tamanho/versão do latest.yml e blockmap conferidos. ASAR extraído/staging idênticos: SHA-256 `aadec4a35595fa74fe4f15f9916ace044af748ff95a78ee4e3400b20d80f706c`. Registro em `dist/installer/0.4.3/qa/artifact-check.json`.

Defender no Setup final: **found no threats**, código 0. Binário sem assinatura; resultado local não diagnostica alertas de outro PC.

Instaladores/relatórios anteriores preservados. Hashes 0.4.2 `39862d78194d7ae82323536b48e1b614f4294e808950b6115f617f3a7bde7b2f` e 0.4.1 `1f1e0b4311e8bccb5573852b08eccff896234d5828ae3b7a03d05da389f2f4b6` conferidos.

Suíte extensa de WASAPI, fallback/reconexão e protocolo Windows permanece documentada na 0.4.0, sem repetição integral. Duas máquinas físicas/redes distintas e clique do protocolo pelo shell após instalação continuam pendentes. A Release pública já pode ser consultada pelo atualizador; a aplicação/reinício em máquina de teste continua pendente.
