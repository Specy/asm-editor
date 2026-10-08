---
status: accepted
date: 2026-10-05
---

# Environments match their reference

Amended in part by [ADR 0041](./0041-runtime-compatibility-protects-calls-and-standard-meanings.md).

Every service a program reaches the outside world through (syscalls, traps, ports, memory-mapped devices) behaves as it does in the Target's **Reference environment**: EASy68K 5.16 for M68K, MARS 4.5 for MIPS, RARS 1.6 for RISC-V, a Linux process on a tty for x86, and, for the Z80, whose Port map has no real counterpart, the Port map as [ADR 0002](./0002-z80-console-ports.md) and [ADR 0011](./0011-z80-peripherals-through-the-port-map.md) define it. This extends [ADR 0003](./0003-preserve-simulator-graphics-conventions.md) from graphics to every service. Three rules apply:

1. **The same result for every input the reference accepts:** formatting, parsing (EASy68K's `atoi` reads `"12abc"` as 12), key codes (Enter is `$0D` to EASy68K), dialog answers (Cancel is 2 or -2 in MARS), exit codes and error returns.
2. **A deviation is kept only where it helps a learner, and is documented** in the language's Documentation. Where the reference is silent or undefined on bad input, the service may stop with a clear error. Typed-character queues that never drop a key, virtual time in Testcases, End of input on standard input and loud rejection of unsupported tasks are such deviations.
3. **The Core owns each service's semantics; the editor owns the transport.** The editor's shared Peripherals deliver lines, bytes, keys, echo, End of input, Program time and Files; the Core parses, formats and decides errors with the reference's rules. An adapter connects the two and never parses or formats.
4. **Every reference service that can work faithfully in a single browser page is implemented**; the rest are rejected with a stated reason, and the Documentation lists exactly what works. This covers, for example, EASy68K's file tasks 50 to 59 on the FileSystem, its echo and prompt settings (12, 16) and cycle counter (30, 31), MARS's and RARS's seed service (40), and sound (EASy68K 70 to 77, MARS and RARS MIDI 31 and 33) through an Audio Peripheral that gets its own design; not serial ports, networking or `fork`.

MARS and RARS are taken as they run on a current JDK (21), whose `Float.toString` and `Double.toString` print the shortest decimal that round-trips; the Cores reproduce that with their own code, because the TeaVM runtime they are compiled with differs on edge values (decided while planning, 2026-10-05).

The audit behind this ([environment-services-audit.md](../research/environment-services-audit.md)) found each language parsing, formatting and failing in its own way, much of it in the editor adapters, and MIPS and RISC-V disagreeing with each other.

## Considered options

- Keeping the current behaviour and fixing only plain bugs: cheapest, but leaves every adapter-side parser and formatter in place and gives no rule for the next case.
- One editor-wide convention for every language (one number parser, one error set, UTF-8 everywhere): simpler to explain inside the editor, but programs, Testcases and course material written against MARS or EASy68K would print differently here.
