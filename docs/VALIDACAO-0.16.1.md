# Validação — Táticas Iniciante, ChessPratica 0.16.1

Executada localmente em Windows, em 30/10/2026.

## Material convertido

- **1.312 exercícios únicos**, 26 tipos de treino, cinco etapas.
- **46 exemplos didáticos**, com suas posições e comentários, sem cartões FSRS.
- **331 exercícios de mate** com xeque-mate confirmado nas continuações aceitas.
- Nenhum item rejeitado na preparação do módulo.
- Os PGNs por tema/etapa não foram somados à coleção completa: são organizações
  alternativas dos mesmos registros. A identidade usa coleção + SourceRecord.
- Os dois PGNs originais ficam preservados no pacote pessoal e no backup.

O arquivo completo fornecido tem SHA-256
`188105e9254c4cdd860a1738fa322bd0e6d9eee8357fd0338553d6d808376c5a`.
O módulo JSON gerado tem 3.467.197 bytes e fingerprint
`7dd2ddec2f50ac68b9f4389bc0ef67666528d970a836e1300ddd8bc9fcc4ff0a`.

## Verificações executadas

| Verificação                                           | Resultado                                         |
| ----------------------------------------------------- | ------------------------------------------------- |
| TypeScript desktop e PWA                              | Aprovados                                         |
| Vitest completo                                       | **123 testes aprovados em 21 arquivos**           |
| Playwright final, com módulo pessoal e rede bloqueada | **6 cenários aprovados, 34,4 s**                  |
| Formatação do código PWA/domínio/infraestrutura       | Aprovada, 35 arquivos na última verificação       |
| Oxlint do código novo e alterado da PWA/domínio       | Sem erros ou avisos                               |
| Extração de traduções em modo CI                      | Sem alterações pendentes                          |
| Build Vite + service worker                           | Aprovado; 18 recursos em precache, cerca de 7 MiB |
| `git diff --check`                                    | Aprovado                                          |

O teste novo usa o curso completo: abre o módulo offline, confere as contagens,
filtra Etapa 1 (120 exercícios) e Mate com torre (12), resolve o primeiro mate,
escolhe Bom, avança ao segundo exercício, recarrega e reabre o módulo. Confere
46 exemplos separados, seta PGN no tabuleiro e a apresentação em viewport móvel.
O backup contém 1.358 lições, 1.312 cartões e a revisão persistida, sem duplicatas.

Os outros cinco cenários mantêm o treino no tabuleiro, Stockfish local, variantes,
rejeição de lance fora do gabarito, estratégia com dois planos, backup/restauração,
instalabilidade Chrome e autoria por FEN/PGN. Os perfis são temporários; os testes
não usaram nem alteraram o perfil pessoal do usuário.

O teste de curso pessoal é habilitado por `CHESSPRATICA_PRIVATE_TESTS=1`. Em um
checkout público sem os arquivos particulares ele é explicitamente ignorado;
os testes unitários do formato usam exemplos autorais independentes da coleção.

## Ajustes encontrados durante a validação

- A prévia anterior na porta 1431 poderia ser reutilizada pelo Playwright.
  Os testes agora iniciam seu próprio servidor na porta 1432 e recusam reutilização.
- Os filtros Mantine foram selecionados pelo papel de combobox, evitando
  ambiguidade entre o campo e a lista acessível com o mesmo rótulo.
- A seta vertical tem largura geométrica zero em SVG, apesar do traço visível.
  O teste verifica o contêiner visível, o marcador da seta e a captura visual.
- Comentários duplicados entre a posição atual e a explicação não são exibidos
  duas vezes no estudo.

O build ainda informa o aviso de chunk principal acima de 500 kB e Browserslist
antigo. Não houve falha de build. A versão é PWA; não foi compilado um instalador
Tauri novo. PDF/OCR permanece fora deste trabalho.

Os PGNs pessoais estão em `local-courses/`, ignorado pelo Git. O pacote local
inclui o módulo solicitado; o código-fonte público não publica essa coleção.
Nenhum arquivo original do Desktop foi modificado.
