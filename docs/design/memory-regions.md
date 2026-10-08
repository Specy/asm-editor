# Memory regions in the memory view

Status: implemented locally on 2026-10-08; the five Core releases and editor dependency pins are pending publication. Terms are in [CONTEXT.md](../../CONTEXT.md) (**Memory region**); the export shape is [ADR 0042](../adr/0042-memory-regions-from-core-layout-exports.md).

## What it is

A picker in `MemoryControls` that jumps the memory view to a **Memory region** or a data label, and a tint on the byte grid that shows which region each byte belongs to. It answers the request "jump between the text/data sections, the labels of data, the heap and the stack".

## Decisions

1. **Destinations.** Regions are the top-level entries; the data labels inside a region are listed under it. Choosing a region jumps to its start (the stack to the stack pointer), choosing a label to its address. Code labels are not listed.
2. **Source.** The Cores' own layout facts, mapped into regions by each language adapter; device regions from the Peripherals that map memory (ADR 0042).
3. **Extent.** A region covers what the program occupies now, not what the environment reserves. The heap runs from its start to the current break, the stack from the stack pointer to its top; a region not yet touched is listed empty at its start address.
4. **Granularity.** A region is a run of one kind of content (code, data, reserved) inside one section. A language with only `org` takes each contiguous assembled run as its section; an EASy68K numbered section is a section. A data label is one that falls in a data or reserved region.
5. **Picker.** A button beside the address input opens a popover listing the regions grouped by section, a section of one run shown as one row and a split one as a header over its runs, each run named by its kind and first label, with addresses and sizes and a filter as you type. The controls show the region the current page is in (`.data · buffer`), and the address input accepts a label and an offset (`buffer+16`). It goes wherever `MemoryControls` goes: the Workbench, the compact layout, the Playground and the Stack pointer **Debug tool**.
6. **Grid.** Each byte has a faint background tint by its region's kind, and hovering a byte names its region and the nearest data label at or below it with an offset (`.data · buffer+3`). The stack pointer highlight, the `??` overlay and the selection win over the tint; the call stack colours keep the text. The popover is the tint's key.
7. **Devices.** Listed as a group of their own and kept when they overlap a program region; on overlapping bytes the device tint wins and the hover names both (`Bitmap display · .data · buffer+3`).
8. **The stack's top.** The top is where the current stack started: the Core's initial stack pointer, until one instruction moves the stack pointer by more than 4 KiB in either direction, which starts a new stack topped at the new value. The stack pointer rising above the top raises the top. The Core applies the rule after every instruction and keeps the top in its own Undo history, so Undo restores it; the editor reads it as one number, like the stack pointer (settled while planning: during a Run the editor sees only slices of thousands of instructions, so it cannot apply the rule itself). Its one false case, a single allocation of more than 4 KiB on the stack, heals when that function returns. The rule is not essential: a Core where it costs measurable throughput or real complexity falls back to the convention, the top fixed at its initial stack pointer.
9. **Compiled names.** For a Build from C or C++ the adapter shows data labels by their source names: C++ names demangled (`_ZN4Game5scoreE` as `Game::score`, the raw name in the hover), a function static without the compiler's `.N` suffix unless two would then collide, and a string literal under its `.LC0`/`$LC0` name with the start of its text beside it (`.LC0 "Hello, wor…"`). Handwritten assembly keeps its names as written.
10. **The heap.** One region from the heap's start to the current break, where the environment has a break: MIPS and RISC-V (`sbrk`, and C `malloc` through the **Runtime library**) and x86 (`brk`). M68K and Z80 have no heap region.
11. **Library labels.** Data labels defined by a **Library member** or the **Start unit** are hidden from the picker unless its "Show library labels" toggle is on, and the hover names them either way, marked as library. Each Core's layout export flags whether a symbol came from the program's own **Files**, since the Cores already resolve Library members ([ADR 0030](../adr/0030-cores-resolve-runtime-library-members.md)); a name filter would miss `errno` and `stdout` and hide a person's own `__foo`. Regions are not split by owner.
12. **Lifetime.** Regions exist only during a **Debug session**: the layout is read at the Build, the heap's and stack's ends refresh with the memory view, and the regions stay after the program exits. Before the first Build and after Stop the picker is disabled ("Build to see memory regions"), the grid has no tint and a label typed in the address input says there is no Build. The **Files** are locked during a session, so the layout cannot go stale against the source.

## Deferred

- **Heap blocks.** Listing each `malloc` block under the heap. Reading the chunk headers of `malloc_impl.h` from the editor would tie it to an implementation [ADR 0031](../adr/0031-projects-pin-the-runtime-abi-not-its-implementation.md) keeps free to change; done later, the Runtime library exports a stable heap walk and the editor calls it.

## Implementation notes (2026-10-08)

The shared model and merge helpers are in `src/lib/languages/memoryRegions.ts`.
The layout is captured once per Build; moving bounds and device geometry refresh
with Core views. Stop, a new Build and the end of a Testcase clear the layout.
All memory controls and render sites, including both Playground layouts and the
Stack pointer tool, receive the same regions and labels.

MARS, s68k, Blink and Z80 implement the 4 KiB stack-top rule and restore their
tracked top in native Undo history. RARS uses the explicitly permitted fixed
initial-SP fallback: a warmed compute loop with Undo measured about 3843 versus
3610 instructions/ms with adaptive tracking (about 6% slower). Its instruction
loop therefore remains unchanged. After reverting the loop tracking, an isolated
benchmark measured about 3666 instructions/ms published versus 3726 locally. MARS and RARS now restore the heap break on
Undo. Blink's existing irreversible `brk` history boundary remains in force.

Flat Core layout tuples have **five**, rather than four, fields: address, length,
kind, section, alignment. The alignment field preserves the facts needed to merge
small padding gaps without bridging `org` holes. MARS and RARS additionally export
parallel symbol source paths, so included Generated assembly receives compiled
names without renaming handwritten labels in the same Build. Blink preserves
translated compiler names in NASM comment metadata and reports their source paths.

C++ names use a lazy, self-contained Emscripten build of LLVM libc++abi (about
95 KB uncompressed; its license and rebuild script are checked in). Compiled
provenance comes from reachable Compilation records. Suffixes are retained on
collisions, and string previews decode UTF-8, escape control characters, and show
up to 24 characters. No demangler is loaded for C or handwritten assembly.

The tint is a 13% theme-colour mix: code/stack accent, data green, reserved hint,
heap accent2 and device red. Device overlaps keep both hover descriptions. Stack
pointer and selection highlights take precedence; unreadable bytes retain their
existing presentation. The popover uses the shared Select's top layer, a 360 px
preferred width clamped to the viewport, filtering, keyboard navigation and
label-name type ahead. Library labels stay hidden until selected by the toggle.

The Core manifests are prepared for MIPS/RISC-V 4.2.0, s68k 3.1.0, Blink 6.1.0
and Z80 1.2.0. This checkout uses `npm run emulators:local`; the editor manifest
and lockfile still pin the published predecessors. Per the plan, the owner must
commit, push and publish each Core before those pins can be updated. A registry
install does not yet contain these APIs. Release completion also needs the editor's
submodule pointers updated to the resulting Core commits.

Validation covers static layout and label classification, included compiler
provenance, data-only library ownership, heap/stack Step and Undo, region lifetime,
moving device bounds, picker filtering and keyboard input, and tint/hover
precedence. The complete MARS/RARS package suites, s68k's 600 native tests, Z80
machine suite, Blink's native-history/compiler suite and all five distribution
smoke tests passed. Chrome checks cover all five Targets; responsive and theme
checks are recorded in the implementation plan.
