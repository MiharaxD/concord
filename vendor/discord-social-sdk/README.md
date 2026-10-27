# Discord Social SDK para Windows x64

Runtime oficial **1.10.19337**, obtido no painel do aplicativo Concord após habilitação do Social SDK pelo titular. A biblioteca é dependência do Concord, não um instalador do app. Avisos de terceiros em `License-Notices.txt`; versão, origem e SHA-256 em `version.json`.

`scripts/build-discord.ps1` confere o hash, copia a DLL/licença para `.runtime/`, compila `native/DiscordSocial.cs` com o .NET Framework do Windows e confirma a versão executando `ConcordDiscord.exe --probe`. O empacotador inclui esses três arquivos em `resources/`. O usuário final não instala o SDK ou ferramentas de desenvolvimento.

Para atualizar: obtenha a versão oficial no painel, revise os [termos do SDK](https://support-dev.discord.com/hc/en-us/articles/30225844245271-Discord-Social-SDK-Terms), substitua DLL/avisos, atualize manifesto/hash e confira as assinaturas C usadas pela ponte. Repita unidades, build/probe e teste autorizado real de amigos/envio. Não coloque URL assinada temporária, credenciais ou pacote completo de downloads no repositório.
