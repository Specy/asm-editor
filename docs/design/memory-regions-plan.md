# Memory regions: implementation plan

Written on 2026-10-08 after the design interview. The decisions are in [memory-regions.md](./memory-regions.md), the export shape in [ADR 0042](../adr/0042-memory-regions-from-core-layout-exports.md), the vocabulary in [CONTEXT.md](../../CONTEXT.md) (**Memory region**). The plan covers one release of each of the five Cores, the editor's mapping in the five adapters and the picker and outlines in the memory view. Implemented in local Core builds and editor code; publication and registry dependency integration remain pending.

## Starting point

Checked on 2026-10-08 in this checkout, partly by building programs against the current Core builds.

| Area                  | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Memory view           | [MemoryControls.svelte](../../src/components/specific/project/memory/MemoryControls.svelte) has a hex input (`searchAddress`, :43), Previous and Next page and no emulator access; [MemoryRenderer.svelte](../../src/components/specific/project/memory/MemoryRenderer.svelte) styles each byte inline (:466-496: stack pointer `--accent2`, then selection `--green`, then the call stack's text colour from `getColorOfAddress`, :308) and hovers through `ValueDiff`. Rendered by `DebugColumn.svelte:82-108`, `WorkbenchCompact.svelte:146-170`, `InteractiveInstructionEditor.svelte:623,705` and `StackPointerView.svelte:53,67`. Clicking a register jumps to its page. Nothing knows labels, sections, the heap or devices.                                                                                                                                                                                                                                                                                                                   |
| Emulator layer        | The Register file pattern (ADR 0021) is the template: shared types in `commonLanguageFeatures.svelte.ts:356-384`, optional adapter hooks in `BaseEmulator.svelte.ts:206-225` (methods, not arrow fields: `GenericEmulator` calls them from its constructor), `$state` built at `GenericEmulator.svelte.ts:264-309`. Per-Build data is copied in `addDecorations` (:332-338, after `_initialize` and `_beginExecutionSession` in `compileInternal`, :1043); everything is cleared in `clear()` (:976-1028, also run by Build); every refresh goes through `refreshCoreViews` (:1426-1432), whose `updateData` (:758-764) reads the pc and the call stack. No editor-side per-step snapshots exist: Undo re-reads the Core.                                                                                                                                                                                                                                                                                                                             |
| Peripherals           | No shared Peripheral interface; `InjectedPeripherals` (`peripheralSet.ts:22`) holds only devices that are not memory-mapped. `MarsDevices` (`mars/MarsDevices.ts:100`: MMIO 0xFFFF0000-0xFFFF000F at :26-29, bitmap geometry from `marsDisplayGeometry`, re-set by `setDisplay`) and `Trs80Devices` (`Z80/trs80/Trs80Devices.ts:52`: video 0x3C00-0x3FFF, keyboard 0x3800-0x3BFF, mapped only while `isEnabled`) are adapter-private.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| C/C++                 | `BuildSources` (`projectFiles.ts:150-169`) carries no C/C++ flag; `CompilationRecord` (`sourceCompilation/records.ts:19-38`) has the language, and `WorkbenchSession.sourceInput` (:304-335) and `playgroundProgram.ts:61-65` fold records into a Build. No C++ demangler is installed; Compiler Explorer is called with `demangle: false` and Blink's `demangle.c` spawns `c++filt`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| MARS and RARS (4.1.0) | Nothing exports the symbol table, the sections, the heap break or the initial `$sp`. `Symbol` holds `name, address, data` (data/text flag) and no owner. The user's Files are one program object; each Library member is its own (`RuntimeLibrary.load`), its locals in a table nothing reads and its globals mixed into `Globals.symbolTable` in `GnuAssembler.link` (MIPS :396-405). MARS dialect: `.text`/`.ktext` hold only instructions, `.data`/`.kdata`/`.rdata`/`.bss` share the data counters, data addresses are written in the first-pass directive handlers (`writeToDataSegment`, `.space`, `.comm`, `.extern`). GNU profile: each `Section` has `name, family, base, size, unit` after `layout()` (MIPS :444-491); TEXT holds only instructions. `Memory.heapAddress` is the break; **Undo does not restore it** in either Core. Initial `$sp` 0x7FFFEFFC. Exports cross as parallel `int[]` (as `Int32Array`) and `String[]`; the TS interface in `marsjs/ts/src/index.ts` is hand-written. Tests are Node scripts in `ts/test/*.mjs`. |
| s68k (3.0.0)          | `Layout`'s per-line `Item` (Instruction, Data, Reserved) is discarded by `finish`; what survives is `AssembledInstruction` and `MemoryRun {address, Bytes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Reserved, location}`in`Program`, neither exported to JS, and neither carries its section. Sections: 16 counters, `org`moves the one in force,`offset`regions produce nothing. Alignment padding is not an item and leaves a 1-byte gap. Locals are qualified`start:loop`. No Library members. Initial SP is the literal 0x01000000 (`interpreter.rs:880`), not exported. Flat exports return `Vec<u32>`as`Uint32Array`. |
| Blink (6.0.0)         | The linked ELF keeps its whole symbol table; `src/elf-symbols.ts` (`readElfSymbolTable`, not exported) already parses sections and symbols. Locals are grouped under each object's `STT_FILE` (`/assembly.s`, `/__x86_project/<path>`, the Start unit as `/__x86_project/@runtime/start.asm`); globals are not, but each unit's own object symbol table is kept in `assembled.units`. NASM's symbol types are unreliable, so the kind comes from the section: `SHF_EXECINSTR` code, `SHT_NOBITS` reserved, else data. NASM writes line rows for `db` in `.text`, so data inside `.text` cannot be told from code. `brk` is compiled in, starts at 0x88000000 (not after `.bss`), and a moving `brk` is irreversible for Undo. The translator renames `.LC0` to `LC0`. Initial `rsp` 0x4FFFFFFFFED0 under a top of 0x500000000000. C exports are `EMSCRIPTEN_KEEPALIVE` `blinkenlib_*` functions.                                                                                                                                                      |
| Z80 (1.1.0)           | `AssembledLine` has `address`, `binary`, `variant` (set for opcodes only) and `nextAddress`; `isData()` is "bytes and no variant". A `ds` or `align` without a fill byte emits nothing and looks exactly like an `org`, so the reserved kind needs a Core change. `asm.symbols` are typed (CONSTANT, CODE, BYTE, WORD, ARRAY) and can repeat a name across `#local` scopes. `machine.stackTop` is already public. No Library members.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## Decisions taken while planning

1. **The Core keeps the stack's top** (confirmed by the owner). Each Core applies decision 8's rule after every instruction and records the top in its Undo history. If it costs measurable throughput or real complexity in a Core, that Core falls back to the convention: the top fixed at its initial stack pointer.

The rest were taken by default, for the owner to overturn:

2. **MARS and RARS restore the heap break on Undo.** A `sbrk` (syscall 9 and service 1100) records the previous break with the instruction. Without it the heap region would disagree with memory after an Undo; the gap is a bug today regardless of this feature.
3. **x86 classifies by section only.** `.text` is one code region even where handwritten NASM puts `db` in it, since nothing in the object separates the two. GCC never puts data in `.text`.
4. **x86 reports the compiler's names.** The Core maps a translated name back through the translator's name table, so the editor sees `.LC0`, matching the Generated assembly the person reads, not `LC0`.
5. **A `ds` with a fill byte is reserved** on Z80 and M68K, because it is what the person wrote, even though it emits bytes.
6. **Alignment padding joins the run before it.** Runs of the same kind and section merge across a gap smaller than the next item's alignment, so `dc.b` followed by `dc.w` is one data region.
7. **MARS's `.extern`, `.kdata` and `.ktext` are sections** like the others: `.extern` as a data region at 0x10000000 when it holds a symbol, the kernel sections where the program uses them.
8. **s68k and Z80 symbols are all the program's own**, as neither has Library members; their exports carry no owner flag.
9. **Labels resolve by the Core's own rule** in the address input: case-sensitive on MARS, RARS and NASM, case-insensitive on Z80 (its names are stored lower-case) and as s68k resolves them. An unknown label says so in the input's error state, as an invalid hex address does now.

## Milestones

M0 comes first. The five Core milestones are independent of each other and of M2. M3 needs M0 and its Core; M4 needs M0 and can start on fake data.

### M0: Editor groundwork

- Shared types in `commonLanguageFeatures.svelte.ts`: the layout one Build reports (sections, each with its runs `{start, length, kind}`; data labels `{name, address, section, fromLibrary, displayName?, preview?}`), the moving ends (heap start and break, stack top), device regions `{name, start, end}` and the merged `MemoryRegion` the UI reads.
- One shared function that turns per-item records into runs: sort by address, merge items of the same kind and section across alignment gaps (decision 6), and assign each data label to the run it falls in. Every adapter feeds it its Core's items.
- Optional `BaseEmulator` hooks, as methods: `_getMemoryLayout?()` (once per Build), `_getHeapBounds?()` and `_getStackTop?()` (per refresh), `_getDeviceRegions?()` (per refresh, since the MARS bitmap can move and the TRS-80 mode can switch on mid-run).
- `GenericEmulator`: read the layout in `addDecorations`, the moving ends and device regions in `updateData`, clear all of them in `clear()`; expose `memoryRegions` and `dataLabels` getters through `Emulator.ts`. Merge per decision 7 of the design.
- `BuildSources` gains the language each Generated assembly path was compiled from, filled in `WorkbenchSession.sourceInput` and `playgroundProgram.ts` from `reachableRecords`.
- Tests: `GenericEmulator.test.ts`'s `FakeEmulator`, after the Register file tests (:359-440): layout read once per Build and cleared on Stop, moving ends refreshed, merging and label assignment.

### M1: MARS and RARS (`@specy/mips`, `@specy/risc-v`)

The same change in both, in `marsjs`/`rarsjs` and the assembler.

- **Layout.** Record `(address, length, kind, section name)` items during assembly. MARS dialect: data items in the first-pass directive handlers (`writeToDataSegment`, string bytes, `.space`, `.comm`/`.lcomm`, `.extern`), code from the final `machineList` (user and kernel text). GNU profile: in `link()` after relaxation, each kept section's `name, family, base, size`, with kind from its family (TEXT code; RODATA, INIT, FINI, DATA data; BSS, COMMON reserved).
- **Symbols.** Enumerate the entry program's local table and the global table with the data flag and an owner flag set where symbols are inserted (`link` and `bindSymbols` in `GnuAssembler`, `transferGlobals` in `Assembler`), from whether `RuntimeLibrary` owns the unit's path. Data-only members' locals become reachable by keeping the units' tables after linking.
- **Exports** on `JsMips`/`JsRiscV`, flat per ADR 0021: `getLayoutItems(): int[]` (address, length, kind, section index per item), `getSectionNames(): String[]`, `getSymbolNames(): String[]` with `getSymbolValues(): int[]` (address, data flag, owner flag per symbol), `getHeapBreak(): int`, `getStackTop(): int`. `getHeapStart` exists. Hand-write the TS interface entries.
- **Heap break Undo** (decision 2): a backstep entry on each break change.
- **Stack top** (decision 1): updated after each instruction in the simulator loop, with a backstep entry when it changes.
- **Tests** in `ts/test/`: a MARS-dialect program with `.text`, `.data`, `.space`, `.extern` and `.kdata`; a GNU-profile C program linking Library members (owner flags, `.rodata`/`.data`/`.bss`); `sbrk` then Undo; `la $sp` then pushes then Undo. Run the throughput benchmark before and after the stack-top change.

### M1: s68k (`@specy/s68k`)

- Add the section in force to `LinePlan` (filled in `plan()`), and keep a per-item list `(address, length, kind, section)` in `Program` from `assemble_line`; `offset` regions already produce nothing. Locals keep their `start:loop` names.
- Export the items as a `Uint32Array` from `WasmAssembly`, the initial and current stack top through the interpreter, and `Program.getLayoutItems()` / `getStackTop()` in `ts-lib/src/index.ts`.
- Stack top tracked in the step loop and saved with each step's Undo record.
- Tests: layout items in `src/test/` (sections, `org` within a section, `ds.w 0`, `offset`, `incbin`, alignment gaps), a snapshot over the EASy68K corpus, `lea stack,a7` then Undo, and the JS smoke test.

### M1: Blink (`@specy/x86`)

- **Layout in the package** from `readElfSymbolTable` over the linked ELF: allocated, non-empty sections with their flags, kind per decision 3, dropping `.eh_frame`, `.note.*` and `.got`; data symbols (in non-executable sections) with an owner: locals from their `STT_FILE` group, globals from the unit whose object defines them (`assembled.units`, as `duplicateUserDefinitions` already walks them). The Start unit and support archives count as library.
- **Names** (decision 4): translated names mapped back through the translator's name table.
- **C exports** `blinkenlib_get_brk`, `blinkenlib_get_brk_start` (heap start is `brkstart`, or `brk` before the first call) and `blinkenlib_get_stack_top`, the last updated per instruction and journalled with the step.
- **Exports** on the emulator: `getMemoryLayout()` (flat, as the others) and the three numbers; declared in `src/wasm-types.ts`. Rebuild the committed wasm with `./compile_blink.sh`.
- **Tests:** extend `tests/elf-symbol-table.test.ts` and `tests/project-linking.test.ts` (owner across `program.o`, `start0.o`, `program.a` and `support.a`), `tests/linux-syscalls.test.ts` for `brk`, a stack top test, and `npm run test:dist`.

### M1: Z80 (`@specy/z80`)

- Public `kind` on `AssembledLine` (`code`, `data`, `reserved`, or nothing for `org`, `#code` and lines that emit nothing), set where `ds`/`defs` and `align` advance (`Asm.ts:1293`, :1261) and where bytes are emitted. Decision 5: a `ds` with a fill byte stays reserved.
- Stack top tracked in `Z80Machine` per instruction, saved in its history, starting from `stackTop`.
- Tests in `Asm.spec.ts` (kinds, `ds` with and without fill, includes, macros) and a machine spec for `ld sp,$8000` then pushes then Undo; `test:dist`.

### Releases

One release per Core after its milestone, minor versions since every change adds: `@specy/mips` and `@specy/risc-v` 4.2.0, `@specy/s68k` 3.1.0, `@specy/x86` 6.1.0, `@specy/z80` 1.2.0. Each Core is its own repository and its release is a version-bump commit; the owner pushes and publishes. Core READMEs gain the new exports in their own style.

### M2: Device regions

- `regions()` on `MarsDevices` (the MMIO block, and the bitmap from its current geometry) and `Trs80Devices` (video and keyboard, only while enabled); the MIPS, RISC-V and Z80 adapters implement `_getDeviceRegions` by delegating.
- Tests beside `mars/MarsDevices.test.ts` and `Z80/trs80/Trs80Emulator.test.ts`: the bitmap moves with `setDisplay`, TRS-80 regions appear when `; @screen trs80` is set.

### M3: Adapters

Per language, after its Core release and the dependency bump:

- Map the Core's items, sections and symbols into M0's records; read the heap bounds and the stack top. M68K and Z80 have no heap; M68K and Z80 symbols carry no owner (decision 8).
- **Compiled names** (design decision 9), for Builds from C or C++: a demangler for Itanium names (none is installed; choose a small browser-ready one or vendor one, licence permitting), the `.N` suffix dropped unless two names would collide, and a string literal's preview read from memory at its address up to the first zero or 24 characters.
- Tests in each `*Emulator.test.ts`, driving the real Core: regions and labels after a Build, the heap growing with `sbrk`/`brk`, the stack top across `ld sp`/`la $sp`/`lea` and Undo, library labels flagged.

### M4: Memory view

- **Picker** in `MemoryControls`: a button beside the search button opening a popover built on `components/shared/input/Select.svelte`'s anchored popover and type-ahead. Regions grouped by section (one row for a section of one run, a header over the runs of a split one), each run named by kind and first label with address and size, data labels under their run, devices as their own group, the "Show library labels" toggle, the outline swatches as the key. Disabled outside a Debug session ("Build to see memory regions").
- **Current region** shown in the controls (`.data · buffer`).
- **Address input** accepts `label` and `label+offset` (decision 9), resolved through the emulator's data labels and, for code labels, the Core's lookup.
- **Outline** in `MemoryRenderer`: a border per region drawn on the exposed edges of its cells, in `memoryRegionColor` (kind hex mixed 85% with the secondary text colour); the device outline wins on overlap; the stack pointer highlight and the selection stay on top.
- **Hover** through `ValueDiff`'s `hoverValue`: region, nearest data label at or below with the offset, the raw name for a demangled one, both names on a device overlap, "(library)" for library labels.
- Pass the regions and labels to all four render sites; the Playground's narrow card shows the picker as an icon button.
- Tests: `MemoryRenderer.dom.test.ts` for outline precedence and hover text, a new `MemoryControls.dom.test.ts` for the picker, the toggle and label input. Verify in Chrome on a MARS program with the bitmap display, a RISC-V C program with `malloc`, an M68K program with interleaved `dc`, a Z80 TRS-80 program and an x86 C++ program.

### M5: Records

- Mark [memory-regions.md](./memory-regions.md) implemented with any deviations; note in this plan which Cores kept the stack-top rule and which fell back.

## Implementation choices

- Demangler: lazy libc++abi Emscripten module; license and rebuild script included.
- Outline: kind colours mixed 85% with the secondary text colour (superseded the 13% background tint; see memory-regions.md decision 6).
- Playground: icon trigger; preferred 360 px popup clamped to the viewport, verified on a 241 px card.
- Stack threshold: 4 KiB retained in four Cores; existing course/corpus suites pass. RARS uses the fixed initial-SP fallback after benchmarking.

## Implementation record (2026-10-08)

| Milestone | Local status                                                                                                                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M0        | Shared model, per-Build layout, moving bounds, lifecycle clearing and compiled provenance implemented.                                                                                                                               |
| M1 MARS   | Layout/symbol exports, source paths, library ownership, heap Undo and adaptive stack top implemented; complete package tests pass.                                                                                                   |
| M1 RARS   | Same layout, ownership and heap Undo; **fixed initial stack top fallback**, after an adaptive-loop benchmark measured about 6% slower. Complete RV32/RV64 package tests pass.                                                        |
| M1 s68k   | Section/item exports and adaptive stack Undo implemented; public history serialization preserved; 600 native tests and distribution smoke pass.                                                                                      |
| M1 Blink  | ELF layout, translated names, symbol ownership and native heap/stack exports implemented; adaptive stack Undo and committed WASM rebuilt. Existing `brk` irreversibility preserved. Core/compiler tests and distribution smoke pass. |
| M1 Z80    | Emission kinds, alignment and adaptive stack top with Undo/snapshot restoration implemented; machine and distribution tests pass.                                                                                                    |
| M2        | MARS MMIO/current bitmap and enabled TRS-80 regions implemented.                                                                                                                                                                     |
| M3        | All five adapters map Core facts; compiled names, collision handling and literal previews implemented.                                                                                                                               |
| M4        | Picker, current-region description, label/offset input, outline and hover wired to every render site. DOM and real-browser checks pass.                                                                                              |
| M5        | Design updated with implementation choices and deviations.                                                                                                                                                                           |
| Releases  | Core manifests and README APIs prepared. Owner release commits, pushes/publication, editor submodule pointers and registry dependency pins pending.                                                                                  |

The flat layout ABI uses a fifth **alignment** field, and MARS/RARS export
`getSymbolFiles()` alongside names/values. These additions supply the padding and
mixed-source provenance facts the editor otherwise could not recover.

The chosen demangler is the browser-ready libc++abi Emscripten module rebuilt by
`scripts/demangle/build.sh`, with the matching license included. Its roughly 95 KB
module loads only for C++ Builds. The picker is an icon button even in narrow
cards; its 360 px popup is clamped to the viewport. Theme tint is 13%.

Release handoff: after publishing the prepared Core versions, install the exact
versions below to regenerate the editor lockfile, then update the submodule
pointers to the released commits. Until then, build the submodules and use
`npm run emulators:local`; registry packages lack the new exports.

```sh
npm install --save-exact @specy/mips@4.2.0 @specy/risc-v@4.2.0 @specy/s68k@3.1.0 @specy/x86@6.1.0 @specy/z80@1.2.0
```

Validation: 511 focused editor tests passed, including all five adapters, layout
lifetime, compiled names/provenance, moving bitmap geometry and picker/render DOM
behavior. Blink's full suite passed (3105 tests), followed by 2064 compiler/layout
tests after the included-source provenance refinement. MARS/RARS complete package
suites, s68k's 600 native tests, Z80's machine suite and all five distribution smoke
tests passed. Chrome builds and picker navigation covered MIPS with bitmap overlap,
RISC-V, interleaved M68K data, Z80 with TRS-80 regions and x86. Chrome also compiled
and ran a RISC-V C program with `malloc` (heap grew from
0 to 32 bytes), and an x86 C++ program showed `Game::score` and
`.LC0 "Hello, memory"` in the picker. All five built-in themes and a custom light
palette resolved every tint at 13% opacity. Keyboard filtering and label type ahead
were checked in Chrome as well as the DOM tests.

The 390 px viewport check kept the popup inside the viewport, including when its
control was inside the compact layout's horizontally scrolling memory pane. The
Playground's 241 px memory card displayed the icon and opened the same picker.
Stop disabled the picker and cleared the layout in the browser. No runtime
exceptions occurred. Final type-check: zero errors (31 existing warnings); changed
editor files pass ESLint and formatting checks. A final focused rerun after the
history-action descriptions and reserved tint correction passed 205 tests.

With RARS's fallback restored, an isolated warmed benchmark measured about 3666
instructions/ms for the published Core and 3726 for the local Core; the adaptive
loop's slowdown is avoided. This is a throughput check on one compute loop, not a
claim about every program. Existing course/corpus suites pass with the 4 KiB rule
in the other Cores; its documented large-single-allocation limitation remains.
