---
status: accepted
date: 2026-10-28
---

# M68K devices deliver IRQs

Amends [ADR 0008](./0008-poll-keyboard-and-mouse-input.md), under which the Keyboard and the Mouse deliver no CPU interrupts.

On M68K, a program can ask for an **IRQ**, an interrupt request at a level from 1 to 7, from the sources EASy68K has without its hardware window: automatic timers, set per level by `trap #15` task 32 with 6 in D1.B, and the Screen's keyboard and mouse, whose events get a level each from tasks 62 and 60 ([m68k-machine.md](../design/m68k-machine.md), decisions 16 to 19). The Core keeps those settings with the rest of the program's state, and Undo puts them back. The editor only reports what happens: each timer firing as `raiseIrq(level)`, and each key down or up, button down or up and move on the Screen as `deviceEvent(kind)`, which latches the level the program set for it or nothing. The Core decides what a request does, and takes it between two instructions as a step of its own.

The Keyboard and the Mouse tell their listener of an event at the moment it happens, so the IRQ is immediate. Everything else about them stays as ADR 0008 has it: the key state a handler reads with task 19 is still applied at read time under the hold interval, and the mouse views still hold their snapshots.

Timers run on program time ([ADR 0010](./0010-program-time-without-clock-pacing.md)), and only while a Run is in progress, as EASy68K stops its timers on Pause and while tracing: each Run counts them from its start, and a Step never meets one. A firing is raised between two slices of the Run ([ADR 0007](./0007-generic-emulator-run-scheduling.md)), at most one slice late.

A processor that `stop` stopped waits for a request above its mask without running anything. Its slice ends with a wait that the next timer firing, a key or mouse event that wakes the processor, Pause or Stop ends, whichever comes first. It is the first wait a Pause ends: a Delay still runs out before a Pause is taken, as ADR 0007 has it, because cutting it short would shorten the time the program asked for, where cutting a `stop` short costs the program nothing. While the processor waits, the status line beside the Terminal's tab says what for: "Stopped: waiting for an interrupt above level 3".

## Considered options

- **The editor decides what an event raises.** It would keep the levels itself and call `raiseIrq` for a key down. The levels are the program's state, which Undo must put back, and the Core already journals its state; two owners of one setting would drift apart at the first Undo.
- **Timers that run whenever the program is loaded**, as wall-clock timers would. A paused program would collect requests while a person looks at it, and the first Step after a pause would meet a handler they did not ask for.
- **A Pause that ends every wait.** A program's Delay would then come back early from a Pause, and a person stepping through an animation would see it run faster than it does.

## Consequences

- An IRQ step is its own row of the History ("IRQ 2 → timer at $102C"), and its frame in the Call stack is named for its level. Undoing it makes its request pending again, as a request is the host's input and is journaled nowhere, while a request raised after an earlier step survives the Undo of that step.
- A request latched while the Run is paused is taken by the next step. A Run that starts on a Breakpoint with a request pending takes the request first, so its handler comes back to the Breakpoint's instruction, which has not run, and the Run stops there again, consistently with [ADR 0023](./0023-run-continues-past-the-breakpoint-it-is-parked-on.md). The Log says so when it happens.
- A Testcase has no keyboard or mouse, so only timers raise requests there, on its virtual clock: a stopped processor moves the clock straight to the next firing that can wake it, so a timer-driven program runs at once. One nothing can wake fails with that reason rather than running into the instruction limit.
- MIPS, RISC-V, x86 and the Z80 keep ADR 0008's polling. MARS's interrupt-driven keyboard mode and the Z80's `ei` + `halt` remain outside compatibility.
