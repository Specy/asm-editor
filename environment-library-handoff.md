# Handoff: Environment library and reference-faithful environments

Written 2026-10-06 when the previous session stopped near its usage limit. Implementation of the plan is authorized; publishing is not.

**Completion and release update, 2026-10-07:** M5, M6, Blink B3/B4/B5, the x86 editor adoption and M8 are complete. The owner subsequently authorized all four Core releases and confirmed their publication to npm. The editor now pins MIPS/RISC-V 4.0.0, s68k 3.0.0 and x86 5.0.0 and resolves their npm packages. The [plan's Implementation notes](docs/design/environment-library-plan.md#implementation-notes) record reviewed implementation and release decisions; [environment-library-continuation.md](environment-library-continuation.md) records current consumption, validation and remaining owner manual checks. The owner requested Sol subagents for the implementation continuation; that supersedes the older Opus instruction below. The original stopping-point checklist and publishing restrictions below are historical. Core release commits and tags were pushed; editor changes remain uncommitted.

## Read first

- [docs/design/environment-library-plan.md](docs/design/environment-library-plan.md): the milestones, the 12 "Decisions taken while planning" (confirmed by the owner), and **Implementation notes** at the end. The notes hold every decision taken so far and the exact APIs each Core now exposes, so read them all before touching code.
- [docs/design/environment-library.md](docs/design/environment-library.md): the design decisions.
- ADRs 0034–0037, plus ADRs 0001, 0005, 0009, 0010 and 0015 where cited.
- [docs/research/environment-services-audit.md](docs/research/environment-services-audit.md): the original departures, by language.
- `CONTEXT.md`: the vocabulary. Terms for this work: Environment library, Reference environment, Line discipline, Random source.

## Ground rules the owner set

- **Agents.** Implement with **Opus subagents** (Agent tool, `model: "opus"`), one milestone or Core part per agent, each confined to its own files. Parallel agents must never edit the same files.
- **Publishing.** Never commit, tag, push, publish or bump versions unless the owner asks. The owner strips `Co-Authored-By` trailers from commits. Auto mode blocks `git push` to the public Core repos, so for a release, prepare the commit and tag and give the owner the push commands. The release recipe: each Core repo's default branch; `npm version`; push the branch, then the tag; check that the `Publish to npm` step ran.
- **Notes.** After each agent finishes, append its decisions as an Implementation note in the plan. Agents should report their decisions rather than edit the plan, to avoid edit races.
- **Other sessions.** They may have uncommitted work in this tree (for example `docs/design/instruction-examples.md` and `src/lib/documentation/instructions/`). Never revert what you did not write.
- **Linked Cores.** `node_modules` currently links the **local** builds of `@specy/mips`, `@specy/risc-v` and `@specy/s68k` (`npm run emulators:status`). `package.json` still names the published versions. Don't run `npm run emulators:registry` until the owner has published, because the adapters now expect the new Core APIs.
- **Known failing test.** `src/lib/languages/X86/x86Syscalls.test.ts` fails in this checkout until the x86 adoption regenerates the list. CI skips it.

## State

### Done (uncommitted)

M0, M1, M2 (translator and the editor's x86 `<sim.h>`), M3 a and b (Line discipline, `TerminalConsole`, xterm removed), M4 a, b and c (Random source, termination contract, FileSystem session, `marsHandlers.ts`), the M5 Core work (MARS and RARS parts 1, 2a and 2b, plus print string without its limit), the M6 Core work (s68k parts 1 and 2), and Blink M7 items 1, 3, 4, 7, 8 and 9 (committed config, 131 syscalls, exported list, exit and signal reasons, no launch line, standard streams, per-run isolation).

### Cut off mid-task: finish these first

Inspect `git diff` in the files named, then finish.

1. **M5 editor adoption, MARS/RARS 4.0.0.** It stopped at "type-check". It was changing:
    - `src/lib/languages/mars/marsHandlers.ts`, the MIPS and RISC-V adapters (StopReason, `exitCode`, `RuntimeError`, removing `ended`/`exited`, `randomSeed` from `peripherals.random`, history kinds `EXIT_RESTORE`/`RANDOM_STREAM_RESTORE`);
    - the syscall data in `src/lib/documentation/mars/` (40 and RISC-V 17 implemented, texts, "Differences from MARS/RARS" sections);
    - `<sim.h>` regeneration with `SIM_SCREEN`'s cap raised to 4,128,768 bytes, plus refreshed fixtures with 40 and 53 and a 512×256 fixture;
    - `scripts/runtime/test-cores.mjs` on the new handler shapes, where the corpus must pass 426/426 with GCC and with `--compiler clang`.

    Still to do: tests, the browser check, and the full brief in the plan's M5 editor bullet.

2. **M6 editor adoption, s68k 3.0.0.** It stopped while "grouping rejected tasks by reason on the documentation page". It was changing:
    - `src/lib/languages/M68K/**` (adopting the 3.0.0 migration table in `emulators/m68k/ts-lib/README.md`, removing the adapter's formatting and parsing, mapping `getTermination`);
    - files 50–59 on the FileSystem session with `{firstDescriptor: 0, maxOpen: 8}` through a `beginSession` hook in `GenericEmulator`;
    - task 58 through the modal Prompt;
    - `getInputSettings()` passed to a new echo option in `Terminal.svelte.ts`;
    - sound 70–77 ending the program with a clear error;
    - `M68K-traps.ts`, `src/lib/documentation/m68k/traps.md` with "Differences from EASy68K", and the M68K Lectures, Exercises and tests.

    Still to do: tests, `content.test.ts`, and the browser check.

### Not started, in order

3. **Blink B3** (`emulators/x86`, M7 items 2 and 5):
    - host hooks for the clock, random and waits, through one `HostNow`/`GetRandom` (also `AT_RANDOM` and `/dev/urandom`) and a monotone `instructions_executed`;
    - asynchronous waits via a new halt-and-resume trap with `ExitTrap`'s cleanup, for `nanosleep`, `clock_nanosleep`, `select`, `poll`, `ppoll`, `pause` and `sigsuspend`;
    - truthful `poll` readiness and EAGAIN for `O_NONBLOCK`;
    - `getrandom`, and `pipe` in-process.

    Build: `source /home/dev/emsdk/emsdk_env.sh`, `npm --prefix emulators/x86/blink-js run build:wasm` (reproducible), then `npx vitest run`, `type-check`, `build && test:dist` in `blink-js`.

4. **Blink B4** (item 6): `kill`/`tkill`/`tgkill` on itself, `wait4` returning ECHILD, and `alarm`/`setitimer` on the host clock, delivered at wait wake and at slice start.
5. **Blink B5** (items 10 and 11):
    - an Emscripten file-system backend over the editor's FileSystem session, mounted at `/project`, with frames keyed by the history serial;
    - decision 7's irreversible marking at `TakeTerminalInput()`, `TCFLSH` and file-mutating calls (and consider `brk`, ids and limits).
6. **M7 editor adoption, x86 5.0.0.** Link with `npm run emulators:local -- x86`.
    - **Adapter:** byte callbacks and `provideInput(bytes | END_OF_INPUT)`; drop the `stdin` callback, `isProgramOutput` and the output filter; wire the clock, wait, random (`peripherals.random.bytes`, `position`/`seek` on Undo) and FileSystem hooks; read termination from `stopReason.signal`, deleting `x86Termination.ts`'s table and mask.
    - **Generated files:** the documentation generator reads `getImplementedSyscalls()` instead of the `config.h` evaluator. Regenerate `x86Syscalls.ts` and `<sim.h>` with the override table for the 28 `value`-labelled pointer arguments (see the note "Correction to the x86 bindings"); names now include `pread64`, `getdents64` and so on. Fix `x86Syscalls.test.ts`.
    - **Translator leftovers:** the 4.0.0-only translator probes and tests go, and the `nop` test now translates.
    - **Stale references:** `init_blink.sh` is mentioned in `scripts/x86-docs/sources.mjs`, the tests and the design docs.
    - **Docs:** add "Differences from Linux" to the x86 Documentation.
7. **M8.**
    - _Using C_ chapters for MIPS, RISC-V and x86: routes under `src/routes/documentation/<lang>/`, the sidebar link, the landing button; `documentation.test.ts` checks pages.
    - Any "Differences" sections still missing, including the Z80's Enter codes.
    - Search goldens.
    - A content sweep: `content.test.ts` and every language's Examples tests.
    - A browser check per language.
    - `docs/manual-verification.md` rows C7, Z5 and M7 on a real phone or browser; these are the owner's.
8. **Releases (owner):**
    - `@specy/s68k` 3.0.0, `@specy/mips` and `@specy/risc-v` 4.0.0, and `@specy/x86` 5.0.0. The x86 translator's inline-assembly change can ship inside 5.0.0 rather than as a separate 4.1.0.
    - Then bump the editor's `package.json`, run `npm run emulators:registry` and `npm install`, and rerun the suites.

### Later (not in scope now)

- The Audio Peripheral design: EASy68K 70–77, MARS/RARS MIDI 31/33.
- A 68000 cycle-timing model for EASy68K 30/31.
- x86 Undo of file and standard-input effects (ADR 0015).
- Terminal transcript Undo.

## Verification

- **Editor.** Run `npx vitest run --project node <files>` while working, and `--project dom` for `*.dom.test.ts`. Before a milestone closes, run `npm run check`, ESLint and Prettier on the touched files. Under load, `lectureSections.test.ts` can time out; it passes alone.
- **Browser checks.** Use the headless Chrome at `~/.cache/ms-playwright/chromium_headless_shell-1243/...`, driven over CDP with Node 24's WebSocket. Run your own dev server from `node_modules/.cache/<name>.config.mts` (merging `../../vite.config.ts`, with its own `cacheDir` and `server.hmr: false`) on a free port; the owner may hold 4173.
