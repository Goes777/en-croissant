# ChessimoFree para Windows

O fork é instalado como **ChessimoFree**, mantendo os componentes e o visual do
En Croissant. A versão 0.15.2 corrige a permissão de leitura de metadados usada
na importação de PGNs; a base original do fork é a versão 0.15.1.

## Compilação automática

O workflow **ChessimoFree Windows preview** compila a branch feature/pgn-courses
num runner Windows x64 com Rust e Visual C++. Depois dos testes e da compilação,
o artefacto ChessimoFree-windows-x64 contém:

- O instalador NSIS `ChessimoFree_0.15.2_x64-setup.exe`.
- O SHA-256 do instalador e a revisão exata do código em SOURCE.txt.

Os artefactos ficam disponíveis durante 30 dias na página da execução em
[Actions](https://github.com/Goes777/en-croissant/actions/workflows/windows-preview.yml).
O workflow não publica releases nem precisa de chaves de assinatura do upstream.
O instalador de prévia não tem assinatura de código do Windows.

O pipeline verifica os comandos de arquivo usados pelo módulo de cursos contra
os manifestos de permissões gerados pelo próprio Tauri. Essa verificação é
adicional aos testes de importação e progresso, que simulam o acesso nativo.

## Instalação separada

- Executável: chessimofree.exe.
- Identificador Tauri: io.github.goes777.chessimofree.
- Pasta padrão de estudos: Documentos/ChessimoFree.
- Configurações, bases e engines usam a pasta de dados do identificador próprio.
- Protocolo: chessimofree://import?url=… . O protocolo encroissant não é registado
  por esta versão.
- Atualizações automáticas do En Croissant estão desativadas. As prévias são
  atualizadas por instalação manual de um novo instalador do fork.
  O comando **Verificar atualizações** abre a página das compilações do fork.

As pastas personalizadas escolhidas nas configurações continuam a ser respeitadas.
O instalador não migra automaticamente cursos nem configurações de outra versão.
A licença GPL-3.0 e os créditos ao projeto original permanecem no repositório e
na janela Sobre.

## Compilar neste computador

Instale os pré-requisitos do Tauri: Rust MSVC, Visual Studio Build Tools com C++
e o Windows SDK. Depois execute na raiz do repositório:

    pnpm install --frozen-lockfile
    pnpm test
    pnpm exec tauri build --bundles nsis --ci

O instalador é criado em src-tauri/target/release/bundle/nsis. O comando
pnpm build-vite compila apenas a interface e não cria um aplicativo Windows.
