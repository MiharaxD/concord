# Verificação do Concord 0.5.1

27/10/2026, Windows x64. Troca focada de identidade visual e publicação autorizada da 0.5.1, incluindo as funcionalidades Discord da base 0.5.0.

## Instalador local preservado

`dist/installer/0.5.1/Concord-0.5.1-Setup.exe`, **138.029.717 bytes**.
SHA-256: `db08ca0079998b69120c0c042e20b745e1257804563fea724a407b4b5ccc426d`.
Build Windows terminou com código 0; Setup/blockmap/checksum/latest.yml gerados. Versões anteriores preservadas, incluindo o Setup/relatório 0.5.0. Instalador público é um build separado do Actions, detalhado abaixo.

## Publicação GitHub confirmada

[Release v0.5.1](https://github.com/MiharaxD/concord/releases/tag/v0.5.1), commit/tag `1e111d2773789c96c21c789e92338d8d21fd6b1b`. [Actions 40531442838](https://github.com/MiharaxD/concord/actions/runs/40531442838) concluiu testes, build e publicação com sucesso. Push de main e tag concluídos; descrição inclui logo, Discord/perfil/banner/amigos/DM/links e seus limites.

Setup público: **128.356.529 bytes**, SHA-256 `0aa181b62cd639f1cfb20325293880f3c15b840e8d7a476e2a0daac25aca19ba`. Quatro anexos (Setup, blockmap, SHA-256, latest.yml) baixados e verificados por tamanho/hash; manifesto SHA-512 confere. Endpoint /releases/latest aponta para v0.5.1. Cópia preservada em `dist/installer/0.5.1/github/`, evidência `test-results/public-release-0.5.1.json`.

App público extraído/aberto com perfil isolado: versão, logo, 14 arquivos runtime, DLL oficial e probe do SDK conferidos, sem substituir instalação pessoal. Textos comparados normalizando apenas CRLF/LF; imagens/ICO/DLL por bytes/hash. Evidência `test-results/public-runtime-0.5.1/result.json`. Não equivale a instalar/reiniciar atualização pública em uma máquina pessoal.

Antes do push, 35 unidades locais e teste do publisher com API simulada passaram. O workflow real também concluiu seus testes. Binários local e público têm hashes/tamanhos distintos por serem builds separados; os anteriores não foram sobrescritos.

## Alteração

- `public/icon.svg` é cópia byte a byte do SVG `C:/Users/YURI/Pictures/icone_camera_vetor.svg` fornecido pelo usuário. SHA-256 `6f51175f00572eddaa4b5c232737a54b42d366795baf2e269d675a998c7acf88`. Desenho/cores/cantos transparentes preservados.
- Logo da interface, favicon e página do convite usam esse vetor.
- `desktop/icon.ico`: 16/24/32/48/64/128 px em DIB 32 bits com máscara/alpha; 256 px em PNG. Mesmo desenho no executável, janela e instalador/desinstalador por configuração existente. A primeira conversão só com PNG em todos os tamanhos apareceu como ícone genérico no Windows; corrigida antes de entregar.
- `public/invite-icon.png`: PNG 512×512 do mesmo vetor para a prévia do link no Discord. Open Graph aponta para `/invite-icon.png?v=camera-1` para revisar o endereço da imagem. Mensagens já enviadas podem continuar com prévia em cache.
- Salas, captura, áudio, Discord OAuth/SDK, perfis e transportes não foram alterados por esta troca.

## Verificações

- 12 testes existentes de servidor passaram, incluindo página/metadata da prévia, limites/autorização de sala e tratamento de convite.
- Setup final extraído em `test-results/installer-0.5.1-verified-2/`; aplicação executada dali com perfil isolado, sem substituir instalação pessoal ou capturar tela/áudio pessoal.
- SVG, PNG, ICO e servidor no pacote conferem byte a byte com o fonte. Versão 0.5.1 confirmada no app.
- Logo da sidebar e página do convite renderizados e inspecionados. Windows leu os ícones reais do executável e do Setup; ambos mostram a câmera correta após a correção do formato.
- Endpoint da imagem Open Graph com query retorna image/png, 512×512 e bytes idênticos ao PNG novo. Página mantém Abrir no Concord/Baixar Concord e convite com confirmação. Sem pageerror.
- Evidência: `test-results/logo-0.5.1/result.json`, `painel.png`, `pagina-convite.png`, `windows-app-icon.png`, `windows-setup-icon.png`.

A verificação da prévia nova cobriu metadata e imagem servida localmente; não foi enviado outro convite real pelo Discord nesta troca visual. Autorização real, 110 amigos, um envio recebido e regressão de duas transmissões foram validados na base 0.5.0, conforme relatório preservado em `dist/installer/0.5.0/VERIFICACAO.md`; não foram repetidos para uma troca de logo.
