# Working on the emulators

The MIPS, RISC-V, M68K, X86 and Z80 emulators (the Cores) are Git submodules under `packages/`, each
pinned to the revision the app uses and each in its own repository. The app depends on them as
workspace packages ([ADR 0043](./adr/0043-the-repository-is-a-workspace-of-its-packages.md)), so it
always runs the checked-out revisions: a change to a Core reaches the app on its next build, with no
release in between.

| Directory         | Repository                                      | npm package                           | Build                                                        |
| ----------------- | ----------------------------------------------- | ------------------------------------- | ------------------------------------------------------------ |
| `packages/mips`   | [Specy/mars](https://github.com/Specy/mars)     | `marsjs/ts` (`@specy/mips`)           | Maven and TeaVM, then tsup (`build:all`)                     |
| `packages/risc-v` | [Specy/rars](https://github.com/Specy/rars)     | `rarsjs/ts` (`@specy/risc-v`)         | Maven and TeaVM, then tsup (`build:all`)                     |
| `packages/m68k`   | [Specy/s68k](https://github.com/Specy/s68k)     | `ts-lib` (`@specy/s68k`)              | `cargo test`, wasm-pack, then tsc (`build-all`)              |
| `packages/x86`    | [Specy/x86-js](https://github.com/Specy/x86-js) | `blink-js` (`@specy/x86`)             | tsdown over the checked-in WASM (`build`)                    |
| `packages/z80`    | [Specy/trs80](https://github.com/Specy/trs80)   | `packages/z80-machine` (`@specy/z80`) | `npm ci`, then vite, bundling the z80-* packages from source |

## Setup

Clone everything at once:

```bash
git clone --recurse-submodules https://github.com/Specy/asm-editor.git
```

For an existing clone, initialize the submodules with:

```bash
git submodule update --init --recursive
```

Then install the toolchains with [mise](https://mise.jdx.dev/), which reads the versions pinned in
`mise.toml` (the JDK and Maven that compile MARS and RARS through TeaVM, Rust with its WebAssembly
target and wasm-pack for s68k, Node.js and pnpm), and the workspace:

```bash
mise install
pnpm install
```

## Building

`pnpm dev`, `pnpm build` and `pnpm test` build the Cores before the app, through the root's
`build:<core>` tasks in `vite.config.ts`. Each task runs the build its Core's own CD runs, in the
table above. Vite+ caches each one by its sources, so a Core that did not change restores its
`dist` instead of building again. To build them on their own:

```bash
pnpm cores:build
vp run build:m68k # or one of them
```

After rebuilding a Core while the dev server runs, restart the server so Vite loads the new build.

X86's `build` uses the WASM checked into `blink-js/src/wasm`. When the Blink C sources change,
`pnpm --filter @specy/x86 run build:wasm` rebuilds it, which needs the Emscripten toolchain.

trs80 is an npm workspace of 20 packages that resolve one another through its own root, so it is not
part of the pnpm workspace: its build task installs it from its own lockfile, and the app links
`@specy/z80` from `packages/z80/packages/z80-machine`.

## Testing a Core

Each Core keeps its own tests. Build it first, then run them in its package:

```bash
vp run build:mips
pnpm --filter @specy/mips test
```

For Z80, run `npx vitest run packages/z80-` in `packages/z80`, which runs the suites of the packages
`@specy/z80` bundles (`npm test` there runs upstream's TRS-80 suites too).

## Updating a submodule

Commit Core changes in the Core's own repository first, then commit the updated submodule pointer
in this repository:

```bash
cd packages/m68k
git add .
git commit
git push
cd ../..
git add packages/m68k
git commit
```

Anyone checking out that parent commit obtains the matching Core revision with
`git submodule update --init --recursive`.

The Cores still publish to npm from their own repositories' CD, for other users of the packages; the
app does not wait for a release.
