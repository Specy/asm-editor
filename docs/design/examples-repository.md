# Examples repository

Status: decided with the owner on 2026-11-03. The build, examples, editor integration and Examples page are implemented, with changes still uncommitted. The model is [ADR 0073](../adr/0073-examples-live-in-asm-examples-a-submodule-the-editor-bundles.md). The page and URL behavior are recorded in [examples-page.md](./examples-page.md). The asmOS RISC-V and MIPS ports remain drafts while their implementation is in progress.

Every example Project the editor ships moves out of `packages/asm-editor/examples/` into [Specy/asm-examples](https://github.com/Specy/asm-examples), the owner's public repository for examples, where asmOS already lives. The repository has a build that packs each Project into its own `.asmproj` archive and writes an index that maps each example to the Targets it is written for, and each Target to its examples. The index feeds two views of the examples in the editor: by example and by Target. Those views get their own design later (decision 10).

**Words used here.** An _example_ is one program, written for one Target or several. A _port_ is one example on one Target: one Project, one archive. "Pac-Man" is an example with one port, RISC-V; "Bouncing ball" has four. Course lectures also have "Example" pages (`src/content/<course>/examples/`). Those are not part of this record, and the Examples page's design settles the names the editor shows.

## What moves

| Example              | Ports                                 | Folder                        |
| -------------------- | ------------------------------------- | ----------------------------- |
| Bouncing ball        | M68K, MIPS, RISC-V, Z80               | `shared/bouncing-ball/`       |
| Bitmap tour          | MIPS, RISC-V                          | `shared/bitmap-tour/`         |
| Keyboard and display | MIPS, RISC-V                          | `shared/keyboard-display/`    |
| Keyboard move        | M68K, Z80                             | `shared/keyboard-move/`       |
| Mouse paint          | M68K, Z80                             | `shared/mouse-paint/`         |
| Flappy Bird          | M68K (assembly), RISC-V (C)           | `shared/flappy-bird/`         |
| asmOS                | X86; RISC-V and MIPS when ported      | `shared/asmos/`, build script |
| Graphics tour        | M68K                                  | `m68k/graphics-tour/`         |
| Bad Apple!!          | M68K                                  | `m68k/bad-apple/`             |
| TRS-80 text          | Z80                                   | `z80/trs80-text/`             |
| TRS-80 bounce        | Z80                                   | `z80/trs80-bounce/`           |
| Pac-Man              | RISC-V (assembly and C, two Programs) | `risc-v/pacman/`              |

**EASy68K's three programs (`m68k/easy68k/`) stay in the editor**, moved to `src/lib/languages/M68K/easy68k/`, where the measurements read them. They are Chuck Kelly's, they do not Build (macros and structured control), and [ADR 0003](../adr/0003-preserve-simulator-graphics-conventions.md) uses them as compatibility references, not as examples.

## Decisions

1. **One root folder per Target, and `shared/` for examples with several ports.**

    ```
    asm-examples/
      package.json, scripts/      the build
      m68k/ mips/ risc-v/ risc-v-64/ x86/ z80/
        <example>/                the folder is the example's one Project
      shared/
        <example>/
          m68k/ z80/ …            each Target folder is one port's Project
          README.md, assets/ …    every other File goes into every port
          build.mjs               optional: replaces the default (decision 5)
      dist/                       the build's output, git-ignored
    ```

    - Folder names are the Targets in lower case; anything that leaves the repository uses the editor's own Target values (`M68K`, `MIPS`, `RISC-V`, `RISC-V-64`, `X86`, `Z80`).
    - **A shared example's other Files go into every port** at their path from the example folder. A port's Files go in at their path from its Target folder. A path that both give fails the build. Pac-Man ported to MIPS would keep one `assets/` for both ports.
    - **Porting an example moves it** from `risc-v/pacman/` to `shared/pacman/risc-v/`, a rename that git follows.
    - **Example ids are folder names** and unique across the repository: `m68k/x` and `shared/x` cannot both exist. They are lower-case words joined by `-`, so they can go into a URL.
    - **Anything else fails the build**, so that a misspelled Target folder cannot hide its examples: a root folder that is neither a Target folder nor `shared/` (`scripts/`, `dist/`, `node_modules/` and dot folders aside), and a loose file in a Target folder or in `shared/`.

    Rejected: every example under one folder with Target subfolders, even ISA-only ones. It is uniform, but the owner wanted the root to show the Targets.

2. **`example.json` describes an example; the build reads nothing else by hand.**

    ```jsonc
    // risc-v/pacman/example.json
    {
        "name": "Pac-Man",
        "description": "The arcade game with its sound, in RISC-V assembly and in C.",
        "tags": ["game", "screen", "sound", "c"],
        "project": {
            "programs": {
                "assembly/main.s": {
                    "display": {
                        "unitWidth": 1,
                        "unitHeight": 1,
                        "width": 224,
                        "height": 288,
                        "baseAddress": 268500992
                    }
                },
                "c/pacman.c.riscv": {}
            },
            "selectedProgram": "assembly/main.s",
            "openTabs": ["README.md", "assembly/main.s", "c/pacman.c", "assets/sprites.bmp"],
            "activeTab": "assembly/main.s",
            "fileViews": { "README.md": "preview" }
        }
    }
    ```

    - `name` and `description` are required. `tags` is optional; the Examples page's design decides what tags are for. `license` is an SPDX expression, `MIT` when absent; any other needs a LICENSE File in the example's folder (decision 9). A field the build does not know fails it.
    - **`project` uses the archive manifest's own field names** (`programs`, `selectedProgram`, `openTabs`, `activeTab`, `fileViews`), so a change to the format maps one to one. A shared example has `ports: { "<target>": { "name"?, "description"?, "project"? } }` instead.
    - **Defaults** let a one-File example give only its name and description. The one File with an assembly extension of its Target is the Entry of the one Program. The tabs are that File, plus `README.md` if there is one, opened as a Preview, with the Entry active, because the Workbench shows no Build button while a Preview tab is active. If there are no such Files, or several, the build fails until `programs` names the Entries.
    - **Compilation records are kept apart from this file, in `compilations.json`**, because tools write them (decision 4).
    - **Not packed:** `example.json`, `compilations.json`, `build.mjs`, `.gitignore`. Everything else is a File, dotfiles included, since asmOS's `Desktop/.keep` keeps a folder alive.
    - **Text or bytes** is decided as the pack scripts decide it today: known binary extensions (`bmp`, `png`, `jpg`, `gif`, `bin`, `wav`, `mid`, `wad`, `vid`, …) are base64, and every other File must be valid UTF-8 text, or the build fails.

3. **The build writes one archive per port and one index.**

    ```
    dist/index.json
    dist/<target>/<example>.asmproj
    dist/<target>/<example>-<variant>.asmproj    (decision 5)
    ```

    `npm run build` packs each port as the editor packs a Project today: a version 3 manifest plus the Files under `files/` ([ADR 0019](../adr/0019-zip-project-archives.md)). Always version 3, not the oldest version that holds the Project as the editor writes it: the archives go out with the editor that reads them. Paths are sorted, and times and ids are fixed, so packing an unchanged example gives the same bytes again. A ZIP stores local times, which fflate takes from the machine's zone, so the build packs in UTC.

    ```jsonc
    // dist/index.json
    {
        "version": 1,
        "examples": {
            "bouncing-ball": {
                "name": "Bouncing ball",
                "description": "…",
                "tags": [],
                "license": "MIT",
                "path": "shared/bouncing-ball",
                "ports": [
                    { "target": "M68K", "archive": "m68k/bouncing-ball.asmproj", "bytes": 2860 },
                    { "target": "MIPS", "archive": "mips/bouncing-ball.asmproj", "bytes": 3305 }
                ]
            },
            "asmos": {
                "…": "…",
                "ports": [
                    {
                        "target": "X86",
                        "archive": "x86/asmos.asmproj",
                        "bytes": 6484762,
                        "buildOutputs": ["os/main.c.asm"]
                    }
                ]
            }
        },
        "targets": {
            "M68K": [
                "bad-apple",
                "bouncing-ball",
                "flappy-bird",
                "graphics-tour",
                "keyboard-move",
                "mouse-paint"
            ],
            "MIPS": ["bitmap-tour", "bouncing-ball", "keyboard-display"]
        }
    }
    ```

    `examples` is the examples view and `targets` the Target view. Examples are listed by id; the page decides any other order. `path` is the example's folder in the repository, for a link to its source. A port named or described apart from its example (`pack`'s `name` and `description`, `ports.<target>`) carries its own `name` and `description`, as asmOS's MIPS and RISC-V ports do. The editor links to a port as its archive's path with a `-` for the `/` (`x86-asmos`), so two archives that would share a link fail the build: `risc-v/64-x` and `risc-v-64/x`, or an example `a-b` and an example `a`'s variant `b`.

    **The build fails** on:
    - a missing Entry, or a missing File named by a Program, a tab, a File view or a record;
    - a path given by both a shared example and its port;
    - a port over the editor's limits: 16 MiB of Files, 4,096 Files, 1,024-byte paths (64 MiB of Files since 2026-11-04, [ADR 0076](../adr/0076-a-project-holds-64-mib-of-files.md));
    - an unknown Target folder;
    - a stale Generated assembly (decision 4).

    The root README's table of examples is written by the build between two markers, and CI fails when it is out of date.

4. **Generated assembly ships with its Compilation record, and the build checks that it is current.**

    A C port carries its Generated assembly as a File (Pac-Man's `c/pacman.c.riscv`, asmOS's seven `.c.asm`), with the Compilation record that ties it to its sources. The record's fingerprints come from the editor, which computed them when it compiled. `compilations.json` keeps them, keyed by Target folder. The build recomputes each fingerprint from the Files and fails when one differs, for example: "c/pacman.c.riscv is stale: c/state.c changed since it was compiled. Compile c/pacman.c again." The fingerprint is the editor's `contentFingerprint` (`src/lib/sourceCompilation/fingerprints.ts`, 20 lines). The build keeps a copy. The function is effectively frozen: changing it would make every saved Project's Generated assembly stale. The editor test of decision 7 catches the copy drifting from it.

    Two tools write `compilations.json`:
    - **`npm run sync -- <archive> <example> [--variant <variant>] [--delete]`** (asm-examples, plain Node) takes a Project exported from the editor after Compile; the port is the archive's Target. It finds where each File comes from by running the example's build without packing, writes the port's Files back, the shared ones to the example's root, leaves out the Build outputs the editor saved, removes Files the archive no longer has only with `--delete` (never a shared one), makes a new port folder when a shared example has none for that Target, copies the archive's Compilation records into `compilations.json`, and prints how the manifest's Programs and tabs differ from `example.json`, which stays hand-written. The usual workflow is: open the archive from `dist/`, edit and Compile in the editor, export, then sync.
    - **`record-compilations`** (the editor's scripts, which import its code as the pack script does today) recomputes the listed records from the Files. It is for a compile done outside the editor's UI, such as asmOS's harness or the Compiler Explorer driver run from a script, and is run right after compiling, because it vouches that the output is current.

    _Amended 2026-11-03, step 2:_ Flappy Bird and asmOS were compiled by a scratch tool that runs the editor's own Compile (`compileSource`) on the sources `compilations.json` lists, then writes the Generated assembly into the example and the record Compile returned into `compilations.json`. It vouches for nothing, since the record comes from the compile itself, so step 3 makes it the editor's tool in place of `record-compilations`.

    Rejected:
    - **Fingerprints filled in by the editor at import**, as the pack script fills them at pack time. This is the simplest option, but a stale Generated assembly would show as current. asmOS's `.c.asm` files are stale right now, since its platform-layer commit.
    - **The build imports the editor's modules from a checkout**, as the pack script and asmOS's tools do today. Every refactor of `compilationInputs` and its lexer could break the examples, and the repository could not build on its own.

5. **An example's `build.mjs` replaces the default.**

    ```js
    // shared/asmos/build.mjs
    export default async function build({ folder, files, pack }) {
        await pack({
            target: 'X86',
            files: files({
                include: [
                    'os/',
                    'Desktop/',
                    'games/',
                    'music/',
                    'pictures/',
                    'videos/',
                    'code/',
                    'welcome.txt',
                    'README.md',
                    'LICENSE',
                    'NOTICE'
                ],
                exclude: ['os/platform/riscv/', 'os/platform/mips/']
            }),
            project: {
                programs: {
                    'os/main.c.asm': {
                        settings: { undoEnabled: false },
                        display: { width: 640, height: 480 }
                    }
                },
                openTabs: ['os/main.c.asm']
            },
            buildOutputs: ['os/main.c.asm']
        })
    }
    ```

    - **`pack` is the default build's own function.** It validates, writes `dist/<target>/<example>[-<variant>].asmproj`, and adds the port to the index, so no custom build can skip either. It takes `target`, `files` (archive path → source path), `project`, optionally `name`, `description` and `variant`, and `buildOutputs` (decision 6). `compilations.json` applies to every `pack` of that Target.
    - **asmOS packs X86 now**, from shared `os/` plus `os/platform/x86/` and the disk folders, without `tools/`. It adds RISC-V and MIPS from the same tree when they are ported ([asmos-portability.md](./asmos-portability.md), decision 5).
    - **Two archives for one Target** are told apart by `variant`, which names the file `<example>-<variant>.asmproj` and goes into the port's index entry.
    - **`draft: true`** marks a port still being written, added 2026-11-03 for asmOS's RISC-V and MIPS ports. The compile tool still sees its Files and its records in `compilations.json`, which may be stubs. The build neither packs nor checks it, and the index does not list it.

6. **asmOS keeps carrying its linked `os/main`.** The owner chose to keep it. [ADR 0056](../adr/0056-a-build-saves-the-program-it-links-as-a-file.md) leaves a Build output out of archives, but this example ships one so that its Listing, Pseudocode and the profiler's symbol table are there before the first Build.

    - **A port asks for it with `buildOutputs`**, which lists the Programs whose Build output its archive should carry. Only x86 saves one, so other Targets fail validation.
    - **The asm-examples build leaves it out** and says so. It never runs a Core.
    - **The editor's examples task adds it** (decision 7). It Builds those Programs with the editor's x86 Core, adds each Build output File and its Build record, rewrites the archive and updates the index entry's `bytes`. This is today's `AsmosBuildOutput.test.ts`, made generic and kept in the editor.

    Rejected: committing `os/main` to asm-examples. Each relink would add more than half a megabyte to the repository's history.

7. **The editor has asm-examples as a submodule, and bundles the build.**

    - **`packages/examples`** is a submodule, as the Cores are ([ADR 0043](../adr/0043-the-repository-is-a-workspace-of-its-packages.md)). Like trs80, it is not a pnpm workspace project: it keeps its own npm lockfile so it can build on its own, and the root's `build:examples` task runs `npm ci && npm run build` inside it, cached on its inputs (not `dist/` or `node_modules/`).
    - **A second editor task** adds the Build outputs of decision 6. It runs under its own Vitest config, like `vitest.measure.config.ts`, because the Emulators are Svelte modules, and depends on `build:x86`.
    - **The site serves `dist/` at `/examples/`**: the dev server from the folder, and the build by copying it into `build/examples/`. A deploy therefore carries examples that run on the editor it ships. Cloudflare Pages' limit is 25 MiB a file; asmOS is about 6.5 MB.
    - **The editor's tests read example programs from `packages/examples/…`** through one helper. Pac-Man's "the archive equals the folder" test becomes "every archive in `dist/` imports, its Generated assembly is current, and every Program Builds", across all examples.
    - **CI already checks submodules out.** The jobs that test or build the site depend on `build:examples`.

    Rejected:
    - **asm-examples publishes `dist/` to GitHub Pages and the editor fetches it at run time.** Examples could ship without an editor deploy, but one could arrive before the editor feature it needs, and the editor's tests would keep their own copies of the programs they run.
    - **Archives copied into the editor by hand**, as decision 7 of asmos-portability had it. Same test copies, and a manual step on every change.

8. **asm-examples has its own CI.** On every push and pull request it runs `npm ci && npm run build`, checks the README table, and uploads `dist/` as an artifact. That covers everything but decision 6's Build outputs, which only the editor makes.

9. **The examples are MIT, asmOS GPL-2.0-or-later**, the owner's choice of 2026-11-03. The repository's `LICENSE` is the MIT License; an example under other terms says so in its `example.json` and has its own LICENSE File, as asmOS has. The index and the README's table give each example's license. Examples are meant to be copied, which the editor's AGPL-3.0 got in the way of. Graphics tour is GPL-2.0-or-later too: it is a port of EASy68K's `graphicSound.X68`, and EASy68K is under the GPL.

    Each example has its own README. The per-Target READMEs of `packages/asm-editor/examples/` are split among their examples. Each port's notes go into its example's README, and a shared example's README goes into every port, so it describes all of them. A README names the material in its example that the MIT License does not cover (step 2).

10. **The Examples page is designed separately**, after this is in place. That pass covers its route, the two views, what opening an example does (a copy imported into the browser, as a drop does), links from the Documentation of each Target, and the names it shows. This record stops at `index.json` and `/examples/`.

## Plan

**1. The build, in asm-examples**: written 2026-11-03, uncommitted.

- `package.json` (private, `"type": "module"`, Node 24.11, `fflate` 0.8.3 as the editor has it), `package-lock.json`, `mise.toml`, `dist/` in `.gitignore`, the MIT `LICENSE`.
- `scripts/`: the default build and `pack` (decisions 2, 3, 5), the fingerprint copy and staleness check (4), `sync` (4), and the README table (3); `npm test` runs 18 tests of them on repositories made in a temporary folder.
- `.github/workflows/build.yml` (decision 8), with Node from `mise.toml` through the editor's pinned `jdx/mise-action`.
- Checked against the editor: a scratch build of Pac-Man, Bouncing ball and TRS-80 text imported in the editor's own `makeProjectFromArchive`, Pac-Man's Generated assembly neither stale nor edited by `compilationStatus`, and Pac-Man's archive equal to the one `pack-example-projects.mjs` makes, File for File and field for field but its times.
- The repository's own build fails until step 2, because `asmOS/` is neither a Target folder nor `shared/`.

**2. The examples, in asm-examples**: done 2026-11-03, uncommitted. The build packs 12 examples into 20 archives, 6.1 MB. In the editor, every archive imports with its Generated assembly current, and every Program Builds and runs 300,000 instructions without an error. asmOS, packed and recompiled, boots to its desktop, opens the Start menu and launches an application in its harness.

- Copy each example into its folder (table above), with an `example.json` and its README. Their history stays in the editor's.
- Name what the MIT License does not cover in each README: Pac-Man's sound tables, taken from the arcade's own sound routine; Bad Apple!!'s frames, from Anira's video.
- Pac-Man: copy its Compilation record from today's archive into `compilations.json`. The build must then pass with no recompiling.
- Flappy Bird's RISC-V port has no Generated assembly yet: Compile it once at the level its README needs, then sync. Done at -O0, the level its course page starts at.
- asmOS: move `asmOS/` to `shared/asmos/` and add its `build.mjs`. Recompile its seven units on Compiler Explorer, since they are stale since the platform layer, then `record-compilations`. Its tools look for the editor two folders up when it is a submodule, and at `../asm-editor` otherwise. Done; `tools/harness/pack.mjs` is gone, replaced by the build. The recompile was not left until the RISC-V and MIPS ports, because until then the whole build fails and the editor would have no asmOS to ship.

**3. The editor**

- Add the submodule at `packages/examples`, the `build:examples` task, and the Build-output task (decisions 6, 7).
- Make step 2's scratch compile tool the editor's own, with a Vitest config of its own as the Emulators need, in place of `record-compilations` (decision 4).
- Serve and copy `dist/` at `/examples/`.
- Point the M68K, MIPS, RISC-V, Z80 and measurement tests at the submodule. Add the all-archives test. Move EASy68K's programs to `src/lib/languages/M68K/easy68k/`.
- Delete `packages/asm-editor/examples/` and `scripts/pack-example-projects.mjs`. Update the formatter and linter ignores in `vite.config.ts`, the paths in `docs/manual-verification.md`, the README's "Repository layout" and `docs/local-emulators.md`. Older design records keep the paths of their day.
- Once the submodule is in, the local clone at `/home/dev/code/asm-examples` is no longer the working copy.

**4. The Examples page**: its own design (decision 10).
