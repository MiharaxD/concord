# Verificação do Concord 0.1.0 — 06/10/2026

Executável entregue: `dist/Concord-0.1.0-Windows.exe` (Windows x64, portátil, 124.437.942 bytes).

SHA-256: `0a618df4ca40f468e56067397044205d41a8c08a79a759527639f8cb22eccfe7`.

## Resultados observados

- **8 testes do servidor passaram:** arquivos públicos, administração local, convites inválidos/Unicode, limite de participantes, sinalização e relay binário, revogação de convite, reconexão do transmissor, bloqueio de mensagens indevidas, origem externa e fechamento de preconexões HTTP.
- **Duas instâncias reais de Electron:** vídeo sintético em movimento recebido por WebRTC e pelo modo de compatibilidade; áudio decodificado confirmado com um analisador, sem depender apenas da existência de uma faixa de áudio.
- **Compatibilidade contínua:** mais de 35 segundos de reprodução, com limpeza de buffer antigo; saída e reentrada do espectador durante a transmissão; convite revogado removendo o espectador.
- **Caminho pela internet:** vídeo de 1280 pixels com quadros avançando através de um endereço público Cloudflare/WSS. Administração com a chave do transmissor continuou retornando HTTP 403 pelo endereço público.
- **Captura nativa Windows:** Electron forneceu uma faixa de vídeo de monitor e uma faixa de áudio do sistema. A verificação reteve apenas metadados, sem salvar os pixels da tela real.
- **Interface:** renderização inspecionada, tela cheia e saída com Esc testadas; controles de volume cabendo na janela.
- **Pacote final sem compactação:** inicialização, seleção de telas e chamada de cópia nativa do convite passaram. O teste interceptou a escrita no clipboard para preservar a área de transferência do usuário. Fechamento com uma preconexão HTTP pendente ocorreu em 146 ms.
- **Executável portátil final:** testado diretamente por `tests/portable.mjs`, incluindo extração, abertura da janela, autenticação da sala, enumeração das telas e encerramento normal. `PORTABLE_TEST_PASS`.
- **Cloudflared embutido:** versão 2026.10.0, SHA-256 verificado contra o release oficial e contra o binário empacotado. `86aee4017b26625cee8484c113558f48effa4cd47f7aa05fcf425604e5d2b23c`.

## Limites dessa verificação

As duas instâncias rodaram nesta mesma máquina, inclusive no teste por túnel público. Não houve teste com duas máquinas físicas e operadoras diferentes, nem medição de desempenho em jogos ou de latência nessas condições. A mistura de microfone com som do sistema foi implementada, mas não foi validada com dois dispositivos físicos de áudio. O modo por túnel usa TLS com terminação na Cloudflare, sem criptografia de ponta a ponta. O executável não possui assinatura digital.

## Repetir os testes

Com Playwright instalado ou `PLAYWRIGHT_MODULE` apontando para seu `index.mjs`:

```powershell
pnpm test
pnpm test:desktop
# Inclui o túnel público:
$env:CONCORD_TEST_TUNNEL = '1'
pnpm test:desktop
# Testes da distribuição:
node tests/smoke.mjs
node tests/portable.mjs
```

O teste de mídia usa uma tela sintética e tom de áudio. Os screenshots em `test-results/` mostram a interface e essa imagem de teste, não a tela real do usuário.
