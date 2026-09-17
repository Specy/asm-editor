---
status: accepted
date: 2026-09-17
---

# Run continues past the breakpoint it is parked on

A **Breakpoint** stops a Run before the instruction it names executes, except for the instruction the Run itself starts on: that one runs whether or not a breakpoint names it, so Run always makes progress. Which instruction that is belongs to `GenericEmulator`, which sets `skipBreakpointAtPc` on the first slice of every Run and clears it for every slice after it; an adapter that re-enters its Core inside one slice, to answer an interrupt or to spend its budget in chunks, passes it to the first of those calls only. We chose one rule enforced above the Cores because each Core had answered the question for itself, two of them wrongly and in opposite directions, and because the answer depends on something no Core knows: whether the host is starting a Run or resuming one it interrupted.

## The two defects this fixes

- s68k applied the skip to every `run_with_breakpoints` call rather than to the Run, and the M68K adapter calls it again after every answered trap. The instruction after any `trap #15` could therefore not be broken on at all: a breakpoint on the line following a task 18 prompt stopped nothing and the whole Run went by. The same was true of any breakpoint that happened to land on a slice boundary.
- `@specy/x86` applied no skip at all, so a Run resumed where the last one stopped saw the same breakpoint, executed nothing and reported the same stop again. The program could only be moved with a Step, and the next Run stuck again at the next breakpoint.

MARS, RARS and the Z80 machine check their breakpoints after executing an instruction, which already behaves this way. They ignore the flag.

## Considered options

- Tracking the address the last stop left the program on and skipping a breakpoint only there, which is what GDB does and what blink's own C run loop does with `skip_current_breakpoint`. Rejected: the three check-after Cores cannot express it without a pre-check of their own in each adapter, and it leaves Run doing nothing at all when the program is parked on a breakpoint line for any other reason, which is the complaint that started this.
- Leaving the rule in each Core and fixing them separately. Rejected: the same question would be answered in five places, and the Core cannot tell a fresh Run from a resumed one.

## Consequences

- `@specy/s68k` and `@specy/x86` change and release before the editor picks the fix up; `run_with_breakpoints` takes the flag as a third argument and `run` takes it as `options.skipBreakpointAtPc`. Both default to the "continue" behaviour, so a caller that runs a whole program in one call keeps working.
- A breakpoint on the first instruction of a program does not stop the Run that starts it, in any language. Four of the five behaved this way already; x86 used to stop there and no longer does. A breakpoint on the instruction a `simhalt` resumes at behaves the same way, for the same reason.
- A loop that closes on its own breakpoint stops on every pass: the skip is for the instruction the Run starts on, not for the address, and it is spent as soon as that instruction has executed.
- Stopping a slice without executing anything is no longer a state a Run can reach through a breakpoint, so the scheduler's "an adapter that ran nothing ends the run" guard is a guard against an adapter defect again, not something a user can trigger.
