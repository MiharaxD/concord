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

Push e Release **autorizados expressamente pelo usuário**. Código e versão 0.3.4 preparados para envio; execução/publicação ainda em andamento. O workflow por tag gera outro build do mesmo código, que pode ter hash diferente do pacote local por recompilação/timestamps. Confirmar artefatos públicos e registrar seus hashes após a publicação.

## Evidências anteriores e limites

Relatório completo da instalação/atualizador permanece em `dist/installer/0.3.3/VERIFICACAO.md`. Nessa versão, instalação/reinstalação/desinstalação reais e atualização HTTP/NSIS com reinício e perfil preservados passaram. Instalador 0.3.3 preservado, SHA-256 `8f0de41a55e4553a8e3caadbf5657a5816e885cc6f1c1ebaa1621132e42db883`.

Há programa/atalhos pessoais no Windows nesta rodada; testes que instalam/desinstalam não foram repetidos sobre essa instalação. Validação local em um PC Windows 11; instabilidade anterior ao reiniciar múltiplas streams continua pendente em TODO.md. Os testes de mídia completos não foram repetidos para esta alteração visual.

Comandos e reprodução estão em [BUILD_WINDOWS.md](BUILD_WINDOWS.md).
