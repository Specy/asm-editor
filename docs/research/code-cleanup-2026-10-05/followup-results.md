# Cleanup follow-ups — 2026-10-05

Both follow-ups were authorized after the initial cleanup: recalibrate x86 scheduling against the pinned `@specy/x86` 4.0.0, and unify the bundled Fira font's family name. Performance experiments ran in a separate worktree before the selected change was applied to the main checkout. No emulator packages were upgraded.

## x86 execution budget

The old initial estimate was 10 instructions/ms. With native execution and the default 200,000-entry Undo history, the measured reference throughput was about 1,880–2,350 instructions/ms. The initial estimate is now 2,000 instructions/ms; the scheduler still adjusts it from actual slice timing.

Simply raising the estimate lets the adaptive scheduler request long slices that cross several Core batches. The Core yields between its 50,000-instruction native batches, but the app's Pause request is honored at the outer slice boundary. To keep those boundaries frequent, each x86 slice is capped at 20,000 instructions with Undo and 50,000 without Undo. The time estimate can request fewer instructions on slower workloads. These caps keep the app responsible for host yields rather than nesting the Core's timer yields inside large app slices.

The measurement harness now repeats capped adapter slices until the requested count has run, without adding scheduler yields. Previously its single-call assumption would have measured only the first capped slice while reporting the whole count. Regression tests exercise a 100,001-instruction Run with and without history, verify the exact RBX result and instruction accounting, and verify Undo after the history wraps.

### Measurements

Chromium 153.0.8010.12 on an Intel Core i7-10750H CPU at 2.60 GHz; one benchmark at a time. Each workload ran 1,000,000 instructions, with three warm reference runs and three warm scheduled runs. The reference calls the public Core API in 50,000-instruction chunks immediately, avoiding the Core's timer yield between larger batches. Both paths check executed counts and RBX increments. Scheduled cold runs start with the scheduler's correction reset by a fresh Build.

| Workload     | Undo entries | Reference instructions/ms | Scheduled instructions/ms | Cold run before → after, ms | Cold slices before → after | Maximum host-yield time, % |
| ------------ | -----------: | ------------------------: | ------------------------: | --------------------------: | -------------------------: | -------------------------: |
| Integer loop |      200,000 |                     2,351 |                     2,083 |               470.6 → 476.8 |                   352 → 50 |                       4.19 |
| Memory loop  |      200,000 |                     1,884 |                     1,857 |               578.7 → 558.2 |                   661 → 50 |                       3.57 |
| SSE loop     |      200,000 |                     2,161 |                     2,124 |               567.0 → 477.6 |                   893 → 50 |                       3.74 |
| Integer loop |            0 |                     7,380 |                     6,930 |               195.8 → 143.0 |                 1,019 → 20 |                       4.09 |
| Memory loop  |            0 |                     7,092 |                     6,892 |               176.3 → 145.3 |                   854 → 20 |                       3.72 |
| SSE loop     |            0 |                     7,273 |                     7,057 |               191.7 → 141.9 |                 1,661 → 20 |                       3.94 |

Throughput columns are medians from the selected implementation. Host-yield time is the maximum across the three scheduled samples: gaps between adapter slices divided by total run time. Those gaps stayed below 5% in every selected sample. This metric isolates host scheduling; the full difference from reference throughput also includes adapter bookkeeping and debugger state refresh. The calibration reduces excessive slicing, particularly on cold runs without history. It does not make every workload faster: the integer loop with Undo varied slightly downward in this paired run.

Pause and Stop were requested by browser timers during unlimited execution, with Chromium's **4× CPU slowdown** enabled for the response measurements. Delay includes late timer delivery and completion of the pause or cleared Run.

| Workload     | Undo entries | Pause delay, ms | Stop delay, ms | Worst event-loop delay, ms |
| ------------ | -----------: | --------------: | -------------: | -------------------------: |
| Integer loop |      200,000 |            69.4 |           49.7 |                       66.6 |
| Memory loop  |      200,000 |            63.0 |           76.3 |                       83.7 |
| SSE loop     |      200,000 |            73.1 |           98.1 |                       83.9 |
| Integer loop |            0 |            46.5 |           53.3 |                       58.8 |
| Memory loop  |            0 |            53.3 |           38.1 |                       55.5 |
| SSE loop     |            0 |            37.7 |           51.2 |                       53.0 |

All selected measurements stayed below the 100 ms response target. Scheduling remains cooperative; these measurements establish behavior on this host and these workloads, rather than a bound on every device or instruction mix.

Raw evidence: [before](x86-scheduling-before.json), [after](x86-scheduling-after.json). Their `estimate` fields identify the tested initial estimate. The [benchmark script](x86-scheduling.mjs) preserves the measurement procedure and accepts a label instead. Start a Vite dev server in the checkout being measured, supply an existing Playwright installation, and run:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs \
PLAYWRIGHT_CHROMIUM=/absolute/path/to/chromium \
ASM_EDITOR_BENCH_URL=http://127.0.0.1:4173 \
BENCH_RESPONSIVENESS_THROTTLE=4 \
node docs/research/code-cleanup-2026-10-05/x86-scheduling.mjs current /tmp/x86-scheduling.json
```

Throughput is measured at normal CPU speed; throttling applies only to Pause/Stop probes. Run without competing tests or builds. Browser and CPU versions, timings, executed counts, history size, slice counts and page errors are saved with the result. Playwright is an external research dependency; no application dependency was added.

## Fira font family

The bundled `/fonts/FiraCode-Medium.woff2` face is now registered as `'Fira Code'`, matching existing search and Markdown declarations. All explicit `FiraCode` declarations and the two remaining `Fira Mono` exam editor declarations now use `'Fira Code', monospace`. Markdown inline code also explicitly requests that family. The font asset and existing weights are unchanged.

Chromium's `CSS.getPlatformFontsForNode` confirmed the actual custom Fira Code font on instruction summaries, instruction forms, inline code and a visible glyph probe copied from the exam Markdown textarea's computed font. Before the change, inline code and the Markdown editor probe fell back to DejaVu Sans Mono. Desktop checks at 1440 px and phone checks at 390 px found no horizontal page overflow or browser errors. The phone instruction summary remained 358 px wide. [Font rendering evidence](font-rendering.json) records the before/after styles, actual fonts and widths. Monaco's editor font option was not part of this naming correction.

## Validation

- `npm run check`: zero errors; 31 existing warnings remain.
- `npm run lint`: passed.
- Focused x86, adapter, execution-slice and generic-scheduler tests: 9 files, 180 tests passed with `--maxWorkers=2`, including the two new instruction-limit regressions. These cover startup/linking, breakpoints, Undo and register behavior.
- Three temporary measurement-harness checks in the isolated worktree passed: 100,001 instructions with and without history produced RBX = 50,001, and a three-instruction exit program returned the actual count rather than the requested limit. The direct measurement path reads Core register values because it bypasses the scheduler's UI-state refresh.
- `npm run build`: passed, including prerender and static output. The final build was run after SvelteKit sync completed. The earlier concurrent generation produced mismatched hydration globals; the fresh output loaded correctly in Chromium.
- Production Chromium Workbench check: Build → Step changed RBX from 0 to 1; Undo restored 0. Unlimited Run → Pause → resume → Stop worked, and rebuilding reset RBX to 0. No browser page errors were recorded. [Workbench evidence](workbench-execution.json) records the observed register values.
- Rendered-font and desktop/phone checks passed as described above.
- Benchmark script syntax and `git diff --check`: passed.

The complete suite passed during the preceding cleanup, as recorded in [cleanup results](cleanup-results.md). This follow-up ran the focused 180-test set and the separate measurement checks; it did not rerun the full suite.
