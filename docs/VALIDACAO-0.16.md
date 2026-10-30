# Validação — ChessPratica 0.16.0, Entrega A

Executada em Windows, em 30/10/2026, contra o código deste fork.

| Verificação                                                    | Resultado efetivo                                    |
| -------------------------------------------------------------- | ---------------------------------------------------- |
| TypeScript do projeto desktop (`tsc --noEmit`)                 | Aprovado                                             |
| TypeScript da PWA (`tsc --project tsconfig.pwa.json --noEmit`) | Aprovado                                             |
| Vitest                                                         | **119 testes aprovados em 20 arquivos**              |
| Build de produção Vite + service worker                        | Aprovado; 17 itens em precache, cerca de 3,7 MiB     |
| Playwright no build de produção                                | **5 cenários aprovados**, 22,5 segundos              |
| Manifesto/instalabilidade Chrome                               | Sem erros em perfil normal temporário isolado        |
| Formatação dos arquivos alterados                              | Aprovada, 65 arquivos verificados                    |
| Oxlint do código novo compartilhado, PWA e scripts             | Aprovado sem avisos                                  |
| Oxlint global                                                  | Sem erros; há avisos preexistentes no código desktop |
| Extração de traduções em modo CI                               | Aprovada, sem alterações pendentes                   |
| `git diff --check`                                             | Aprovado                                             |

## Cobertura que sustenta o resultado

Os testes unitários cobrem legalidade, mate, continuação completa, variantes
aceitas, respostas conceituais/planos múltiplos, versão efetiva da API FSRS,
serialização de datas, atualização atômica, revisão concorrente, reimportação,
versões de gabarito, reconciliação, migração Dexie, migração de cartões/logs
desktop, backup/restauração e exportação PGN com comentários e variantes.

Os cinco cenários de navegador executam:

1. Mate por cliques reais no Chessground, Stockfish local com internet bloqueada,
   rating, recarregamento, exportação e restauração em perfil vazio.
2. PGN com comentários/variantes, réplica automática obrigatória, rejeição de
   lance legal fora do gabarito, preservação do erro e reimportação sem duplicatas.
3. Tela de 390 × 844, dois planos estratégicos corretos e ausência de overflow
   horizontal. É emulação de viewport, não um teste físico de Android.
4. Manifesto e critérios de instalação em Chrome normal isolado. Não instala
   o aplicativo no perfil pessoal do usuário.
5. Autoria por FEN/SAN, publicação, estudo da continuação e exportação PGN offline.

As requisições não locais do primeiro cenário e dos perfis adicionais são
bloqueadas; os cenários de treino passam com o contexto sem rede após o cache.
O antivírus do computador de teste injeta uma tentativa de requisição externa;
ela também é bloqueada. A exceção na asserção identifica somente essa injeção
do ambiente e não permite tráfego. Nenhuma configuração de segurança foi alterada.

## Falhas encontradas e resolvidas

- Resolução de `workbox-window` sob pnpm: dependência direta fixada em 7.4.1.
- Checkbox de estratégia: captura do valor antes da atualização funcional React.
- Navegação após restaurar: espera explícita pela publicação e proteção contra
  troca de tela que sobrescrevia uma escolha posterior do usuário.
- Ordem inicial dos exercícios: campo pedagógico `order`, preservado na fila.
- Navegação duplicada na acessibilidade móvel: menu lateral oculto nesse tamanho.
- Os testes de diretório do desktop recebem EPERM no sandbox Windows; passaram
  com a execução autorizada fora dele, usando apenas diretórios temporários.

O build emite avisos de bundle JavaScript acima de 500 kB e base Browserslist
antiga. Não houve falha de build. Não foi compilado localmente um novo instalador
Tauri, pois Rust/MSVC não estão disponíveis neste computador; a ponte possui
workflow Windows separado. O workflow PWA também foi acrescentado, mas a execução
local acima é a evidência desta entrega, sem presumir resultado remoto.

## Escopo e limitações

A Entrega A está implementada. PDF.js, OCR, editor de diagramas digitalizados e
uma segunda PWA especializada pertencem à Entrega B, ainda pendente. Não há IA
redigindo conteúdo nem sincronização entre dispositivos. Instalação Android real
e hospedagem HTTPS pública ainda precisam ser verificadas nesse ambiente.

O antigo fork não possuía banco Dexie: a ponte de migração Tauri é separada da
migração interna Dexie 1 → 2 testada. Não houve leitura, exclusão ou substituição
dos dados pessoais do desktop durante os testes.
