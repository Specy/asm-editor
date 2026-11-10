---
status: accepted
date: 2026-11-10
---

# A Step over and a Step out end at a Call stack depth

**Step over** and **Step out** end when the **Call stack** is back to a depth: a Step over when it is no deeper than it was when the command was given, a Step out when the frame of the routine the stop is shown in is gone. The depth is each Core's own count of its frames, and the Core is asked to stop at it with one run option, `untilCallDepth`, which is a plain number passed on every call and leaves no state in the Core. `GenericEmulator` does the rest: one ordinary Step, and, if the Call stack got deeper, a sliced run back to the depth it started from.

We chose the depth over the test most debuggers use, "the program is at the return address with the stack pointer where it was", because that test has to be right for five processors and is not: on MIPS and RISC-V a leaf routine never moves `sp`, and on x86, M68K and the Z80 a changed return address, an unwind or `call next` / `pop` never arrive at the address at all. A frame that is gone covers those. It also means the two commands and the Call stack panel can never disagree, which they could when the panel was one thing and the stop test another.

The price is that every Core's Call stack has to be trustworthy, and they were not. So each Core now says when a frame is pushed and when it is gone in the way that suits its processor:

- **x86, M68K, Z80**, where the return address is on the stack: a frame is gone when the stack pointer of the stack it is on is above it, whatever instruction took it there.
- **MIPS, RISC-V**, where it is in a register: a frame is gone when a return instruction runs, or when the program arrives at its return address with `sp` at or above its value at the call.
- **Handlers** (an exception, an IRQ, an interrupt, an x86 signal) are frames on every Core, so a Step over runs through one and then still runs its line.

The rules, the edge cases and what they do not cover are in [stepping-plan.md](../design/stepping-plan.md).

## Considered options

- **The return address and the stack pointer**, as GDB, LLDB, WinDbg's `gu` and Mesen do: right for recursion, but it runs on when the routine does not come back to that address, and it needed a Call stack to find the address for Step out anyway.
- **Counting call and return instructions**, as VICE does: no Call stack needed, but any return that is not a return instruction, or a call used as a jump, throws the count off for good, with nothing to bring it back.
- **The address after the call alone**, as MAME and EASy68K do: ends early in a routine that calls itself, which MAME's manual says of its own command.
- **Holding the pending step in the Core**: the Core would then own a state that an Undo, a Poke, a rebuild or a Stop could leave stale, and a Run is made of many Core calls, some of which execute nothing. A number that every call is given has none of that.
- **A `stepOver()` and `stepOut()` in each Core** that run to their end in one call, as the Z80 machine had: they cannot be resumed after a slice ends inside the routine, so they could not be used at all, and were removed.

## Consequences

- A routine that takes its return address off the stack before it returns (`pop hl` … `jp (hl)`, the usual way to read parameters placed after a call) ends a Step over at that `pop`, inside the routine, on x86, M68K and the Z80. No tool we looked at handles this; the others run on instead.
- A program that switches stacks, as the asmOS examples' task switches do, can end a step early or late.
- MIPS, RISC-V and the Z80 gain a Breakpoint check before the first instruction of a call that asks for one, so that a Breakpoint on the first instruction of a routine stops a Step over. This changes how [ADR 0023](./0023-run-continues-past-the-breakpoint-it-is-parked-on.md)'s skip is spent; see its update.
- A step that did what it was asked is one entry of the History, which one Undo takes back, when the Core still holds all of it and can reverse all of it. Any other is undone one instruction at a time, as after a Run.
- A Step over or a Step out in flight owns the Core: `GenericEmulator` refuses a Step, an Undo or a Run asked for meanwhile rather than queueing it, which the queue of `duringCoreOperation` would otherwise run once the step is over.
