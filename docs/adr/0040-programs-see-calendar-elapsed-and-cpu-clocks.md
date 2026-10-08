---
status: accepted
date: 2026-10-08
---

# Programs see calendar, elapsed and CPU clocks

Amends the time semantics of [ADR 0010](./0010-program-time-without-clock-pacing.md) and [ADR 0037](./0037-testcases-run-on-a-seeded-random-source.md). Clock values follow their reference environment rather than sharing one elapsed counter.

| Clock | Interactive | Testcase |
| --- | --- | --- |
| Calendar | `Date.now()`, Unix epoch milliseconds | 2000-01-01 UTC plus virtual elapsed milliseconds |
| Elapsed | Host monotonic time since start | Virtual elapsed milliseconds, initially zero |
| CPU | Executed instructions at nominal 100 MHz | The same instruction counter and rate |

Waits advance elapsed time, and virtual calendar time, without charging the waiting duration to CPU time. CPU time rewinds with Core Undo and starts over when a program loads. CPU clocks are a nominal cost model, not an estimate of host CPU performance. Instruction identities stay monotonic and independent of the count.

MARS/RARS service 30 and RARS `time`/`timeh` report calendar time. Reference RARS samples Unix epoch milliseconds into those CSRs, so no separate callback is needed. C `time()` reads that clock. C `clock()` reads retired instructions (`instret` on RISC-V; private service 1101 on MIPS), converts at 100 instructions per microsecond, and returns -1 on overflow. The small cost of making clock reads still counts as executed instructions.

x86 clock ids 0/5/11 use calendar, 1/4/6/7 use elapsed, and 2/3 use CPU. CLOCK_TAI currently shares realtime: leap-second offsets are not modeled. Wait deadlines remain on the Core's monotonic clock. EASy68K task 8 counts hundredths since local midnight interactively and UTC midnight in Testcases. Z80 TIME_NOW is an editor-defined port, explicitly defined as elapsed hundredths in the port map, and retains that meaning.
