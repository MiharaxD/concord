# Verificação local após relato de bloqueio no download

Data: 06/10/2026. Esta verificação não identifica o motivo do bloqueio no computador do destinatário.

- Arquivo: `dist/Concord-0.1.0-Windows.exe`.
- SHA-256: `0a618df4ca40f468e56067397044205d41a8c08a79a759527639f8cb22eccfe7`, igual ao executável originalmente entregue.
- Assinatura digital: ausente.
- Microsoft Defender: antivírus e proteção em tempo real ativos; definições `1.459.574.0`.
- Scanner: `MpCmdRun.exe`, plataforma `4.18.26080.4-0`.
- Varredura do executável portátil: saída `found no threats`, código de saída 0.
- Varredura de `dist/win-unpacked`, incluindo os componentes descompactados: saída `found no threats`, código de saída 0.
- As varreduras usaram `-DisableRemediation` para preservar os arquivos. Essa opção desativa a remediação da varredura, não a proteção do antivírus.
- Não foram criadas exclusões nem desativadas proteções. Não foi enviado o executável a um serviço externo de análise.
- Nenhuma detecção local do Defender para caminhos contendo Concord ou cloudflared apareceu na consulta ao histórico após a varredura.

O resultado de um scanner não garante ausência de malware e não permite classificar o alerta do destinatário como falso positivo. Ainda falta o texto exato do alerta e, caso seja uma detecção do antivírus, o nome da ameaça e o produto responsável.

Distinção documentada pelo Google:

- O Drive tem limite de verificação de 100 MB. O executável tem aproximadamente 124,4 MB; um aviso de que não foi possível verificar vírus pode decorrer desse limite. Isso é diferente de uma detecção de ameaça: https://support.google.com/drive/answer/141702?hl=pt-BR
- No Chrome, os erros “Vírus detectado” e “Falha na verificação de vírus” indicam bloqueio pelo antivírus do computador: https://support.google.com/chrome/answer/2898334?hl=pt-BR
