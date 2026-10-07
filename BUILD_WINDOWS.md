# Build Windows do Concord

O distribuível principal é um instalador **NSIS `.exe`**, gerado por **electron-builder 26.15.3**. O projeto já usa Electron; manter seu empacotador inclui o runtime e aproveita instalação, atualização, atalhos e desinstalação existentes. Personalização pequena por `include`, conforme a [documentação do electron-builder v26](https://www.electron.build/v26/docs/nsis/).

## O que acompanha o app

| Parte | Uso | Distribuição |
| --- | --- | --- |
| JavaScript/Electron 44.5.1 | Janela, Chromium e Node embutidos | Runtime incluído; usuário não instala Node |
| `desktop/` e `public/` | Interface, ícones, captura e permissões | Dentro de `resources/app.asar` |
| `server.mjs` e `ws` 8.22.0 | Servidor HTTP/WebSocket interno em loopback e porta dinâmica | Dentro do pacote; sem serviço instalado no Windows |
| Cloudflared 2026.10.0 | Convite público e conexão pela internet | EXE, identificação/checksum e licença incluídos em `resources/` |
| `native/AppAudio.cs` | Captura WASAPI por processo | Compilado como `resources/ConcordAudio.exe` |
| `electron-updater` 6.8.9 | Consulta, download/checksum e instalação NSIS | Dependência de runtime incluída no app |
| Perfil | Nome e miniatura da foto | `%APPDATA%\Concord\profile.json`; não acompanha o instalador |

Não há banco de dados. Captura e mídia ficam em memória. Não há Python, Git ou compilador em runtime. O servidor encerra junto do app; nenhum serviço/tarefa agendada é criado. O programa instalado resolve arquivos pelo pacote e `process.resourcesPath`, sem depender da pasta do código ou do diretório de onde foi aberto.

Windows x64: Windows 10/11 para o app; captura **somente do jogo/app** exige build 20348+ (Windows 11 recomendado). O helper utiliza o .NET Framework 4 do Windows, já incluído no Windows 11; não exige o SDK nem .NET moderno instalado separadamente. [Referência da Microsoft](https://learn.microsoft.com/en-us/dotnet/framework/install/on-windows-and-server). Em Windows anterior, escolha áudio de todo o computador; a captura por app mostra sua limitação explicitamente.

## Ferramentas apenas no PC de desenvolvimento

1. Instale [Node.js](https://nodejs.org/en/download) 22 ou mais recente, com npm, e reabra o terminal.
2. Instale o gerenciador fixado pelo projeto:

```powershell
npm install --global pnpm@11.19.0
```

O Windows também precisa do compilador do .NET Framework em `%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe`, usado somente para gerar o helper. O script detecta sua ausência e interrompe o build com uma mensagem. Não precisa de Python, Visual Studio, Git ou NSIS instalados separadamente: o empacotador prepara suas ferramentas. A primeira preparação precisa de internet para obter dependências e Cloudflared oficial.

## Gerar uma nova versão

Altere `version` em `package.json`, mantendo `name`, `appId` e o diretório de dados. Depois dê duplo clique em **`build-installer.bat`**, ou execute:

```powershell
pnpm build:installer
```

O comando instala as dependências pelo lockfile, verifica o SHA-256 oficial do Cloudflared, inclui sua licença, compila o áudio e gera o instalador completo. Recria somente `win-unpacked` da versão atual dentro de `dist/`; não limpa versões anteriores nem dados do usuário. Caminhos com links são recusados na limpeza. Não publica arquivos no GitHub.

Resultado da versão atual:

```text
dist/installer/0.3.4/Concord-0.3.4-Setup.exe
dist/installer/0.3.4/Concord-0.3.4-Setup.exe.sha256
dist/installer/0.3.4/Concord-0.3.4-Setup.exe.blockmap
dist/installer/0.3.4/latest.yml
```

**Envie o `.exe`** para a instalação inicial dos amigos. Todos os componentes estão dentro dele. Na GitHub Release, publique também `.blockmap` e `latest.yml`: são necessários para o atualizador. `win-unpacked` e relatórios não precisam ser enviados. Para gerar também o formato portátil, use `pnpm build`; sua saída fica em `dist/<versão>/`.

## Instalação e dados

- Instalação somente para o usuário atual, normalmente em `%LOCALAPPDATA%\Programs\Concord`; sem solicitar administrador.
- Entrada no menu Iniciar, opção de atalho na Área de Trabalho, nome/versão/ícone e desinstalador em **Aplicativos instalados**.
- Atualização/reinstalação mantém o mesmo identificador e substitui os arquivos do programa. Feche o Concord antes de atualizar ou desinstalar; o instalador pede isso e não mata uma sala à força.
- Nome/foto e dados do Chromium continuam em `%APPDATA%\Concord`. Atualização e desinstalação normal preservam essa pasta. Instalar depois de usar o portátil continua usando o mesmo perfil.
- Para testes, `CONCORD_DATA_DIR` aponta a um perfil separado. Não é uma configuração necessária para usar o programa.

## Onde alterar

| Item | Arquivo |
| --- | --- |
| Versão, descrição, dependências e comandos | `package.json` |
| Nome, appId, recursos, ícone e assinatura | `build/electron-builder.cjs` |
| Formato e opções do instalador | `build/installer.cjs` |
| Página/atalho e pedido de fechamento | `build/installer.nsh` |
| Preparação e limpeza de staging | `scripts/build-windows.ps1` |
| Atualizador principal e IPC | `desktop/updater.cjs`, `desktop/main.cjs`, `desktop/preload.cjs` |
| Publicação completa / CI por tag | `scripts/publish-release.mjs`, `.github/workflows/release.yml` |
| Ícone | `desktop/icon.ico`; ícone da interface em `public/icon.svg` |

Não mude `appId: local.concord.desktop` após distribuir: ele identifica atualizações e a entrada de desinstalação. `desktop/main.cjs` usa o mesmo identificador de janela. Não mude o nome/diretório de dados sem implementar migração do perfil.

## Atualização automática

A instalação NSIS da 0.3.3 usa `electron-updater` no processo principal e a configuração `resources/app-update.yml` gerada pelo builder: GitHub público, owner `MiharaxD`, repo `concord`. Não há token no cliente. Verifica uma vez após bootstrap da interface, sem esperar nome/convite nem bloquear a janela. O botão discreto **Verificar atualizações** permite repetir; consultas/downloads concorrentes são agrupados. Sem consulta periódica agressiva.

Download automático em segundo plano, progresso e **Reiniciar e atualizar** no menu lateral. `autoInstallOnAppQuit = false`: fechar normalmente não aplica um update. O clique espera operações pendentes de perfil, encerramento do servidor/túnel/helper e só então chama `quitAndInstall(true, true)`. NSIS espera brevemente a saída do Electron em `--updated`, sem matar processos. Reiniciar encerra sua sala atual. Arquivos do perfil ficam fora da instalação.

Erros são registrados em `%APPDATA%\\Concord\\updates.log`, rotacionado após 1 MB, sem diálogos técnicos. Sem update, a consulta automática fica silenciosa. Desenvolvimento, portátil e pasta descompactada sem instalação não verificam updates. IPC continua validando janela/URL; sandbox/context isolation permanecem habilitados e Node desabilitado no renderer. Diferencial e fallback para download completo ficam a cargo do electron-updater; não há patch próprio. [Fluxo oficial do electron-builder v26](https://www.electron.build/v26/docs/features/auto-update/).

Versões portáteis anteriores e o instalador 0.3.2 sem updater precisam instalar 0.3.3 uma vez. A partir dela, releases **públicas estáveis** com versão maior e metadados completos são recebidas no app.

## Publicar próximas versões

1. Aumente `version` em `package.json` com SemVer estável e registre o código/lockfile/workflow no GitHub. Preserve o `appId`.
2. No PC de desenvolvimento, defina `GH_TOKEN` (ou `GITHUB_TOKEN`) no ambiente, com acesso de escrita em Contents do repositório. Não cole tokens em arquivos.
3. Execute `pnpm release` ou `npm run release`.

O comando gera o pacote local e usa a API oficial do GitHub para criar/reutilizar um **rascunho** `v<versão>`, envia o Setup, `.blockmap`, `.sha256` e `latest.yml`, verifica manifesto/checksum e publica somente após todos os envios terminarem. Falha mantém o rascunho; repetir retoma seus anexos. Uma release já publicada é recusada: aumente a versão em vez de substituir um pacote entregue. Requer Git somente no desenvolvimento para identificar o commit; o commit precisa existir no GitHub. [API de Releases](https://docs.github.com/en/rest/releases/releases).

Alternativa pelo GitHub Actions, após enviar os commits à branch principal:

```powershell
git tag v0.3.4
git push origin v0.3.4
```

O workflow em Windows confere se tag/`package.json` concordam, usa Node 24/pnpm fixado, executa testes de unidade, gera NSIS e publica os quatro artefatos. Recebe apenas o `GITHUB_TOKEN` temporário com `contents: write`; não precisa de token pessoal nos PCs dos amigos. Assinatura pode ser adicionada futuramente via secrets de CI. [Autenticação oficial do Actions](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token).

Para retomar uma publicação que falhou, o workflow também permite **Run workflow** na branch principal. Se a tag dessa versão já existe, confere que app, dependências e configuração do pacote continuam iguais à tag; mudanças no app exigem outra versão. Isso permite corrigir scripts de desenvolvimento sem mover uma tag. O build seleciona somente a primeira instalação de Node/pnpm disponível no PATH.

Gerar um instalador com `build-installer.bat` / `pnpm build:installer` **não publica**. O workflow roda somente após push de uma tag, e `release` publica apenas quando executado expressamente. A instalação inicial enviada diretamente funciona antes da primeira Release; receber versões futuras depende da publicação dos artefatos completos.

## Assinar futuramente

O build atual é sem assinatura. SmartScreen pode indicar editor desconhecido; não há exclusões de antivírus, alteração de proteção ou contorno do aviso.

Quando tiver um certificado válido, forneça-o fora do repositório:

```powershell
$env:WIN_CSC_LINK = 'C:\Certificados\Concord.pfx'
$env:WIN_CSC_KEY_PASSWORD = 'senha-do-certificado'
pnpm build:installer
```

Para certificado no repositório de certificados do Windows/token, use `CONCORD_CERT_SUBJECT` com o nome do titular. A configuração habilita assinatura SHA-256 e `forceCodeSigning` quando recebe credenciais; falha na assinatura impede o build. Não guarde senhas/certificados no Git. [Assinatura no electron-builder v26](https://www.electron.build/v26/docs/features/code-signing/code-signing-win/).

## Verificar

```powershell
pnpm test
$env:CONCORD_EXE = (Join-Path (Get-Location) 'dist/installer/0.3.4/win-unpacked/Concord.exe')
node tests/smoke.mjs
pnpm test:installer
```

`tests/installer.mjs` instala, reinstala, abre com PATH contendo só Windows e diretório de trabalho fora do projeto, verifica assets/servidor/áudio/túnel, bloqueio com app aberto, fechamento dos auxiliares, preservação dos dados e desinstalação. Recusa rodar se já existir instalação ou atalho pessoal do Concord; use um ambiente de teste. `CONCORD_BASELINE_INSTALLER` e `CONCORD_BASELINE_VERSION` permitem testar atualização a partir de um instalador anterior. Não executa a suíte de chamadas como parte do build; a instabilidade de múltiplas transmissões já registrada em `docs/context/TODO.md` é uma questão distinta do empacotamento.

### Testar atualização de ponta a ponta sem publicar

Use uma máquina/VM sem Concord instalado ou atalhos pessoais. O teste recusa substituir uma instalação existente. Gere uma versão anterior **com o mesmo updater implementado**, em pasta própria de QA:

```powershell
pnpm exec electron-builder --config build/installer.cjs --win nsis --x64 --config.extraMetadata.version=0.3.2 --config.directories.output=test-results/updater-baseline --publish never
pnpm test:updater
node tests/release.mjs
```

O build normal da 0.3.4 deve existir primeiro. A fixture 0.3.2 acima serve somente para QA: não substitui o instalador 0.3.2 preservado, que não possui atualização automática. `CONCORD_UPDATE_BASELINE` e `CONCORD_UPDATE_OLD_VERSION` aceitam outros pares. Use uma versão maior no pacote de destino.

`tests/updater.mjs` instala a fixture anterior, modifica somente seu `app-update.yml` **instalado** para um feed HTTP em loopback e executa o electron-updater real. Verifica offline/silêncio, consulta única/manual, download/progresso/checksum, fechamento comum sem instalar, clique com áudio/túnel ativos, instalação NSIS, reinício automático, versão nova e nome/foto preservados. O artefato distribuído continua apontando para GitHub; não existe override de feed por IPC/env no app. O teste desinstala sua própria instalação e guarda screenshots/resultados em `test-results/updater-*`.

O servidor local fornece os mesmos `latest.yml`, Setup e `.blockmap` gerados para Release; a instalação/reinício são reais. Isso valida o mecanismo, mas **não comprova a execução do workflow nem o percurso de uma Release pública do GitHub**. Para confirmar também esse percurso após publicação autorizada: instale uma versão com updater, publique uma versão maior com os quatro anexos, abra a anterior, observe o download, clique em reiniciar e confira a versão/nome/foto no app reaberto. Nenhum token é necessário no cliente.

O teste começa com um perfil de QA isolado para verificar gravações concorrentes. Para instalação/reinício automático, usa o perfil normal do Windows, pois NSIS reabre pelo shell sem herdar `CONCORD_DATA_DIR`. Se esse perfil já existe, lê seus dados sem editá-los e confere seu hash antes/depois; se não existe, cria somente o perfil de teste e o remove ao terminar, após conferir que não foi alterado. A desinstalação continua preservando dados pessoais.

`tests/release.mjs` simula a API de upload para conferir ordem/completude e checksum, sem publicar no GitHub. Consulte `VERIFICACAO.md` para os resultados realmente observados no pacote atual e seus limites.
