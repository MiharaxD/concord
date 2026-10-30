# Spec: sala estilo Discord (0.8.3)

Status: implementada localmente na 0.8.3, sem commit nem publicação; a usuária está testando. Esta spec descreve o comportamento esperado e serve de critério de aceite e de guia para mudanças futuras nessa área.

## Problem Statement

A sala do Concord, até a 0.8.2, exigia esforço para entender. Quem estava sem transmitir não aparecia no palco. O convite ocupava uma coluna lateral com caixa de texto. O chat ficava espremido ao lado do vídeo. A barra lateral ocupava espaço fixo. O microfone só existia misturado à transmissão de tela, então não dava para simplesmente conversar como numa chamada. Quem vem do Discord, como os amigos da dona do app, não conseguia "bater o olho e entender" quem está na sala, quem está falando, quem está ao vivo e onde convidar alguém.

## Solution

A sala segue o modelo mental do Discord:

- **Palco:** todo participante aparece no palco como cartão. Quando alguém transmite, os vídeos ocupam o palco e as pessoas viram uma faixa embaixo.
- **Cabeçalho:** mostra o nome da sala, a contagem de pessoas, o AO VIVO e os botões Copiar link e Convidar pelo Discord, sem caixa de texto.
- **Barra de controles:** botões redondos para microfone, câmera, tela, fone/volume e sair.
- **Voz:** independente da tela. O microfone abre ao entrar na sala, o botão só muta e o mute fica lembrado.
- **Chat de texto:** fica embaixo do vídeo e recolhe com uma seta animada.
- **Barra lateral:** recolhe ao clicar no logo, com animação fluida. Recolhida, fica só com ícones, logo e fotos.
- **Cor tema:** a pessoa escolhe a cor no perfil, e ela vale para tudo que era roxo.

## User Stories

### Entender a sala

1. Como participante, quero ver todas as pessoas da sala como cartões no palco, para saber quem está ali mesmo sem ninguém transmitir.
2. Como participante, quero que, quando alguém transmite, as pessoas sem vídeo virem uma faixa embaixo dos vídeos, para que a transmissão tenha o maior espaço possível.
3. Como dono sozinho na sala, quero ver um cartão "Chame alguém" no lugar do palco vazio, para saber que o próximo passo é convidar.
4. Como participante, quero ver no cabeçalho o nome da sala, quantas pessoas estão nela e se há alguém AO VIVO, para entender o estado da sala de relance.
5. Como participante, quero que a pessoa falando ganhe um anel verde pulsante no cartão e na lista, para saber quem está falando.
6. Como participante com redução de movimento ativada no sistema, quero que o pulso de fala não anime, para não me incomodar.
7. Como participante, quero ver um microfone riscado no cartão e na lista de quem está mutado, para saber que a pessoa não está falando comigo.
8. Como participante, quero ver uma coroa no dono da sala, AO VIVO em quem transmite e um ícone de câmera em quem está com a câmera ligada, na lista lateral.
9. Como participante, quero clicar na foto de alguém (cartão, lista ou avatar no nome da transmissão) para abrir o perfil da pessoa.
10. Como participante, quero clicar na minha própria foto e ver meu perfil com a opção Editar perfil, para ajustar minha aparência sem procurar o menu.
11. Como participante usando teclado, quero que o foco volte para onde eu estava ao fechar um perfil.

### Convidar

12. Como dono, quero um botão Copiar link no cabeçalho da sala, para convidar alguém com um clique.
13. Como dono, quero um botão Convidar pelo Discord ao lado, para mandar o convite por DM sem sair da sala.
14. Como dono, não quero ver uma caixa de texto com o link, porque eu nunca edito o link à mão.
15. Como dono, quero "Gerenciar convite" discreto à esquerda dos botões, com Trocar convite e Fechar acesso, para revogar o link quando precisar sem poluir a tela.
16. Como dono, quero ver o status do convite (preparando, erro, link copiado) logo abaixo dos botões, e que avisos de sucesso sumam sozinhos.
17. Como convidado, não quero ver controles de convite que só o dono pode usar.

### Controles

18. Como participante, quero uma barra de botões redondos só com ícone (nome no tooltip), para controlar microfone, câmera, tela, som e saída como no Discord.
19. Como participante, quero o botão Sair à esquerda da barra, separado dos outros, para não sair por engano.
20. Como participante, quero que o botão Tela abra um pop-up com o menu completo de compartilhamento, e que o pop-up feche ao começar ou encerrar a transmissão.
21. Como participante, quero que Tela e Câmera fiquem na cor de destaque quando ligados, e Sair/AO VIVO em vermelho.
22. Como participante, quero um botão de fone que silencia toda a sala (ensurdecer) e um volume geral ao lado.
23. Como participante, quero ajustar o volume de cada pessoa ao passar o mouse no quadro dela ou pelo cartão de perfil, para equilibrar quem fala alto ou baixo.
24. Como participante, quero que o volume por pessoa multiplique o volume geral, para que o geral continue controlando tudo.
25. Como participante, quero tela cheia e Ver todas à direita da barra.

### Voz

26. Como participante, quero que o microfone já funcione ao entrar numa sala, como no Discord, para conversar sem configurar nada.
27. Como participante, quero que o botão de microfone só mute e desmute, sem fechar e reabrir o dispositivo, para que a troca seja instantânea.
28. Como participante, quero que meu mute fique lembrado entre sessões, para não entrar falando sem querer.
29. Como participante, quero que ensurdecer também me mute, e que desmutar desfaça os dois, igual ao Discord.
30. Como participante, quero conversar por voz sem ninguém transmitir tela, para usar a sala como chamada.
31. Como participante, quero que a voz funcione mesmo sem rota direta, pelo modo de compatibilidade, para que NAT restritivo não me deixe mudo.
32. Como participante, quero que o microfone feche ao sair da sala, para que o indicador do Windows apague.
33. Como participante fora de sala, quero que o microfone fique fechado.
34. Como participante, quero que a transmissão de tela não misture mais o microfone, porque a voz já vai separada.
35. Como participante numa sala de um dono com versão anterior à 0.8.3, quero que a sala continue funcionando, mesmo sem voz.

### Configurações de dispositivo

36. Como participante, quero uma engrenagem que abre um modal de configurações com a escolha de microfone e câmera, para trocar de dispositivo sem sair da sala.
37. Como participante, quero que trocar o microfone mantenha a voz funcionando e que a escolha seja lembrada pelo nome do dispositivo.
38. Como participante, quero que câmera desligada apareça vermelha e riscada.
39. Como participante, quero que listar dispositivos não abra a câmera, que continua exigindo clique explícito em Ligar câmera.

### Chat

40. Como participante, quero o chat de texto embaixo do vídeo, como no Discord, sem título "Chat da sala" nem subtítulo, para ganhar espaço.
41. Como participante, quero recolher o chat com uma seta, numa faixa fina e com animação, para dar mais espaço ao vídeo.
42. Como participante com o chat recolhido, quero ver um contador de não lidas na faixa, para não perder mensagens.
43. Como participante, quero uma barra de digitação com + para anexar, Enter para enviar e um rosto que abre um painel de emojis, sem botão Enviar.
44. Como participante, quero que o emoji escolhido entre na posição do cursor e que o painel feche com Esc ou clique fora.
45. Como participante, quero que imagens, vídeos e arquivos continuem funcionando como antes (prévia, download no hover, sem limite de tamanho, nada salvo).

### Barra lateral

46. Como participante, quero clicar no logo para recolher a barra lateral, sem um ícone separado de esconder painel.
47. Como participante, quero que o recolhimento tenha uma animação fluida, com largura encolhendo, textos sumindo em fade e ícones se centralizando.
48. Como participante com a barra recolhida, quero ver só o logo, os ícones de navegação, minha foto e as fotos de quem está na sala.
49. Como participante com a barra recolhida, quero ver o nome de cada item e pessoa ao passar o mouse.
50. Como participante usando leitor de tela, quero que o logo anuncie se a barra está expandida ou recolhida.
51. Como participante, quero que o palco reorganize os vídeos depois da animação, para aproveitar o espaço ganho.
52. Como participante, quero ver na lateral um painel de conexão acima do meu perfil, com o estado da sala.

### Cor tema

53. Como participante, quero escolher a cor tema no perfil (roxo, verde, azul, rosa, vermelho ou cor livre), para personalizar o app.
54. Como participante, quero que a cor valha para tudo que era roxo, inclusive o logo da barra lateral.
55. Como participante, quero que o texto sobre a cor de destaque fique claro ou escuro automaticamente, para continuar legível.
56. Como participante, quero que a cor tema fique só neste PC, sem ir para o perfil compartilhado com a sala.

## Implementation Decisions

- **Palco em duas grades:** uma só com quadros de transmissão (que os testes contam) e outra com cartões de pessoas sem vídeo, mais o cartão Chame alguém. Uma única função de arranjo calcula a grade 16:9 das duas. Com alguma transmissão ativa, o palco entra no modo faixa.
- **Convite no cabeçalho:** reaproveita os mesmos botões e IDs de antes (Copiar link, Discord, gerenciar, status). O campo do código continua no DOM, oculto, porque a lógica de convite e os testes leem dele. Não mudam o protocolo de sala nem o formato do convite.
- **Detecção de fala:** um laço de 200 ms com AnalyserNode sem saída, segurando 700 ms após a última fala. Mede só a voz, não o som da transmissão. Streams que chegam pelo relay MediaSource não ganham anel.
- **Voz independente:**
  - O microfone é capturado ao receber `welcome` com o recurso `voice` anunciado pelo servidor e é fechado em `disconnect`.
  - Mute e ensurdecer só alternam `enabled` da track; o que vai pela rede é silêncio.
  - A voz é o quarto transceiver do RoomMedia, depois da câmera, negociado só quando os dois lados anunciam `camera` e `voice`.
  - Sem rota direta, o relay usa Opus em WebM com fatias de 100 ms, buffer curto e id `<membro>:voice`.
- **Protocolo:**
  - `stream-state` ganha `voice` e `muted`, independentes de `active`.
  - O servidor mantém alvos de voz e aceita `relay-stream` do tipo voz.
  - Campos novos são opcionais, então membros 0.3.0+ continuam compatíveis.
- **Reprodução da voz:** elementos de áudio ocultos tocam a voz recebida, com volume geral × volume por pessoa. O foco da grade não afeta a voz.
- **Preferências:** passam a guardar o mute, os nomes do microfone e da câmera escolhidos (os IDs do Chromium mudam com a porta) e a cor tema, sempre pela whitelist existente.
- **Permissões:** o check handler compara a origem sem a barra final e libera `media` só para enumerar dispositivos. Abrir a câmera continua passando pela janela de 15 s do `concord:allow-camera`.
- **Invariante substituída:** "microfone desligado ao abrir" virou "microfone aberto só enquanto estiver numa sala". Esta é uma decisão de produto da dona do app e está registrada nas decisões do projeto.
- **Cor tema:**
  - Os roxos fixos do CSS viraram variáveis de destaque (base, hover, texto e "sobre o destaque"). A cor "sobre o destaque" vem da luminância.
  - O logo da barra lateral virou SVG inline para seguir a cor. Favicon e ícone do executável continuam roxos.
- **Barra lateral recolhível:**
  - O estado fica numa classe no `body`, alternada pelo botão do logo, com `aria-expanded` e `title` atualizados.
  - A animação usa transição de largura, padding, `max-width`/`opacity` dos textos e `max-height` dos blocos, em cerca de 0,32 s com curva suave. Não há `display:none`, para a transição ficar contínua.
  - O estado não é lembrado entre sessões.
- **Chat embaixo do vídeo:** a área da sala vira uma coluna (palco flexível em cima, chat com altura limitada embaixo). Recolher anima `flex-basis` até uma faixa de 40 px, e o conteúdo some com `opacity` e `visibility` atrasada. A API do RoomChat não muda.
- **Segurança:** nada de `innerHTML`. O painel de emojis usa uma lista fixa e insere texto com `setRangeText`. A blindagem da 0.8.2 contra janelas, navegação e `openExternal` continua valendo.

## Testing Decisions

- **Um bom teste observa o que a pessoa vê e ouve,** não detalhes internos. Exemplos: cartões presentes, microfone riscado do outro lado, nível de áudio recebido subindo ou caindo, foco voltando ao elemento certo. Os testes não checam variáveis de módulo nem estrutura de CSS.
- **Seam principal (o mais alto):** E2E com Playwright `_electron`, dirigindo duas ou três instâncias reais do app pela UI, com dados isolados em `CONCORD_DATA_DIR`. As instâncias usam `--mute-audio`, para não incomodar quem roda o teste, e `--use-fake-device-for-media-stream`, para não capturar o microfone nem a câmera reais.
- **Seam secundário:** testes unitários do servidor (`node --test`) para o protocolo de voz e para a whitelist de preferências, onde a UI não alcança de forma barata.
- **Cobertura por módulo:**
  - Voz (cenário próprio): microfone abre ao criar a sala; voz por rota direta sem tela; mute envia silêncio e aparece riscado do outro lado; ensurdecer e desmutar; troca de microfone no modal mantém a voz e salva o nome; relay Opus sem rota direta; sair fecha o microfone.
  - Chat: os cenários existentes, mais a barra de digitação nova e o recolhimento.
  - Navegação da sala: barra lateral, perfil e foco.
  - Perfil de membro: cartões, abrir perfil pela foto e estabilidade de streams com perfil aberto.
  - Câmera e P2P: regressão.
  - Experiência: precisa de som real; roda só sob pedido.
- **Prior art:**
  - Testes E2E do chat, da câmera e do P2P (três instâncias, brokers reais e túnel simulado).
  - Teste de perfil de membro, que mede quadros e RMS de áudio antes e depois de interações.
  - Unitários de servidor e de preferências.
- **Sempre que a UI mudar,** valide no código-fonte e também no app empacotado (`win-unpacked`) antes de dizer que o instalador tem a mudança.

## Out of Scope

- Lembrar o estado recolhido da barra lateral entre sessões.
- TURN próprio, ou qualquer servidor para melhorar a rota da voz.
- Cancelamento de eco ou ruído além do que o Chromium já faz.
- Push-to-talk, atalho de mute global e detecção de voz com limiar configurável.
- Histórico persistente do chat, reações, menções e edição de mensagens.
- Cor tema compartilhada com a sala, ou aplicada ao favicon e ao ícone do executável.
- Corrigir a instabilidade antiga de reinício de várias streams no modo compatibilidade.
- Publicação: commit, push, tag e release só com pedido explícito da dona do app.

## Further Notes

- Pendências de validação:
  - voz entre duas máquinas físicas e redes distintas (eco, atraso, relay);
  - microfone e câmera físicos trocados no modal;
  - arquivo grande no chat entre duas máquinas.
- O microfone fica aberto enquanto a pessoa estiver na sala, inclusive mutada, então o indicador do Windows fica aceso. Isso é esperado e está documentado.
- Cores muito escuras no seletor livre reduzem o contraste de textos em destaque. Não há trava; é uma escolha consciente.
- Spec local, sem issue no GitHub, a pedido da dona do app.
