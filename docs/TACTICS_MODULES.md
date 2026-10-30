# Módulos de tática — ChessPratica 0.16.1

A biblioteca pode incluir módulos pessoais junto com a PWA. Em **Cursos**, abra
o cartão do módulo para acrescentar suas lições e cartões à biblioteca local.
O carregamento é feito uma vez; reabrir o módulo conserva a agenda e o histórico.

## Táticas Iniciante

A versão local preparada a pedido do usuário inclui os PGNs fornecidos:

- 1.312 exercícios únicos, em 26 tipos de treino e cinco etapas;
- 46 exemplos didáticos, separados dos cartões de revisão;
- 331 exercícios com objetivo de mate confirmado nas soluções aceitas;
- posições, comentários, símbolos e variantes preservados no PGN original;
- filtros por etapa, tipo de treino e exemplos/exercícios;
- objetivos específicos e dicas graduais; solução em SAN após a resposta;
- avanço para o próximo exercício do filtro atual após escolher a avaliação FSRS;
- setas PGN mostradas no tabuleiro de estudo.

As coleções completa, por tema e por etapa repetem o mesmo conteúdo. O módulo usa
uma cópia de cada exercício, identificada por coleção e `SourceRecord`, mantendo
a ordem original. A importação de outra organização no mesmo curso reutiliza os
mesmos identificadores. Não cria três conjuntos de cartões para a mesma coleção.

Variantes com NAG de erro (`$2`, `$4`, `$6`) ficam no estudo e não integram o
gabarito. O marcador terminal `--` é preservado como anotação didática; não é
considerado um lance legal. Um `--` no meio de uma continuação é recusado para
revisão manual. Os diagramas introdutórios não recebem soluções inventadas.
O leitor desktop continua estrito por padrão; essa adaptação é explícita na PWA.

Os comentários recuperados mantêm seu idioma original, inclusive os exemplos em
russo. Não foi acrescentada uma tradução atribuída ao autor nem uma nova análise
do motor apresentada como solução da fonte.

Nos exemplos sem cabeçalhos de tema e etapa, a organização usa a seção do próximo
exercício na ordem de `SourceRecord`. Essa associação da biblioteca não altera o
PGN original nem pretende ser um cabeçalho extraído que não existia na fonte.

## Empacotamento local

O código público não contém os PGNs pessoais. A pasta `local-courses/` é ignorada
pelo Git. Para preparar o módulo com os arquivos locais autorizados:

```sh
node scripts/prepare-tactics-course.mjs caminho/exercicios.pgn caminho/exemplos.pgn
pnpm build:pwa
```

O conversor valida todas as partidas antes de gerar
`local-courses/taticas-iniciante.json`. O Vite inclui esse arquivo como recurso
local da PWA e o service worker o guarda para uso offline. Uma compilação sem essa
pasta continua funcional, mas não inclui o conteúdo particular do usuário.

O JSON também pode ser importado manualmente em **Importar**. O backup completo
mantém o curso, as referências, os dois PGNs originais e o histórico FSRS.
Exportar somente um PGN não substitui o backup do progresso.

Os campos adicionais são opcionais para preservar compatibilidade com os cursos
e backups 0.16.0. Não são apagados estudos existentes nem reiniciadas revisões ao
apenas abrir um módulo já carregado.
