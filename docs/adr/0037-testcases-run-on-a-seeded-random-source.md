---
status: accepted
date: 2026-10-05
---

# Testcases run on a seeded Random source

Amended in part by [ADR 0040](./0040-programs-see-calendar-elapsed-and-cpu-clocks.md).

Every Target's random services draw from a **Random source** selected for the whole run, as the **Time Source** is ([ADR 0010](./0010-program-time-without-clock-pacing.md)). In an interactive run an unseeded generator starts from host randomness, as in its Reference environment; in a Testcase's scripted run it starts from a fixed seed, and x86 `getrandom` returns a fixed stream, so the same program and Testcase produce the same numbers every time and a random program can be tested. A program that seeds a generator itself (MARS and RARS service 40) gets that seed's sequence in both kinds of run. MARS's and RARS's generators implement `java.util.Random`'s algorithm exactly, rather than TeaVM's, which differs in `nextInt(bound)`, so a seeded program prints the numbers MARS prints ([ADR 0035](./0035-environments-match-their-reference.md)). The fixed seed is a deviation that helps a learner, documented with each random service.

x86 also joins the virtual Time Source, ending the exception ADR 0010 recorded: Blink's clock and sleep calls go through Core hooks, the way MARS's time and sleep syscalls do, and a sleep becomes an asynchronous wait instead of a busy loop that froze the page.

## Consequences

- The fixed seed values, how a generator's id derives its seed in a scripted run, and the generator algorithms become part of every saved Testcase's expected output: changing any of them changes what a passing program prints, so they are fixed once and changed only as a breaking change.
- Scripted runs need no seed setting of their own; a Testcase that wants different numbers can seed explicitly.
- Undo restores a generator's state, as [ADR 0005](./0005-restore-screen-state-on-undo.md) restores the Screen: MARS and RARS journal a stream's state when a random service advances it, and x86 records `getrandom`'s stream position with the instruction, so Undo then Step draws the same number again (decided while planning, 2026-10-05).
- The fixed seed and the derivations, fixed on 2026-10-06 in `src/lib/languages/peripherals/RandomSource.ts` and pinned by its tests: the seed is `0x5465737463617365`, the text `Testcase` in ASCII read as a big-endian number. With SplitMix64's output function `mix` and γ = `0x9E3779B97F4A7C15`, `word(k) = mix(seed + k·γ)` modulo 2^64, SplitMix64's k-th output. MARS and RARS generator n starts from the high 48 bits of `word(n)`, n taken as a 64-bit two's complement number; x86's random bytes are `word(2^63)`, `word(2^63 + 1)`, … each least significant byte first. A scripted run's generator 0 therefore starts from `0xC4E8BADD8E2E` and its bytes begin `10 43 8D C6 A6 15 00 80`. An interactive run derives the same way from a seed drawn from host randomness at every Build, so a generator keeps its first seed for the run and Undo then Step draws the same number there too.

## Considered options

- Reproducible time only: random programs stay untestable unless they seed themselves.
- Keeping x86 on Blink's real clock and the unseeded generators, adding only service 40.
