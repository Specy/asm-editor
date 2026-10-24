# 68000 verification and timing references for s68k

Gathered 2026-10-21 for the [M68K machine design](../design/m68k-machine.md): how to verify s68k's real encodings, decoder and disassembler, exceptions, supervisor mode, interrupts and cycle counts, and what a Pseudocode view of 68000 code would take. Web sources are linked inline. "Measured here" means sample files were downloaded and checked with throwaway scripts outside the repository. This is a fact base, not a set of decisions.

## 0. Recommendations

1. **Use [SingleStepTests/m68000](https://github.com/SingleStepTests/m68000) as the primary single-instruction suite, not the better-known Tom Harte set.** It is MIT-licensed, generated from MAME's microcode-derived 68000 core, has 317,500 tests and covers user mode, LINE-A/LINE-F and STOP. The Harte set ([SingleStepTests/680x0](https://github.com/SingleStepTests/680x0)) has no licence and has known-wrong data, including every ASR with a shift count at or above the operand size and DIVU overflow N/Z. Use it only as an optional second run with a skip list.
2. **Runner:** an opt-in `#[ignore]` integration test that reads the fixtures from a directory given by an environment variable (fetched by a script or a git submodule), plus a small vendored subset for the default `cargo test`. MIT makes vendoring a subset legal. The MAME set's binary format parses in about 120 lines of Rust with no new dependencies.
3. **Timing source:** encode the M68000UM Section 8 tables as data, apply Yacht's errata, and verify every number against the suite's `length` field. I checked the data-dependent formulas (DIVU/DIVS, MULU/MULS, shifts, MOVEM, Bcc, DBcc, CHK) against the MAME suite, and all of them match exactly (§2.5).
4. **Encoder/decoder cross-check:** GNU binutils for m68k is not installed but is one `apt` package away (`binutils-m68k-linux-gnu` 2.46). Run the differential tests one instruction at a time, using explicit mnemonics and generated canonical lines, not EASy68K sources. For opcode legality, the 65,536-entry `68000.official.json` map and Musashi's `m68k_is_valid_instruction` are ready-made oracles.
5. **Binary loading:** accept S-records (EASy68K `.S68`: S0 header + S0 memory map + S1/S2/S3 + S8), raw binaries with a user-given load address, and big-endian ELF32 `EM_68K` executables. Use the `object` crate (it has `Architecture::M68k`). The S-record parser can be your own (about 100 lines) or the `srec` crate.
6. **Ghidra:** Processors/68000 ships, but there is **no plain-68000 variant**. Use `68000:BE:32:MC68020` (or CPU32). Its compiled `.sla` measures **67.7 KB** (`68020.sla`), against 501 KB for the bundled x86-64. Adding it is mostly a new `specs/` entry plus an architecture row in `js/src/index.ts`. The real work is making `trap #15` decompile meaningfully (§4.4).

---

## 1. Single-instruction test suites

### 1.1 There are two 68000 JSON suites

|               | **Tom Harte "680x0"**                                                                                                                                                                                                                                                                                                                                    | **raddad772 "m68000"**                                                                                                                                            |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Location      | [SingleStepTests/680x0](https://github.com/SingleStepTests/680x0) `68000/v1/*.json.gz`. Formerly [TomHarte/ProcessorTests](https://github.com/TomHarte/ProcessorTests) `680x0/68000/v1`, which was archived on 2024-05-15 and points to the SingleStepTests org.                                                                                         | [SingleStepTests/m68000](https://github.com/SingleStepTests/m68000) `v1/*.json.bin`                                                                               |
| Generator     | Tom Harte's emulator ([Clock Signal](https://github.com/TomHarte/CLK), MIT). He says "the tests were generated via software emulation with what is — evidently — a flawed emulation" ([ProcessorTests#27](https://github.com/TomHarte/ProcessorTests/issues/27)).                                                                                        | "Generated using the microcoded core in MAME" ([README](https://github.com/SingleStepTests/m68000)). MAME's core is BSD-3-Clause, by Olivier Galibert.            |
| CPU           | 68000 only                                                                                                                                                                                                                                                                                                                                               | 68000 only. The maintainers confirm it is "very 68000 specific" ([m68000#4](https://github.com/SingleStepTests/m68000/issues/4)).                                 |
| Files / tests | 124 files. README: "slightly more than 8,000 tests per operation … a little over 1,000,000 tests". Each of the 5 files sampled here had 8,065 (so 124 × 8,065 ≈ 1.0 M).                                                                                                                                                                                  | 127 files × 2,500 = **317,500 tests**, counted here from every file header.                                                                                       |
| Size          | **202.6 MB gzipped** (sum of the git tree). About **1.1 GB** of JSON uncompressed (estimated from a 5.5× ratio on 5 sampled files).                                                                                                                                                                                                                      | **137.9 MB** of raw little-endian binary (no compression). gzip -9 gives about 38%, so roughly 53 MB.                                                             |
| Licence       | **None.** [680x0#1 "License"](https://github.com/SingleStepTests/680x0/issues/1) has been open since 2024-06-06. ProcessorTests has no licence either.                                                                                                                                                                                                   | **MIT** (`LICENSE`, "Copyright (c) 2024 SingleStepTests")                                                                                                         |
| Initial state | README: 99% of tests start in supervisor mode and 99% have word-aligned pointers. In the samples, all 40,325 tests started in supervisor mode with `pc = 0xC00` and `ssp = 0x800`. Address registers carry random high bytes, so **the bus must mask addresses to 24 bits** ([ProcessorTests#23](https://github.com/TomHarte/ProcessorTests/issues/23)). | Random PC anywhere in 24 bits. About 50% user mode and **about 50% have the T (trace) bit set** ([m68000#2](https://github.com/SingleStepTests/m68000/issues/2)). |
| Status        | Last data commit 2024-05-14. Open errata are not fixed (§1.4).                                                                                                                                                                                                                                                                                           | README: "all of the tests except TAS and TRAPV are verified as good". Last commit 2024-08-01.                                                                     |

The 680x0 repository also has [`map/68000.official.json`](https://github.com/SingleStepTests/680x0/tree/main/map). It maps each of the 65,536 opcode words to a decoded name such as `"d244": "ADD.w D4, D1"` or `"48e7": "MOVEM.l #, -(A7)"`, or to `"None"`. There are 45,815 valid words. The ILLEGAL opcode and LINE-A/LINE-F words are `"None"`. MOVE to/from SR, CCR and USP are listed under their own names. Conditions are not recorded for Bcc/Scc/DBcc. This makes a decoder-legality oracle, but it has no licence, so use it as a local check and don't vendor it.

### 1.2 Harte JSON format (exact, from [68000/v1/README.md](https://github.com/SingleStepTests/680x0/blob/main/68000/v1/README.md))

Each file is a JSON array of tests:

```json
{ "name": "e3ae [LSL.l D1, D6] 5",
  "initial": { "d0": …, "d7": …, "a0": …, "a6": …, "usp": …, "ssp": 2048, "sr": 9994,
               "pc": 3072, "prefetch": [58286, 50941], "ram": [[3077, 34], [3076, 42]] },
  "final":   { …same keys… },
  "length": 126,
  "transactions": [["r", 4, 6, 3076, ".w", 10786], ["n", 122]] }
```

- `pc` is "the formal program counter", the address of the instruction. `prefetch` is the two-word prefetch queue, the first item fetched first.
- **The opcode and first extension word exist only in `prefetch`. They are not in `ram`.** This held for every sampled test. An emulator without a prefetch queue must write `prefetch[0]` and `prefetch[1]` to `pc` and `pc+2` before stepping, as moa does.
- `ram` holds `[address, byte]` pairs. `final.ram` lists the relevant memory after execution.
- `length` is the total cycle count, assuming an immediate DTACK.
- A transaction is either `["n", cycles]` (idle) or `[kind, cycles, fc, address, ".w"|".b", value]`:
    - `kind` is `r`, `w` or `t` (the TAS read-modify-write).
    - `fc` is FC2..FC0.
    - For byte accesses, UDS/LDS is inferred from address bit 0, and the value is 0–255.
- There are no LINE-A, LINE-F, ILLEGAL or STOP files. MOVE from CCR is absent ([680x0#3](https://github.com/SingleStepTests/680x0/issues/3)), which is correct because it is a 68010+ instruction.

### 1.3 raddad772 m68000 binary format (from [decode.py](https://github.com/SingleStepTests/m68000/blob/main/decode.py)), reimplemented here and checked

Everything is little-endian.

- **File:** `u32 magic 0x1A3F5D71`, `u32 count`.
- **Test:** `u32 size, u32 magic 0xABC12367`, then the name, then the initial and final states, then the transactions.
- **Name:** `u32 size, u32 0x89ABCDEF`, `u32 len`, then `len` bytes of UTF-8.
- **State:** `u32 size, u32 0x01234567`, then 19 × `u32` in the order d0–d7, a0–a6, usp, ssp, sr, pc. Then `u32 pf0, u32 pf1`, then `u32 n` followed by n × (`u32 addr`, `u16 word`). **RAM is stored as 16-bit words.**
- **Transactions:** `u32 size, u32 0x456789AB`, `u32 total_cycles`, `u32 n`. Each record is `u8 kind, u32 cycles`. Unless `kind` is 0 (idle), five `u32` follow: fc, addr, data, UDS, LDS. `kind` values: 1=w, 2=r, 3=TAS, **4=`re`, 5=`we`**. The last two are read/write address-error cycles, where AS is not asserted.

Differences from the Harte format (README):

- **`pc` is MAME's `m_au`, "next prefetch address", which is the execution PC + 4.**
- RAM includes the instruction words at `pc-4`.
- The data bus is recorded as on the real pins (a UDS-only byte read of `0xAB` is recorded as `0xAB00`), and UDS/LDS are recorded.
- The `re`/`we` kinds mark address errors.
- The upstream Python decoder turns `.json.bin` into Harte-shaped JSON. A Rust runner should parse the binary directly; m68k-rs and my scratch parser both do.

### 1.4 Errata and caveats

**Harte 680x0 set.** I verified these with independent reference implementations:

| Issue                                                                                                                                                                                                     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ASR.b/.w/.l: X and C are wrong whenever the shift count is at or above the operand size.** The data clears them. They should be the sign bit.                                                           | Measured here: **1,642** ASR.b, **1,063** ASR.w and **1,031** ASR.l register-form tests disagree with the documented semantics. Every mismatch has count ≥ size. LSR.b, ROXR.b, ASL.w and ASL.l are clean. Real hardware agrees with the semantics: [transistorfet/68k-test-runner](https://github.com/transistorfet/68k-test-runner) ran ASR.b on a 68000 board and got exactly 1,642 mismatches. Reported in [ProcessorTests#21](https://github.com/TomHarte/ProcessorTests/issues/21) (open). The shift-flag fix [#19](https://github.com/TomHarte/ProcessorTests/issues/19)/[#20](https://github.com/TomHarte/ProcessorTests/pull/20) in 2022 did not cover this. |
| **ASL.b tests `e502 … 1583` and `… 1761`** have corrupted D2: the upper bytes change.                                                                                                                     | Measured here (the only 2 bad ASL.b tests). Reported in [680x0#4](https://github.com/SingleStepTests/680x0/issues/4) and [ProcessorTests#21](https://github.com/TomHarte/ProcessorTests/issues/21).                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **DIVU overflow leaves N and Z unchanged.** The MAME suite instead gives **N=1, Z=0, C=0, V=1** (DIVU and DIVS).                                                                                          | Measured here. In Harte's DIVU, all 2,466 overflow cases keep the initial N/Z. In MAME's DIVU (791) and DIVS (1,162), every overflow case has N=1, Z=0. Musashi also leaves N/Z alone. Hardware truth is microcode-level, so prefer MAME.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ABCD/SBCD/NBCD "undefined" N and V                                                                                                                                                                        | **Both suites agree**: N = bit 7 of the result, and V = `~uncorrected & corrected & 0x80`. Measured on ABCD Dy,Dx in both. This is the hardware behaviour in [Bart Trzynadlowski's 68knotes.txt](https://retroisle.com/general/68knotes.txt). So masking these flags is optional: implement the formula and they pass.                                                                                                                                                                                                                                                                                                                                                |
| Address-error side effects and frames come from an emulator. For example, CMPM `(Ay)+` is incremented before the fault ([ProcessorTests#27](https://github.com/TomHarte/ProcessorTests/issues/27), open). | Galibert explains the true microcode order in that thread and points to [MAME m68000-sdf.cpp](https://github.com/mamedev/mame/tree/master/src/devices/cpu/m68000) and [fx68k](https://github.com/ijor/fx68k).                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| A large share of tests are address errors                                                                                                                                                                 | Random odd displacements and absolute addresses mean, for example, **3,105 of 8,065 DIVU tests** take an exception (almost all vector 3). The Harte format has no `re`/`we` marker. Detect them by a vector-3 fetch (a read at `0x00C` with FC=5) or, as moa does, by an SSP drop of 10 or more bytes.                                                                                                                                                                                                                                                                                                                                                                |
| Coverage gaps                                                                                                                                                                                             | No divide-by-zero and no zero quotient ([ProcessorTests#67](https://github.com/TomHarte/ProcessorTests/issues/67)). Almost no user mode. No trace, interrupts or STOP.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

**raddad772 m68000 set.**

- **TAS and TRAPV are not verified.** TAS lacks the special 5-cycle read-modify-write timing (README).
- **T bit set in about 50% of initial states,** but the final state is captured _before_ the trace exception. Either suppress trace in the runner (as snow does with `trace_mask`) or strip T from both states ([#2](https://github.com/SingleStepTests/m68000/issues/2)).
- **MOVE.b and MOVEP final RAM lists bytes that were never written,** as zeros ([#1](https://github.com/SingleStepTests/m68000/issues/1)). Treating unlisted memory as 0 makes these tests pass.
- **No divide-by-zero tests,** and no DIVU boundary case where dividend = divisor << 16 ([#3](https://github.com/SingleStepTests/m68000/issues/3)).
- **DBcc's counter-expired path (14 cycles) is never exercised.** In DBcc, 0 of 2,500 tests expire, measured here.
- `61ff` (`BSR` with displacement byte `$FF`) is a byte displacement of −1 on a 68000, not a long branch ([#4](https://github.com/SingleStepTests/m68000/issues/4)).
- Address errors are about 38% of DIVU/DIVS: 954 and 982 of 2,500 have `re`/`we` cycles.
- The README warns "Any bugs that exist in MAME's microcoded M68000 emulator will exist here too".

### 1.5 How other emulators consume them, and what they relax

**[m68k-rs](https://github.com/benletchford/m68k-rs)** (`m68k` crate, MIT, Rust, 68000–68060). It uses the MAME set as a git submodule `tests/fixtures/m68000`. The runner is [tests/singlestep_m68000_v1_tests.rs](https://github.com/benletchford/m68k-rs/blob/main/tests/singlestep_m68000_v1_tests.rs).

- The fixtures are not vendored. Each test skips itself when they are absent, `M68K_SST_FIXTURES` points CI at a clone, and CI fetches them.
- Relaxations:
    1. **Skips every test with `re`/`we` cycles** ("m68k is not bus/prefetch-accurate").
    2. Masks N and V for ABCD/SBCD/NBCD.
    3. **The PC check is opt-in** (`M68K_SST_STRICT_PC=1`, comparing `exec_pc + 4` to `m_au`).
- It **enforces cycle counts** on every non-address-error test, with `M68K_SST_AUDIT_CYCLES=1` as a report-only mode, and has a `#[ignore]` `cycle_gap_report`.
- It also runs Musashi's test binaries.
- Its docs claim all fixture cases match the clock counts, and that this is "tighter than Musashi, which charges ADD.L Dn,Dn at 6 cycles" instead of 8 ([docs.rs](https://docs.rs/crate/m68k/0.2.5)). Musashi's table does list 6 for `add 32 er d` on the 68000 (checked in `m68k_in.c`).

**[snow](https://github.com/twvd/snow)** (MIT, Rust Macintosh emulator). It uses the MAME set as a submodule converted with `decode.py` ([building.md](https://github.com/twvd/snow/blob/master/docs/src/getting_started/building.md)). The runner is [core/src/cpu_m68k/tests/singlestep.rs](https://github.com/twvd/snow/blob/master/core/src/cpu_m68k/tests/singlestep.rs).

- It sets `trace_mask` and masks SR with `0xA71F`.
- It compares the prefetch queue, registers (unless an exception was taken), RAM (except the 14 bytes of exception frame at SSP when an exception was taken, plus one div-by-zero frame quirk), cycles, and bus transactions best-effort.
- It has per-file test levels (state only, state + cycles, or all).

**[moa](https://github.com/transistorfet/moa)** (GPL-3.0, Rust). It uses the Harte set via [tests/m68k-test-runner](https://github.com/transistorfet/moa/tree/main/tests/m68k-test-runner).

- It writes the prefetch words into memory at `pc`/`pc+2`.
- It classifies exception tests by SSP drop (≥6 bytes: exception; ≥10: group-0 frame) and offers `--exceptions exclude|only`.
- Timing is off by default (`-t`).
- Its 2023-06 progress log: "passed: 817042, failed: 12381, total 99%" with address errors excluded.

**[Moira](https://github.com/dirkwhoffmann/Moira)** (MIT core). Its repository validates against Toni Wilen's **cputester** (from WinUAE; tests generated in emulation and checked on real Amiga hardware, shipped as ADF/HDF images in `Cputester/`) and against a Musashi differential `Runner/` (with GNU binutils for the disassembler). I found no SingleStepTests runner in its tree.

**[Musashi](https://github.com/kstenerud/Musashi)** (MIT). It ships **60 self-checking 68000 test programs** (`test/mc68000/*.s` plus prebuilt `.bin`). They are linked at `0x10000` and signal results by writing to `TEST_FAIL_REG 0x100000` or `TEST_PASS_REG 0x100004`. Each accumulates data and flag checksums and compares them against constants (for example `cmpi.l #0x23ED428F,%d4`). They are cheap integration tests for s68k given a tiny memory-mapped I/O hook, and MIT allows vendoring.

### 1.6 A Rust runner for s68k

This is practical. s68k already builds as an `rlib`, `cargo test` runs natively, and `serde_json` is already a dev-dependency.

- **Parsing:** read the MAME `.json.bin` directly; no new dependencies are needed. Reading the Harte `.json.gz` would add `flate2`.
- **Opt-in full run:** `#[test] #[ignore]` tests (one per file, or one that walks a directory) that read `S68K_SST_DIR` and skip with a message when it is unset. Fetch with a script rather than from inside `cargo test`, because network access in tests is flaky, sandbox-hostile and would need an HTTP crate. Two options:
    - `git clone --depth 1 https://github.com/SingleStepTests/m68000` (repository about 110 MB), or
    - curl the 127 files (138 MB).

    Run with `cargo test --release -- --ignored`.

- **Vendored subset for the default run:** at about 434 bytes per test (measured average), 50 non-address-error tests per file is about 6,350 tests, roughly 2.8 MB raw or 1 MB gzipped. 100 per file is about 5.5 MB raw or 2 MB gzipped. Vendor this from the MAME set only (MIT, with notice). **Do not vendor Harte data**, which has no licence.
- **Semantics for an instruction-granular core:**
    - Use a 24-bit address mask and memory that defaults to zero.
    - Load SR, USP and SSP. Set the execution PC to `pc − 4` (MAME) or to `pc` (Harte, after writing the prefetch words to memory).
    - Suppress trace, step one instruction, then compare D0–D7, A0–A6, USP, SSP, SR and RAM. The PC check (`final.pc − 4`) works for normal flow.
    - Compare `length` with s68k's cycle counter for tests without address errors.
    - For address-error tests, either skip them or assert only "vector 3 taken, final PC = handler". The group-0 frame's PC and IR values depend on prefetch timing, and everyone relaxes this.
    - Ignore the `prefetch` field otherwise. Self-modifying writes into the next two words are the only case where a prefetch queue matters, and that is rare with random addresses.
- **Cases to write by hand, because neither suite covers them:**
    - Divide by zero: vector 5, the frame, and 38+EA cycles.
    - A zero quotient (Z flag), and DIVU at dividend = divisor << 16.
    - DBcc expiry (14 cycles).
    - Trace exceptions.
    - Interrupts: IPL mask, 44 cycles, autovectors.
    - STOP waking on an interrupt.
    - RESET.
    - TAS timing, because the MAME set's TAS is wrong.

---

## 2. Instruction timing references

### 2.1 M68000UM Section 8: the primary documentation

[M68000 8-/16-/32-Bit Microprocessors User's Manual](https://cdn.hackaday.io/files/1805367724052224/M68000UM_AD_M68000_Microprocessor_Users_Manual_Rev8_1993.pdf) (Motorola/Freescale, Rev 8/9, 1993; this is a community mirror, and nxp.com returned 404 to scripted fetches). Section 7 covers the 8-bit bus (68008), Section 8 the 16-bit bus (68000/68HC000/68EC000), and Section 9 the MC68010.

Section 8 subsections:

| Subsection | Contents                                                                                                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8.1        | Operand effective-address calculation times (Table 8-1: Dn/An 0; (An) 4/8; (An)+ 4/8; −(An) 6/10; (d16,An) 8/12; (d8,An,Xn) 10/14; (xxx).W 8/12; (xxx).L 12/16; PC-relative as for An; #imm 4/8, as byte-word/long) |
| 8.2        | MOVE                                                                                                                                                                                                                |
| 8.3        | Standard instructions, with the "+2 when ⟨ea⟩ is Dn/An/#imm" footnotes for .L ALU ops                                                                                                                               |
| 8.4        | Immediate instructions                                                                                                                                                                                              |
| 8.5        | Single-operand instructions                                                                                                                                                                                         |
| 8.6        | Shift/rotate                                                                                                                                                                                                        |
| 8.7        | Bit manipulation                                                                                                                                                                                                    |
| 8.8        | Conditional instructions (Bcc, DBcc, Scc)                                                                                                                                                                           |
| 8.9        | JMP, JSR, LEA, PEA, MOVEM                                                                                                                                                                                           |
| 8.10       | Multiprecision instructions                                                                                                                                                                                         |
| 8.11       | Miscellaneous instructions                                                                                                                                                                                          |
| 8.12       | MOVEP                                                                                                                                                                                                               |
| 8.13       | Exception processing                                                                                                                                                                                                |

Every entry is `n(r/w)` and assumes 4-clock bus cycles. The manual's DIVU (<140) and DIVS (<158) are maxima, and its "less than 10% variation" claim is wrong (§2.4).

### 2.2 Yacht ("Yet Another Cycle Hunting Table")

A corrected and extended reading of UM Section 8 by "danorf", derived from Motorola's microcode patent US 4,325,121, the MC68000/AC reference card, real-hardware checks and contributor reports (ijor, TomH, flamewing, byuu, Nemesis).

- **Content:** for every instruction and addressing mode it gives the total time, the read/write counts, and the **bus-usage order** (for example `np nr nw`). It also includes flowcharts for the DIVU/DIVS/MULU/MULS loops and exact exception sequences.
- **Versions:** v1.1 is widely mirrored, for example [larsbrinkhoff/m68k-microcode/doc/Yacht.txt](https://github.com/larsbrinkhoff/m68k-microcode/blob/master/doc/Yacht.txt). **v1.2** is in [danorf69/YACHT](https://github.com/danorf69/YACHT) (2026-03). It fixes the TAS (xxx).W/.L and ADD/SUB.L Dn,⟨ea⟩ rows and two typos.
- **Licence:** that repository is **GPL-3.0**. Cycle counts are facts, so using Yacht as a reference to derive tables is fine. Copying the document's text or tables verbatim into the MIT s68k repository is not.
- **UM errata Yacht documents:**
    - ADDQ.W #,An is **8**, not 4.
    - ANDI.L #,Dn is **16**, not 14.
    - TAS on memory is **10+EA**, not 14.
    - The read counts for JMP (d8,An,Xn) and RTR are wrong. The totals are right.
    - The exception table was corrected per ijor.

### 2.3 Musashi's tables

[Musashi](https://github.com/kstenerud/Musashi), MIT ("Copyright 1998-2002 Karl Stenerud", in `readme.txt` and the `m68kdasm.c` header; GitHub detects no licence). `m68k_in.c` has a per-opcode table with base cycles for 000/010/EC020/020/040, and `m68kmake` adds effective-address cycles. Special cases are runtime variables:

- `CYC_BCC_NOTAKE_B/W`, `CYC_DBCC_F_NOEXP/EXP` and `CYC_SCC_R_TRUE`
- `CYC_SHIFT` (2 per count) and `CYC_MOVEM_W/L` (per register)
- `m68ki_exception_cycle_table`

Known gaps:

- **DIVU and DIVS are fixed at 140 and 158**, the manual's maxima.
- MULU/MULS on the 68000/010 _are_ data-dependent (`38 + 2·ones` in `mulu`).
- ADD.L Dn,Dn is 6, not 8.
- It is not bus-accurate.

It is convenient MIT code, but treat it as approximate.

### 2.4 Other references

- **[Moira](https://github.com/dirkwhoffmann/Moira)** (Dirk Hoffmann; core is MIT). It claims "high emulation accuracy, both functionally and temporally… precise cycle counts but also that memory accesses occur at the correct DMA cycles". It is the CPU of vAmiga and is verified with cputester. Timing lives in templated C++ code, not in a table.
- **MAME m68000** (BSD-3-Clause, Olivier Galibert). It is generated from the decapped microcode (`m68000-sdf.cpp`), and is the ground truth behind the MAME test suite.
- **[fx68k](https://github.com/ijor/fx68k)** (GPL-3.0, Jorge Cwik). A cycle-exact SystemVerilog core.
- **[Clock Signal](https://github.com/TomHarte/CLK)** (MIT). Bus-accurate. Generated the Harte suite.
- **Jorge Cwik's division timing** (2005, **GPL-2.0-or-later**, [copy](https://github.com/ggnkua/Atari_ST_Sources/blob/master/C/div68kCycleAccurate.c); also used in WinUAE, Hatari and Genesis Plus GX):
    - DIVU: overflow 10; otherwise 76–136.
    - DIVS: absolute overflow 16/18; otherwise 120–156.
    - The algorithm is two short loops. **Reimplement it from Yacht's flowchart rather than copying the GPL code** into the MIT crate. My Python port matched every register-form case: MAME DIVU 371/371, MAME DIVS 372/372, Harte DIVU 1,149/1,149.
- **[68knotes.txt](https://retroisle.com/general/68knotes.txt)** (Bart Trzynadlowski, 2001). Hardware-tested undocumented flags (BCD N/V, CHK, etc.).

### 2.5 The practical source and the special cases (verified against the MAME suite)

For an instruction-granular emulator, keep a **data table derived from UM Section 8 and corrected by Yacht**: base cycles per (instruction, size) plus the EA time from Table 8-1. Compute the data-dependent extras below in code. Then let the MAME suite's `length` check every number; m68k-rs shows exact agreement is achievable.

| Case                       | Rule                                                                                                                                                                      | Verified here (MAME, no address errors)                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| MULU                       | 38 + 2n + EA, where n = number of 1 bits in the 16-bit source                                                                                                             | 351/351 Dn forms                                                                                                                       |
| MULS                       | 38 + 2n + EA, where n = number of 01/10 transitions in (src << 1)                                                                                                         | 407/407                                                                                                                                |
| DIVU                       | Overflow 10. Otherwise Cwik/Yacht loop (76–136) + EA. Divide by zero is an exception at 38+EA.                                                                            | 371/371                                                                                                                                |
| DIVS                       | Absolute overflow 16 (dividend ≥ 0) or 18 (< 0). Otherwise loop (120–156) + EA.                                                                                           | 372/372                                                                                                                                |
| Shift/rotate, register     | .b/.w 6+2m; .l 8+2m (m = count, register count mod 64)                                                                                                                    | ASL.l 2,500/2,500                                                                                                                      |
| Shift/rotate, memory       | 8 + EA (always 1 bit)                                                                                                                                                     | from the tables                                                                                                                        |
| MOVEM (Yacht)              | M→R: .w 12+4m, .l 12+8m for (An)/(An)+; 16 for (d16,An), 18 for (d8,An,Xn), 16 for .W, 20 for .L. M→R does one extra word read. R→M: 8+4m / 8+8m, with 12/14/12/16 bases. | MOVEM.l 1,304/1,304                                                                                                                    |
| Bcc                        | Taken 10. Not taken: .s 8, .w 12. BRA 10, BSR 18.                                                                                                                         | consistent                                                                                                                             |
| DBcc                       | cc true 12. Branch taken 10. **Counter expired 14** (never exercised by the suite).                                                                                       | 12 and 10 seen                                                                                                                         |
| Scc                        | Dn: false 4, true 6. Memory 8+EA.                                                                                                                                         | —                                                                                                                                      |
| CHK                        | No trap: 10+EA. **Trap: 38 on the upper-bound path** (Dn > bound, or a negative Dn whose Dn−bound overflows); **40 on the negative path.** UM says 40 for all.            | 38 and 40 split as described ([m68k-rs test](https://github.com/benletchford/m68k-rs/blob/main/tests/cycle_timing_chk_68000_tests.rs)) |
| Exceptions (Yacht/UM 8.13) | Address and bus error 50. Interrupt 44. Illegal, privilege, trace, LINE-A/F, TRAP and TRAPV 34. CHK 40+EA. Divide by zero 38+EA. Reset 40. RESET instruction 132.         | TRAP 2,500/2,500 at 34                                                                                                                 |

Yacht's notes also give the order in which exceptions push the frame: PC low word first, then SR, then PC high word.

---

## 3. Cross-checking the encoder/decoder, and loading binaries

### 3.1 Local availability (checked)

- `which m68k-linux-gnu-as m68k-linux-gnu-objdump m68k-elf-as vasmm68k_mot` finds nothing.
- `apt-cache policy binutils-m68k-linux-gnu`: **not installed**. Candidate `2.46-3ubuntu2` (resolute/universe, about 5.5 MB installed).
- `gcc-m68k-linux-gnu` 15.2.0 is also available.
- Neither was installed. Without root, `apt-get download` plus `dpkg -x` into a scratch directory would also work.

### 3.2 GNU as with Motorola syntax

Sources: the [M68K options](https://sourceware.org/binutils/docs/as/M68K_002dOpts.html), [Motorola syntax](https://sourceware.org/binutils/docs/as/M68K_002dMoto_002dSyntax.html) and [`--mri`](https://sourceware.org/binutils/docs/as/M.html) pages, and `gas/config/tc-m68k.c`.

**What works:**

- Motorola operand syntax is accepted natively and can be mixed with MIT syntax in the same instruction: `(d16,An)`, `(d8,An,Xn.W)`, `-(An)`, `(An)+`, `#imm`, and `move.l`-style size suffixes.
- `-m68000` (or `-march=68000`) restricts the instruction set. The default is otherwise the 68020.
- `--register-prefix-optional` drops the `%` in front of registers.
- `-M`/`--mri` switches it on automatically (`m68k_mri_mode_change` sets `flag_reg_prefix_optional = 1`). It also accepts MRI pseudo-ops: DC, DS, EQU, SET, XDEF, `*` comment lines, labels without colons, and `$` hex constants.
- `--bitwise-or` makes `|` an operator instead of the comment character.

**What breaks EASy68K sources:**

- `;` is gas's **statement separator** (`line_separator_chars = ";"`). EASy68K uses it for end-of-line comments.
- **`ORG` and `END start` are unsupported** in MRI mode for ELF: "ORG… not supported", and the start address must come from `ld -e`.
- `SIMHALT`, structured `IF`/`ENDI`, and EASy68K's macro and `OPT` dialect are not understood.

**Implicit instruction selection differs:**

- gas's opcode table lists the quick and immediate forms first: `add.l #1,d0` becomes ADDQ, `add.l #$100,d0` becomes ADDI, `move.l #5,d0` becomes MOVEQ, and `cmp.l (a0)+,(a1)+` becomes CMPM.
- Branches are relaxed automatically.
- Absolute addresses default to `.L`.

**Recipe:**

1. Generate one canonical instruction per line from s68k's own form table (the latest s68k commit exports each instruction's forms with modes, sizes and privilege). Use explicit mnemonics (`addq`/`addi`/`moveq`/`movea`/`cmpm`), explicit branch sizes (`bra.s`/`bra.w`), and explicit `.w`/`.l` on absolute addresses.
2. Assemble with `m68k-linux-gnu-as -m68000 --register-prefix-optional -o x.o`.
3. Read the bytes with `objcopy -O binary -j .text`.
4. Compare those bytes with s68k's encoder.

For the decoder direction, use `m68k-linux-gnu-objdump -D -b binary -m m68k:68000`. Its output is MIT-style (`movel %d0,%a0@+`), so you need a normaliser. Moira's disassembler has `GNU`/`GNU_MIT` styles that exist precisely to mimic it ([HowToUseTheDisassembler.md](https://github.com/dirkwhoffmann/Moira/blob/master/Documentation/HowTo/HowToUseTheDisassembler.md)).

### 3.3 Alternatives

- **vasm** (Volker Barthelmann and Frank Wille). Its `mot` syntax is Devpac-like and the closest free assembler to EASy68K. It outputs raw binary, `-Fsrec` and `-Felf`. **Licence:** "may be redistributed without modifications and used for non-commercial purposes"; commercial use only for M68k + AmigaOS targets; "in all other cases you need my written consent" ([licence text](https://github.com/haikuports/haikuports/blob/master/dev-lang/vasm/licenses/vasm)). It is fine as a local developer tool, but don't vendor or redistribute it.
- **Musashi `m68kdasm.c`** (MIT). It prints Motorola-style output (`move.l  D0, (A0)+`, `$` hex). `m68k_is_valid_instruction(op, M68K_CPU_TYPE_68000)` gives a legality table for all 65,536 words. Build it in a tiny C harness that dumps golden text, or through `cc` as a dev build dependency.
- **`map/68000.official.json`** (§1.1) is a second legality oracle (45,815 legal words), unlicensed and for local use only.
- **Rust crates:**
    - [`m68k`](https://crates.io/crates/m68k) 0.14.6 (MIT, benletchford; has `dasm/`; fast-moving).
    - [`m68000`](https://crates.io/crates/m68000) 0.2.3 (**MPL-2.0**, Stovent; interpreter + disassembler + assembler/code emitter + a user-mode "handle TRAP in Rust" design; **needs nightly**).
    - [`r68k`](https://crates.io/crates/r68k) 0.2.2 (MIT, a Musashi port).
    - [corytodd/m68kdecode](https://github.com/corytodd/m68kdecode) (MIT, a Rust 680x0 decoder; the original deplinenoise repository is gone).

    As a dev-dependency oracle, `m68k` (MIT) is the safest pick. Cross-checking against several independent decoders is more useful than adopting one.

### 3.4 File formats for "load an M68K binary"

**S-record (`.S68`, `.S28`, `.S37`, `.srec`, `.mot`).** This is what EASy68K emits ([Edit68K `OBJECT.CPP`](https://github.com/fduhia/Easy68k/blob/master/Edit68Kv5.12.28/OBJECT.CPP)):

- An `S0` header `68KPROG 20CREATED BY EASY68K` (version 2, revision 0).
- Since v4.8.10, **extra `S0` records describing a memory map** (ROM, READ, PROTECTED and INVALID ranges, as `start,end`) for the simulator's hardware window.
- Data in **S1, S2 or S3 chosen per record** by address width, so they mix within one file.
- An **`S8`** (24-bit) start address.

`m68k-elf-objcopy -O srec` produces S0/S1–S3/S7–S9. The loader should accept every record type, verify checksums, and take S7/S8/S9 as the entry. It may want to honour EASy68K's map records. The [`srec`](https://crates.io/crates/srec) crate (MIT, 0.2.0, last released 2020) works, but a parser is about 100 lines and gives control over the nonstandard S0 records.

**Raw binary.** There is no metadata, so it needs a user-chosen load address and entry. Musashi's tests use `0x10000`. A sensible option is "image at 0, reset vectors at 0/4 give SSP/PC", which is the ROM convention of Genesis cartridges and Musashi's harness.

**ELF32 big-endian, `EM_68K` (4), ET_EXEC.**

- Load PT_LOAD segments, take the entry from `e_entry`, and read labels from `.symtab`.
- The [`object`](https://crates.io/crates/object) crate (Apache-2.0 OR MIT) maps `EM_68K` to `Architecture::M68k`. `goblin` and `elf` work too.
- Check `e_flags`: `EF_M68K_M68000 = 0x01000000`, `EF_M68K_CPU32 = 0x00810000`, `EF_M68K_FIDO = 0x02000000`, plus the ColdFire ISA bits ([include/elf/m68k.h](https://sourceware.org/git/?p=binutils-gdb.git;a=blob;f=include/elf/m68k.h)). **Warn when `EF_M68K_M68000` is absent**, because the file may contain 68020 instructions.
- Toolchain caveat: `m68k-linux-gnu-gcc` defaults to 68020+FPU. Debian's m68k port targets 68020+, so its libc and libgcc objects should be assumed to be 68020 code. For a 68000 target use `-m68000 -msoft-float -ffreestanding -nostdlib -static` with your own runtime, or a bare-metal `m68k-elf` toolchain built with 68000 multilibs.
- Skip ET_REL (`.o`), which needs relocation, plus Amiga hunk and Atari TOS `.PRG` (0x601A + relocation table), unless there is demand.

---

## 4. Ghidra and the Pseudocode view

### 4.1 What Ghidra ships

[Ghidra/Processors/68000/data/languages at `Ghidra_12.1.4_build`](https://github.com/NationalSecurityAgency/ghidra/tree/Ghidra_12.1.4_build/Ghidra/Processors/68000/data/languages), the tag the decompiler package vendors, contains:

- `68000.sinc` (164 KB, the whole description).
- `68020.slaspec`, which only includes it.
- `68030.slaspec`, `68040.slaspec`, `CPU32.slaspec` and `coldfire.slaspec`, which add `@define`s.
- `68000.pspec`, `68000.cspec`, `68000_register.cspec`, `68000.ldefs`, `68000.opinion` and `68000.dwarf`.

The language IDs in `68000.ldefs` are:

| Language ID            | Notes                                                  |
| ---------------------- | ------------------------------------------------------ |
| `68000:BE:32:default`  | Described as "Motorola 32-bit 68040"; uses `68040.sla` |
| `68000:BE:32:MC68030`  |                                                        |
| `68000:BE:32:MC68020`  |                                                        |
| `68000:BE:32:Coldfire` | Also has a `register` compiler spec                    |
| `68000:BE:32:CPU32`    |                                                        |

**There is no plain MC68000 variant.** The 68020 language decodes a superset, which is fine for valid 68000 code.

- The only edge is that 68020 honours extension-word scale bits and full-format extensions that a 68000 ignores. Compilers targeting the 68000 don't emit them.
- CPU32 is the smallest description, with no FPU or bitfield instructions.
- The default `cspec` is a stack-argument `__stdcall`: arguments at `stack+4`, return in D0 (D0:D1 for 8 bytes, FP0 for floats); D2–D7 and A2–A6 preserved; D0/D1/A0/A1 clobbered. This matches m68k gcc.

### 4.2 Compiled size (measured)

I compiled the downloaded upstream files with the package's existing `build/sleigh/sleigh`. It was run read-only, and the outputs were kept outside the repository.

| Spec                                 | Size                                                            |
| ------------------------------------ | --------------------------------------------------------------- |
| `68020.sla`                          | **67,689 bytes** (compressed `sla\x04` format; 502 KB inflated) |
| `68040.sla`                          | 71,639 bytes                                                    |
| `CPU32.sla`                          | 50,378 bytes                                                    |
| Bundled `x86-64.sla`, for comparison | 501,178 bytes                                                   |

Each compile takes about 0.07 s and exits 0 with only warnings (NOP constructors, unreferenced tables). The SLEIGH translator's runtime memory should also be far below x86-64's "about 17 MB" from the package README.

### 4.3 The decompiler package (read-only look)

`/home/dev/code/asm-editor/packages/decompiler` exists. It is `@specy/decompiler` (decompiler-js, Ghidra 12.1.4 decompiler compiled to wasm, Apache-2.0) at `c20651e Release v1.0.0`.

- **It bundles one architecture:** `specs/x86-64/{x86-64.sla, x86-64.pspec, x86-64-gcc.cspec, x86.ldefs}`. The vendored `ghidra/processors/` contains only `x86/languages` (30 files).
- `scripts/compile_specs.sh` has an `architectures=(…)` array of `name languages-dir slaspec spec-files…`.
- `js/src/index.ts` has `type Architecture = 'x86-64'` and a table entry with `language: 'x86:LE:64:default:gcc'` and its four file URLs.

Adding M68K therefore means:

1. Vendor `Ghidra/Processors/68000/data/languages/{68000.sinc, 68020.slaspec, 68000.pspec, 68000.cspec, 68000.ldefs}`.
2. Add `'m68k ghidra/processors/68000/languages 68020.slaspec 68000.pspec 68000.cspec 68000.ldefs'` to the script.
3. Add `'m68k': { language: '68000:BE:32:MC68020:default', … }`.
4. Audit the host for 64-bit or little-endian assumptions: pointer-slot size, and "addresses below 2^53".
5. Ship the glibc prototypes only where they make sense.

### 4.4 Caveats for decompiling EASy68K-style programs

- `trap #n` lifts to `__m68k_trap(n)` (`68000.sinc` line 2333: `{ vector:1 = op03; __m68k_trap(vector); }`). The CALLOTHER has **no register inputs**, so the decompiler treats the D0/D1/A1 set-up before `trap #15` as dead and can drop it. The output would lose the task number and arguments. Two ways to fix it:
    - A `callotherfixup` injection in a custom cspec/pspec that declares the D0/D1/D2/A1 reads (and D1/D2 results), or
    - Rewriting `trap #15` as a call to a named function with a register-parameter prototype.
- Hand-written assembly has no calling convention. Expect `in_D0`/`unaff_A1` noise unless functions get custom prototypes or the register `cspec`.
- The `68000.cspec` alignment map gives 4-byte objects 4-byte alignment. m68k SysV gcc aligns `int` and pointers to 2 bytes, which only matters for struct layout of compiled C.

---

## 5. Licence summary

| Resource                                                           | Licence                                    | Use in the MIT s68k repository                 |
| ------------------------------------------------------------------ | ------------------------------------------ | ---------------------------------------------- |
| SingleStepTests/m68000 (MAME-generated tests)                      | MIT                                        | Vendor a subset with notice; download the rest |
| SingleStepTests/680x0, ProcessorTests (Harte), 68000.official.json | **none**                                   | Download at test time only; don't vendor       |
| Musashi (code, dasm, test binaries)                                | MIT                                        | Reuse with notice                              |
| Moira core                                                         | MIT                                        | Reuse with notice                              |
| Clock Signal                                                       | MIT                                        | Reuse with notice                              |
| MAME m68000                                                        | BSD-3-Clause                               | Reuse with notice                              |
| m68k-rs (`m68k` crate)                                             | MIT                                        | Fine as a dependency or reference              |
| `m68000` crate                                                     | MPL-2.0                                    | File-level copyleft                            |
| moa                                                                | GPL-3.0                                    | Reference only                                 |
| fx68k                                                              | GPL-3.0                                    | Reference only                                 |
| Cwik division code                                                 | GPL-2.0+                                   | Reimplement from the description               |
| Yacht v1.2                                                         | GPL-3.0 (repository)                       | Facts only, no verbatim tables                 |
| vasm                                                               | Non-commercial, no modified redistribution | Local tool only                                |
| GNU binutils                                                       | GPL-3.0                                    | Fine as an external test tool                  |
| Ghidra 68000 processor files                                       | Apache-2.0                                 | Same as the existing x86 specs                 |

## 6. How the measurements were made

The sample fixtures of both suites, the check scripts (an independent parser for the MAME `.json.bin` format, and checks of shift flags, division flags and timing, BCD flags, the timing formulas, MOVEM and CHK) and the compiled Ghidra `.sla` files lived in a session scratch directory and were not kept. Each "measured here" result can be reproduced from the linked sources with the method its row describes.
