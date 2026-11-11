# Step over and Step out: plan

Status: implemented on 2026-11-10, uncommitted, in the worktree `.cache/wt/stepping` (branch `feat/stepping` in the editor and in each Core). What was built, what differs from the plan below and what is left are under [Implementation record](#implementation-record). Agreed the same day (the owner: stepping only, with the Call stack limit below), then reviewed and amended before any code was written; see [Review](#review). The decisions under [Decisions taken by default](#decisions-taken-by-default) are mine, for the owner to overturn.

Written after reading the editor's Run, Step and Undo code and one read-only research pass per Core. Paths are under `packages/` unless they say otherwise; line numbers are from each repository's HEAD on 2026-11-10. A finding marked _(reported)_ comes from a research pass and was not re-read here.

## What is being added

| Command       | What it does                                                                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Step**      | Unchanged: runs one instruction, and enters a routine it calls.                                                                                            |
| **Step over** | Runs one line. A routine the line calls runs to its return, and so does a handler the processor enters on the way. The program stops on the line after it. |
| **Step out**  | Runs until the routine the program is in has returned to its caller.                                                                                       |

One principle defines both new commands: **a Step over or Step out ends when the Call stack is back to a depth.** Step over ends when the Call stack is no deeper than it was when the command was given; Step out ends when the frame shown on top of the Call stack is gone. What the Call stack panel shows and what the two commands do can then never disagree, and each Core decides what a frame is and when it is gone in the way that suits its processor.

In every other way both are a Run: sliced, pausable, stopping at a Breakpoint, at an input wait (and going on after the answer), at the end of the program and on an error.

## Starting point

### Editor

| Area      | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Step      | `GenericEmulator.step` → `stepInternal` (`asm-editor/src/lib/languages/GenericEmulator.svelte.ts:2403-2500`) calls the adapter's `_step()` once, then keeps calling it while the next instruction is **Library code** and the Preference is off, up to `STEP_THROUGH_LIMIT` (50,000,000), one instruction per call (:2445-2458). It stops in a library's callback into program code on purpose.                                                                                          |
| Run       | `runSlices`/`sliceLoop` (:1930-2050) call `_runSlice(ExecutionSliceRequest)` until a slice answers something other than `budget` or `wait` (`ExecutionSlice.ts`). Pause is taken only between slices. `skipBreakpointAtStart` already exists as an option (:1960).                                                                                                                                                                                                                       |
| Undo      | The ledger (`recordHistory`, :1255) groups a Step's stretch of library code so that one Undo takes it back, by calling `_undo()` once per entry (:2745-2765). A group the history no longer holds whole cannot be undone at all (`canUndoStep`, :1241). A Run is recorded ungrouped. Grouping needs `_undoDepth`, `_getInstructionsExecuted` and `_getUndoHistoryRange`, which only the MARS/RARS and x86 adapters have; **M68K and Z80 have none**, so a grouped Undo is refused there. |
| History   | A grouped stretch is one row, "Called printf: 1,770 instructions" (`visibleHistory`, :1118; `LibraryStretch`).                                                                                                                                                                                                                                                                                                                                                                           |
| Controls  | `ExecutionDock.svelte` (Stop, Run/Pause/Restart, Undo, Step) is used by the Workbench (`ExecutionControls.svelte`), every **Interactive editor** (`InteractiveInstructionEditor.svelte`) and the home page backdrop. It drops its labels as it narrows (`fitLabels`).                                                                                                                                                                                                                    |
| Shortcuts | `shortcutsStore.ts`: Step is Shift+↓, Undo is Shift+↑, both rebindable. A held Step key repeats.                                                                                                                                                                                                                                                                                                                                                                                         |
| Session   | `WorkbenchSession.step()` (:4428) does not set `running`; `run()` does, which is what turns Run into Pause.                                                                                                                                                                                                                                                                                                                                                                              |
| Assistant | The coding agent has `step` (with a count) and `run_to_completion` tools (`defaultCodingAgent/tools.ts:1578`).                                                                                                                                                                                                                                                                                                                                                                           |
| Text      | 56 lecture and example pages tell the reader to press **Step**.                                                                                                                                                                                                                                                                                                                                                                                                                          |

### Cores

| Core              | Run loop                                                                                                                                                                                                                                                                         | Call stack today                                                                                                                                                                                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| x86 (`x86`)       | One native loop, every instruction interpreted, Breakpoints checked before executing (`libblink/blink/blinkenlib.c:501-641`). A new stop kind has to be added in four places or the program ends or runs on _(reported)_.                                                        | Frames pushed on a call, popped when `rsp` rises above the frame's slot (`debughistory.c:724-745`), so `longjmp`, exception unwinding and `push`+`ret` are right. **Tracked only while the Undo history records**: with Undo off the Call stack is empty. No frame for a signal handler.                              |
| M68K (`m68k`)     | Breakpoints checked before executing, only on the Breakpoint path; `run_with_limit` has no per-instruction check. The adapter re-enters the Core many times per slice (traps, waits) _(reported)_.                                                                               | `bsr`/`jsr` and exceptions push; `rts`/`rtr`/`rtd` pop whatever is on top, `rte` pops only an exception frame. A routine that pops its return address and jumps, or a handler left with `rts`, leaves the stack wrong from then on. A frame has no stack pointer before the call and no stack (USP/SSP) _(reported)_. |
| MIPS (`mips`)     | Breakpoints checked after executing, so the first instruction of each call is never checked (`Simulator.java:469`). Each call is a new `SimThread`; all Core state is static.                                                                                                    | `jal`, `jalr` (any `rd`), taken `bgezal`/`bltzal` push; `jr $ra` pops the top without comparing. A return through another register never pops. No frame for an exception or interrupt handler. A `bgezal` frame records the branch target as its return address (`InstructionSet.java:829`).                          |
| RISC-V (`risc-v`) | As MIPS (`Simulator.java:606-610`).                                                                                                                                                                                                                                              | Only `rd == ra` pushes and only `jalr x0, ra` pops; `t0` is not a link register; no frame for a trap handler _(reported)_.                                                                                                                                                                                            |
| Z80 (`z80`)       | Breakpoints checked after executing (`z80-machine/src/Z80Machine.ts:984-1034`). **`stepOver` and `stepOut` already exist but cannot be resumed**: each call recomputes from the current `pc`, so a slice that ends inside the callee finishes the step there. Nothing uses them. | Rebuilt from stack memory on every read (`CallStack.ts`), from a record of which instruction pushed each slot. Undo does not restore that record, and with `ld sp,0` the outermost frame is never found _(reported)_.                                                                                                 |

Facts that shape the design:

- Step is one machine instruction on every Core. A RISC-V `call` is two (`auipc`, `jalr`); `la` and `li` are up to several; a Z80 `ldir` is one iteration per Step; an x86 `rep` is one.
- A Step can enter a handler without running the instruction it was pressed on: an M68K IRQ, a MIPS or RISC-V interrupt, an x86 signal. On x86 the interval timer runs on the wall clock, so a person stepping slowly can meet the handler at most presses.
- M68K timers fire only between a Run's slices, never on a Step.
- Undo is one Core call per instruction on every Core, each followed by the adapter's peripheral rewinds. MIPS and RISC-V `getUndoDepth()` walks the whole history (`JsMips.java:783`), and the editor asks for it at every stop.
- The Undo history holds 200,000 entries (`UNDO_HISTORY_SIZE`), about 100,000 instructions on MIPS and RISC-V.

## How other tools do it

Read from their sources and manuals on 2026-11-10. There are three families, and no tool has a rule without holes.

| Tool                               | Step over ends when                                                                                                               | Step out ends when                                                                          | Recursion                       | Handlers                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------- |
| MAME (`debugcpu.cpp`)              | `pc` reaches the address after the call. The disassembler flags which instructions are calls and returns; the debugger is shared. | The first return instruction at this level; nested calls are stepped over.                  | Ends early; the manual says so. | An acknowledged interrupt is skipped like a call. |
| EASy68K (`RUN.CPP`, `CODE8.CPP`)   | `PC` reaches the address after the `BSR`/`JSR`.                                                                                   | No command found.                                                                           | Ends early.                     | Not skipped.                                      |
| VICE (`monitor.c`)                 | A count is back to zero: `JSR` adds one, `RTS`/`RTI` take one away.                                                               | The same count, started at one.                                                             | Right, by the count.            | An IRQ or NMI adds one.                           |
| Mesen 2 (`NesDebugger.cpp`)        | A return instruction lands on the address after the call with the stack pointer it had before the call.                           | A return lands on the top frame's return address with that frame's stack pointer.           | Right, by the stack pointer.    | Frames, pushed at the interrupt.                  |
| LLDB (`ThreadPlanStepInstruction`) | It steps one instruction without decoding it; if the frame is now deeper it steps out again.                                      | A breakpoint at the caller's resume address, accepted only in the caller's frame.           | Right, by the frame.            |                                                   |
| WinDbg `gu`                        |                                                                                                                                   | The return address is reached at the same call stack depth (`g @$ra` is the address alone). | Right, by the depth.            |                                                   |

- MAME's source says of its own rule: "this completely fails for subroutines that consume inline operands or use alternate returns".
- Mesen's call stack copes with a return that does not match the top frame by searching down for the frame it does match, and keeps at most 511 frames.
- GDB's manual words `next` as stopping "at the original stack level" and `finish` as "until just after function in the selected stack frame returns".

What this plan takes from them: the shape of LLDB's step over (one instruction, then out again if the program went deeper), handlers skipped as calls (MAME, VICE), the stack pointer as what tells two calls from the same place apart (Mesen, WinDbg), and Mesen's search for the matching frame. Where it goes further is in ending a step when the frame is gone rather than when one address is reached, which is what covers a changed return address and an unwind.

Sources: [debugcpu.cpp](https://github.com/mamedev/mame/blob/master/src/emu/debug/debugcpu.cpp), [MAME execution commands](https://docs.mamedev.org/debugger/execution.html), [Easy68k Sim68K](https://github.com/fduhia/Easy68k/tree/master/Sim68Kv5.12.28), [VICE monitor.c](https://github.com/VICE-Team/svn-mirror/blob/main/vice/src/monitor/monitor.c), [Mesen2 debugger](https://github.com/SourMesen/Mesen2/tree/master/Core/Debugger), [ThreadPlanStepInstruction.cpp](https://github.com/llvm/llvm-project/blob/main/lldb/source/Target/ThreadPlanStepInstruction.cpp), [ThreadPlanStepOut.cpp](https://github.com/llvm/llvm-project/blob/main/lldb/source/Target/ThreadPlanStepOut.cpp), [GDB: Continuing and Stepping](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Continuing-and-Stepping.html), [WinDbg gu](https://learn.microsoft.com/en-us/windows-hardware/drivers/debuggercmds/gu--go-up-).

## Design

### What every Core provides

1. **A Call stack that can be trusted**, by the rules in the next table, restored by Undo, and kept whether or not the Undo history records. MIPS, RISC-V, M68K and the Z80 keep the newest 131,072 frames and the depth goes on counting past that (the owner, 2026-11-10: real programs never go that deep, so the limit is only a guard). The guard matters where a call used as a jump adds a frame on every pass of a loop: on MIPS and RISC-V that uses no stack at all, and on the Z80 the stack pointer wraps round memory. x86 has no limit: its stack memory bounds it, and trimming its shared frame list would cost a pass over it per call. The panel asks for the newest frames only, `getCallStack(max)`, rather than all of them at every refresh.
2. **`getCallDepth()`**, the number of frames, in constant time.
3. **A run option `untilCallDepth: N`** and a stop reason of its own, `callDepth`. The run stops before executing whenever the depth is `N` or less. It is tested when the call begins and after every instruction, **ahead of the Breakpoint, limit and pause tests**, so a slice that ends on its budget never ends on the instruction that completed the step, and a Breakpoint on the line a step ends on reports the step. A program that has ended stays ended: the end wins over `callDepth`.
4. **`skipBreakpointAtPc: false` honoured by every Core.** MIPS, RISC-V and the Z80 ignore the flag today because they check after executing; they gain a check before the first instruction when it is false. **The skip is spent by the first instruction that executes, not by the first call.** A call that executed nothing leaves it unspent: a Z80 `in` rolled back to wait for input, or a wait on a time port. So `GenericEmulator` keeps the flag set until a slice reports progress, and an adapter that re-enters its Core keeps it until the Core has executed an instruction. This amends [ADR 0023](../adr/0023-run-continues-past-the-breakpoint-it-is-parked-on.md), which says "the first of those calls".
5. **A step that says when it was only a handler entry**, so the editor knows the instruction it was pressed on has not run yet.

The option is passed on every call rather than held in the Core, and it is a plain number: the test reads nothing but the current depth, so there is no pending state for an Undo, a Poke or a rebuild to leave stale.

### When a frame is pushed and when it is gone

| Core   | Pushed by                                                                                                             | Gone when                                                                                                                                                                                                                                                                                                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| x86    | `call`; delivery of a signal to a handler (new). `int3`, `int n` and `into` no longer push a call frame of their own. | A call frame: `rsp` is above the frame's slot. Today's rule, kept. A signal frame: `rsp` is back at or above what it was when the signal arrived, so the frame lasts through the handler's `ret` and the restorer, to `rt_sigreturn`.                                                                                                                                                      |
| M68K   | `bsr`, `jsr`; an exception or IRQ entry                                                                               | The stack pointer **of the stack the frame is on** (USP, SSP, and MSP/ISP on a 68020) is above the frame. Replaces the pops by instruction, so a return by any means, a changed return address and an unwind are all right.                                                                                                                                                                |
| Z80    | A `call` that is taken, `rst`, an interrupt entry                                                                     | `SP` is above the frame's slot by no more than 4,096 bytes, counted with 16-bit wraparound so a stack at the top of memory works. A larger move is a stack switch and removes nothing, which is the line the Core's stack-top tracking already draws; it keeps the frames while a program borrows `SP` to fill memory. A tracked list, journaled for Undo, in place of the reconstruction. |
| MIPS   | `jal`, `jalr` with `rd` other than `$zero`, a taken `bal`/`bgezal`/`bltzal`; an exception or interrupt entry (new)    | (1) `jr $ra`: every frame down to the one whose return address it goes to, or the innermost when none matches. (2) The program arrives, by any instruction, at the innermost frame's return address with `$sp` at or above its value at the call. (3) `eret`: every frame down to the newest handler frame.                                                                                |
| RISC-V | `jal`/`jalr` whose link register is `ra` or `t0`; a trap entry (new)                                                  | (1) `ret`, that is `jalr x0, 0(ra)`, and no other instruction, as for `jr $ra`. (2) As MIPS; it is the only rule that ends a call that linked through `t0`. (3) `uret`. Nothing pops and pushes in one instruction, whatever the specification's return-address-stack table says of `jalr ra, 0(t0)`.                                                                                      |

The two families differ because of where the return address lives. On x86, M68K and the Z80 it is on the stack, so the stack pointer alone says whether the call is over, whatever instruction ended it. On MIPS and RISC-V it is in a register and a leaf routine never moves `sp`, so the return has to be recognised: by its instruction, or by arriving at the return address.

A frame records the call site, the routine entered, the return address and the stack pointer, plus its kind (call or handler), on every Core.

### What the editor does

```
stepOver(limit):
    N = the depth of the routine the stop is shown in
    if callDepth() > N:                         // shown at the program's call into Library code
        run in slices with untilCallDepth: N    // finish that call
    else repeat:
        step one instruction                    // today's Step, input waits and all
        if the program ended or failed: stop
        if callDepth() > N:                     // it entered a routine or a handler
            run in slices with untilCallDepth: N, skipBreakpointAtPc: false
            if that did not end at depth N or less: stop   // Breakpoint, Pause, end, error, limit
    while that step was only a handler entry              // its instruction is still to run
       or the next instruction is a later one of the same source line

stepOut(limit):
    N = the depth of the routine the stop is shown in     // not offered when N is 0
    run in slices with untilCallDepth: N - 1              // a Run: the instruction it starts on runs
```

- **The single instruction goes through the existing `_step()`**, so a Step over on anything but a call is exactly a Step.
- **The routine runs as a Run's slices do**: the Screen updates, Pause answers, an input wait shows its prompt and the step carries on after the answer.
- **`skipBreakpointAtPc: false`** is what makes a Breakpoint on the routine's first instruction stop the step.
- **Completion is read from the depth**, not from the reason the Core gave: a run that stops with the program not ended and the depth at `N` or less has completed, whichever test the Core reported.
- **The depth of the routine shown** is the Call stack's depth, except when the stop is shown at the program's call into **Library code** (the Preference off, the program in fact inside the library): then it is the depth at that call. Step out then leaves the routine the person is looking at, not the library function, and Step over finishes the library call.
- **Library code after a step.** Only a completed step that ends inside Library code with the Preference off goes on to program code, with the loop Step uses today (a Step out of a `qsort` comparator stops in the next comparator call, or back in the caller). A Pause, an input wait, an error and a Breakpoint in a Runtime library member stay where they are.
- **`limit`** is an instruction limit for the run phases, none by default. The coding agent's tool passes 1,000,000, as `run_to_completion` does, and says when it was reached, since it cannot press Pause.
- **One gate, on the Emulator.** A `stepping` state is set the moment either command starts. While it is set, Step, Step over, Step out, Undo and a new Run are refused, not queued (`duringCoreOperation` queues today, so a held key would go on stepping after it is released), and Run's button and shortcut pause. `stepInFlight` is set only around each `_step()`, so `pause()` reaches the run phases. The Workbench, the Interactive editors and the backdrop read this one state rather than each keeping a flag.
- **Contract.** `ExecutionSliceRequest` gains an optional `untilCallDepth` (requests built by hand in the measurement harness and tests stay valid), `ExecutionSliceReason` gains `callDepth`, adapters gain `_getCallDepth()`, and `_step()` answers `handlerEntry` beside `terminated`.

### Undo and the History

- **A Step over or Step out that completed is one ledger group**: one Undo takes it back, and the History shows one row.
- **How the group is formed.** `sliceLoop` records each slice ungrouped and merges it into the segment before, and `_step()` and the Library code loop record their own. For the length of a step, `recordHistory` adds to one pending segment instead, which is pushed when the step ends: grouped if it completed and can be undone whole, ungrouped otherwise.
- **The row.** The segment carries its kind and a name taken when the command was given: the frame entered for a Step over ("Stepped over draw_sprite: 1,234 instructions"), the frame left for a Step out ("Stepped out of draw_sprite: 310 instructions"), and nothing for a line of several instructions that calls nothing ("3 instructions"). The row is the group's oldest entry. `visibleHistory` builds a grouped row from "the first library instruction and the call that reached it" today, which neither a Step out nor a RISC-V `call` (whose oldest entry is the `auipc`) fits.
- **One that stopped early** (a Breakpoint, a Pause, an error, the end, the limit) is recorded as a Run is: Undo goes back one instruction.
- **One that cannot be undone whole** is recorded ungrouped, so Undo still works, one instruction at a time, as far back as it can: the history no longer holds all of it, or it holds an entry that cannot be reversed, as an x86 signal return is. Only Library code keeps the all-or-nothing rule, because its instructions are not shown.
- **The M68K and Z80 adapters gain the ledger hooks.** M68K counts history entries by step id, since an IRQ entry is an entry and not an instruction.
- **Speed.** One Undo of a group as long as the history is up to 200,000 `_undo()` calls, each with its peripheral rewinds, in one synchronous turn. Stage 5 turns that into one Core call and has to be in before a release.

### Controls

- Two buttons after Step in `ExecutionDock`: **Step over** and **Step out**. Tooltips: "Run one line, and the routine it calls" and "Run until this routine returns". _Changed by the owner, 2026-11-10:_ the three are one button in parts, "Step | over | out" (see Where it differs from the plan).
- Step out is disabled while there is no routine to leave.
- Shortcuts: Shift+→ for Step over, Shift+← for Step out, rebindable like the others. A held Step over repeats, as Step does, and the gate above means a repeat that arrives while a step is in flight is dropped.
- While the routine runs the dock shows Pause, as during a Run. The gate is immediate; the button is drawn as Pause only once the step has been going for 150 ms, so a short one does not flash it.
- The coding agent's `step` tool takes a `mode` (`into`, `over`, `out`) and the limit above.

## Edge cases

| Case                                                                                                      | What happens                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| The line calls nothing                                                                                    | Step over is a Step of the whole line.                                                                                                         |
| A conditional call that is not taken (Z80 `call nz`, MIPS `bgezal`)                                       | No frame is pushed, so it is a Step.                                                                                                           |
| A call to the next instruction, to read the program counter (MIPS `bal 1f`)                               | MIPS and RISC-V: the frame is pushed and gone at once, so it is a Step. x86 `call next` / `pop`: ends after the `pop`.                         |
| Recursion                                                                                                 | Each level is a frame; the step ends when the depth is back, not at the first return to that address.                                          |
| A Breakpoint inside the routine, its first instruction included                                           | The program stops there and the step is over. Run or Step out carries on.                                                                      |
| A Breakpoint on the call's own line                                                                       | The line runs (ADR 0023).                                                                                                                      |
| A Breakpoint on the line after the call                                                                   | One stop, where the step ends, and the step counts as completed.                                                                               |
| The line waits for input before it runs (Z80 `in`) with a Breakpoint on it                                | The line runs once the input is given: the skip is spent by an instruction that executes.                                                      |
| The routine reads input                                                                                   | The prompt is shown as in a Run; the step goes on after the answer.                                                                            |
| Pause while the routine runs                                                                              | The program stops inside it.                                                                                                                   |
| The program ends or fails inside the routine                                                              | As in a Run: ended, or the error at the failing line.                                                                                          |
| A changed return address (inline data after the call, the return address left on the stack and rewritten) | Ends where the routine returns to.                                                                                                             |
| A return through another register (`jr $t0`, RISC-V `jr t0`)                                              | Ends on arrival at the return address.                                                                                                         |
| A tail call (the routine jumps to another)                                                                | Ends when the second routine returns to the caller.                                                                                            |
| `longjmp`, an exception unwound to an outer routine                                                       | x86, M68K, Z80: ends as soon as the stack is back above the frame. MIPS and RISC-V: see Limits.                                                |
| A handler is entered instead of the line (IRQ, interrupt, signal)                                         | The handler runs to its return, then the line runs. At most 16 handlers in a row, then the step stops where it is.                             |
| An x86 signal handler                                                                                     | Runs through its `ret` and the restorer to `rt_sigreturn`. Its return cannot be reversed, so Undo of that step goes one instruction at a time. |
| The line itself traps to a program handler (`trap #1`, `teq`, a fault with a handler)                     | The handler runs to its return.                                                                                                                |
| A host service (`syscall`, `ecall`, `trap #15`)                                                           | One instruction, as today.                                                                                                                     |
| A pseudo-instruction or macro line of several instructions (RISC-V `call`, `la`)                          | One Step over runs the whole line; a jump back within the line ends it.                                                                        |
| A routine returns into a Z80 macro's instructions                                                         | Stops there. Today a program counter inside a macro is taken for the end of the program; fixed with the Z80 work.                              |
| Z80 `ldir` and the other repeating block instructions                                                     | One Step over runs the block to its end. Step stays one iteration.                                                                             |
| A Z80 routine borrows `SP` to fill memory                                                                 | The frames stay: a move of more than 4,096 bytes is a stack switch.                                                                            |
| The call is the program's last instruction                                                                | The program ends when the routine returns.                                                                                                     |
| Step out with no routine to leave                                                                         | Not offered.                                                                                                                                   |
| Step out inside a handler                                                                                 | Runs to the handler's return.                                                                                                                  |
| Step out of a routine entered without a call (a jump, falling through)                                    | Leaves the frame the Call stack shows on top, which is the caller's.                                                                           |
| Step over a call into Library code                                                                        | The library routine runs natively, callbacks included. Step still enters callbacks.                                                            |
| Stopped inside Library code, shown at the program's call                                                  | Step over finishes the library call. Step out leaves the routine shown.                                                                        |
| Step out of a callback ends inside Library code                                                           | Goes on to program code one instruction at a time, as Step does, under the same 50,000,000 limit.                                              |
| Undo off                                                                                                  | Both commands work. On x86 the Call stack is no longer empty.                                                                                  |
| M68K timers                                                                                               | They run while a stepped-over routine runs, as in a Run, and not for a single instruction.                                                     |
| The coding agent steps over a routine that never returns                                                  | The tool's limit ends it, with the program stopped inside the routine.                                                                         |

### Limits

- **A routine that never returns** runs until a Breakpoint, a Pause or the end, like a Run.
- **A routine that takes its return address off the stack before it returns** (`pop hl` … `jp (hl)`, `move.l (sp)+,a0` … `jmp (a0)`, the usual way to read parameters placed after the call): on x86, M68K and the Z80 the frame is gone at that `pop`, so a Step over ends there, inside the routine, and the Call stack no longer shows the call. None of the tools surveyed handles this; MAME and Mesen run on instead.
- **Programs that switch stacks** (coroutines, the asmOS examples' task switches, an x86 `sigaltstack` above the main stack): frames are kept or dropped by a stack pointer that now belongs to another task, so a step can end early or run on.
- **A Z80 unwind of more than 4,096 bytes** in one instruction is taken for a stack switch and leaves its frames.
- **MIPS and RISC-V returns the rules do not recognise**: a routine that neither executes a return instruction nor arrives at its return address, for example one that branches back into the middle of its caller, keeps its frame, and a Step over it runs on.
- **MIPS and RISC-V unwinds**: a `longjmp`-style jump removes only the frames whose return address it reaches. Their Runtime libraries have no `setjmp`.

## Decisions taken by default

1. **Step keeps its name.** The new commands are Step over and Step out; there is no "Step into" button.
2. **The Call stack depth is the rule**, and each Core's frame rules are reworked to make it trustworthy, rather than a "return address and stack pointer" test beside a Call stack that can be wrong.
3. **Handlers are frames on every Core**, new on MIPS, RISC-V and for x86 signals. Step over runs through a handler and then still runs its line.
4. **Step over works on the source line**, so a RISC-V `call` or a macro line is one press. Step stays one machine instruction.
5. **Step over finishes a Z80 block instruction.**
6. **RISC-V gives a frame to a call that links through `t0`**, as well as `ra`. Only `ret` is a return instruction.
7. **Step out is disabled with no routine to leave**, rather than running to the end.
8. **One Undo takes back a completed step**, with the instruction-by-instruction fallback above.
9. **Library code keeps today's Step.** Only Step over and Step out use the native run.
10. **No instruction limit for a person**, as for a Run. The coding agent's tool passes one.
11. **Both buttons appear in every dock**, the Interactive editors included, with the shortcuts above.
12. **Core APIs.** The Z80's `stepOver`/`stepOut` and `STEP_COMPLETE` go: they cannot be resumed and nothing uses them. MARS and RARS gain one `run(options)` beside the `simulate*` exports, which stay: the Runtime library's corpus runner (`runtime/scripts/test-cores.mjs`) and the asmOS test suite in asm-examples use them. Their `StopReason` gains `CALL_DEPTH` at the same number in both.
13. **The frame limit is on MIPS, RISC-V, M68K and the Z80.** x86 has none.

## Work

### Per Core

Each Core is independent of the others and of the editor, and ships with its own tests. Every change in stage 1 adds to a Core's API and takes nothing the editor uses away, so the editor builds against the Cores throughout.

| Core   | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Tests and build                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| x86    | Frame tracking moved out of the history's capacity check. A frame for signal delivery, gone at the interrupted `rsp`; `int3`, `int n` and `into` no longer classed as calls. `untilCallDepth` tested at the top of `runLoop`, before the limit check (`blinkenlib.c:530`); the new stop kind in the four places (`blinkenlib.c:239`, `blink-runtime.ts:149-158`, `x86-emulator.ts:1016`, the adapter's reason mapping). `getCallDepth()`. The step reports a delivered signal. | `blink-js`: `npm test`, `npm run type-check`. Wasm: `compile_blink.sh` with emsdk; the wasm is committed. |
| M68K   | `CallStackFrame` gains the stack pointer and its stack; frames popped by stack pointer after each step, journaled for Undo; the frame limit. `untilCallDepth` on one checked run path that replaces the unchecked `run_with_limit` path for stepping. A stop reason the adapter can read instead of inferring a Breakpoint from `Running`. `call_depth()`. History depth getter.                                                                                               | `cargo test` in `m68k`; `npm run build-wasm`, `build-lib`; `ts-lib` smoke test.                           |
| MIPS   | Frame rules above; `returnAddress` and `kind` on the frame; the `bgezal` frame fixed; no frame for `jalr $zero`; the frame limit. Handler frames, journaled. `run({ breakpoints, limit, untilCallDepth, skipBreakpointAtPc })` beside `simulate*`; `CALL_DEPTH`; `getCallDepth()`. The step reports an interrupt entry. No `long` in the hot loop (TeaVM).                                                                                                                     | `mvn clean install`, then in `marsjs/ts`: `npm run build`, `npm test`, `npm run test:wasm`.               |
| RISC-V | The same, mirrored, with frames for calls that link through `t0`.                                                                                                                                                                                                                                                                                                                                                                                                              | The same in `rarsjs/ts`.                                                                                  |
| Z80    | Tracked frames in `Z80Machine`, journaled, with the 4,096-byte rule and the frame limit; `callStack` and `namedCallStack` read them. `run({ untilCallDepth, skipBreakpointAtPc })`; `StopReason.CALL_DEPTH`; `stepOver`, `stepOut`, `STEP_COMPLETE` removed. A way to tell a repeating block instruction. An instruction inside a macro mapped to the line that used the macro (`SourceMap.ts:79-82`). `z80-emulator` is upstream's and stays untouched.                       | `npx vitest run packages/z80-`; `npm run build -w packages/z80-machine`.                                  |

Each Core's test list: recursion; nested calls; a call not taken; a call to the next instruction; a Breakpoint on the routine's first instruction, inside it and on the line it returns to; a Breakpoint on a line that waits before it runs; input inside the routine; the program ending and failing inside it; a changed return address; a return by another instruction; a tail call; a handler entered during the step; Undo across pushes and pops, several pops in one instruction included; `untilCallDepth` reached exactly on the slice's last instruction; the call as the program's last instruction.

The new per-instruction tests must cost one comparison when nothing is asked for. Throughput is measured before and after with the editor's harness (`asm-editor/src/lib/languages/measurements/`).

### Editor

1. `ExecutionSlice.ts`, `BaseEmulator`, `GenericEmulator`: the slice option and reason, `_getCallDepth`, `stepOver`/`stepOut`, the `stepping` gate, the pending ledger segment, the History row, and `sliceLoop` clearing `skipBreakpointAtPc` on progress rather than after its first slice. Tested against the fake adapter in `GenericEmulator.test.ts`, so it does not wait for the Cores.
2. The five adapters: pass the option on every Core call (the M68K adapter re-enters several times per slice), map the stop reason, report the handler entry, keep the skip until an instruction has executed, and the ledger hooks on M68K and Z80. One test file per language against the real Core, with the list above.
3. `ExecutionDock`, `ExecutionControls`, `InteractiveInstructionEditor`, the backdrop, `shortcutsStore`, `WorkbenchSession`, the coding agent's tool, and the fakes of the Emulator in `workbench/__fixtures__/`. Checked in a browser at the Workbench's and a Playground's widths.
4. Text: [CONTEXT.md](../../CONTEXT.md) (Step, Step over, Step out; Library code, IRQ and Breakpoint amended), the ADR, a dated note on ADRs 0007 and 0023, the "Using the editor" lecture, the lecture of each Language course that teaches calls, each Core's README and changelog.

### Order

| Stage | What                                                                                                                          | Depends on |
| ----- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 0     | The owner's decisions and the review, below                                                                                   |            |
| 1     | The five Cores, in parallel                                                                                                   | 0          |
| 2     | Editor engine against the fake adapter, in parallel with stage 1                                                              | 0          |
| 3     | Adapters and per-language tests                                                                                               | 1, 2       |
| 4     | Controls, shortcuts, the assistant tool, browser check                                                                        | 3          |
| 5     | Undo speed: measured, then a batch `undo(count)` and a constant-time depth in each Core, with one peripheral rewind per batch | 3          |
| 6     | Design record, ADR, glossary, lectures, Core documentation; releases                                                          | 4, 5       |

## Review

On 2026-11-10 an independent pass was asked to break the plan against the code before any of it was written. It read the five Cores and the editor and returned eleven findings; each was checked and taken:

1. The check MIPS, RISC-V and the Z80 gain for `skipBreakpointAtPc: false` would have stopped a plain Run parked on a Breakpoint whose line waits for input. The skip is now spent by an instruction that executes.
2. The RISC-V rule for `t0` contradicted itself and, read as the specification's table, popped live frames (`la t0, f` / `jalr t0`). It is now a push only.
3. An x86 signal frame would have ended at the restorer, before `rt_sigreturn`, and `int3` would have counted twice. Both rules are restated.
4. `pause()` returns early during a Step, and a held key would have queued steps. The gate is now one state on the Emulator.
5. The order of the depth and Breakpoint tests, how one ledger group spans the phases, and what the History row shows were unspecified, and today's code could produce none of them.
6. The Library code continuation applied to every stop, and Step out left the library function rather than the routine shown.
7. A Z80 program that borrows `SP` to fill memory would have lost every frame; the 4,096-byte rule covers it. A routine that pops its return address ends the step early, which is now stated as a limit and not claimed to work.
8. Removing `simulate*` would have broken the Runtime library's corpus runner and the asmOS suite. They stay.
9. The coding agent's tool could hang on a routine that never returns. It takes a limit.
10. A Z80 routine returning into a macro's instructions would have been reported as the end of the program. The fix is in the Z80 work.
11. Undo of a long step is slow enough that stage 5 has to come before a release, and the frame limit on x86 would have cost more than it saved.

## Implementation record

Done on 2026-11-10. The five Cores were each done by one worker in parallel, with the Z80, x86 and shared MIPS/RISC-V adapters after them; the engine, the controls, the M68K adapter and the MIPS tests were written by hand. Nothing is committed.

### What was built

| Part                  | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Z80 Core              | A tracked Call stack, journaled for Undo, with the 4,096-byte rule and the frame limit; `RunOptions.untilCallDepth` and `skipBreakpointAtPc`; `StopReason.CALL_DEPTH`; `getCallDepth()`, `getCallStack(max)`, `getHistory(max, skip)`, `getUndoDepth()`, `getInstructionsExecuted()`; a macro's instructions mapped to the line that used it; `stepOver`, `stepOut`, `STEP_COMPLETE` and `reconstructCallStack` removed. 192 tests in `z80-machine`.      |
| x86 Core              | Frames tracked with Undo off; a frame for a signal delivered to a handler; `int3`, `int n` and `into` push none; `X86RunOptions.untilCallDepth`, stop kind `callDepth` (SIGTRAP code 46); `getCallDepth()`, `getCallStack(max)`; `step()` answers `handlerEntry`. A handled fault now carries on into its handler in the same native slice, which it used to end with no stop reason. 3,548 tests.                                                        |
| M68K Core             | One frame rule, by the stack pointer of the stack the frame is on, in place of the pops by instruction; frames record `sp` and `stack`; the frame limit; `untilCallDepth` on `runWithBreakpoints` and `runWithLimit`; `getStopReason()`; `getCallDepth()`, `getCallStack(max)`, `getUndoDepth()`, `getRecordedSteps()`, `getUndoHistory(amount, skip)`. 1,050 tests; the Musashi and Moira differential suites, which need fetched sources, were not run. |
| MIPS and RISC-V Cores | The frame rules above, handler frames, the frame limit, `run(options)` beside `simulate*`, `StopReason.CALL_DEPTH = 7`, `getCallDepth()`, `getCallStack(max)`, and `callSite`, `returnAddress` and `kind` on a frame. Both suites pass on JavaScript and WebAssembly.                                                                                                                                                                                     |
| Editor engine         | `GenericEmulator.stepOver`/`stepOut`, the `stepping` gate, `stepRunning`, `canStepOut`, `callStackDepth`; the pending ledger segment; `sliceLoop` keeps the Breakpoint skip until a slice reports progress. Tested against a fake Core that runs a program (`ProgramEmulator` in `GenericEmulator.test.ts`).                                                                                                                                              |
| Adapters              | All five pass `untilCallDepth` on every Core call, map the stop, report a handler entry and honour `max` on the Call stack. M68K and Z80 gained the ledger hooks. One stepping test file per language against the real Core.                                                                                                                                                                                                                              |
| Controls              | Step over and Step out in `ExecutionDock`, Shift+→ and Shift+←, the History row, the coding agent's `step` modes with a 1,000,000-instruction limit, and the Call stack panel given the newest 500 frames with "and N more below".                                                                                                                                                                                                                        |
| Text                  | [ADR 0079](../adr/0079-a-step-over-and-a-step-out-end-at-a-call-stack-depth.md), dated updates on ADRs 0007 and 0023, [CONTEXT.md](../../CONTEXT.md) (Step, Step over, Step out, Call stack), the "Using the editor" lecture and a short note in the six lectures that teach calls.                                                                                                                                                                       |

Checked in headless Chrome on a Playground of each of the five languages: Build, Step over twice, Undo, Step into the routine, Step out, at 1,100 and 560 pixels wide.

### Where it differs from the plan

- **Step over of an instruction that repeats** asks the adapter whether the instruction at the program counter is one of the Z80's eight block instructions, after a pass that left the program counter on it. The Core's `blockInstructionWillRepeat()` answers a different question and is not used by the editor.
- **RISC-V's `ret` with any immediate** still counts as a return, as before the work.
- **Step over and Step out are parts of the Step button**, not two buttons after it (owner, 2026-11-10: "too many buttons"). The dock draws Step, over and out in one edge with a rule between each part; each part is still its own button, with the names Step over and Step out, so the shortcuts, the tests and the lectures' **Step over** and **Step out** are unchanged. A host can instead draw them in a menu behind an arrow beside Step, which stays open as they are pressed, or not at all (`stepButtons`: `normal`, `dropdown`, `none`). The Workbench uses `normal` and every Playground `dropdown` (owner, 2026-11-10). Checking it found the phone layout's buttons running into each other, which is fixed.
- **The home page's backdrop dock** was left as it is, with Step alone.
- **The x86 frame holds no call site**; it is the return address less the call's length.
- **Step out of `main` in a loaded Executable**, pressed while the program is inside a library function, leaves `main` and then goes on through libc's `exit` to the Executable's own `__do_global_dtors_aux`, which is program code, rather than ending the program.

### Measured

- **Throughput**, each against its Core's HEAD, on a loaded machine: M68K 1 to 3 percent slower on its test loops; x86 with Undo off 2 to 5 percent on a loop with no calls, 2 to 3 on a recursive `fib`, 7 on a loop that calls every fourth instruction; MIPS and RISC-V within the noise of the measurement.
- **One Undo of a completed step** of 30,000 instructions took 0.71 s on M68K, 0.93 s on MIPS and 0.48 s on x86 while the editor took the group back an entry at a time. The Cores' own undo was a small part of it: all 30,000 took 9 ms on MIPS, 21 ms on x86 and 157 ms on M68K, the last because each undone step was handed back to JavaScript. The rest was asking the Core to describe the newest entry before each single undo, and rewinding every peripheral journal once per entry. With the group taken back in one go (below) the same Undo takes 12 ms on M68K, 22 ms on MIPS, 30 ms on RISC-V and 27 ms on x86, and 14, 39, 57 and 56 ms for 90,000 instructions. The Z80 was never slow (48 ms for 60,000) and keeps its loop.

### Stage 5, as built

Smaller than planned, since the measurement put the cost in the editor and not in the Cores. An adapter may offer `_undoEntries(count)`, which `GenericEmulator.undo` calls for a group in place of `count` calls of `_undo`: it reads the group's oldest entry once, undoes the entries, and rewinds each peripheral journal once to before that entry, which is right because the journals are keyed by a step id or serial that only grows. M68K, MIPS, RISC-V and x86 have it. The only Core change is `undoMany(count)` in s68k, which takes steps back without describing each to the caller. The constant-time undo depth for MIPS and RISC-V was not needed and was not built: `getUndoDepth()` is asked once per Undo, not once per entry.

### Left to do

- **MIPS's `jr $ra` search is not bounded** as RISC-V's is (which counts held frames per return address): a program that piles up 131,072 unreturned `jal`s and then returns through addresses that match none of them takes time in proportion to the frames held for each return.
- **MIPS History rows show no frame pushed or popped**, which RISC-V's now do (`rowFacts` in `RISC-V/RISC-VEmulator.svelte.ts`).
- **A row whose instruction left a handler** (`eret`, `uret`) reads "Popped call".
- **The Core READMEs** the workers wrote have not been read against the text guidance.
- **Releases** of the five Cores.

## Found on the way

Folded into the Core work above unless marked.

- MIPS: a `bal`/`bgezal`/`bltzal` frame shows the branch target as the return address.
- MIPS and RISC-V: `getUndoDepth()` walks the whole history at every stop. Left as it is: it measured 0.15 ms a call with 30,000 entries held, and it is asked once per stop.
- M68K: `rts` pops an exception frame and `rte` leaves a call frame, so the Call stack drifts _(reported)_; every `bsr`/`jsr` allocates sixteen registers and `getCallStack` serialises every frame at each refresh _(reported)_.
- x86: no Call stack with Undo off.
- x86: a fault whose handler runs ends the slice with no stop reason, and the faulting instruction has a history entry but is not counted _(reported; not in this plan)_.
- Z80: Undo does not restore which instruction pushed a stack slot, so frames can vanish after an Undo _(reported)_; fixed by the tracked list.
- Z80: instructions inside a macro have no source line (`SourceMap.ts:79-82`), and the adapter takes a `pc` with none for the end of the program (`Z80Emulator.svelte.ts:449`).
- M68K and Z80: a grouped Undo is always refused today, because the adapters lack the ledger hooks.

## Raised by the owner: a yield hook in place of slices

On 2026-11-10 the owner asked whether a Run should be one call to the Core, which calls an awaited hook every so often, so that nobody using a Core has to know about slices. Not decided. What was found:

- **Three layers do the same job today.** The editor cuts a Run into slices (`sliceLoop`). Inside a slice the MIPS and RISC-V adapter runs chunks of 64 instructions and up (`mars/marsSlice.ts`), and `@specy/x86`'s `run()` already loops over 200,000-instruction native calls with a `deferToHost()` between them (`x86-emulator.ts:986-1012`). Every option a Run has is passed again at each layer, which is where `skipBreakpointAtPc` and this plan's `untilCallDepth` come from.
- **It need not be slower.** The test costs nothing: every run loop already counts down a limit per instruction. Calling the hook costs what the end of a slice costs today, a return to JavaScript and a host turn, so the same cadence gives the same throughput. What would be slow is a hook every few instructions: each awaited call is at least a microtask, and letting the browser paint takes a whole host turn.
- **By time, not by count.** Instructions vary in cost by orders of magnitude, which is why the editor learns each program's speed (`speedCorrection`, an instructions-per-millisecond constant per adapter). A Core that reads the clock every 1,024 instructions, as the x86 Core's timer already does, can call the hook every 16 or 50 ms directly, and that estimating goes away.
- **Two kinds of Core.** MIPS and RISC-V run on a TeaVM coroutine and can await the hook where they are, as they do an input handler. x86 and M68K are WebAssembly and cannot: their package's own wrapper has to return from the module, await the hook and go back in. That is a slice still, but inside the package, as x86's is now. The Z80's `run` would become asynchronous in the same way.
- **What it would take.** One `run(options)` per Core with `onYield`, a way to stop (the hook's answer, or an `AbortSignal`) and a way to change Breakpoints during it; `GenericEmulator`'s scheduler reduced to that hook; the chunk loops and the per-slice re-passing removed from the adapters; input waits, sleeps, the M68K's timers between slices and the frame shown at a sleep carried over. It supersedes [ADR 0007](../adr/0007-generic-emulator-run-scheduling.md).

Recommendation: a refactor of its own, after stepping. Stepping does not need it, since `untilCallDepth` is one number with no state behind it and carries over unchanged, and the scheduler is where most of this code's measured fixes live. The `run(options)` that MARS and RARS get here is shaped so that `onYield` is one more option later. A first spike on MIPS, which has the most layers and can await in place, would measure throughput and how fast Stop answers against the existing harness.

## Not in this plan

- Stepping by C source line. Step over works on the Generated assembly's lines; a "next C line" command needs a run that stops when the program leaves a range of addresses.
- Undoing back over a call from inside it, or back out to the caller.
- Running to a frame chosen in the Call stack panel, which is `untilCallDepth` with that frame's index.
- Replacing the Library code loop of Step with a native run.
