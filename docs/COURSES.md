# Cursos a partir de PGN

A seção **Cursos**, identificada pelo ícone de livros na barra lateral, utiliza os
componentes e o tabuleiro do En Croissant. Um curso pode reunir vários ficheiros
PGN e vários temas.

## Criar e estudar um curso

1. Abra **Cursos → Importar PGNs como curso**.
2. Defina o nome e a descrição e selecione um ou mais PGNs.
3. Escolha o tema e o lado de treino de cada ficheiro. As etiquetas opcionais
   Topic ou Theme do PGN têm prioridade sobre o tema do ficheiro.
4. Confirme **Criar curso**. Cada partida ou posição do PGN torna-se uma lição.
5. Use **Estudar** para ler os lances, comentários e variações no tabuleiro original.
6. Use **Treinar** para abrir o painel de treino de repertório existente. Inicie a
   prática nesse painel; ele utiliza as continuações principais como respostas e
   mantém as revisões de cada lição separadas.
7. Marque uma lição como concluída na biblioteca ou na barra acima do tabuleiro.
   A barra também permite regressar ao curso e abrir a próxima lição.

A conclusão é uma marcação manual de estudo. Ela é independente das estatísticas
e da agenda de revisão do treinador.

Os exemplos em docs/examples/fundamentos.pgn e docs/examples/finais.pgn podem
ser selecionados juntos para experimentar um curso com desenvolvimento, mate e
promoção.

## Conteúdo suportado

- Xadrez padrão, incluindo posições iniciais definidas por FEN e pretas a jogar.
- Vários PGNs num curso e várias partidas por PGN.
- Comentários, variações e anotações preservados no texto original de cada lição.
- Nome da lição a partir de Title, Chapter, Event ou dos jogadores.
- Validação de lances na linha principal e nas variações antes de importar.
- Lições teóricas com comentário ou FEN, mesmo sem lances; ficam disponíveis para
  estudo e não recebem um treino de lances inventado.
- Limite de 20 MB por ficheiro. Cursos grandes usam paginação de 25 lições.

## Armazenamento local

Os cursos ficam na subpasta courses da pasta de documentos configurada no En
Croissant. Cada curso tem um identificador próprio e contém:

- course.json: estrutura do curso e PGN completo de cada lição.
- Um PGN de origem por ficheiro importado, com nome baseado no identificador.
- progress.json: conclusões e última lição aberta.

Depois de importar, o curso funciona mesmo que os ficheiros selecionados sejam
movidos. Os originais selecionados não são alterados. Os estudos abertos no
tabuleiro são independentes: **Guardar PGN** exporta uma cópia.

A importação só aparece na biblioteca depois de terminar. Se ela falhar, a pasta
temporária dessa importação é removida. O progresso é substituído por gravação
temporária e renomeação, e as gravações são sequenciais para evitar perda de
conclusões simultâneas.

## Desenvolvimento e verificação

    pnpm install --frozen-lockfile
    pnpm lint
    pnpm test
    pnpm build-vite

O aplicativo desktop continua a precisar dos [pré-requisitos do
Tauri](https://v2.tauri.app/start/prerequisites/), incluindo Rust e as ferramentas
C++ no Windows. O comando pnpm build gera o aplicativo nativo; build-vite
compila apenas a interface.

Os testes de armazenamento simulam as chamadas do Tauri, usam ficheiros
temporários reais e verificam importação, recuperação após falha, persistência e
gravações concorrentes. Os testes de conteúdo validam FEN, comentários, variações,
lances ilegais e isolamento das revisões.

## Próximas extensões

Dicas didáticas progressivas, desbloqueios, editor de cursos e distribuição de
pacotes são extensões futuras. Esta primeira implementação organiza os PGNs e
reutiliza o modo de estudo e treino já disponível.
