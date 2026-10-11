# Binary import: handoff for implementation

Written 2026-10-12 for an agent implementing the feature end to end without the design session's context. The owner will have the design author review your final report, so make it complete and honest.

## Read first, in this order

1. [CONTEXT.md](../../CONTEXT.md): the glossary. Use its terms exactly (**Executable**, **Listing**, **Command line**, **Arguments**, **Breakpoint**, **Poke**, **Runtime library**, **Reference environment**, **Settings**, **Testcase**, **Log**).
2. [binary-import.md](./binary-import.md): the 18 decisions, the **Spike results** (what was measured and why), **Deferred** (do not build those).
3. [ADR 0044](../adr/0044-an-executable-is-a-project-file-a-build-loads.md) and [ADR 0045](../adr/0045-invented-names-are-frozen-words-from-file-addresses.md).
4. [binary-import-plan.md](./binary-import-plan.md): the plan you implement, milestones M1 to M13. It names files, steps, tests and acceptance checks.

The design wins over the plan; the plan's **Decisions taken while planning** are defaults you follow unless one proves untenable, in which case pick the closest workable choice and record it.

## Scope

Implement M1 to M13 end to end: the x86 Core changes (the `packages/x86` submodule, repository `Specy/x86-js`) and the editor changes (`packages/asm-editor`). One deviation from the plan: at M5, do not stop for review and do not tag, push or publish. Bump the Core to `7.0.0` and write its changelog locally, then carry on with M6 against the workspace build (`workspace:*`, `pnpm --filter @specy/x86 build`).

## Rules

- **Branches.** Create `feat/binary-import` in the monorepo from the current `HEAD` (it carries the uncommitted design docs; commit them first, as their own commit) and `feat/binary-import` in `packages/x86` from its current `HEAD`. Commit at the end of each milestone, in the submodule for Core work and in the monorepo for editor work (bumping the submodule pointer when the editor needs the new Core). Never push, tag or publish.
- **No `Co-Authored-By` trailers** in any commit message.
- **Do not edit** anything outside these two repositories.
- **Checks before each commit.** Core (in `packages/x86/blink-js`): `npm run type-check`, `npm test`, `npm run build`, `npm run test:dist`. Editor (from the root): the `check` and test scripts in `package.json` (`vp`). Fix what you break; do not skip or weaken tests to pass. Tests that pin the old memory layout are listed in the plan (M2.5): update them to the new layout, keeping what they test.
- **Rebuilding wasm.** `source ~/emsdk/emsdk_env.sh` (emsdk 6.0.9), then `packages/x86/compile_blink.sh`; record the sha256 lines it prints in the commit message. Same for the new `compile_zydis.sh`. CI never rebuilds wasm: the committed `blink-js/src/wasm/*` files are what ships.
- **Record deviations** as you go in an **Implementation notes** section at the end of `binary-import.md`: what you did differently from the plan and why, with measurements.
- **Formatting:** run `vp fmt` on files you touch.

## Environment facts (checked 2026-10-12)

- Host: Ubuntu 26.04.1 LTS, Node 24.11, gcc/g++ 16 (`libc6 2.43-2ubuntu2.4`, `libstdc++6`/`libgcc-s1 16-20260322-1ubuntu1`, the exact libraries the plan bundles), emsdk 6.0.9 at `~/emsdk`, `gh` authenticated, network available. CMake is not installed system-wide; Zydis's amalgamation (`assets/amalgamate.py`) avoids needing it.
- `git clone --recurse-submodules` fails here because of a mise shim (`gettext.sh` syntax error). For Zydis, clone `zyantific/zydis` at tag `v4.1.1`, then fetch Zycore by commit `0b2432ced0884fd152b471d97ecf0258ff4d859f` into `dependencies/zycore`.
- Ubuntu `.deb` packages for the bundle come from `archive.ubuntu.com/ubuntu/pool/main/g/glibc/` and `.../pool/main/g/gcc-16/`; pin their sha256 in the fetch script.

## Techniques the spike used (reuse them for debugging)

- **Driving the Core in Node:** pipe a scratch `.mjs` into `node --input-type=module` from `packages/x86/blink-js`, importing `dist/index.mjs`: `createX86Emulator()`, `loadElf(bytes)`, `initialize(undoSize)`, `run(limit)`, `provideInput('hunter2\n')` when `stopReason.kind === 'input'`, then `run` again; `on('stdout')`/`on('stderr')` for output.
- **Testing a scratch wasm build without touching the package:** `dist/index.mjs` embeds `blinkenlib.wasm` as base64 inside `function __wasm_init(imports) { return loadWasmModule(false, null, "<base64>") }`; copy `dist`, replace that string with the new wasm's base64 and `dist/wasm/blinkenlib.js` with the new glue.
- **Libraries before the M3 API exists:** wrap `emulator.runtime.writeExecutableSync` so it also writes the libraries (with `FS.mkdirTree`) after `startProgram`'s `resetFileSystem`.
- **Finding a native abort:** set `emulator.runtime.module.onAbort` to print `new Error().stack`; to see Blink's own log and assertion messages, add `LogInit("/dev/stderr")` at the top of `blinkenlib.c`'s `SetUp()` (include `blink/log.h`) and enable `LOG_MEM` in `log.h` in a scratch build: the messages arrive on the program's `stderr` event, one character per event. That is how `memorymalloc.c:677 assertion failed: !Munmap(...) (EINVAL)` was found.

## When to stop and ask instead of deciding

Only for a blocker that changes a design decision: for example, if private file mappings cannot be copied (M1.3) without breaking Undo, if gdb's layout cannot be reached in the browser build (M2), or if Monaco cannot hold libc's Listing and windowing it changes what a person sees (plan, Risks). Otherwise decide, record, continue.

## Final report

When M13 is done (or you are blocked), write it at the end of `binary-import.md` under **Implementation report** and summarise it in your last message:

1. Each milestone: done or not, with the commit hashes (submodule and monorepo).
2. Every check's result at the end (Core and editor), and the browser verification of M13.3 scenario by scenario, with what you saw.
3. Measurements: wasm heap growth for the C++ fixture before and after M1.3; Listing generation times (crackme, a static binary, libc); Zydis wasm size; `blinkenlib.wasm` and `zydis.wasm` sha256.
4. Every deviation from the plan and from its planning defaults, and why.
5. Anything left undone, known bugs, flaky tests, and risks you would flag for review.
6. The invented-name word lists' location, for the owner's review before release (they freeze once shown).
