# Contratos da arquitetura

Consulte apenas para alterações de captura, áudio, transporte, permissões ou empacotamento.

## Autoridade e captura

- O processo principal Electron possui a autoridade para seleção nativa, captura e túnel. A interface tem isolamento de contexto, sandbox e API restrita em preload.
- O servidor interno escuta em loopback com porta dinâmica. Chave do transmissor é disponibilizada somente à janela própria via IPC; visitante usa chave de convite distinta.
- Administração HTTP exige origem local sem cabeçalhos de proxy e chave do transmissor. A página pública não recebe essas credenciais.
- Convite curto e link legado são capacidades distintas somente de visitante, revogadas atomicamente. `public/invites.js` compartilha geração/parsing entre servidor e interface: reconstrói somente um nome DNS válido sob `trycloudflare.com`; não consulta encurtador nem endpoint público de resolução. Sessão protegida retorna `guestInvite` para exibição/cópia e preserva `guestLink` legado. Chave curta tem 128 bits aleatórios, independente da chave legada de 256 bits.
- Captura inicia após seleção explícita. Encerrar transmissão, mudar de modo ou fechar o app deve liberar tracks, encoder e qualquer processo auxiliar de áudio.

## Mídia

- Uma sessão negocia WebRTC e identifica mensagens por sessão; falha de conexão permite fallback WebSocket. Não mudar as regras de convites para acrescentar qualidade ou áudio.
- Compatibilidade recebe fluxo contínuo MediaRecorder/WebM e usa MediaSource no espectador. Reconexão exige cabeçalho/encoder novos; não descartar chunks arbitrariamente de um fluxo ativo.
- Buffers são limitados; ao excesso, recuperar conexão ou informar insuficiência de upload, sem acumular mídia indefinidamente.
- Bitrate WebRTC é limite máximo e MediaRecorder recebe uma taxa alvo; nenhum deles garante consumo constante ou FPS real. Resolução maior não deve implicar detalhe inventado de uma fonte menor.

## Áudio específico

- O loopback Electron cobre o computador inteiro. A opção específica usa helper C# próprio com WASAPI process-loopback, incluindo a árvore de filhos; exige Windows build 20348+ (Windows 11).
- Helper transmite PCM estéreo 48 kHz por pipe/IPC; um AudioWorklet com buffer limitado entrega uma track ao mesmo caminho WebRTC/MediaRecorder. Microfone permanece opcional e pode ser misturado.
- O usuário deve saber qual app é a fonte sonora, inclusive ao compartilhar um monitor inteiro. Falha na captura específica deve mostrar erro; não incluir automaticamente sons de outros apps.
- Captura de áudio ao vivo deve alimentar a transmissão em memória, sem gerar gravação de áudio em disco.
- Eventos de áudio/vídeo separados podem cancelar promises de play. Não substituir a mesma `srcObject` em cada evento de track e não silenciar por AbortError; preservar o mute escolhido pelo espectador.
- Em compatibilidade, dividir blobs grandes em mensagens de até 1 MiB, na ordem original. Guardar poucos segundos de mídia antiga para evitar esgotar o SourceBuffer com bitrates altos.

## Distribuição e validação

- Portátil embute Electron e Cloudflared; o binário Cloudflared é obtido do release oficial com SHA-256 verificado.
- Testes de mídia devem observar imagem em movimento e áudio decodificado. Uma faixa de áudio existente sozinha não confirma reprodução audível.
- O wrapper portátil NSIS não é lançado de forma confiável pelo `_electron.launch` do Playwright: o teste do portátil usa processo normal e conexão CDP. O app descompactado usa `_electron.launch`.
- Encerramento do servidor deve fechar também preconexões TCP sem cabeçalhos HTTP, que podem manter o processo vivo após a janela fechar.
