# GenericEmulator owns run scheduling

GenericEmulator will own run scheduling, time-budget selection and yielding to the host, giving each language adapter a hint for how long its Core should execute before returning at an instruction boundary. Long compute-only runs will still yield occasionally to keep the editor responsive, using longer budgets than interactive runs and avoiding waits for display frames. Centralizing this policy keeps responsiveness and throughput tuning consistent across languages while each Core handles efficient execution and periodic budget checks.

## Consequences

- A time-budget return must be distinguishable from a breakpoint, termination, an input wait or exhaustion of the overall instruction limit, so the generic scheduler can resume or stop correctly.
- Adapters must report sufficient execution progress to preserve the overall instruction limit across all slices of one Run; receiving another time hint must not reset that limit.
- The time budget is a cooperative hint, not a real-time guarantee. Its checking interval and yielding overhead require measurement against the actual Cores.
- Exact budgets and the host yielding mechanism remain implementation choices to validate; language adapters do not choose independent rendering or browser-yield policies.
- Validation targets, decided on 2026-09-06: yields cost under five percent of compute-only throughput on every Core, and Stop is answered within a tenth of a second.
- Program-requested waits, meaning EASy68K's delay task, MARS's sleep syscall and the Z80 wait and frame-sync ports of [ADR 0010](./0010-program-time-without-clock-pacing.md), are scheduling events like input waits: the adapter reports them, the scheduler resumes after the duration without blocking the GUI, and Stop stays available.

## Pause

Pause ends the current Run invocation at a slice boundary, preserving the program, peripheral
state and undo history, just as reaching a breakpoint does. Once Run returns, Step and Undo are
available and Run continues from the current PC with a new instruction limit. No suspended Run
promise remains. Execution commands are serialized so a quick Step followed by Run cannot enter
the Core concurrently. A pending program wait completes before Pause releases the Core.
