<p align="center">
  <img src="public/icon.svg" width="88" alt="Logo do Concord">
</p>

<h1 align="center">Concord</h1>

<p align="center">Compartilhamento de tela em salas privadas para Windows.</p>

<p align="center">
  <a href="https://github.com/MiharaxD/concord/releases/download/v0.7.0/Concord-0.7.0-Setup.exe"><strong>Baixar para Windows · v0.7.0</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/MiharaxD/concord/releases">Todas as versões</a>
</p>

Até **8 pessoas** na mesma sala, com várias transmissões simultâneas. Sem cadastro no Concord, domínio ou servidor próprio. Feito em Electron e JavaScript.

## Como usar

1. **Instale e escolha seu nome.** Foto e banner são opcionais.
2. **Crie uma sala** e use **Copiar link** para compartilhar o convite.
3. Para participar, abra o link ou cole o convite em **Entrar em uma sala** e confirme.
4. Escolha a tela ou janela, ajuste qualidade e áudio e clique em **Compartilhar tela**.

O link fica pronto assim que você clica em **Criar sala**. Quem entra se conecta direto ao seu PC; se a rede não permitir, o Concord prepara sozinho um acesso de compatibilidade pela Cloudflare só para essa pessoa.

Clique em uma transmissão para focar; clique novamente para voltar à grade. Na grade, você ouve todas as streams recebidas; em foco, apenas a selecionada.

**Parar a transmissão mantém a sala aberta. Fechar o Concord de quem criou a sala encerra a sala e seu link.**

## Recursos

| Recurso | O que oferece |
| --- | --- |
| Transmissões | Várias telas simultâneas, grade adaptável, foco e tela cheia |
| Câmera | Webcam sozinha ou junto com a tela; quem assiste vê no canto, em tela cheia ou em quadro separado |
| Qualidade | 720p, 1080p, 1440p ou 4K; 30 ou 60 FPS |
| Bitrate | Automático ou personalizado de 1 a 60 Mbps, em **Opções avançadas** |
| Áudio | Som do jogo/app ou do computador, microfone opcional e medidor de nível |
| Perfil | Nome, foto e banner salvos no PC; cartão de perfil dos participantes |
| Discord | Vinculação opcional para importar o perfil e convidar amigos por mensagem direta |
| Atualizações | Download em segundo plano e instalação ao clicar em **Reiniciar e atualizar** |

## Atalhos

| Tecla | Ação |
| --- | --- |
| **M** | Silenciar ou ativar o áudio recebido |
| **F** | Alternar tela cheia |
| **Esc** | Voltar à grade ou fechar um pop-up |

Os atalhos ficam desativados enquanto você digita ou usa um pop-up.

## Requisitos e limites

- **Windows 10/11 de 64 bits.** O instalador inclui os componentes; não exige Node.js ou ferramentas de desenvolvimento.
- Áudio **somente do jogo/app** exige Windows build 20348+; Windows 11 é recomendado. Pode incluir outras janelas do mesmo processo.
- Convites usam servidores MQTT públicos só para os PCs se encontrarem (mensagens cifradas) e uma página no GitHub Pages. A Cloudflare entra apenas quando a conexão direta falha e pode ter bloqueios temporários.
- Salas criadas na 0.6.0 ou mais nova exigem a 0.6.0 ou mais nova para entrar.
- O Discord é opcional. A cota atual de desenvolvimento é de **100 mensagens diretas a cada 2 horas para o aplicativo inteiro**.
- Mais participantes e transmissões exigem mais upload e processamento. O modo de compatibilidade pode ter mais atraso.

## Desenvolvimento

No Windows, use **Node.js 22+** e **pnpm 11.19.0**.

```powershell
pnpm install --frozen-lockfile
node scripts/prepare.mjs
pnpm build:audio
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-discord.ps1
pnpm start
```

- **Testes:** `pnpm test`
- **Instalador:** `pnpm build:installer` ou abra `build-installer.bat`
- **Saída:** `dist/installer/<versão>/`

## Documentação

- [Guia de uso](COMO%20USAR.txt)
- [Build, instalação e publicação](BUILD_WINDOWS.md)
- [Verificações da versão](VERIFICACAO.md)
- [Arquitetura](docs/context/ARCHITECTURE.md) · [Limitações e pendências](docs/context/TODO.md)
