# Working on the emulators

The MIPS, RISC-V, M68K, X86, and Z80 repositories are included under `emulators/` as Git
submodules. They are pinned to the revisions used by the app so emulator and editor changes can be
developed together.

The app's `package.json` deliberately continues to depend on the published `@specy/*` packages.
Consequently, a normal `npm install`, CI build, or deployment does not need the submodules and uses
the registry packages. Local emulator use is explicit and does not modify `package.json` or
`package-lock.json`.

Emulator fixes belong in these submodules. The app no longer rewrites installed package bundles
with postinstall patch scripts; publish a new emulator package before selecting that version for a
registry-backed deployment.

## Initial setup

Clone everything at once:

```bash
git clone --recurse-submodules https://github.com/Specy/asm-editor.git
```

For an existing clone, initialize the submodules with:

```bash
npm run emulators:init
```

If you use [mise](https://mise.jdx.dev/), install the repository's pinned Java and Maven toolchain
before building MIPS or RISC-V:

```bash
mise install
```

## Build and use a local emulator

Build only the emulator you are changing, then replace its installed npm package with a local
symlink. For example:

```bash
npm run emulators:build:m68k
npm run emulators:local -- m68k
npm run dev
```

Valid local-link names are `mips`, `risc-v` (or `riscv`), `m68k`, `x86`, and `z80`. To build or link
all five emulators, use:

```bash
npm run emulators:build
npm run emulators:local
```

Check which implementation is active at any time:

```bash
npm run emulators:status
```

After rebuilding a linked emulator, restart the dev server so Vite reloads the package. Running the
link command again also clears Vite's dependency cache.

MIPS and RISC-V need a JDK and Maven because their Java cores are compiled through TeaVM; both are
pinned in `mise.toml`. M68K needs Rust and `wasm-pack`. Rebuilding X86's TypeScript package uses its
checked-in WASM artifact; use `npm run emulators:build:x86:wasm` when the Blink C sources change,
which also requires the Emscripten toolchain. Z80 installs and builds from the TRS80 npm workspace.

## Return to registry packages

To remove the local symlinks and reinstall the package-lock versions from npm, run:

```bash
npm run emulators:registry
```

This is also the deployment behavior: local emulator sources are never selected automatically.

## Updating a submodule

Commit emulator changes in its own repository first, then commit the updated submodule pointer in
this repository:

```bash
cd emulators/m68k
git add .
git commit
git push
cd ../..
git add emulators/m68k
git commit
```

Anyone checking out that parent commit can obtain the matching emulator revision with
`npm run emulators:init`.
