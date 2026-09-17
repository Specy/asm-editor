# Pokes

## Scope

Decided on 2026-09-15 in a design interview. A **Poke** ([CONTEXT.md](../../CONTEXT.md)) is a change a person or the coding agent makes to one register or memory value of a **Debug session** between two instructions, kept in the same Undo history as the instructions as a step of its own. It exists so that a program can be debugged by changing its state and watching what the next instructions do with it, and undone like anything else.

In the first version:

| Pokeable                                                                                         | Not pokeable                                                                                                                              |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Every register of every **Register file**: the CPU file and the FPU, CP0, CSR, SSE and x87 files | The program counter, wherever it is drawn: the PC row and the `pc`, `hi`, `lo` (MIPS), `pc` (RISC-V) and `rip` (x86) rows of the CPU file |
| Every byte of memory the panels show, one byte or a selected range at a time                     | The **Status flags** rows, both the CPU's and a file's own                                                                                |
|                                                                                                  | Registers the Core cannot set: `$zero`, `zero`, MIPS `hi` and `lo`; an empty x87 stack slot                                               |

RISC-V's CSR counters (`cycle`, `time`, `instret` and their high halves) are pokeable because the RARS setter allows it; the program cannot write them, but the debugger may.

A Poke is possible exactly when Step is: after Build, after a Step, at a breakpoint or after Pause, with no **Interrupt** pending, the program not terminated and the **Project** not read only. While a Run is in flight the panels stay read only; the person presses Pause first. Read-only Projects, which already disable Undo, Run and Build, get no Pokes.

## Agreed architecture

- [Record Pokes in each Core's own history](../adr/0022-core-native-poke-records.md): each Core gains `beginPoke()`/`endPoke()`; the setters it already has journal into the open transaction and stay direct outside it. One transaction is one history entry, however many writes it holds, so a MIPS double written to its register pair and a four-byte memory Poke are one step each.
- A Poke is one step of the same history as the instructions. Undo reverts the most recent thing, Poke or instruction; the History panel lists a Poke as its own row with "Undo to here", and undoing N steps counts Pokes among the N.
- MARS and RARS report their undo stack grouped per instruction or Poke, which also fixes the History panel on MIPS and RISC-V, where a row is one backstep today and "Undo to here" on row N undoes N instructions rather than N rows.
- The same panels serve the Project page and the Lecture **Playgrounds**, so both get Pokes; the coding agent gets two tools.
- Everything ships at once, after all five Cores are published; the editor never depends on an unpublished build.
- A commit that leaves the value unchanged records nothing, in the panels and in the Emulator alike.

## Presentation

### Registers

- Clicking a chunk of a register row turns that chunk into an input holding what it shows: a hex group at the grouping strip's width, or a decoded float lane under a float **Format**. The register name keeps its current click, which jumps the memory panel to the value.
- An integer group takes hex digits, `0x` optional, or a signed decimal when the Preference shows decimals. It must fit the group's width, or the commit is refused and the input stays open; nothing is truncated silently.
- A float lane takes a decimal number, `NaN` or `Infinity`, rounded to the lane's precision. RISC-V singles are NaN-boxed as the Core expects; a MIPS double is written to its even/odd pair as one Poke.
- Enter or clicking away commits, Escape cancels. The input opens on the current value.
- A Poke highlights the cell like a program write, by the same previous-value diff.

### Memory

- Clicking a byte cell edits that byte in the reading shown: two hex digits in hex mode, one character in character mode (its code must fit a byte, or the commit is refused).
- The selection popup, which already shows a selected range as one number in the Target's endianness, becomes an input: the range can be retyped as hex or a signed or unsigned decimal and lands as one Poke in that endianness.
- Same commit rules as registers.
- A Poke into a memory-mapped display, the MARS bitmap or the TRS-80 text page, repaints the Screen at once and again when undone, through the existing observer (MARS, RARS) and resync (Z80) paths ([ADR 0005](../adr/0005-restore-screen-state-on-undo.md), [ADR 0020](../adr/0020-mirror-the-trs80-display-in-guest-memory.md)).

### History panel

- A Poke is a row of its own, with "Undo to here" like any row. It reads as one sentence in the words the instruction rows use, "Wrote 0x7D0 to D0 (was 0xBB8)" or "Wrote DE AD to $2000 (was FF 01)", the value it found in the colour the panels give a previous value; it has no PC line, since no instruction ran.
- `ExecutionStep` gains a `kind`, `instruction` or `poke`, so the panel and the agent's output can tell the two apart.
- An instruction's writes open on a click, tinted with the accent while open, to the values their Core reports: "Wrote Word to D1" becomes "Wrote Word 0x0002 to D1 (was 0x0000)", the value written and, in parentheses, the value found. Nothing is reconstructed in the editor: every Core reports both sides at the write itself, which took a second Core change on 2026-09-16 (s68k, MARS and RARS added the written value to their history entries, RARS also stopped truncating a 64 bit value to an int, and the Z80's records had both already). The one caveat is the x86 wrapper, which reads a store's new bytes back from the machine right after the step because capturing them at the store needs a wasm rebuild; no instruction of the checked-in machine can tell the two apart. A write whose Core hands over neither side stays plain text.

## Undo

- Undo of a Poke is the Core's own rollback of its Poke entry. `GenericEmulator.undo` does not distinguish the two kinds; the adapters do, so that a Poke skips the peripheral journals: `ScreenInstructionHistory` and the FileSystem session hang effects on instruction identities (s68k step ids, Z80 bus timestamps, MARS and RARS syscall addresses), and a Poke has none.
- A Poke is a Core operation like Undo: synchronous, refused while a Run, Step or input handler owns the Core, and followed by the same panel refresh.
- A Poke takes one slot of the Core's history. With the history Setting at 0 it applies but cannot be undone, like an instruction.

## Coding agent

- `poke_register` (register file, register name, value as hex or decimal) and `poke_memory` (hex address, bytes as a hex string) make the same Pokes through the Emulator, blocked by the same rule as `step`, and return what `step` returns. `undo` reverts them like anything else, and `latestSteps` lists them with their kind.
- The system prompt gets one paragraph on Pokes: what they are for, that they are undoable, and that the program counter is not one.

## Core changes

Each package ships as a published version before the editor consumes it. The transaction is the same shape everywhere; what differs is how each history stores the entry.

| Package         | Adds                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@specy/s68k`   | `beginPoke()`/`endPoke()` on `Interpreter`. Inside, `setRegisterValue` and `writeMemoryBytes` journal into one `ExecutionStep` flagged as a poke, with a step id of its own so `getLastStepId()` and the Screen journal keep working. Outside, `setRegisterValue` stops appending to the last instruction's mutation list (it does today) and `writeMemoryBytes` stays direct. `undo()` restores a poke step like any other and returns it with its flag                       |
| `@specy/mips`   | `beginPoke()`/`endPoke()` on `JsMips`. Inside, `setRegisterValue`, `setCoprocessor1Value`, `setCoprocessor0Value`, `setConditionFlag` and `setMemoryBytes` push backsteps under a poke group key that no instruction address can equal; outside, `setMemoryBytes` records nothing (today it records a backstep per byte) while still notifying write observers. `getUndoStack()` returns groups, one per instruction or Poke, each with its backsteps; `undo()` pops one group |
| `@specy/risc-v` | The same as MIPS with `setFloatingPointRegisterValue` and `setControlAndStatusRegisterValue`; the counter-decrement entry stays inside its instruction's group                                                                                                                                                                                                                                                                                                                 |
| `@specy/x86`    | `beginPoke()`/`endPoke()` on the wrapper. Begin snapshots registers, flags and the FPU block as an instruction step does; memory written through `writeMemoryBytes` inside the transaction keeps its old bytes. End pushes one history entry with `kind: 'poke'`, its mutations diffed the way a step's are, and `undo()` restores it like any entry. `setRegisterValue` outside stays direct                                                                                  |
| `@specy/z80`    | `beginPoke()`/`endPoke()` on `Z80Machine`, plus `setRegisterValue(name, value)` and `writeMemoryBytes(address, bytes)`, since today the adapter writes `z80.regs` and `memory` directly. Inside a transaction the writes are journaled into one `ExecutionRecord` with `kind: 'poke'`, `stateBefore` and the old bytes; outside they are direct. `undo()` and `getHistory()` treat it as any record                                                                            |

## Facts learned before the decision

Probed under node on 2026-09-15 against the published Cores, with a host write made between the first and second instruction and then two Undos:

- s68k: `setRegisterValue` appended `WriteRegister d5` to the first instruction's mutation list, so undoing that instruction reverted the edit too; `writeMemoryBytes` recorded nothing and the bytes survived every Undo.
- MARS and RARS: `setRegisterValue` recorded nothing and the register survived every Undo; `setMemoryBytes` recorded one backstep per byte under the first instruction's address, so the second Undo reverted the instruction and the edit together. Disabling the backstepper around the write (`setUndoEnabled(false)`) recorded nothing and left the stack intact.
- x86 and Z80, from their sources: each instruction entry restores a full register snapshot taken before it, so a register edit vanishes when the instruction before it is undone, while a memory edit to an address that instruction did not write survives every Undo.
- MIPS and RISC-V History rows: one per backstep, so `jal` shows two rows, and "Undo to here" at row N undoes N instructions.

## Facts learned while implementing

Recorded on 2026-09-15 from the five Core changes and the editor work built on them, all consumed as local builds until released:

- `@specy/mips` and `@specy/risc-v`: a whole Poke is one back step (`BackStepAction.POKE`), so it takes one history slot however much it wrote, and the new `getUndoGroups()` folds an instruction's back steps into one row — a RARS instruction is two or three of them (the value restore, sometimes a clock `BACKDOOR` sample, and the counter decrement).
- `@specy/mips` and `@specy/risc-v`: `setMemoryBytes` outside a Poke now records nothing, where it recorded one back step per byte, but still notifies the write observers, which is what keeps a memory-mapped Screen repainting.
- `@specy/risc-v`: a poke write's `old` and `new` cross as signed decimal strings, because the values are 64-bit; read them with `BigInt.asUintN(64, BigInt(s))` and mask to 32 bits on an RV32 target, the way the adapter already masks register values. Memory writes stay number arrays.
- `@specy/risc-v`: RARS needed a `CONTROL_AND_STATUS_REGISTER_POKE_RESTORE` action of its own, because neither existing CSR restore is the inverse of the setter for linked, masked or read-only registers.
- `@specy/s68k`: `setRegisterValue` used to append to the last instruction's mutation list and now writes directly outside a Poke. `begin_poke` refuses while an Interrupt is pending, since `answer_interrupt` writes registers on the trap's behalf and they would land in the open transaction; the availability rule already keeps the editor away.
- `@specy/s68k`: memory starts as `0xFF`, so a Poke into untouched memory reports old bytes of 255.
- `@specy/x86`: a poke entry's `pc` is the next instruction's address, while an instruction entry's `pc` is `pcBefore`, the address of the instruction that ran. `endPoke()` (`emulators/x86/blink-js/src/x86-emulator.ts`) diffs `rip` too, takes `line` and `file` from the source location of that pc, `old_ccr` from the pre-poke flags and `callStackBefore` from the current stack, and its memory diff collapses per byte, so a write that goes away and comes back records nothing at all.
- `@specy/x86`: undoing a poke made on a terminated program would resume the machine; the availability rule keeps that unreachable, and an adapter test reaches a pokeable state with `step()` rather than `run()` for the same reason.
- `@specy/x86`: `recordFpuMutations` diffs the whole FPU block and names only the rows whose bits changed, comparing the x87 stack as logical bit patterns — the ones the panel shows — so an `_setRegisterFileValue` that rewrites the entire block through `setFpuState` still produces a one-register poke write. `getFlags()` takes `prev` from the newest entry's `flagsBefore`, so a Poke that leaves the flags alone shows every Status flag with `prev == value`, and the adapter needs no special case.
- `@specy/z80`: a poke record carries `POKE_RECORD_ADDRESS` (-1) as its address and a unique increasing `stepId`, with the PC it was made at in `stateBefore.regs.pc`; `isPokeRecord` and the sentinel are exported. The shadow registers are `afPrime`, `bcPrime`, `dePrime` and `hlPrime` in the machine's own keys, which the adapter's `CORE_REGISTER_BY_NAME` already spelled that way for `af'`.
- `@specy/z80`: `setRegisterValue` masks to the register's width and does nothing when the value is already there, so the machine owns the clamp the adapter used to; the adapter keeps only a `BigInt.asUintN(16, …)` so the bigint to number conversion stays exact. `writeMemoryBytes` wraps at the top of the address space, which the adapter's old direct `memory.set` did not, so the `Z80_MEMORY_SIZE` clamp stays and bytes past `0xFFFF` are dropped rather than landing back at address 0. `getHistory(n)` copies the newest n records, so looking past a run of pokes for the last instruction needs a growing window rather than one `getHistory(1)`.
- MIPS and RISC-V (RV32) CPU register values are signed in the panels — `_getRegisterValues` does `BigInt(value)` over the Core's int32 array, so a register of all ones reads `-1n` — while a `PokeWrite`'s `old` and `new` are unsigned by contract, so the two readings differ in sign. Every comparison of a stored value with a poked one therefore masks both sides to the register's width (`BigInt.asUintN`, the width `registerWidthBits` reads): `GenericEmulator.pokeRegisters` before it drops a write that changes nothing, `RegisterFileRows.commit` before it calls `onPoke`, and `poke_register` before it tells the model the value changed. Without it, poking `$t0` with the `ffffffff` the panel is showing reads as a change on every MIPS or RISC-V CPU register whose top bit is set.
- A chunk input also refuses to re-encode the text it opened on, because a reading is not always its own bits: a RISC-V register that is not NaN-boxed draws `NaN` under the Single Format whatever it holds, and parsing that back is the canonical NaN, so a lane the reader only looked at would be poked. `RegisterFileRows` keeps the opening text beside the edited one and a commit of the same text records nothing.
- `@specy/x86`: `endPoke()` answers whether the Poke changed a value, and answers true with a history of zero too, where the entry it pushed is dropped as an instruction's is. `_endPoke`'s contract is whether an entry was kept, so the adapter asks `canUndo()` as well; MARS, RARS, s68k and the Z80 machine all answer false there themselves.
- MARS and RARS report a group's back steps newest first; both adapters reverse them so a History row lists what the instruction did in the order it did it. A RARS `jal` row is `ra` then `pc`, with the counter decrement and the clock sample filtered out; a MARS `jal` row is two `WriteRegister` mutations. Both simulators also keep a failing instruction's own group on top of the undo history — probed with an unaligned `lw`, the group's pc is the faulting instruction's address — and the line the editor reports already agrees with it.
- A Poke can never be the newest entry when `getLastExecutedLine` and `selectLastExecuted` run: those fire only after a step or a run that just executed an instruction, and the availability rule forbids poking a terminated program. The MIPS and RISC-V adapters therefore got no `_getLastInstruction()`, which would also have redirected `reportRuntimeFailure` and `stepInternal`'s catch away from `_getNextInstruction()`; x86, which had none either, got one over the newest instruction entry's `pc`. `refreshAfterPoke` does not touch `state.line`, so a Poke leaves the current line where it was.
- A memory Poke into the MARS or RARS framebuffer repaints without any adapter work: `setMemoryBytes` notifies the write observers and `pokeMemory` then calls `_resyncScreenFromMemory()`, which re-reads the whole mapped region, and Undo takes the same path. The 64 by 64 display at 8 by 8 units mirrors only 64 words (256 bytes) from the base address, so a Poke past `0x10010100` draws nothing — the tests poke at `0x10010400` when they want no repaint.
- s68k's `ExecutionStep.writes` types `old` and `new` as `number` while the editor's `PokeWrite` uses bigint, so the M68K adapter can no longer spread a Core step wholesale into the editor's step; `_getUndoHistory` builds both kinds field by field. The Core spells a poke's register names as the assembler does (`d0`, `a7`) and the adapter upper-cases them for the `writes` and the poke's mutations; instruction mutations keep the Core's lowercase spelling, so the two kinds of row differ in case on M68K. The History row upper-cases a poked register's name itself, so every language's row names the register the way the panel beside it does (HL, $T0).
- Neither the M68K nor the Z80 adapter has a FileSystem journal, and neither language declares a Register file beyond the CPU one, so the only peripheral journal a Poke has to skip in those two is `ScreenInstructionHistory`; x86 has neither journal, so the rule costs its adapter nothing.
- Throughput, measured on 2026-09-15 with `npm run measure` against the five local builds: MIPS 12.6 to 13.2 thousand instructions per millisecond (2026-09-14: 12.2 to 12.5), RISC-V 6.4 to 6.5 (6.0 to 6.5), x86 10.4 to 10.7 (10.1) and Z80 9.9 to 10.3 (9.5 to 10.0) are at or above their previous numbers, so the grouped backstepper costs nothing measurable. M68K is the exception: 10.0 to 10.6 against 11.9 to 12.3. An A/B on the same machine, the untouched release commit built with the same toolchain against the Poke build, reproduced it (11.9 against 10.3 under identical conditions), and a bisect cleared every per-instruction line of the change: restoring the setter's gating, then also the two `executing` stores in `step`, then dropping wasm-opt's unlimited inlining, then boxing the journal and the step's `writes` all measured 9.5 to 10.8. What is left is a code-generation effect of the whole-program inlining the crate is built with (`--flexible-inline-max-function-size` in `Cargo.toml`), which variant three showed the throughput to be very sensitive to. Two caveats on the numbers themselves: this machine throttles after about four seconds of sustained load, so the first three repeats run about twenty percent faster than the rest and a five-repeat median depends on where that cliff falls; and the harness sizes a run from a ten-millisecond probe, so its "Instructions" column swings by a quarter between runs. Not fixed: whether to accept the loss and recalibrate `M68K_INSTRUCTIONS_PER_MS` (15,000, which the measured 10 to 12 thousand already fell short of before this change) or to look for the layout cause is the owner's decision.
- An input that replaces a cell has to carry its frame as an inset `outline` and declare its width as `calc(Nch + <its padding>)`. `global.css` puts `box-sizing: border-box` on everything, so a bare `width: Nch` gives the text `N` characters minus the padding and the border, which drew the digits visibly squeezed inside a box the same size as its neighbours; a border would also be layout and widen the cell as the input opened. Measured in the browser afterwards: the input and the cell it replaces are both 41.72 by 21.59 pixels on the M68K CPU file, and the text no longer overflows its own box.

## Editor surface

- `BaseEmulator` gains `_beginPoke()`/`_endPoke()`; `GenericEmulator` gains `canPokeRegister(fileId, register)`, which is the panels' own question about one row, and `pokeRegisters(fileId, writes)` and `pokeMemory(address, bytes)`, which check the availability rule, compare against the current value at the register's own width, wrap the existing `_setRegisterValue`, `_setRegisterFileValue` and `_writeMemoryBytes` in a transaction, resync a memory-backed Screen and refresh the panels and `canUndo`. Several writes in one `pokeRegisters` call are one step, which is how a MIPS double reaches its even/odd pair, and each answers whether the Core kept an entry to undo.
- The adapters map a Poke entry to an `ExecutionStep` of kind `poke` and skip the peripheral journals when undoing one. MIPS and RISC-V map the new grouped stack, one row per group.
- `RegisterFileRows` and `MemoryRenderer` get an `onPoke` callback and a `pokeable` flag; the Project page and the Playground derive the flag from the Emulator state and the Project's read-only flag.

## Documentation

A changelog entry, and the landing page's feature list gains editing registers and memory. The manual verification matrix gets an Undo row per environment with a memory-mapped display: a Poke into the display region repaints, and its Undo repaints back.

## Order of work

Items 1 to 4 are implemented as of 2026-09-15 and run against the five Cores' local builds; the five releases are still pending, so the editor half cannot merge yet.

1. Done, releases pending. Cores: the transaction and the poke entry in all five packages, MARS and RARS grouping and the direct `setMemoryBytes`, s68k's `setRegisterValue` no longer appending; smoke tests; five releases.
2. Done. Editor model: `ExecutionStep.kind`, the `BaseEmulator` hooks, `pokeRegister`/`pokeMemory`, the adapters' history mapping and Poke undo.
3. Done. Panels: the chunk input, the byte input, the selection input, the availability rule; the History row.
4. Done. Coding agent tools and the prompt paragraph.
5. Done. Documentation and the verification rows: the changelog entry, the landing page sentence and the P1-P5 rows.
6. Done, with one open finding. Measured with `npm run measure` against the 2026-09-14 numbers in [register-files.md](./register-files.md): four Cores unchanged or faster, M68K about ten percent slower for a reason the bisect above could not pin on any line of the change; the owner decides between accepting it with a recalibrated `M68K_INSTRUCTIONS_PER_MS` and a deeper look.
