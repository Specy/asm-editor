# PR #108 public wording review

Updated: 2026-11-04. Working branch: `feat/asmos-doom-bad-apple`.
PR: https://github.com/Specy/asm-editor/pull/108
Reviewed head: `9b35da73939f9f7281c19d85358f12d3a358257a`.
Base: `origin/main`, `1c6f2915fc16b91a6673abd912e0951bb4ad3641`.

## Authorization and scope

The user first requested an inventory and plan for rewriting user-facing PR text, including docs,
UI, tooltips, diagnostics, courses and examples. They then authorized the short-text batch, and
subsequently the examples and courses batch. They have now authorized the remaining reference
documentation with “ok do what's left now.” They explicitly requested this saved research for
resuming after context compaction. No commit, push or publish was requested.

Use direct, factual wording. Preserve executable examples, routes, anchors, stable example IDs,
API signatures, addresses, return conventions, diagnostic codes and runtime behavior. No broad
test suite is needed for prose-only changes. Preserve unrelated dirty work.

## Earlier coverage

- `293d347b` rewrote x86 Screen/input/sound docs, seven x86 course examples, the syscall lecture,
  generated device help, and related messages/tooltips. This is already in the base branch.
- `0a5fee10` revised file terminology across docs and courses: explain files shown in the editor's
  file explorer rather than assuming users know internal Project/File terminology.
- The current PR adds MIPS/RISC-V input-controller, folder/linking, interrupt/timer and streaming
  sound documentation, and moves bundled examples into the `packages/examples` submodule.

## Short-text batch completed in the working tree

Changed share labels to explain build/run on opening a link; expanded the Examples ISA filter;
shortened `wfi` statuses and clarified recovery steps in input/audio warnings; revised helper and
register summaries, documentation-card descriptions, and six new page meta descriptions.
Generated help and `sim.h` outputs were regenerated from their sources. No runtime behavior changed.

Sources: `scripts/sim-header/helpers.mjs`, input/MIDI/PCM register models, `mars/chapters.ts`,
`mars/{MarsEmulator.svelte,InputController,MidiPortDevice,SampledAudioDevice}.ts`, share menu,
Examples route and six new MIPS/RISC-V documentation routes, all under `packages/asm-editor`.

Validation: focused device/help/project DOM tests passed except a header-generator subprocess
initially blocked by sandbox EPERM. Its rerun outside the sandbox passed all 42 tests. The three
RISC-V `a Step on wfi` tests passed. Both generation checks passed. Generated-header comparison
confirmed comments only, and catalog comparison confirmed summaries only. Formatting and
`git diff --check` passed. No browser or full-suite validation was performed.

Tooling: `pnpm` startup stalled because installed 12.7 differs from packageManager 12.13. Use
installed `node_modules/.bin/vp` directly. From `packages/asm-editor`, use
`../../node_modules/.bin/vp test run <focused paths>`. Help generation/checks can run with Node:
`node scripts/sim-header/generate.mjs [--check]` and
`node scripts/source-language-help/generate.mjs [--check]`.

## Examples and courses batch: completed in the working tree

Examples are a separate git repository at `packages/examples`, initially clean at
`21d297367cc95ce620e578efd2e4a42bdc3dd5d0`. Learner-facing sources include twelve bundled READMEs,
their `example.json` names/descriptions, asmOS's `welcome.txt`, and port descriptions in
`shared/asmos/build.mjs`. The repository README's example table is generated from that metadata.
Preserve slugs, names/IDs, ports, compilation records and executable/source assets.

Confirmed findings:

- asmOS's shared `welcome.txt` says it runs as one Linux program on x86, but it is bundled for
  RISC-V and MIPS too. Its generic introduction needs to describe all three versions.
- asmOS's README covers all three targets but its introduction and architecture/performance
  sections pack many distinct facts into long sentences. Keep running instructions, controls,
  application features and target-specific restrictions easy to find.
- `shared/asmos/example.json` is intentionally the x86 port description; `build.mjs` supplies
  RISC-V/MIPS descriptions. Revise the whole visible description set consistently.
- MIPS's archive excludes `videos/` to stay under the project limit. Do not promise the bundled
  Bad Apple!! video in that version. DOOM runs once per asmOS launch on RISC-V/MIPS.
- Most other example READMEs are short; verify controls and polish awkward wording without
  expanding them into tutorials or rewriting imported vendor text.
- Course scope is the nine changed `src/content/**/index.md` files from the PR: assembly-basics
  interrupts/exceptions; M68K trap-15; MIPS keyboard-control, exceptions/CP0, syscall, bitmap/keyboard;
  RISC-V keyboard-control, exceptions, bitmap/keyboard. Make local wording edits, preserving
  lesson structure, exercises and every executable fence.

The examples README group uses `docs-rewrite-orchestrator`: independent reader, separate writer,
then same-reader reread. Course additions are a direct local copyedit, not a course restructuring.

Reader `/root/examples_reader` finished its first review, saved verbatim at
`/tmp/pr108-example-reader.md`. Writer `/root/examples_writer` revised all twelve bundled READMEs,
asmOS's welcome text, three example descriptions and the two asmOS port descriptions. The parent
also revised the bouncing-ball description after the reread, making four edited `example.json`
files in total. `packages/examples/README.md` changed only through its generated example table.

The edits put running instructions and controls first, narrow the embedded Assembly Editor's
compatibility claim, expose MIPS video and DOOM restart restrictions, remove maintainer test
history/checksums and unsupported performance promises, and retain useful architecture and video
encoding explanations. The MIPS trap-file linking explanation was corrected: referenced exported
functions cause linking; `.ktext` determines the handler's placement.

The same reader's reread verdict was **READY WITH MINOR NITS**, with no textual blockers. Both
nits were addressed: the bouncing-ball description no longer suggests atomic frame presentation
on every target, and “asks a dialog something” became “waits for a ... dialog response.” No
additional reread is needed for those local wording fixes. This was a reading assessment, not a
browser or runtime verification.

All nine course pages received local wording edits. A structural check confirmed all **80 fenced
blocks**, all headings, lesson structure and exercises are unchanged; every linked documentation
route exists. No substantive learner reread was needed for these local edits.

Validation: the examples' Node build and `--check` both pass, packing **12 examples / 22 archives**.
An archive-content comparison against a fresh build of the submodule's original HEAD confirms
that IDs, settings, compilation records, executable code and assets are unchanged. Only README,
welcome text and project descriptions differ. The initially installed `dist` archives were stale
relative to tracked source; use a fresh HEAD build for preservation comparisons rather than that
cache. Temporary baseline source path is saved in `/tmp/pr108-examples-head-path`.

Root course formatting and both repositories' diff checks pass. The prior short-text batch's
file hashes still match `/tmp/pr108-short-text-baseline.json`. The examples repository has no
formatting configuration and is excluded by the editor's root formatter; its Markdown and diff
were reviewed directly. No broad test suite, browser run, compilation or emulator run was needed
for this prose-only batch.

A requested memory pointer was saved to
`/home/dev/.codex/memories/extensions/ad_hoc/notes/20261104T175128Z-pr108-public-copy-review.md`.
It points here for up-to-date status, research and remaining work.

## Reference documentation batch: authorized and in progress

Priorities: `inputController.md`, `soundDevices.md`, `mars/interrupts.{mips,riscv}.md`, new file/folder
sections of MIPS/RISC-V Syscalls/Runtime pages, new Using C linking sections, and changed x86
linking paragraphs. Include prose appended by their TypeScript renderers and CP0/CSR descriptions.
Problems: multiple rules per sentence, internal implementation language, unclear distinction
between typed characters and held keys, and dense error/persistence/timing explanations.

The reference pass uses two bounded reader/writer groups: devices and interrupt/register guidance;
and C/linking/file services. Consumer-visible snapshots are generated from actual documentation
chapters into `/tmp/pr108-reference`, including appended tables and API entries. Baseline hashes of
all earlier modified files are saved in `/tmp/pr108-before-reference-hashes.json`.

Fresh reader reports are saved at `/tmp/pr108-device-reader.md` and
`/tmp/pr108-file-reader.md`. The separate active writers are `/root/device_reference_writer` and
`/root/file_reference_writer`; their original readers are `/root/device_reference_reader` and
`/root/file_reference_reader`. Source and complete rendered-model baselines are in
`/tmp/pr108-reference/source-baseline.json` and its original `{mips,risc-v,x86}.json` files.
`/tmp/pr108-refresh-reference.mjs` refreshes consumer snapshots and writes revised models under
`latest/`; run it from `packages/asm-editor` after the writers stabilize and again after revisions.

Important findings being addressed: EPC must distinguish resuming interrupts from skipping or
retrying faults; the RV32 wheel sign-extension example needs explicit RV64 guidance; CSR
`time/timeh` uses Unix milliseconds (`calendarNow`, service 30), unlike MMIO `time`'s active
milliseconds from zero. Input Undo can restore more than 64 events, while Status saturates at
127, and losing Screen focus generates releases. C/file issues include C++ `extern "C"`, unsafe
blanket EEXIST advice, empty-folder persistence, NULL versus -1 returns and errno at readdir EOF,
and labeling the RV32-only offsets in the preserved folder-listing example. Keep all existing
executable fences unchanged and state their preconditions/variant-specific adjustments in prose.

## Worktree preservation and resumption

Unrelated existing untracked file: `docs/research/project-size-limit.md`. Do not change it.
The completed short-text diff is saved at `/tmp/pr108-short-text-baseline.patch`; its modified-file
SHA-256 baseline is `/tmp/pr108-short-text-baseline.json`. Course/example edits should not alter
those files. Update this note with results and remaining work before handing off.
