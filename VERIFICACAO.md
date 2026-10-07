# Verificação do Concord 0.2.1 — 06/10/2026

Executável Windows x64: `dist/0.2.1/Concord-0.2.1-Windows.exe`, 124.445.684 bytes. Versões 0.1.0 e 0.2.0 preservadas em `dist/`.

SHA-256: `80a3fda80ed3f6c56e7874f3a79d57d4ccf4edab0d6895169774f8f2d59a64f4`.

## Resultados observados

- **15 testes passaram:** conversão de convites, URLs antigas/locais/personalizadas, rejeição de código inválido/host injetado, autenticação, revogação das duas chaves, papéis, relay, reconexão, origem, encerramento e bitrate.
- **Convite público curto:** app descompactado 0.2.1 criou túnel real, exibiu e copiou nativamente um convite `concord:` de 58 caracteres. Link legado para a mesma sala tinha 103 caracteres: redução de 45. Cópia foi interceptada somente no teste para preservar a área de transferência do usuário.
- **Internet:** outra instância do app aceitou esse código e recebeu vídeo sintético em movimento de 1280×720 pela Cloudflare/WSS. Administração no endereço público respondeu 403, inclusive com a chave do transmissor. `DESKTOP_TEST_PASS`.
- **Regressão local:** convite com chave curta autenticou o receptor; vídeo WebRTC e compatibilidade avançaram, áudio foi decodificado nos dois caminhos. Tela cheia/Esc, mais de 35 segundos com limpeza do buffer, reentrada durante transmissão e expulsão por revogação passaram.
- **App empacotado:** inicialização, enumeração de fontes, cópia nativa do convite e encerramento com preconexão TCP sem HTTP passaram. `PACKAGED_SMOKE_PASS`.
- **Portátil final:** extração, janela, sala autenticada, seleção de fonte, helper embutido entregando PCM e encerramento normal passaram. `PORTABLE_TEST_PASS`.
- **Helper preservado:** SHA-256 do capturador empacotado `17a8bbf53204cdd8c68062c68409a5fe8af04ee788fb2438a1e1d97c2db3621a`, igual ao da 0.2.0.
- **Release anterior preservada:** SHA-256 do portátil 0.2.0 continua `a348dedfa794c0d33445bfde17b56dcfb9122d1b95c217637d726d781ad9fecb`.
- **Defender local:** plataforma 4.18.26080.4-0 examinou `dist/0.2.1`, incluindo portátil e componentes. Retornou `found no threats`, código 0. Não foram desativadas proteções nem criadas exclusões. Isso não garante ausência de malware nem diagnostica alertas em outros PCs.

## Limites dessa verificação

Testes ocorreram em uma máquina Windows 11, usando duas instâncias e um túnel público real. Não houve teste desta versão em dois PCs físicos/redes distintas. Qualidade 1440p/4K, cancelamento tardio de reprodução e isolamento de dois processos sonoros foram medidos na 0.2.0; esses caminhos não mudaram nesta atualização. Evidência anterior preservada em `dist/0.2.0/VERIFICACAO.md`. Bitrate configurado é teto/alvo, não consumo constante. Captura específica inclui processos filhos; mistura com microfone físico não foi medida. O executável continua sem assinatura digital, e TLS no fallback termina na Cloudflare.

## Repetir os testes

Com Playwright instalado ou `PLAYWRIGHT_MODULE` apontando para seu `index.mjs`:

```powershell
pnpm test
$env:CONCORD_EXE = (Join-Path (Get-Location) 'dist/0.2.1/win-unpacked/Concord.exe')
$env:CONCORD_TEST_TUNNEL = '1'
pnpm test:desktop
node tests/smoke.mjs
node tests/portable.mjs
```

O teste com túnel cria um acesso público temporário e o fecha ao terminar. Mídia usa tela sintética; captura real do Windows é validada apenas por metadados. O teste portátil emite um tom breve para validar o helper sem salvar áudio em disco.
