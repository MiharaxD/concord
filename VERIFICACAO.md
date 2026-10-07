# Verificação do Concord 0.3.4 — 07/10/2026

Pacote local: `dist/installer/0.3.4/Concord-0.3.4-Setup.exe`, 134.778.731 bytes.
SHA-256 local: `adea918179b6470a4980af2759434745b85e41fcd90079fcc2fb6bfa515ac892`.

## Mudanças e verificações locais

- Cabeçalho “Bora compartilhar?”/“Sua tela, sua galera” e indicador visual “Sala conectada” removidos. Conexão permanece registrada internamente; erros continuam usando os avisos existentes.
- Texto ocioso “Pronto quando você estiver” removido. Relógio começa em 00:00:00 ao transmitir e fica oculto/limpo ao encerrar.
- Estado sem transmissões mostra somente a ilustração e **Compartilhamento de tela**, removendo slogan, descrição e “Sem conta / sem enrolação”.
- Menu **PAINEL**, versão **Concord 0.3.4** sem “pessoal” e crédito **Feito com carinho por Yuri Mihara**.
- Convite com título **Link de convite**, rótulo **CONVITE DA SALA** e sem instrução promocional nem mensagem de sucesso permanente. Preparação, erro e cancelamento mantêm feedback.
- Protocolo/captura/áudio/updater preservados; mudanças restritas à apresentação. Testes existentes adaptados para observar a conexão sem depender do indicador removido, com compatibilidade com versões anteriores.

**19/19 testes de unidade passaram.** `tests/smoke.mjs` passou no pacote 0.3.4: janela, sala, seleção nativa, PNG/JPG, cópia de convite, cancelar/retomar preparo e fechamento em 150 ms, incluindo preconexão sem HTTP.

Revisão real no Electron com perfil isolado em `test-results/interface-1791416312711`: layout e convite pronto conferidos; captura da própria janela de QA iniciada/encerrada, vídeo reproduzido e relógio mostrado/ocultado corretamente. Screenshot do painel e convite guardadas nessa pasta. Nenhuma transmissão/instalação pessoal foi encerrada ou substituída.

Publisher passou contra API simulada: checksum, quatro anexos completos antes de publicar, retomada de rascunho, falha de upload sem publicação e recusa de sobrescrever release pública. Defender local 4.18.26080.4-0 examinou `dist/installer/0.3.4`: **found no threats**, código 0. Binário sem assinatura digital; isso não diagnostica alertas em outros computadores.

## Publicação

Push e Release **autorizados expressamente pelo usuário e concluídos**. [Release 0.3.4](https://github.com/MiharaxD/concord/releases/tag/v0.3.4) com quatro anexos públicos: Setup.exe, .blockmap, .sha256 e latest.yml. [GitHub Actions concluído com sucesso](https://github.com/MiharaxD/concord/actions/runs/37704240993), com os 19 testes passando no Windows hospedado.

Instalador público: **125.193.971 bytes**, SHA-256 **`6c35d9efa6ab32a177247eed46913aa023a1b80cfb0bdf3a826f990bde7d014c`**. Cópia local em `dist/installer/0.3.4/github/Concord-0.3.4-Setup.exe`. Checksum publicado e hash retornado pela API conferem com o arquivo baixado. Build CI utiliza outra compressão/timestamps; o build local inicial foi preservado, sem substituir releases anteriores.

Tag v0.3.4 permanece em c4b5abf. Duas correções nos scripts de desenvolvimento foram enviadas depois: seleção da primeira instalação Node/pnpm quando Get-Command retorna múltiplas e checksum via .NET quando Get-FileHash não está disponível no PowerShell iniciado pelo runner. Retomada manual validou app/dependências/configuração iguais à tag; nenhum código runtime foi alterado nessas correções.

Cliente empacotado 0.3.3, sem GH_TOKEN/GITHUB_TOKEN, usando **electron-updater real** e feed GitHub público: detectou 0.3.4, mostrou progresso intermediário (41%, 65%, 84%, 90%) e terminou download/checksum. Evidência em `test-results/github-update-1791417230910/result.json`. Cache/perfil isolados; não chamou quitAndInstall nem modificou a instalação pessoal. A primeira atualização usa fallback completo, porque a 0.3.3 não tinha blockmap público anterior.

O conteúdo foi extraído do **instalador público baixado** para revisão, sem executar instalação: ASAR corresponde ao fonte (normalizando fins de linha), ws/electron-updater presentes, dependências de desenvolvimento ausentes. Smoke passou nesse pacote real: janela, sala, assets/seleção/cópia/preparo e fechamento em 138 ms. Defender também examinou o instalador público: found no threats, código 0.

## Evidências anteriores e limites

Relatório completo da instalação/atualizador permanece em `dist/installer/0.3.3/VERIFICACAO.md`. Nessa versão, instalação/reinstalação/desinstalação reais e atualização HTTP/NSIS com reinício e perfil preservados passaram. Instalador 0.3.3 preservado, SHA-256 `8f0de41a55e4553a8e3caadbf5657a5816e885cc6f1c1ebaa1621132e42db883`.

Há programa/atalhos pessoais no Windows nesta rodada; testes que instalam/desinstalam não foram repetidos sobre essa instalação. Validação local em um PC Windows 11; instabilidade anterior ao reiniciar múltiplas streams continua pendente em TODO.md. Os testes de mídia completos não foram repetidos para esta alteração visual.

Comandos e reprodução estão em [BUILD_WINDOWS.md](BUILD_WINDOWS.md).
