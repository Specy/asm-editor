---
status: accepted
date: 2026-10-11
---

# The repository is a pnpm workspace, and the app runs the checked-out Cores

The repository is a pnpm workspace run with Vite+. Every package sits directly under `packages/`: the SvelteKit app in `packages/asm-editor`, the **Runtime library** in `packages/runtime`, and each **Core** in `packages/<core>` (`mips`, `risc-v`, `m68k`, `x86`, `z80`), still a Git submodule of its own repository. The app depends on the Cores with `workspace:*`, so it always runs the checked-out revisions. A change to a Core reaches the app on its next build, and the editor no longer waits for an npm release to use one.

Each Core builds through a task in the root `vite.config.ts` that runs the build its own CD runs (Maven and TeaVM for MARS and RARS, cargo and wasm-pack for s68k, tsdown for Blink, lerna for trs80). The app's `dev`, `build` and `test` tasks depend on them. Vite Task caches each build by its sources and restores only its `dist`, so an unchanged Core costs nothing after the first build, locally and in CI.

The Runtime library is a package rather than a folder the app reaches into. It owns its C sources, the scripts that build and test it, the generated library the app imports, and the two modules both sides used to share out of the app's tree: the compiler contract (`@asm-editor/runtime/compiler-contract`) and the x86 link inputs (`@asm-editor/runtime/x86`). The dependency runs one way, from the app to the runtime and from both to the Cores.

## Considered options

- Absorbing the Core repositories into this one: rejected. Each Core keeps its history, its upstream fork (MARS, RARS and trs80 are forks), its own issues and its npm trusted publishing, which is registered to its repository and its `cd.yml`.
- Keeping the app on released `@specy/*` versions, with local builds linked in by hand as before: rejected. A Core change needed a release and a dependency bump before the editor could ship it, and the published package could drift from the submodule's revision. The price of the choice taken is that every clone, CI run and deploy builds the Cores, which needs Java 21 and Maven, and Rust with wasm-pack. The task cache keeps that to the first build after a change.
- npm workspaces: rejected for pnpm, Vite+'s default. npm has no `workspace:` protocol, so a version that stops matching quietly installs the registry copy instead of the checkout, and its hoisting hides undeclared dependencies.
- trs80 as a pnpm workspace project like the others: rejected. It is an npm workspace of 21 packages whose builds rely on its root's hoisting (`tsc`, `@types/chai`), so declaring them here would mean patching its packages. It installs and builds itself from its own lockfile, as its CD does, and the app links `@specy/z80` with `link:`.

## Consequences

- `pnpm dev`, `pnpm build` and `pnpm test` at the root build the Cores first, with the toolchains `mise.toml` pins, which `mise install` sets up locally and CI installs from the same file. The build output stays at the repository root in `build/`, where the deploy picks it up.
- Cloudflare Pages builds nothing: its build image has no JDK or Rust for the Cores. The Deploy workflow builds every pushed branch and uploads it with Wrangler, `main` as production and any other branch as its preview, and the Pages project's automatic deployments are off.
- A Core's dev dependencies resolve through this workspace's lockfile, not the Core's own `package-lock.json`, which its CD keeps using.
- Paths in documents name the package: `packages/asm-editor/src/...`, `packages/runtime/...`, `packages/<core>/...`. Inside a package, its scripts and comments use paths relative to the package.
