# ChessPratica

PWA de cursos de xadrez, tática, estratégia e revisão FSRS, com dados e motor locais.

**0.16.1:** [módulos de tática, etapas, temas e exemplos didáticos](docs/TACTICS_MODULES.md).

**[Instalação, uso, migração e limites da versão 0.16](docs/CHESSPRATICA.md)** · [Validação](docs/VALIDACAO-0.16.md) · [Licenças](THIRD_PARTY_NOTICES.md)

```sh
pnpm install --frozen-lockfile
pnpm build:pwa
pnpm preview:pwa
```

Abra http://127.0.0.1:1431/ e aguarde “Disponível offline”. Para instalar no celular, sirva `dist-pwa/` em HTTPS. Nenhum serviço de conta ou API é necessário.

O código Tauri e os dados do ChessimoFree são preservados para migração. O texto abaixo documenta o projeto original e seus recursos desktop; esses recursos online não fazem parte da nova PWA.

---

<br />
<div align="center">
  <a href="https://github.com/franciscoBSalgueiro/en-croissant">
    <img width="115" height="115" src="https://github.com/franciscoBSalgueiro/en-croissant/blob/master/src-tauri/icons/icon.png" alt="Logo">
  </a>

<h3 align="center">En Croissant</h3>

  <p align="center">
    The Ultimate Chess Toolkit
    <br />
    <a href="https://www.encroissant.org"><strong>encroissant.org</strong></a>
    <br />
    <br />
    <a href="https://discord.gg/tdYzfDbSSW">Discord Server</a>
    Â·
    <a href="https://www.encroissant.org/download">Download</a>
    .
    <a href="https://www.encroissant.org/docs">Explore the docs</a>
  </p>
</div>

En-Croissant is an open-source, cross-platform chess GUI that aims to be powerful, customizable and easy to use.

## PGN courses fork

This modified version is maintained at [Goes777/en-croissant](https://github.com/Goes777/en-croissant).
The course module was added on 2026-10-26. It adds a Courses sidebar entry, local
imports of multiple PGNs into a course, themes, lessons, manual completion progress,
and access to the existing study board and repertoire trainer.
See the [course guide](docs/COURSES.md) and [sample PGNs](docs/examples).
Original authorship and the GPL-3.0 license are retained.

The legacy desktop fork was named **ChessimoFree** and uses a separate application ID,
data directory, and deep-link scheme. Upstream automatic updates are disabled.
See the [Windows build guide](docs/WINDOWS.md) for preview installers and local builds.

## Features

- Store and analyze your games from [lichess.org](https://lichess.org) and [chess.com](https://chess.com)
- Multi-engine analysis. Supports all UCI engines
- Prepare a repertoire and train it with spaced repetition
- Simple engine and database installation and management
- Absolute or partial position search in the database

<img src="https://github.com/franciscoBSalgueiro/encroisssant-site/blob/master/public/showcase.webp" />

## Building from source

Refer to the [Tauri documentation](https://tauri.app/start/prerequisites/) for the requirements on your platform.

En-Croissant uses pnpm as the package manager for dependencies. Refer to the [pnpm install instructions](https://pnpm.io/installation) for how to install it on your platform.

```bash
git clone https://github.com/franciscoBSalgueiro/en-croissant
cd en-croissant
pnpm install
pnpm build
```

The built app can be found at `src-tauri/target/release`

## Donate

If you wish to support the development of this GUI, you can do so [here](https://encroissant.org/support). All donations are greatly appreciated!

## Contributing

For contributing to this project please refer to the [Contributing guide](./CONTRIBUTING.md).

## License

This software is licensed under GPL-3.0 License.
