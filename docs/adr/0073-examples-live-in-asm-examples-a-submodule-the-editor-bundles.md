---
status: accepted
date: 2026-11-03
---

# Examples live in asm-examples, a submodule the editor bundles

The editor's example Projects move from `packages/asm-editor/examples/` into [Specy/asm-examples](https://github.com/Specy/asm-examples), the owner's public repository for examples ([examples-repository.md](../design/examples-repository.md)).

**Layout.** asm-examples keeps one root folder per Target for examples written for one Target, and `shared/` for examples with several ports: each Target folder inside a shared example is one Project.

**The build.** It packs every port into its own `.asmproj` and writes `dist/index.json`, which maps each example to its ports and each Target to its examples. An example may replace the default with a `build.mjs` that packs one or more archives through the same `pack` function, as asmOS will for x86, RISC-V and MIPS.

**What it needs.** The build is plain Node and never imports the editor:

- **Generated assembly** ships with the Compilation record the editor computed. The build recomputes its fingerprints and fails on stale assembly.
- **The editor's own examples task** adds the Build outputs an archive asks for, as asmOS asks for `os/main`, because only a Core can link them.

**The editor has the repository as a submodule at `packages/examples`, as it has the Cores.** It builds the examples with its own build and serves `dist/` from its own site at `/examples/`. Its tests read the example programs from the submodule.

This amends decision 7 of [asmos-portability.md](../design/asmos-portability.md), under which the editor got copies of asmOS's archives and no submodule.

## Considered options

- **The examples stay in the editor.** The owner wants them in their own repository, where they can be shared, licensed and grown without the editor's history.
- **asm-examples publishes `dist/` to GitHub Pages, and the editor fetches it at run time.** Examples could ship without an editor deploy. But one could arrive before the editor feature it needs, and the editor's tests would keep copies of the programs they run.
- **Archives copied into the editor by hand**, as asmos-portability decided for asmOS. This needs the same test copies, plus a manual step after every change.
- **The build imports the editor's modules from a checkout**, as the old pack script did. Any refactor of the editor's compilation code could break it, and the repository could not build on its own.
- **The editor computes fingerprints at import for records without them.** This is simpler, but stale Generated assembly would be shown as current.

## Consequences

- **Clones of the editor grow** by about 15 MB, and every deploy carries the archives: asmOS alone is about 6.5 MB, under Cloudflare Pages' 25 MiB a file.
- **An editor commit pins an examples commit**, as it pins each Core. Updating the examples means moving the gitlink.
- **asm-examples is not a pnpm workspace project.** Like trs80, it has its own npm lockfile, so it also builds on its own, without the Build outputs only the editor can add.
- **The fingerprint function is now copied outside the editor.** It was already effectively frozen, since changing it makes every saved Project's Generated assembly stale. The editor's test that imports every archive catches a drift.
- **The Examples page, with its two views, gets its own design.** Until then nothing in the editor's UI reads `/examples/`.
