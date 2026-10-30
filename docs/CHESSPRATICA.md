# ChessPratica 0.16 — PWA offline

O destino do projeto passou a ser uma PWA instalável no computador e no celular,
por decisão do usuário em 30/10/2026. A implementação reaproveita React, Mantine,
Chessground, chessops e a leitura rigorosa de PGN do fork En Croissant. O código
desktop continua disponível como ponte de migração; seus dados não são apagados.

## Usar e instalar

Para desenvolver: `pnpm install --frozen-lockfile` e `pnpm dev:pwa`.
Para usar a versão offline: `pnpm build:pwa` e `pnpm preview:pwa`.
Abra **http://127.0.0.1:1431/**, espere **Disponível offline** e use o botão
Instalar ou a opção de instalação do Chrome/Edge. Depois do primeiro carregamento,
interface, peças e Stockfish ficam no cache local, sem depender de uma API.

No Android, a mesma pasta `dist-pwa/` precisa ser servida em um endereço **HTTPS**.
Abra esse endereço no Chrome e escolha **Instalar aplicativo**. Um arquivo HTML
aberto diretamente por `file://` ou HTTP de um computador na rede não fornece o
contexto seguro necessário. Esta entrega contém o build para hospedagem estática;
não publica uma URL na internet nem instala silenciosamente em outro dispositivo.

O banco é local a cada origem/perfil/dispositivo. Não há conta nem sincronização
automática. Antes de trocar de endereço ou dispositivo, exporte o backup completo.
Não existe coleta de telemetria na PWA; a inicialização PostHog do desktop foi removida.

## Primeiro curso

1. Em Hoje, **Adicionar fundamentos guiados** inclui 20 exercícios autorais:
   10 de tática/técnica e 10 de estratégia, com 19 posições distintas.
2. **Importar** reúne vários PGNs em um curso, conservando temas, comentários,
   variantes e a cópia original. A revisão do autor antecede a publicação.
3. Também é possível criar uma posição por FEN e fornecer uma solução em SAN,
   explicação e, nos exercícios conceituais, rubrica.
4. **Cursos → Estudar solução** permite percorrer comentários/variantes e editar
   pergunta, FEN, explicação e gabarito. Alterações de resposta pausam o cartão
   até a reconciliação explícita; versões e revisões anteriores permanecem.

Responda no tabuleiro ou por coordenadas. Apenas continuações expressas no
gabarito são aceitas. Stockfish é uma análise complementar após a resposta.
Na estratégia há múltipla escolha com planos justificados, ordenação de etapas
e explicação com autoavaliação por rubrica. Texto livre não recebe uma suposta
avaliação semântica por motor ou palavras-chave.

Após o feedback, escolha Novamente, Difícil, Bom ou Fácil. O adaptador está fixado
em `ts-fsrs@3.5.1`, usa `repeat(card, now)[rating]` e grava tentativa, evento e
cartão na mesma transação. Tempo de resposta termina antes da leitura do feedback.
As estatísticas distinguem acerto autônomo, ajuda/erro e autoavaliação; repetição
da mesma posição não é apresentada como prova de transferência de aprendizagem.

## Arquivos e dados anteriores

- **Curso JSON** (`chesspratica-course`, versão 1): exercícios e referências,
  sem o histórico pessoal do estudante. Pode ser reimportado.
- **PGN**: posições, comentários e variantes. Não contém a agenda FSRS.
- **Backup completo** (`chesspratica-backup`, versão 1): exercícios, versões,
  fontes, cartões, tentativas, eventos, referências e preferências. A restauração
  mescla registros iguais e recusa conflitos; não substitui histórico divergente.
- **course.json** do desktop: importação direta de curso e temas.
- **ChessPratica-migracao.json**: exportado pelo botão **Exportar para ChessPratica**
  no módulo Cursos da versão desktop atualizada. Inclui progresso manual e somente
  os cartões/logs locais de repertório (`deck-*`), sem credenciais de contas.
  A PWA mantém a agenda original desses cartões e arquiva os logs anteriores sem
  inventar tempos ou tentativas que o programa antigo não registrava.

O executável desktop 0.15.2 não tem o novo botão de migração. É necessário compilar
a ponte atualizada ou importar os arquivos PGN/course.json manualmente. O projeto
mantém o identificador nativo `io.github.goes777.chessimofree`, o nome binário técnico
e a pasta Documents/ChessimoFree para continuar encontrando os dados existentes.
Não renomeie essas pastas para migrar.

O repositório real era Tauri, não uma PWA com Dexie v2. Portanto, esta entrega
introduz o banco `ChessPraticaTraining`, com uma migração explícita/testada de seu
esquema inicial 1 para 2. A migração dos dados Tauri usa a ponte acima; não se
declara uma migração de uma base Dexie antiga que nunca existiu neste fork.

## Validação e próximos passos

O relatório [VALIDACAO-0.16.md](VALIDACAO-0.16.md) registra resultados efetivos.
Os testes de navegador usam o build de produção e bloqueiam a internet.

Esta é a **Entrega A** da especificação v3: tática, estratégia e FSRS. O módulo
PDF/OCR da **Entrega B ainda não foi implementado**. Sua próxima etapa deve usar
PDF.js, Tesseract local por/eng, um PDF autorizado e revisão humana de diagramas,
reutilizando os mesmos Exercise, SourceAnchor e adaptador de agendamento.
Também não há uma segunda PWA, IA local ou reconhecimento automático de diagramas.

O código é uma derivação GPL-3.0 do En Croissant. Veja [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
