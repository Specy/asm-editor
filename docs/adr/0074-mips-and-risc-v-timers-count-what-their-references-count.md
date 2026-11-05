---
status: accepted
date: 2026-11-04
---

# MIPS and RISC-V timers count what their references count

asmOS runs cooperatively on MIPS and RISC-V because neither Target delivers interrupts: setting an interrupt-enable bit stops the program. Stage 2 of its port ([asmos-stage2.md](../design/asmos-stage2.md)) gives both a timer and delivers its interrupts. The two references count different things, so the two Targets do too:

- **RISC-V** gets RARS's Timer Tool: `time` at 0xFFFF0018 and `timecmp` at 0xFFFF0020, in milliseconds of **Program time** ([ADR 0010](./0010-program-time-without-clock-pacing.md)), as the tool counts real milliseconds. A "fire in one second" fires after a real second. `time` starts at 0 at each run, as the tool's does, and counts only while the program runs: it stops at Pause, at Breakpoints and between Steps. It is checked every 1,024 instructions, at each slice's end and at each Step. `wfi` waits for the timer or an external interrupt that `uie` enables, which Pause and Stop also end, a Step's wait included, and in a Testcase moves the virtual clock to `timecmp`.
- **MIPS** gets MIPS32's CP0 Count (`$9`) and Compare (`$11`), raising Cause IP7. Count counts **CPU time** ([ADR 0040](./0040-programs-see-calendar-elapsed-and-cpu-clocks.md)): it goes up once every two retired instructions, a Count ticking every other cycle of the nominal 100 MHz machine. It says how much the program has run, not how long that took, so it is the same on every run. The timer stays off until the program first writes Compare: MARS starts programs with interrupts enabled, and a program that never used the timer must not stop at an interrupt when Count wraps.

**Delivery** goes the way each reference delivers it:

- MIPS: Status, Cause and EPC, the `.ktext` handler at 0x80000180, and `eret`;
- RISC-V: `utvec`, `ustatus`, `uie`, `uip` and `ucause`, then `uret`.

The reference tools' keyboard receiver and display transmitter raise their interrupts too, so their interrupt-driven keyboard and display labs run unchanged. The receiver's is level-triggered, requested for as long as a character waits and the interrupt is enabled, where MARS and RARS raise one per key event: the editor queues keys, and a key typed early, a Testcase's input or two quick keys must not be stuck in the queue. The transmitter's is edge-triggered, as MARS's and RARS's are: one request each time it becomes ready again after taking a character, which here is at once, so a handler that prints nothing more is not called again with the interrupt still enabled. A request waits until it can be taken, where the references drop one that comes while interrupts are held back. **Stepping** is faithful: a Step can land on a handler's first instruction, and the Log says when a Step took an interrupt. Undo restores the interrupt state.

## Considered options

- **Both on CPU time:** deterministic everywhere, but RARS's "one second" would take 20 to 30 real seconds at today's speed, and `time` would disagree with syscall 30.
- **Both on Program time:** a MIPS cycle counter ticking in milliseconds, which no MIPS does.
- **A nominal clock nearer the real speed**, so that Count's seconds feel real: the 100 MHz rate is shared by every Target's CPU-time services, and the real speed varies by machine and by the Undo setting. Software calibrates instead, as Linux on MIPS calibrates Count at boot, and asmOS's MIPS platform does the same against syscall 30.
- **Holding interrupts off while stepping:** easier on a learner stepping through main, but it hides what an interrupts lesson teaches, and stepping would time differently from running.

## Consequences

- **MIPS interrupts land at the same instruction on every run**, so Undo, stepping and Testcases see them identically. RISC-V's land where Program time puts them, as x86's asmOS timer already does.
- **A RISC-V program in a Testcase that spins for a timer interrupt without ever waiting gets none**, since the virtual clock moves only on waits. It runs to the instruction limit, as ADR 0010 already accepts for a program that polls the time. The Documentation says so.
- **The Cores own the timers** ([ADR 0035](./0035-environments-match-their-reference.md)). The receiver and transmitter stay in the adapter, which raises their interrupts through a new Core export.
- **The Input controller's interrupt-enable bit stays reserved**, still stopping the program ([ADR 0071](./0071-mips-and-risc-v-read-the-keyboard-and-mouse-through-an-input-controller.md)).
- **Count's rate is now a contract:** one tick per two instructions.
