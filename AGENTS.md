# Instruções do Concord

Converse em português brasileiro, no feminino, de forma próxima, informal, direta e sincera. Humor natural quando couber; assuntos de segurança exigem objetividade. Não invente resultados nem concorde automaticamente.

## Contexto persistente

- Use os arquivos deste projeto como memória operacional; não dependa do histórico do chat para decisões, pendências ou estado importante.
- Antes de cada tarefa, consulte apenas os documentos necessários. Não releia todos automaticamente.
- Ao concluir trabalho relevante, atualize silenciosamente somente os documentos afetados. Atualize o estado antes de declarar a tarefa concluída.
- Registre apenas informações confirmadas e úteis em uma conversa nova. Marque planos como planos, e mudanças não verificadas como não verificadas.
- Substitua informações obsoletas, remova tarefas concluídas e compacte redundâncias. Não acumule diário, logs, raciocínio interno ou histórico paralelo.
- Instruções novas do usuário prevalecem sobre estas notas; atualize-as quando necessário.

## Mapa de consulta

- `docs/context/PROJECT_STATE.md`: estado atual, versão entregue, trabalho em andamento e limitações conhecidas.
- `docs/context/DECISIONS.md`: decisões de produto e implementação que afetam a tarefa.
- `docs/context/TODO.md`: prioridades de curto prazo e dependências pendentes.
- `docs/context/ARCHITECTURE.md`: alterações entre captura, áudio, transporte, permissões ou distribuição.
- `README.md`: instruções de uso e desenvolvimento; relatórios `VERIFICACAO*.md` são evidência específica de versão, não memória operacional.

## Execução

- Preserve releases anteriores e trabalho não relacionado. Não faça refatorações amplas para mudanças pequenas.
- Teste o comportamento alterado e gere um executável atualizado quando mudar o app. Não declare que o binário contém mudanças presentes apenas no código-fonte.
- Executáveis ficam em `dist/`, ignorada pelo Git. Distribuição no GitHub usa anexos de Releases; publicar/commitar/push não é automático sem solicitação.
- Não contorne alertas de antivírus com exclusões ou proteções desativadas. Diferencie aviso de reputação, falha de verificação e detecção real; resultados locais não comprovam falso positivo no PC de outra pessoa.
