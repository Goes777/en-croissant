# ChessPratica — autoria, licenças e fontes

ChessPratica é uma versão modificada do **En Croissant**, de Francisco Salgueiro
e colaboradores, mantida no fork https://github.com/Goes777/en-croissant.
As alterações para cursos começaram em 26/10/2026; a PWA ChessPratica, em 30/10/2026.
Os avisos originais e a licença GPL versão 3 em `LICENSE` são mantidos.

## Componentes distribuídos

A versão 0.17.0 acrescenta Better Auth 1.7.14 (MIT), SQLite nativo do Node e um
servidor local empacotado. Os avisos de Better Auth e suas dependências acompanham
`THIRD-PARTY-LICENSES.txt`. Fonte: https://github.com/better-auth/better-auth.

| Componente                | Versão usada                      | Licença / fonte                                                                            |
| ------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| En Croissant              | base deste fork                   | GPL-3.0; https://github.com/franciscoBSalgueiro/en-croissant                               |
| Chessground               | resolução exata no pnpm-lock.yaml | GPL-3.0; https://github.com/lichess-org/chessground                                        |
| chessops                  | resolução exata no pnpm-lock.yaml | GPL-3.0; https://github.com/niklasf/chessops                                               |
| ts-fsrs                   | 3.5.1, fixada                     | MIT; https://github.com/open-spaced-repetition/ts-fsrs                                     |
| Dexie                     | 4.4.7, fixada                     | Apache-2.0; https://github.com/dexie/Dexie.js                                              |
| React / Mantine / Vite    | resoluções no lockfile            | MIT; fontes identificadas nos respectivos pacotes                                          |
| vite-plugin-pwa / Workbox | 2.0.0 / 7.4.1                     | MIT; https://github.com/vite-pwa/vite-plugin-pwa e https://github.com/GoogleChrome/workbox |
| Stockfish.js              | npm 19.0.1, variante lite-single  | GPL-3.0; fonte correspondente abaixo                                                       |

O motor local é copiado sem alterações de `stockfish@19.0.1`, arquivos
`bin/stockfish-19-lite-single.js` e `.wasm`. A licença está em
`pwa/public/engine/COPYING.txt`. O código-fonte e scripts de compilação correspondem
à tag `v19.0.1`, commit `0d5dd7944f88c817c07a26bc4fb1905d5f9c46d6`:

- Fonte: https://github.com/nmrugg/stockfish.js/tree/0d5dd7944f88c817c07a26bc4fb1905d5f9c46d6
- Arquivo completo: https://github.com/nmrugg/stockfish.js/archive/0d5dd7944f88c817c07a26bc4fb1905d5f9c46d6.tar.gz
- Instruções e scripts: README.md, build.js e `npm run build-single-lite` nessa revisão.

Peças Cburnett (Colin M. L. Burnett), Merida e texturas/ícones foram reutilizados
dos recursos distribuídos pelo En Croissant. Os respectivos avisos dos recursos
originais devem acompanhar redistribuições; esta versão não reivindica sua autoria.

Os 20 exemplos introdutórios são conteúdo autoral do projeto, com posições e
explicações criadas para teste/estudo. PGNs ou livros particulares do usuário não
foram incluídos no build nem publicados. Exportações de cursos são ações locais.

Ao distribuir o build, distribua também o código-fonte correspondente deste fork,
o lockfile, as licenças e o acesso ao código-fonte correspondente do motor acima.
O build de navegador não dispensa as obrigações de distribuição da GPL.
