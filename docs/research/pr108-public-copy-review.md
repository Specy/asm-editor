# PR #108 public wording review

Updated: 2026-11-04. Working branch: `feat/asmos-doom-bad-apple`.
PR: https://github.com/Specy/asm-editor/pull/108
Original reviewed head: `9b35da73939f9f7281c19d85358f12d3a358257a`.
Resumed review head: `a5138d586767e6e874ffa62261d53b31b5d54eb2`.
Base: `origin/main`, `1c6f2915fc16b91a6673abd912e0951bb4ad3641`.

## Resumption after the usage-limit pause

The user completed and committed additional work while this review was paused. The wording drafts
are committed in `ae46d4fa`; `a5138d58` further corrects MIPS Cause/Status and the GNU CSR syntax
explanation. The project file limit is now 64 MiB (`5cdf9297`). The examples submodule is clean at
`94d1acb5a119ab30f5e33cd1b3270a630c42403a`, following the added beginner examples in `d65c697`.
**MIPS asmOS now includes its video.** Historical findings below about omitting it are superseded.

The independent reference rereads did not finish before quota exhaustion. Both original readers
have now reread fresh public snapshots from the current checkout. Both returned **READY WITH MINOR
NITS**, with every original blocker resolved. The small nits were addressed locally: current wfi
status wording, physical-key position wording, the MARS/RARS placeholder, a definition of program
entry files and the older x86 folder-persistence sentence. Their saved reports are
`/tmp/pr108-device-reread.md` and `/tmp/pr108-file-reread.md`. These final small wording fixes do
not require another substantive reader cycle.

Validation on resumption: all **53 focused documentation tests** passed across the documentation
model, MIPS register reference and syscall bindings. Both generated-help checks passed. The
preservation check confirmed all **93 reference Markdown fences**, both syscall contracts and
**2,041 rendered entry identities, links, signatures and examples**. The current examples build
and packaging check passed for **30 examples / 103 archives**. No browser or emulator run was
performed for these prose-only fixes.

The only pre-existing dirty editor file on resumption was
`packages/asm-editor/src/routes/projects/[project]/+page.svelte`; its current hash is saved in
`/tmp/pr108-resume-user-work.json`. Preserve that user edit. The resumed pass found stale video
availability text in asmOS's shared welcome and application table and corrected those two places.
Additional user screen/window/workbench layout edits appeared during review; those were also
left untouched. The original dirty project-page file still matches its resumption hash.

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

## Short-text batch completed (committed in ae46d4fa)

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

## Examples and courses batch: historical completion record

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

## Reference documentation batch: completed

Priorities: `inputController.md`, `soundDevices.md`, `mars/interrupts.{mips,riscv}.md`, new file/folder
sections of MIPS/RISC-V Syscalls/Runtime pages, new Using C linking sections, and changed x86
linking paragraphs. Include prose appended by their TypeScript renderers and CP0/CSR descriptions.
Problems: multiple rules per sentence, internal implementation language, unclear distinction
between typed characters and held keys, and dense error/persistence/timing explanations.

The reference pass uses two bounded reader/writer groups: devices and interrupt/register guidance;
and C/linking/file services. Consumer-visible snapshots are generated from actual documentation
chapters into `/tmp/pr108-reference`, including appended tables and API entries. Baseline hashes of
all earlier modified files are saved in `/tmp/pr108-before-reference-hashes.json`.

Initial reader reports are saved at `/tmp/pr108-device-reader.md` and
`/tmp/pr108-file-reader.md`. The separate writers were `/root/device_reference_writer` and
`/root/file_reference_writer`; their original readers `/root/device_reference_reader` and
`/root/file_reference_reader` completed the rereads after resumption. Source and complete rendered-model baselines are in
`/tmp/pr108-reference/source-baseline.json` and its original `{mips,risc-v,x86}.json` files.
`/tmp/pr108-refresh-reference.mjs` refreshes consumer snapshots and writes revised models under
`latest/`; run it from `packages/asm-editor` after the writers stabilize and again after revisions.

Important findings addressed: EPC must distinguish resuming interrupts from skipping or
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
SHA-256 baseline is `/tmp/pr108-short-text-baseline.json`. Those are historical baselines; user
commits after the quota pause supersede them. The current working branch contains the completed
rewrite. No requested wording batch remains pending, and no commit or push was requested.

## Follow-up inventory of newer content

The user's next request was to check newer changes for text outside the completed review. This
is an inventory, with no additional public-copy rewrite authorized by that request. Compared
`ae46d4fa..a5138d58`, the AI feature-switch commit `181f89f2`, examples
`21d2973..94d1acb`, and the current working changes. No user-facing text changed during this audit.

- `d65c697` added 18 beginner example READMEs and their descriptions beyond the original twelve
  reviewed examples. Most prose needs only a light pass, but the shared introductions sometimes
  describe one target as though all ports do the same thing. Source-verified examples:
  `binary-search` says 91 in twelve numbers while x86 searches for 23 in six;
  `factorial-and-fibonacci` says factorial(8) while x86 calls fact(10);
  `subroutine-with-stack-arguments` describes sum_of_squares while x86 calls sum7;
  `sum-of-an-array` directs x86 readers to rax, which is overwritten for exit, while the program
  explicitly preserves the result in r8. Check shared descriptions and target tables together.
- New ports of previously reviewed examples also need a consistency pass. Flappy Bird's README
  still says "Both versions" above five variants. Its current C compilation instructions have
  awkward wording about running "slower than its 20 millisecond frames."
- Current uncommitted MIPS Flappy Bird, RISC-V Flappy Bird, and RISC-V Flappy Bird in C lessons and
  metadata contain substantial new prose outside the original nine-page course batch. Priorities
  are the long RISC-V description, dense drawing explanations, the blanket -O0 variable-storage
  explanation, and absolute claims about unseen partial frames and 20 ms timing. The latter
  claims were identified for verification, not established as runtime defects by this audit.
- The new Projects loading message and MIPS unused-handler/linking hints are clear enough to
  keep. Many added-looking import/limit diagnostics were existing strings moved by the refactor,
  rather than new unreviewed wording. The AI switch and current floating-screen/share changes
  primarily change behavior and visibility, with no substantial new copy batch found.

Recommended next scope: beginner README/description and port-consistency fixes first, then a
bounded review of the three Flappy Bird lessons once their current changes settle. This audit
used source comparison only, with no browser or emulator validation and no commit or push.

## Follow-up rewrite: non-README content first

The user authorized the follow-up inventory and requested non-README content before READMEs.
The current-worktree baseline is saved at `/tmp/pr108-followup/source-baseline.json`; dirty-file
hashes are at `/tmp/pr108-followup/dirty-baseline.json`. Preserve concurrent screen, sharing,
startup-flag, compilation-record and example-code changes. Do not commit or push.

The three Flappy Bird lessons and their metadata received a local wording and accuracy pass.
Teaching order, all headings, routes, exercises and all twelve fenced blocks are preserved.
No course restructuring or substantive learner rewrite was performed, so the sequential-course
orchestrator was not needed. Drawing explanations now describe copying scenery and skipping
unchanged stores directly. Timing targets 20 ms without promising exact browser timing or hidden
partial frames. The C lesson explains -O2 without claiming -O0 keeps every variable in memory,
and its final edit instructions include Compile before Build and Run. All three course
descriptions are shorter, and their titles use Flappy Bird consistently.

Nine new example descriptions were clarified before starting the README batch. In particular,
Factorial and Fibonacci no longer promises factorial(8) for every target, Hello world no longer
claims to be the shortest program with output, and Chiptune describes its three sound channels
without a broad claim about game-console music. Structured metadata is preserved.

Source evidence: `mars/marsHandlers.ts` flushes devices before service 32 waits, while
`ScreenRenderer.svelte` paints on its own animation loop. Sleep is therefore useful for displaying
a frame, but does not guarantee that no partial drawing is visible. The three games' `wait_frame`
implementations target deadlines, reset when late and always wait at least 1 ms.

The README batch uses `docs-rewrite-orchestrator`: fresh reader, separate writer, then same-reader
reread. Its bounded scope is the eighteen new example folders plus Flappy Bird, Bouncing ball
and Mouse paint, whose new target variants need a consistency check.
