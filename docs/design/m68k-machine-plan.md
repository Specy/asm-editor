# A real 68000 behind the M68K Target: implementation plan

Written on 2026-10-21, beside the [design](./m68k-machine.md), and revised the same day after the owner's review:

- decisions 4, 7, 9 and 24 confirmed;
- the Hardware panel and the S-record Executables deferred;
- the 68010 and 68020 added as dialects.

On 2026-10-28 the owner confirmed design decision 3's `opt p=` and planning decisions 11 and 12, and batch 1 began. The editor's IRQ ADR is numbered 0065, since 0055 was taken meanwhile. The same day the owner deferred the Build output's format (design decision 32), so E5 is deferred and has no ADR.

The plan covers both halves:

- **the s68k Core** (`packages/m68k`, crate `s68k`, npm `@specy/s68k`);
- **the editor's integration** (`packages/asm-editor`).

The editor runs the checked-out Core as `workspace:*`, so each Core milestone can be integrated as soon as it lands, without waiting for an npm release. The work is cut into five batches, and each batch ships on its own. The first three make the 68000; the last two add the dialects.

## Starting point

Checked on 2026-10-21 against the Core at `87d94d7` (3.1.2 plus the forms export) and the editor on `feat/pseudocode`. Throughput was measured under Node 24 with the built `ts-lib/dist`.

| Area               | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layout             | Two passes and no loop ([layout.rs:97-102](../../packages/m68k/src/assembler/layout.rs)). Every instruction is `INSTRUCTION_SIZE = 4` (`layout.rs:71`, used at `:318`, `:656`, `:1026`, `:1042`). Everything else already reads the stored per-instruction size (`end_address`, `increment_pc(size)`, `instruction_ending_at`). Forward references are allowed in operands, `dc` and `end`, and refused in `org`, `equ`, `set`, `ds` counts, `offset` and `section` (`layout.rs:1751-1785`). Only two encodings depend on values: unsized branches and unsized absolute addresses. Sections 1–15 start at address 0, so section data with no `org` lands on the vector table today (`layout.rs:2027-2031`).                                                                                                                                                                  |
| Lowering           | Loses the branch size (`analyzer.rs:712-717`, `lowering.rs:167-174`) and the absolute width (`lowering.rs:80-85`). Lowers `add #n,an` to ADDI with An (`lowering.rs:463-479`), and `and`/`or #n,<memory>` to AND/OR with an immediate source; neither can be encoded. PC-relative uses +2 everywhere (`encoded.rs:169`, `lowering.rs:113-122`, `interpreter.rs:3391`), which is wrong for `movem d(pc),list` and `btst #n,d(pc)`. `Instruction`, `Operand` and `IndexRegister` do not derive `PartialEq`. In memory, an `Instruction` is 40 bytes and an `AssembledInstruction` 152.                                                                                                                                                                                                                                                                                         |
| Table              | 125 rows, 122 implemented ([table.rs:885-1291](../../packages/m68k/src/assembler/instructions/table.rs)). Refused: `rte`, `stop`, `reset` (rows), `move usp` (`analyzer.rs:453-479`) and `trap #0-14` (`analyzer.rs:794-808`). Two non-68000 extras: `move ccr,<ea>` and `extb.l`; no course, example or corpus program uses either. The forms export ([lib.rs:549-618](../../packages/m68k/src/lib.rs)) has modes, sizes and privilege but no opcode bits and no processor.                                                                                                                                                                                                                                                                                                                                                                                                 |
| Interpreter        | Every step does a binary search over the Program's instructions, plus a second one when history is kept ([interpreter.rs:1211-1221](../../packages/m68k/src/interpreter.rs)). Loads and stores that touch code are refused (`InstructionAccess`, `:392-397`), and so are host writes. Every runtime error ends the program (`end_with_an_exception`, `:1124`). There is one A7. The SR's high byte has no effect and keeps bits a 68000 lacks. Statuses are `Running, Interrupt, Terminated, TerminatedWithException, Paused`, exported by number, so new ones are appended.                                                                                                                                                                                                                                                                                                 |
| Undo               | Mutations are `WriteRegister`, `WriteMemory`, `WriteMemoryBytes`, `PushCall`, `PopCall` and `SetInputSettings` ([debugger.rs:39-77](../../packages/m68k/src/debugger.rs)). SR, PC and the stack top are fields of the step, and undo restores SR first. Undoing a `PopCall` re-pushes the frame with the RTS's address and with registers read at undo time (`interpreter.rs:1297-1318`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Throughput         | About 20 M instructions/s with no history and 10 M with a history of 100, on an 8-instruction loop. It falls to 11–14 M at 1,000–20,000 instructions because the lookup dominates. The scripts are not kept; any loop over `run()` reproduces the numbers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Tests              | 622 Rust tests. 30 program and 30 run corpus snapshots: the run snapshots hash all 16 MB of memory, and every program snapshot prints addresses. 67 diagnostic snapshots. `ts-lib/test/smoke.mjs`. All of `src/test/instruction_access.rs` encodes "code is not in memory".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Confirmed bugs     | `divs` of `$80000000` by −1 panics (`interpreter.rs:2300`) and leaves the wasm instance dead. Byte `-(a7)`/`(a7)+` step by 1. `movem.w` into a data register does not sign-extend. `move #$FFFF,sr` reads back `$FF1F` instead of `$A71F`. `link a6,#-70000`, and `bra.s` out of range or with a zero displacement, all assemble. Limited runs report `ExecutionLimit` even when the last step ended the program. `Cargo.toml` says 2.1.1 against npm's 3.1.2.                                                                                                                                                                                                                                                                                                                                                                                                               |
| Adapter            | [M68KEmulator.svelte.ts](../../packages/asm-editor/src/lib/languages/M68K/M68KEmulator.svelte.ts):<br>• The only place run options reach the Core is `new Interpreter(program, {history_size, keep_history})` (`:296-299`).<br>• Build artifacts carry no `opcode` (`:330-345`).<br>• The flags come from `ccrToFlagsArray` (`:347-366`).<br>• The mutation, interrupt and termination switches are exhaustive with `never` (`:1310-1364`, `:1129`, `:490-512`), so every new Core variant breaks the build until handled.<br>• `getSr()` is unused.<br>• `M68K_INSTRUCTIONS_PER_MS = 15_000` (`:99`).                                                                                                                                                                                                                                                                       |
| Shared layer       | Slice reasons are `budget, breakpoint, paused, terminated, limit, wait` ([ExecutionSlice.ts](../../packages/asm-editor/src/lib/languages/ExecutionSlice.ts)). A `wait` is cancelled on Stop only through `ProgramClock.reset()`, and Pause is checked only before a slice. Testcases run unsliced on a virtual clock. `STATUS_FLAG_BITS.M68K = [5,4,3,2,1]` ([statusFlagBits.ts](../../packages/asm-editor/src/lib/languages/statusFlagBits.ts)). The Register file hooks (ADR 0021) exist and M68K uses none. Region kinds are `code, data, reserved, heap, stack, arguments, device`. The RISC-V assembly profile is the precedent for an assembler-affecting choice: a Setting carried in `BuildSources` to the Build and the language service ([projectSettings.ts](../../packages/asm-editor/src/lib/projectSettings.ts)).                                              |
| Machine code views | `fileKind` gates Executables on X86 ([fileKinds.ts:161-170](../../packages/asm-editor/src/lib/fileKinds.ts)). The Build output path is generic ([buildOutput.ts](../../packages/asm-editor/src/lib/buildOutput.ts)).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Documentation      | One hand table, [M68K-documentation.ts](../../packages/asm-editor/src/lib/languages/M68K/M68K-documentation.ts), drives completions, hovers, the grammar, the docs and search. `rte`, `stop` and `reset` are refused there (`:1883`) and again in [assemblyHighlight.ts:159-163](../../packages/asm-editor/src/lib/content/assemblyHighlight.ts). About 30 prose passages state today's limits: [exceptions.md](../../packages/asm-editor/src/lib/documentation/m68k/exceptions.md), [traps.md](../../packages/asm-editor/src/lib/documentation/m68k/traps.md), [M68K-traps.ts](../../packages/asm-editor/src/lib/languages/M68K/M68K-traps.ts) (30, 31, 32, 60 and 62 refused), the M68K exceptions lecture, the General course interrupts lecture, and lectures whose address tables assume four-byte instructions. No test checks that every Core mnemonic is documented. |
| Releasing          | The editor CI builds the Core from the submodule pointer. npm releases are tag-triggered from s68k `main` and are for outside users ([cd.yml](../../packages/m68k/.github/workflows/cd.yml)). Pushes are the owner's.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Decisions taken while planning

These are taken by default, for the owner to overturn.

1. **The decoded form is the existing `Instruction` enum, extended.** It gains:
    - the branch size (short, word, or long under the 68020);
    - the absolute width (`.w` or `.l`);
    - the quick forms as written (`ADDQ`, `MOVEQ`) rather than normalised;
    - variants for `RTE`, `STOP(u16)`, `RESET`, `MOVEUSP { to_usp, register }`, `LINEA(u16)` and `LINEF(u16)`, and for the dialects' instructions as their batches land.

    The PC-relative `Operand` stores its target address, not a displacement from a guessed base. The encoder and the decoder are inverses over this enum, so `decode(encode(i)) == i` is the round-trip test, and the 900-line `execute_instruction` survives with new arms. Each decoder entry and each table form records the first processor that has it.

2. **The decode cache is filled by the assembler** (design decision 4).
    - **Shape.** `Vec<Option<Box<Page>>>` over the 16 MB, 4,096 pages of 4 KB. A `Page` holds 2,048 slots, one per word, about 48 bytes each: the `Instruction`, its size, and the index of its Program instruction (`u32::MAX` when the slot was decoded at run time).
    - **Filling.** `Interpreter::new` creates the pages under the Program's code and fills each slot from the `AssembledInstruction` already built. Assembled code is never decoded at run time.
    - **Fetching.** `step` reads `pages[pc >> 12]` and then `slots[(pc & 0xFFF) >> 1]`. An empty slot, or a missing page, runs the decoder and stores the result.
    - **Writing.** Every write path in `Memory` (the program's stores, the trap tasks' buffers, Pokes, undo's raw writes and interrupt answers) calls `invalidate(address, length)`. It returns at once when no page covers the range. Otherwise it clears each valid slot whose instruction overlaps the range, looking back 8 bytes, and into the previous page when the range starts near a page boundary.
    - **The code-write flag.** A slot cleared by the program's own write sets the step's `wrote_code` flag, which carries the address and the Program instruction it held. That flag is what the pause of design decision 4 reads.
    - **The gate.** The benchmark at 8 and at 20,000 instructions must be at least as fast as today. A slower result is a blocker.
3. **Source locations come from an address map, not from the instruction list.**
    - The Program keeps sorted `(start, end) → instruction index` ranges for the code it placed. The current line, a step's location and the Breakpoint address sets read it.
    - A changed line keeps its Location: the bytes moved on, the source did not.
    - Undoing a `PopCall` stops re-deriving the caller from code: the mutation stores the callee and the registers.
4. **Undo of the machine state.**
    - Restoring SR on undo becomes a raw write that never swaps stacks. Every swap journals both stack pointers (`WriteStackPointers { usp, ssp }`, old and new).
    - Exception entry journals `PushException { vector, from, handler }`, and `rte` journals `PopException`. The Call stack reads these.
    - Each step gets an `old_cycles` field, like `old_sr`.
    - The IRQ latch, the stopped flag, the task 60/62 levels and the timer settings are one `MachineState` value, journaled as `SetMachineState { old, new }` whenever it changes.
    - An IRQ step is a new `ExecutionStepKind`, `Irq`.
5. **Unhandled exceptions keep today's error types.** `Termination::Exception` carries the cause as now (`DivisionByZero`, `ChkOutOfBounds`, `AddressError`, …) plus `vector: Option<u8>`, which is set when the program had a vector to fill. New causes are `BusError`, `PrivilegeViolation`, `LineA`, `LineF`, `Trace` and `UnhandledTrap { vector }`. A double fault is `Termination::Halted { cause }`. `InstructionAccess` is removed.
6. **The conformance harness is behind a cargo feature, `conformance`.**
    - It adds `Interpreter::from_state(cpu, memory_words, prefetch)` and the reader of the MAME suite's binary format, about 120 lines.
    - The vendored subset sits in `tests/m68000/` with the suite's MIT `LICENSE`.
    - A script fetches the full suite into an ignored directory for `cargo test --features conformance -- --ignored`.
    - A scheduled workflow runs the full suite weekly.
    - Every relaxation lives in one skip list with a reason per line. Expected ones: trace in initial states is suppressed, as other runners do; the BCD instructions' undefined N and V; TAS and TRAPV, which the suite itself does not vouch for.
    - The dialects' differential harness against Musashi is a second feature, `musashi`, added in batch 4.
7. **The corpus fixtures are re-recorded once per batch,** with a dated note in `tests/corpus/README.md` saying what moved and why: addresses, branch text, and the memory hash now covering code. A fixture changes only in the batch whose behaviour changed it.
8. **The bug fixes ship first and alone (C0),** as a patch release, because none of them waits on the rest.
9. **Branches.** Core work goes on `feat/machine` in `packages/m68k`, merged into `main` per batch. Editor work goes on `feat/m68k-machine`, with the submodule pointer bumped per batch. No Co-Authored-By trailers.
10. **The Core's TypeScript surface grows as listed under [API](#api)** and stays one `Interpreter` class. Enums are only appended to.
11. **The dialect plumbing ships in batch 1**, so `extb.l` and `move ccr,<ea>` have a home from the day the 68000 refuses them. Confirmed by the owner on 2026-10-28.
    - `opt p=68010`, `opt p=68020` and `opt bit` are parsed, and `Program.processor` is set.
    - The gates exist in the assembler and the decoder.
    - The two instructions are the dialects' first members.
    - Every other 68010/68020 instruction stays refused with "not implemented yet in the 68010 dialect" until batch 4 or 5. The Documentation calls the dialects partial until then.
12. **The pause on a write into code is a Preference,** "Pause when a program writes to its code", on by default. It changes what Run does for the person, not what the program does, as ADR 0014 draws the line. The Core reports the flag on every step; the editor decides whether to pause. Confirmed by the owner on 2026-10-28.

## API

What the editor will call, beside today's methods. TypeScript names are as `ts-lib` will spell them.

- **`S68k`:** `disassemble(bytes, address, processor?)` returns `{address, size, bytes, text}[]`, where undecodable words come back as `dc.w`.
- **`Program`**
    - `getImage()` returns `{address, bytes}[]`.
    - `toSRecord()`.
    - `getMemoryMap()`.
    - `getInfo()` gains `processor` (`'68000' | '68010' | '68020'`) and `bitFields`.
    - `getInstructionAt(addr)` gains `bytes` and `assembledAs`, the disassembly when it differs from the source.
- **`Interpreter`, machine state**
    - `getSystem()` returns `{sr, usp, ssp}`, plus the dialect's control registers. `setSr`, `setUsp` and `setSsp` journal as Pokes.
    - `getCycles(): bigint`.
    - `getMachineState()` returns `{pendingIrqs, stopped, autoIrqs: {level, intervalMs}[], keyboardLevels, mouseLevels}`.
- **`Interpreter`, input from the host:** `raiseIrq(level)` (used for timer firings) and `deviceEvent('keyDown' | 'keyUp' | 'mouseDown' | 'mouseUp' | 'mouseMove')`.
- **`Interpreter`, running:** `runWithBreakpoints(…, {skipBreakpointAtPc, stopOnCodeWrite})`. It returns after a step whose `wroteCode` is set when asked to.
- **`Interpreter`, reading code:** `disassembleAt(address)`.
- **Statuses and types**
    - `getStatus()` gains `Stopped`.
    - `ExecutionStep` gains `kind: 'Irq'`, `wroteCode: {address, instructionIndex} | null` and `cycles`.
    - Mutations gain `WriteStackPointers`, `PushException`, `PopException` and `SetMachineState`.
    - A `StackFrame` gains `kind: 'call' | 'exception'` and `vector`.
    - `Termination` gains `Halted`.

## Batches and milestones

| Batch                    | Core            | Editor                | Ships                                                                                                                                                                                                     |
| ------------------------ | --------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Real code             | C0–C5, C10, C11 | E0, E1, E6a, E7a, E8a | Encodings, disassembler, code in memory with the cache and the code-write pause, conformance on plain instructions, the S-record writer, `opt p=` with its first two instructions. Core 4.0.0 (breaking). |
| 2. Exceptions            | C6, C7          | E2, E7b, E8b          | Vectors, frames, `rte`, privilege, trace, bus errors, memory map. Core 4.1.0.                                                                                                                             |
| 3. Interrupts and cycles | C8, C9          | E3, E4, E7c, E8c      | IRQs, `stop`, `reset`, timers, keyboard and mouse IRQs, cycles. Core 4.2.0.                                                                                                                               |
| 4. The 68010             | C12             | E6b                   | The complete 68010 dialect. Core 4.3.0.                                                                                                                                                                   |
| 5. The 68020             | C13             | E6c                   | The 68020 as a 68EC020, user-mode integer set; its cache-case cycle estimate can follow. Core 4.4.0.                                                                                                      |

Within a batch the Core leads and the editor follows each milestone. Batches run in order: batches 4 and 5 build on batch 2's frames and batch 3's timing tables.

### C0: Fixes (patch release)

- **`divs`.** Compute in `i64`, so `$80000000 / −1` overflows into V instead of panicking.
- **A7 byte step.** `-(a7)` and `(a7)+` step by 2 for bytes.
- **`movem.w`.** Sign-extend into data registers.
- **SR mask.** `set_sr` masks to `$A71F`.
- **Limited runs.** Return the status when the last step ended the program.
- **Undo of `PopCall`.** Restore the callee and registers it recorded (planning decision 3).
- **Housekeeping.** Sync `Cargo.toml` to the npm version. Derive `PartialEq` on the encoded types.
- **Tests.** One per fix in `src/test/test.rs`, and a smoke check that the instance survives `divs`.
- **Estimate:** 1–2 days.

### C1: Decoder and disassembler

- **Modules:** `src/machine/decode.rs` and `src/machine/disassemble.rs`, with a processor column per entry.
- **The decoder.** It maps a first word and its extension words to the extended `Instruction` and its size.
    - Unknown words become `ILLEGAL` with the word kept, and `$Axxx`/`$Fxxx` become `LINEA`/`LINEF`.
    - `$FFFF $FFFF` is recognised before line F.
    - Bits 10–8 of an index word are ignored, and a `$FF` branch byte is −1, as on the 68000.
- **The disassembler** prints EASy68K syntax, with an optional symbol table so that targets print as labels.
- **Tests.**
    - All 65,536 first words are decoded against a legality bitmap derived from Musashi's MIT `m68k_is_valid_instruction`, vendored with its notice.
    - A local, unvendored check against the unlicensed `68000.official.json`.
    - Disassembly snapshots for every form of the table.
- **Estimate:** 3–4 days.

### C2: Encoder and lowering

- **The encoder,** in `src/assembler/instructions/encode.rs`, maps `Instruction` to words.
- **The lowering keeps what the encoder needs:**
    - the written branch size, the absolute width and `#n.l`;
    - the EASy68K form order (design decision 5);
    - ADDA for `add #,an`, and ANDI/ORI for memory destinations;
    - the quick forms and MOVEQ under the back-reference rule.
- **The analyzer** gains the range checks for `bra.s`, word branches and `link`.
- **Tests.**
    - A generator over the forms export assembles, encodes, decodes and compares every form, size and mode.
    - An opt-in `--ignored` test runs `m68k-linux-gnu-as -m68000` (apt `binutils-m68k-linux-gnu`) one instruction line at a time with explicit mnemonics and compares the bytes.
- **Estimate:** 2–3 days.

### C3: Layout at real sizes

- **Sizes in pass 1.** `LinePlan` gains `size`, decided in pass 1 from the AST's suffixes and modes plus the back-reference rule. Pass 1 evaluates quietly against the partial table: defined above means short when the value fits.
- **Placement.** Pass 2 encodes, and the Program's memory runs include the code. `simhalt` places `$FFFF $FFFF`. Alignment pads stay unwritten.
- **PC-relative** displacements are computed from the extension word's address, both in lowering and in `check_pc_distance`.
- **The `memory` directive** is parsed into `Program.memory_map` and enforced in C7. Today it is refused at `layout.rs:2210`.
- **Records.** Core ADR 0001's consequences are amended (design decision 6) and Core ADR 0006 is written.
- **Fixtures.** The 30 program fixtures and `value_out_of_range` are re-recorded. A review pass reads every changed branch for `.s` against `.w`.
- **Estimate:** 3–5 days. This is the riskiest milestone in batch 1: `layout.rs` is 3,500 lines. EASy68K's no-relaxation rule keeps it to one decision per line.

### C4: Running from the cache

- **The cache.** Planning decision 2: the pages, prefilled from the Program, invalidated by every write path, with the `wrote_code` flag.
- **Removals.** `InstructionMap`, `InstructionAccess` and `src/test/instruction_access.rs` go. Tests for self-modifying code replace them: a write into the next instruction runs the new instruction, Undo restores the old one, and a Poke into code runs.
- **`stopOnCodeWrite`** on the limited runs.
- **Source lookups** move to the address map (planning decision 3).
- **The end rule** follows design decision 7. `has_reached_bottom` becomes "the PC is at `$FFFF $FFFF` outside placed memory". The Program records the set of placed bytes as ranges.
- **Records.** Core ADR 0009 is written.
- **Fixtures.** The 30 run fixtures are re-recorded: the memory hash now covers code.
- **Throughput.** Benchmark before and after, with the numbers recorded in the PR (planning decision 2's gate).
- **Estimate:** 2–4 days.

### C5: Conformance harness

- **Contents.** The `conformance` feature, the MAME-format reader, the vendored subset and the fetch script, as planning decision 6 describes.
- **What runs in batch 1.** Only instructions that raise nothing are checked. The exception tests are listed as skipped until C6, and the cycle check is off until C9.
- **Musashi's programs.** Its 60 self-checking 68000 programs run through a raw-image loader (`Program::from_image(address, bytes, entry)`, test-only) with a pass/fail hook on two addresses.
- **Fixes.** Every failure found is fixed in this milestone or filed against the milestone that owns it.
- **Records.** Core ADR 0010 is written.
- **Estimate:** 1–2 days for the harness, plus 3–5 days of fixes across the batches.

### C6: Exceptions, privilege and trace

- **CPU state.** `Cpu` gains `usp`, `ssp` and SR swapping.
- **Exception processing** follows design decision 10, through one frame builder that the dialects extend:
    - group 0 and group 1/2 frames;
    - the vector read and the unhandled-vector rule (9);
    - a double fault ends in `Halted`;
    - the stacked PC by kind;
    - trace.
- **Instructions:** `rte`, `move usp`, `trap #0-14` through vectors 32–46, `trap #15` with an unknown task through vector 47, privilege violations, and line A/F.
- **Reset state** follows design decision 2. Task 32 #5 is accepted.
- **Undo:** the new mutations of planning decision 4, and the call stack's exception frames.
- **Fixtures and records.** The exception tests of the suite are enabled. The trap-task fixtures that expect `UnsupportedTrapTask` for unknown tasks gain the vector 47 rule. Core ADRs 0007 and 0008 are written.
- **Estimate:** 4–6 days.

### C7: Memory map and bus errors

- **The four range kinds** (design decision 15) are checked in `Memory`'s access paths. The host is exempt.
- **Bus errors** raise the group 0 frame. The trap #15 buffers are checked as EASy68K checks them.
- **Tests:** one per range kind, both modes, and a ROM range over the program's own code that the program writes to.
- **Estimate:** 1–2 days.

### C8: Interrupts, stop and reset

- **Machine state.** `MachineState` (planning decision 4) holds the IRQ latch, the stopped flag and the timer settings. An IRQ is taken at the start of `step` as an `Irq` step when a pending level beats the mask.
- **Statuses.** `stop` enters `Stopped`. `run` and `step` return at once while stopped and no IRQ is pending.
- **Host calls:** `raiseIrq` and `deviceEvent`. `reset` takes 132 cycles.
- **Task 32** gains #4 and #6, while #0, #1, #2, #3 and #7 stay refused with "there is no hardware window". Tasks 60 and 62 are implemented.
- **Breakpoints and IRQs.** `run_with_breakpoints` takes a pending IRQ before checking the Breakpoint at the PC, because the next instruction to run is then the handler's.
- **Tests:** latch and priority, the mask, level 7, `stop` and wake, undo across an IRQ step, the task 60/62 levels per event, and the suite's STOP tests.
- **Estimate:** 2–4 days.

### C9: Cycles

- **Timing tables.** The base and effective-address tables are data in `src/machine/timing.rs`, one table per dialect.
- **Special cases:**
    - MULU and MULS by bit pattern;
    - DIVU and DIVS by a reimplementation of Cwik's algorithm (his code is GPL, so only the method is used);
    - shifts by count, MOVEM per register, Bcc and DBcc taken or not;
    - exceptions;
    - `reset` at 132;
    - `trap #15` at 0.
- **The counter.** `old_cycles` on each step. Tasks 30 and 31, and `getCycles`.
- **Tests.** The suite's cycle check is switched on, and any rows where EASy68K differs are listed in the README.
- **Estimate:** 2–3 days.

### C10: The S-record writer (batch 1)

- **Output.** `Program::to_srecord()` in EASy68K's layout: the S0 header `68KPROG   20CREATED BY EASY68K`, the memory-map S0 records, S1/S2/S3 records of up to 32 bytes, and S8.
- **Tests.** Read the result back with a test-only parser.
- **Estimate:** 0.5–1 day.

### C11: Dialect plumbing (batch 1)

- **The directive.** `opt p=68000|68010|68020` and `opt bit` (planning decision 11).
    - Once, before the first instruction; a repeat with the same value is harmless and a different value is an error.
    - Parsed into `Program.processor` and `Program.bit_fields`.
- **The gates.** A processor column in the table forms and the decoder entries. The forms export gains `processor`.
- **The first members.** `extb.l` (68020) and `move ccr,<ea>` (68010) are gated. In a 68000 Program they are refused with the two-part hint of design decision 3, and the Diagnostic carries the `opt p=` line as a suggested fix.
- **Not implemented yet.** Every other 68010/68020 mnemonic answers "not implemented yet in the 68020 dialect" under `opt p=`.
- **Records.** Core ADR 0011 is written.
- **Estimate:** 1.5–2.5 days, including the dialect-ready decoder and frame builder.

### C12: The 68010 (batch 4)

- **Instructions:** `move ccr,<ea>` completed, `rtd`, `bkpt` (illegal-instruction behaviour), `movec` (SFC, DFC, USP, VBR), `moves`, and the privileged `move sr,<ea>`.
- **Frames:** VBR; format `$0` frames and the format `$8` frame with zeroed internal words; `rte`'s format check and the format error (vector 14).
- **Timing:** Section 9 timing with loop mode, and Moira's MUL/DIV models.
- **Verification:** the `musashi` differential feature (Musashi built with the `cc` crate, serialised because of its globals), hand tests for frames and loop mode, and GNU `as -m68010`.
- **Estimate:** 8–12 days.

### C13: The 68020 as a 68EC020 (batch 5)

- **Addressing modes:** scaled index, base displacements, memory indirect, `bcc.l`/`bsr.l`. That means syntax, pass-1 sizing, the encoder, the decoder, the executor, the disassembler and EA timing.
- **Instructions:**
    - `extb` completed, `chk.l`, `link.l`, the extended `tst`/`cmpi` forms, `trapcc` and `pack`/`unpk`;
    - `mul.l` and the `div.l` family;
    - `chk2`/`cmp2` and `cas`/`cas2`;
    - bit fields, which also serve `opt bit` in 68000 Programs.
- **Supervisor model:** unaligned data, SR `$F71F` with T1/T0, ISP/MSP with M and the `$1` frame, frames `$0`/`$2`, the `movec` additions, CACR and CAAR.
- **Verification:** Musashi's mc68040 self-checking programs, the differential harness, and GNU `as -m68020`.
- **Cycles:** the cache case as an estimate, possibly as a follow-up (3–5 days).
- **Estimate:** 19–30 days, plus 3–5 for cycles.

### C14: Surface, documents and releases (each batch)

- **Surface:** `src/ts_types.rs`, `ts-lib/src/index.ts` and `smoke.mjs` for every new call.
- **Documents:** the README's instruction table, "Known limitations" and task list, and the Core's CONTEXT.md glossary (design: Glossary changes).
- **Release:** `npm version` and the tag per the release recipe; pushes are the owner's.
- **Estimate:** about 1 day per batch.

### E0: Real code in the editor (after C4)

- **The adapter** fills `BuildArtifact.opcode` and `_getCompiledCode` from `assembledAs`, so the Build hover shows machine code and "assembled as" (design decision 26), in [assemblyInsights.ts](../../packages/asm-editor/src/lib/monaco/assemblyInsights.ts).
- **The code-write pause.** The Preference "Pause when a program writes to its code" (planning decision 12) is passed as `stopOnCodeWrite`.
    - A slice that stops for it returns a new reason, `codeWrite`, which the run loop treats like `breakpoint`.
    - The notice names the address, the line and its source text.
    - The History row of that step says "wrote into code".
- **Messages.** The `InstructionAccess` message goes from [M68kUtils.ts](../../packages/asm-editor/src/lib/languages/M68K/M68kUtils.ts). The EndOfProgram termination reads "ran into memory the program never wrote, at $…" ([termination.ts](../../packages/asm-editor/src/lib/languages/termination.ts)).
- **Recalibration.** `M68K_INSTRUCTIONS_PER_MS` is recalibrated with the measurement harness.
- **Tests:**
    - `M68KEmulator.test.ts`: the build artifacts now carry an opcode, the termination text changes, the slices change, and the code-write pause and continue.
    - `memoryRegions.integration.test.ts`: a case "M68K code reads as its encoding and takes Pokes".
- **Estimate:** 1.5–2.5 days.
- **As built (2026-10-28):** "assembled as" is a field of the Build artifact, `assembledAs`, which the Build hover shows beside the machine code; `_getCompiledCode` still adds nothing, since a below-line zone on every `bra` and `moveq` would bury the source. M68K_INSTRUCTIONS_PER_MS is 12,000.

### E1: Changed code and disassembly (after C4)

- **Changed lines.** A line whose bytes differ from what its Build placed is marked with a gutter decoration "changed at run time", and its hover disassembles what runs there now. The adapter compares `getInstructionAt(addr).bytes` with memory at each refresh, only for lines on screen.
- **History rows** for steps with no source line show `disassembleAt(pc)`, and so does the agent's step formatting ([formatting.ts](../../packages/asm-editor/src/components/shared/agent/defaultCodingAgent/formatting.ts)).
- **Estimate:** 1–2 days.
- **As built (2026-10-28):** the adapter compares every laid-out line, not only those on screen: it reads each run of code in one call at a refresh and disassembles only what changed, and keeps the reading while the Core's step id stands. A changed line is marked as a Listing's patched line is, and a History row on a changed line shows its disassembly too.
- **Since Core 6e9d8a3:** a History row's disassembly is the step's own `ran`, decoded from the words it ran, so a later write into its code leaves the row right; `disassembleAt(pc)` read memory as it is now. A row also shows it when its line ran other bytes than the Build placed, as a line changed and then changed back does. A step that ran nothing, an instruction fetched from an odd address or refused by the memory map, shows none.

### E2: Exceptions and privilege in the editor (after C6, C7)

- **System Register file.** The adapter declares "System" (SR with flag names T S I2 I1 I0, USP, SSP) through the Register file hooks, with Poke setters. [statusFlagBits.ts](../../packages/asm-editor/src/lib/languages/statusFlagBits.ts) and [MutationStep.svelte](../../packages/asm-editor/src/components/specific/project/user-tools/MutationStep.svelte) read the CCR from the real SR.
- **Mutations and History.** `convertMutation` handles `WriteStackPointers`, `PushException`, `PopException` and `SetMachineState`. History rows show exception entry. The Call stack shows exception frames with their vector names.
- **Terminations.** Unhandled exceptions and Halted map onto termination kinds with the vector in the message. `getM68kErrorMessage` gains the new causes.
- **Memory regions** ([memoryRegions.ts](../../packages/asm-editor/src/lib/languages/memoryRegions.ts)):
    - an "Exception vectors" region with one data label per vector;
    - region kinds `rom`, `readOnly`, `protected` and `invalid` from `getMemoryMap()`, each with its tint and hover reason;
    - ROM does not join `readOnly` for Pokes (design decision 15).
- **Tests:** the adapter (a trap #3 handler, an unhandled divide, a privilege violation in user mode, undo through `rte`), register files, regions, and History rendering.
- **Estimate:** 3–4 days.
- **As built (2026-10-28), against C6 alone:**
    - **Terminations.** An exception whose vector held no handler reads "Division by zero at line 12: vector 5 at $000014 holds no handler", what it was about following in parentheses ("Address error … (reading a word at the odd address $1)"). A double fault reads "The CPU halted at line 4: a double bus fault while taking TRAP #0 (vector 32), as pushing its frame raised an address error, writing a word at the odd address $4FFF". Both are `error` terminations.
    - **History.** `PushException` becomes the shared mutation `TakeException` (vector, name, handler, label), listed first in its row and drawn apart from the frame it pushed; `PopException` becomes `ReturnFromException`. A swap of the stacks reads "Switched to user mode, so A7 is the USP", `move An,usp` is a write of the USP, and an instruction that writes SR's system byte gets a write of SR. `SetMachineState` is C8's and not handled yet.
    - **Regions.** The memory layout gains `machineRegions`. The Exception vectors region has a data label for each vector 0 to 63 and one "User vectors" for 64 to 255, which only vectored interrupts use, so the picker lists 65 rows rather than 256. Overlaps outline the vectors first, then a range of the map, then the program's own runs, and the hover names them all with a line saying what the region means.
- **As built against C7 (Core 6e9d8a3):**
    - **Bus errors.** A bus error says what was accessed and which `memory` line refused it, with the range's bounds from `getMemoryMap()`: "Bus error at line 7: vector 2 at $000008 holds no handler (writing a word at $9000, where the program's memory read line makes $9000-$9FFF read only)". A protected range adds "in user mode". A double fault on a vector read from an invalid range reads "…, as reading its vector at $000014 raised a bus error, where …", and one on a refused frame "as pushing its frame raised a bus error, …".
    - **Regions.** Each range's hover says what the Core enforces: ROM can be read and run and ignores writes, read only refuses writes, protected refuses every access from user mode, invalid every access, a fetch included.
    - **The `memory` directive** leaves the refused lists, so it is highlighted, completed and documented as a directive.
    - **Quick fix.** `processor_chosen_after_code`'s deletion of the late `opt` line comes through the existing provider unchanged.

### E3: IRQs and stop in the editor (after C8)

- **`Stopped` in the slice loop.** The slice returns `{reason: 'wait', wait}`, where `wait` settles on an IRQ source, Pause or Stop.
    - [ExecutionController.ts](../../packages/asm-editor/src/lib/languages/ExecutionController.ts) gains a cancellable wait that Pause also settles. Today only `ProgramClock.reset()` settles a wait, on Stop.
    - The status line reads "Stopped: waiting for an interrupt above level n".
    - A Step while stopped takes a pending IRQ, or reports that nothing can run (design decision 29).
- **Timers.** An IRQ timer scheduler in the adapter reads `getMachineState().autoIrqs` after every Core call and schedules firings on [ProgramClock.ts](../../packages/asm-editor/src/lib/languages/peripherals/ProgramClock.ts). Firings run only during a Run; virtual time applies in Testcases, where `Stopped` advances the clock to the next firing.
- **Keyboard and mouse events.** Press-time hooks on [Keyboard.ts](../../packages/asm-editor/src/lib/languages/peripherals/Keyboard.ts) and [Mouse.ts](../../packages/asm-editor/src/lib/languages/peripherals/Mouse.ts) call `deviceEvent`. Key state still applies at read time, as ADR 0008 requires.
- **IRQ steps** render as History rows of their own.
- **Records.** Editor ADR 0065 is written, amending 0008, and ADR 0010 gets a note on timers. (The design first numbered it 0055, which was taken in the meantime.)
- **Tests:**
    - a fake-clock scheduler;
    - `stop` with Pause and Stop;
    - a Testcase with a timer-driven program finishing instantly;
    - a Testcase with an unwakeable `stop` failing with its reason;
    - a key-down IRQ on the Screen.
- **Estimate:** 3–4 days. This touches the run loop that every language shares.
- **As built (2026-10-28), against Core 28e9fe9:**
    - **The shared run loop.** The Pause flag moved into `ExecutionController`, which gained `whileUnpaused(execution, promise)`: a wait that settles on its promise, on Pause (resolved, also when the Pause came before the wait began) or on Stop (`ExecutionSupersededError`). Only the adapter's `stop` wait uses it; a Delay or a MARS `sleep` still runs out before a Pause is taken. `pause()` is refused for a run that takes none, and the slice request gained `startsRun`. The emulator gained `runStatus`, from the adapter's `_getRunStatus`, which the bottom panel's run-info line shows while the program has not ended.
    - **The adapter.** `irqTimers.ts` runs task 32's timers: synced from `getMachineState().autoIrqs` at each slice, after Undo and before a `stop` wait, restarted at each Run's first slice, and raised between slices. A `Stopped` slice returns a wait on the next timer (`ProgramClock.wait` with an abort signal), on a Keyboard or Mouse event whose `deviceEvent` woke the processor, on Pause or on Stop. A Testcase's `stop` moves the virtual clock to the next timer above the mask, or fails "The program stopped at line 3 waiting for an interrupt above level 3, which nothing in a Testcase can raise: …". A Step while stopped runs nothing and says so in the Log. A Run that starts on a Breakpoint with a request pending, whose handler returns to it, says so in the Log too.
    - **History and Call stack.** An IRQ step is `kind: 'irq'`, headed "IRQ 2 → timer at $102C"; one that ended the program is titled "IRQ 3: vector 27 at $00006C holds no handler". `SetMachineState` reads "Set the level-2 timer to 500 ms", "Turned the level-2 timer off", "Key down raises IRQ 5", "Mouse move raises IRQ 3", "Stopped until an interrupt above level 0" and "Woke from stop". An autovector's frame is "IRQ 2 → timer".
    - **Documentation.** Tasks 32, 60 and 62 are a new "Interrupt requests" group of the Trap tasks chapter, task 32's hardware-window parts staying refused. `stop` and `reset` got their entries (E7b's), leaving the refused instruction list empty, and the Exceptions chapter's Interrupts section was rewritten, since it said none existed.
    - **Found.** A key-down handler that reads task 19 once can see the previous key's release before its own press: the key state still applies one queued transition per read (ADR 0008), so the IRQ is ahead of the state it reports.

### E4: Cycles in the editor (after C9)

- **Display.** The counter under the registers with the last step's cost, each History row's cycles, and the cycles in the exit line of the Log.
- **Trap tasks.** Tasks 30 and 31 move from the refused list in [M68K-traps.ts](../../packages/asm-editor/src/lib/languages/M68K/M68K-traps.ts) to the documented tasks, and task 32's #4, #5 and #6 are documented beside its refused parts.
- **Estimate:** 1 day.
- **As built (2026-10-29), against Core b5e60d3:**
    - **The counter.** The adapter's `_getCycles` answers `getCycles()` and the newest step's `cycles`, and no step's cost after a Poke, which ran nothing. The emulator keeps it as `cycles`, read with the other panels and after a Build. `CyclesLine` shows "Cycles 12,345 (+8)" at the foot of the registers card in the Workbench and the Interactive editor, with a tooltip saying what it counts; a phone leaves it out, as it does the run-info line.
    - **History.** The row of an instruction or an IRQ has a Cycles line: 44 for an IRQ, 4 for `stop`, 0 for a `trap #15` task. The coding agent's steps and state carry the same numbers.
    - **The Log.** The exit line leads with the cycles: "Ran 1,234 cycles in 12ms", or "Ran 0 cycles, stopped by an error: …" after a Step. The count is the counter's, so it starts from the last task 30. The run-info line beside the Terminal keeps its shorter wording.
    - **Trap tasks.** Tasks 30 and 31 are a "Cycle counter" group of the Trap tasks chapter. Task 32's #4, #5 and #6 were documented with E3.

### E5: The S-record Build output (deferred)

- **Deferred** on 2026-10-28: the owner wants the Build output's format chosen first, an ELF or a Build output option (design decision 32). Until then an M68K Build saves no File.
- **The code is kept, switched off.** `_compile` makes the S-record `<entry>.S68`, saved as text through the Build output host ([buildOutput.ts](../../packages/asm-editor/src/lib/buildOutput.ts)), and for a non-68000 Program the Log says the file will not run in EASy68K, but only while [`m68kSRecordOutput`](../../packages/asm-editor/src/lib/languages/M68K/M68KEmulator.svelte.ts) is on. Its tests turn it on.
- **Records.** None while it is deferred. The ADR first written for it was deleted before it was merged, and its number, 0065, goes to the IRQs (E3).

### E6: Dialects in the editor

- **E6a (batch 1, after C11).**
    - The quick fix for the refusal Diagnostic: "Add `opt p=68020`" and "Use `ext.w` and `ext.l`".
    - The processor shown beside the registers when it is not the 68000.
    - Documentation entries tagged with their first processor; `extb` and `move ccr` get the tag.
    - Completions and hovers say "68020 only" where it applies.
- **E6b (batch 4, after C12).**
    - VBR, SFC and DFC in the System Register file.
    - The Exception vectors region following VBR.
    - Documentation entries for `rtd`, `bkpt`, `movec` and `moves`, and the 68010 frames in the exceptions chapter.
    - **As built (2026-10-29), against Core a2febcf:**
        - **System file.** A Build declares the files anew (`GenericEmulator.redeclareRegisterFiles`): a 68010 or 68020 Program's System file has VBR, then SFC and DFC as byte rows, after SR, USP and SSP, each poked through `setVbr`, `setSfc` and `setDfc`; a 68000 Program's keeps the three. The files stay as the last Build made them through a Stop, so a Build does not shrink and regrow them.
        - **Vectors.** The region and its 65 labels start at VBR. The adapter's `_getMemoryLayoutKey` answers VBR and the shared refresh reads the layout again when it changes, so a `movec`, a Poke and an Undo all move it. "Vector 5 at $008014 holds no handler", the Call stack's detail and a halted vector read use VBR too. Vector 14 is "Format error", except in a 68000 Program's table, where it stays reserved.
        - **History.** `WriteControlRegister` is a write of that register ("Wrote long to VBR"), `SetLoopMode` reads "Entered loop mode at $1010: the loop's next turns fetch no instructions, so they take fewer cycles" and "Left loop mode". The 68010's frames needed nothing: the History lists the Core's writes, whatever their number. `FormatError` reads "Format error at line 6: vector 14 at $000038 holds no handler (rte found a frame of format $3, which a 68010 does not make)".
        - **Documentation.** Entries for the four, tagged 68010, `movec` and `moves` privileged, with examples under `opt p=68010` that the examples test runs. Rows write the manual's `Rc` for a control-register position and `Rn` for a position of exactly `Dn` and `An`, which keeps `movec`'s and `moves`'s two forms apart and also changes `exg` (`exg Rn, Rn`) and `cmp` (`cmp <ea>, Rn`). `move sr, <ea>` stays in the untagged section with the fact "Privileged on the 68010 and 68020", from `privilegedFrom`. The Addressing modes chapter gained "Control registers", the Exceptions chapter "On the 68010" (VBR, the format word, the format `$8` frame, the format error, loop mode) and vector 14 in its table; completions offer `vbr`, `sfc` and `dfc`; both highlighters colour them as `usp`, and the static one no longer refuses the four mnemonics. Golden queries "vbr" and "format error".
- **E6c (batch 5, after C13).**
    - ISP, MSP, CACR and CAAR in the System Register file.
    - The 68020 addressing modes in the grammar, completions and operand legend.
    - About 35 Documentation entries.
    - The cycle counter marked as an estimate.
- **Estimate:** 1 day (a), 1–2 days (b), 3–4 days (c).

### E7: Documentation and language features (batches 1–3)

- **E7a (batch 1).**
    - The `simhalt` text, and every passage about four-byte instructions or code not being in memory.
    - A new test: every mnemonic in `S68k.instructionTable()` has an entry in `M68kDocumentation`.
- **E7b (batch 2).**
    - Entries for `rte`, `stop` and `reset`, and the USP addressing mode with its completions. The refused lists in `M68K-documentation.ts` and `assemblyHighlight.ts` are emptied.
    - `trap`'s description, with its duplicated task table replaced by a link, and `chk`, `trapv` and `illegal` rewritten for handlers.
    - The `privileged` tag text ([formTags.ts](../../packages/asm-editor/src/lib/documentation/instructions/formTags.ts), `instructionDocument.ts`) and [exceptions.md](../../packages/asm-editor/src/lib/documentation/m68k/exceptions.md) rewritten.
    - A golden search query for "return from exception".
    - The agent prompt ([prompts.ts](../../packages/asm-editor/src/components/shared/agent/defaultCodingAgent/prompts.ts)).
- **E7c (batch 3).**
    - Tasks 30, 31, 60 and 62 and the supported parts of 32 documented, and [traps.md](../../packages/asm-editor/src/lib/documentation/m68k/traps.md) updated.
    - The Status flags documentation gains T, S and I2–I0.
    - **As built (2026-10-29):** tasks 32, 60 and 62 came with E3 and tasks 30 and 31 with E4. The Condition codes chapter gained "The status register", the whole of `sr` with T, S and I2–I0 beside the condition codes; the Exceptions chapter gained "Cycles", what a cycle is, what the editor counts, what exceptions and IRQs cost, and timing a loop with tasks 30 and 31. The agent prompt says how cycles are counted and read, and that a key-down handler reading task 19 can see the key before. Four golden queries: "cycle counter", "how many cycles does my loop take", "interrupt mask" and "timer interrupt".
- **Estimate:** 2–3 days across the three.

### E8: Courses (batches 1–3)

- **E8a (batch 1).** Lectures whose address tables or PCs assume four-byte instructions:
    - `subroutines`, `using-the-editor` and `registers` (General course);
    - `bsr-rts-link-and-unlk`, `memory-regions-and-executable-files`, `sum-of-an-array`, `hello-world` and `the-stack-and-movem` (M68K, whose byte push now moves `sp` by 2).
    - Every address is re-read from a Build, not computed.
- **E8b (batch 2).** The M68K lecture `exceptions-and-the-vector-table`, rewritten around real handlers: filling a vector, a `trap #3` service, an address-error handler, `rte`, and user mode with its own stack. The General course's `system-calls-and-traps` and `interrupts-and-exceptions` are updated, along with the facts in `docs/courses/plan.md`.
- **E8c (batch 3).** An interrupts section in the same lecture or a new one: a timer IRQ with `stop`, and a key-down IRQ on the Screen. `trap-15-and-its-tasks` gains tasks 30, 31, 60 and 62 and the supported parts of 32.
    - **As built (2026-10-29):** a new lecture, "Interrupts and cycles" (`interrupts-and-cycles`, order 3, topic `interrupt-requests`, which no other course has), after "Exceptions and the vector table", whose Interrupts section now points to it. It covers IRQ levels, the mask in `sr` and the autovectors; a level-2 timer with `stop`; a key-down IRQ on the Screen that counts presses for five seconds, a level-2 timer ending it, since a playground that waits in `stop` with nothing to wake it would never end in the content test; why interrupts beat polling; and timing a `dbra` loop with tasks 30 and 31. Two Exercises: a level-3 timer, and holding a level back with the mask of `stop`. The key-down handler counts and reads no key, as a handler that reads task 19 once can be answered with the key before (E3's finding). `trap-15-and-its-tasks` gained a section on the timer, interrupt and cycle tasks with a playground reading the counter; the General course's `interrupts-and-exceptions` says the M68K's devices interrupt it; `docs/courses/plan.md` records the lecture and the facts. A student review by a separate agent was folded in.
- **How.** The course-rewrite workflow (student review, then writer, per lecture). The writing guide is being redone, so the rewrites follow whatever guide exists when each batch is written.
- **Estimate:** 3–5 days across the three.

## Estimates

Person-days for someone who knows both codebases. The fixes found by the conformance suite are the least certain part of the 68000; the differential harness is the least certain part of the dialects.

|                                | Core                                  | Editor and content           | Total                                                          |
| ------------------------------ | ------------------------------------- | ---------------------------- | -------------------------------------------------------------- |
| Batch 1: Real code             | 15–25 (C0–C5, C10, C11, C14)          | 6–10 (E0, E1, E6a, E7a, E8a) | 21–35                                                          |
| Batch 2: Exceptions            | 6–9 (C6, C7, C14)                     | 5–7 (E2, E7b, E8b)           | 11–16                                                          |
| Batch 3: Interrupts and cycles | 5–8 (C8, C9, C14)                     | 6–7 (E3, E4, E7c, E8c)       | 11–15                                                          |
| Conformance fixes              | 3–5                                   |                              | 3–5                                                            |
| **The 68000 machine**          | **29–47**                             | **17–24**                    | **46–71, about 9–14 weeks**                                    |
| Batch 4: The 68010             | 9–13 (C12, C14)                       | 1–2 (E6b)                    | 10–15                                                          |
| Batch 5: The 68020             | 20–31, plus 3–5 for cycles (C13, C14) | 3–4 (E6c)                    | 23–35, plus 3–5                                                |
| **With both dialects**         |                                       |                              | **79–121, plus 3–5 for the 68020's cycles; about 16–25 weeks** |

## Risks

- **Layout sizing (C3).** This is the largest change to a large file. Mitigation: EASy68K's back-reference rule decides each size once in pass 1, so no relaxation loop is needed, and every changed branch in the re-recorded fixtures is reviewed.
- **Throughput (C4).** Running from the cache must not fall below today's 10–20 M instructions/s. Mitigation: the prefilled pages, and the benchmark gate of planning decision 2.
- **The shared run loop (E0, E3).** The code-write pause adds a slice reason, and the cancellable wait for `stop` is the first wait not created by the program clock; Pause has never been able to end a wait. Every language runs through this code. Mitigation: a contained `ExecutionController` change with tests for Stop, Pause, an IRQ and the code-write stop.
- **Conformance findings.** The seven bugs above came from a read and a few probes. The suite will find more, especially in flags and in address-error frames.
- **The dialects' oracle.** No single-step suite covers the 68010 or 68020. The Musashi harness has gaps of its own (no loop mode, a format error on 68020 `$A`/`$B` frames), so hand tests carry the frames.
- **Course churn.** Every lecture that prints an address after code moves. E8a re-reads them all from Builds.
- **Saved programs.** `extb.l` and `move ccr` in a saved 68000 program become a Diagnostic with a one-click fix. Running off the end keeps today's outcome.

## Order of the first week

1. **The owner's last calls.** Design decision 3's choice between `opt p=` in the source and a Setting, and planning decisions 11 and 12. Everything else can start without them. All three were confirmed on 2026-10-28: `opt p=`, the plumbing in batch 1, and the Preference.
2. **C0,** released as a patch.
3. **C1 and C2 in parallel.** They meet at the round-trip test.
4. **C3,** then **C4** with the benchmark, then **C5**. C10 and C11 fit beside C3.
