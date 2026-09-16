# Register files

## Scope

Decided on 2026-09-14 in a design interview. Every **Emulator** exposes one or more **Register files** ([CONTEXT.md](../../CONTEXT.md)): a named, ordered set of registers that share a width and a way of reading their values, read from the **Core** as one unit, optionally with a row of **Status flags** of its own. The general registers every Emulator already shows are the first file; this feature adds the files the Cores hold and the editor never showed.

| Language          | Register files in the first version                                                                                                                                                                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MIPS              | CPU; FPU (`$f0..$f31`, with the eight condition flags `0..7` as its Status flags); CP0 (`$8 (vaddr)`, `$12 (status)`, `$13 (cause)`, `$14 (epc)`)                                                                                                                                                                |
| RISC-V, RISC-V-64 | CPU; FPU (`ft0..ft7`, `fs0`, `fs1`, `fa0..fa7`, `fs2..fs11`, `ft8..ft11`, which is register-number order `f0..f31`); CSR (the seventeen RARS holds: `ustatus`, `fflags`, `frm`, `fcsr`, `uie`, `utvec`, `uscratch`, `uepc`, `ucause`, `utval`, `uip`, `cycle`, `time`, `instret`, `cycleh`, `timeh`, `instreth`) |
| x86               | CPU; SSE (`xmm0..xmm15`, `mxcsr`); x87 (`st0..st7`, `fctrl`, `fstat`, `ftag`)                                                                                                                                                                                                                                    |
| M68K              | CPU only                                                                                                                                                                                                                                                                                                         |
| Z80               | CPU only                                                                                                                                                                                                                                                                                                         |

The rule behind the list: the first version shows what the reference tool's register window shows, in the spirit of [ADR 0003](../adr/0003-preserve-simulator-graphics-conventions.md). MARS has Registers, Coproc 1 and Coproc 0 tabs; RARS has Registers, Floating Point and Control and Status; gdb's `info registers` and `info float` are the x86 reference. Register names are spelled as those tools spell them.

Left out deliberately, both reachable without a Core change should they ever be wanted: the M68K SR (s68k stores its high byte but it is inert, and the low byte is the CCR the Status flags row already shows) and the Z80's I, R, IFF1, IFF2 and IM (they matter only to interrupt-driven code, which the environment does not run under [ADR 0008](../adr/0008-poll-keyboard-and-mouse-input.md), and R changes on every instruction, so its highlight would be permanent noise).

The program counter and the CPU's Status flags stay outside the model, where they are today.

## Agreed architecture

- [Assemble Register files in the editor from architecture-specific Core exports](../adr/0021-register-files-from-core-exports.md): each Core exposes the state it holds, in its own words, as flat arrays in a fixed order, with setters beside the getters; the language adapter names the values and builds the files. No Core gains a generic register-file call.
- The panel shows one file at a time behind tabs, and each file offers the **Formats** that make sense for its registers (below). Both choices are session state, like the width grouping beside them, not Preferences.
- Undo restores every file the panel shows. MARS and RARS already roll back coprocessor, floating-point and CSR writes in their own backsteppers, so the editor only re-reads; the x86 wrapper adds the FPU block to the snapshot it already takes before every recorded step (below).
- The coding agent sees every file in full on request and only what is non-zero otherwise (below).
- Testcases stay on the CPU file in this version (below).
- The documentation describes each file on the language's registers page, in the same change as the panel.

## Presentation

### Formats

| File          | Formats                                                                                                                                                                                                                                                                                        | Default |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| CPU, CP0, CSR | hex, grouped by the widths the Target names (`src/lib/languages/sizeNames.ts`)                                                                                                                                                                                                                 | hex     |
| MIPS FPU      | double, single, hex. Double reads the even/odd pair, so odd rows are blank, as MARS's Double column is                                                                                                                                                                                         | double  |
| RISC-V FPU    | double, single, hex. A register that is not NaN-boxed shows NaN in single, as RARS does, which is why double leads: a file of zeroed registers reads as zeros rather than as 32 rows of NaN                                                                                                    | double  |
| x86 SSE       | hex (16 bytes), single (4 lanes), double (2 lanes)                                                                                                                                                                                                                                             | double  |
| x86 x87       | double, hex. Blink keeps the x87 stack as 64-bit doubles rather than 80-bit extended values, and the documentation says so. The wasm build had x87 disabled (`init_blink.sh --disable-all`); the Core change turns it back on, so x87 instructions now execute instead of stopping the program | double  |

- The hover popup shows the raw hex and the other precision, so nothing is more than a hover away. Integer Formats keep today's signed and decimal hover.
- The hex/decimal Preference applies to integer Formats only; a float Format is always decimal.
- Change highlighting works as today, by diffing the rendered text against the previous value.
- Every file is read from the Core on every panel refresh, whichever tab is visible, so a highlight always means "changed since the last refresh". The cost is a few flat-array calls per refresh; the measurement harness (`npm run measure`) confirms no throughput regression before merge.

### Tabs

- A segmented control replaces the "Registers" title in the panel header: CPU, FPU, CP0 for MIPS; CPU, FPU, CSR for RISC-V; CPU, SSE, x87 for x86. It is not rendered at all for a language with one file, so M68K and Z80 look exactly as they do now.
- One file is visible at a time and the Format selector on the right belongs to it. A file's own Status flags row sits at the top of its tab, mirroring the CPU column's flags-then-registers order. This is MARS's and RARS's layout; the known trade-off is that `$t0` and `$f0` cannot be watched together, which those tools cannot do either.
- The CPU tab is selected by default and the tab never switches by itself when another file changes.
- The header is one tinted block holding everything above the rows. At the width of the register column three tabs and a selector cannot share a line, so with tabs the strip keeps a line of its own and the selectors fall to the next, right aligned and at their natural width; a stretched grouping strip reads as a second row of tabs and is what the first attempt got wrong. A single file keeps the one line it always had, the "Registers" title with the grouping strip beside it.
- The register column is pinned to the width of the CPU file, and every other tab lays out inside it: a file with longer names (MIPS's CP0, RISC-V's CSR) wraps them rather than widening the column. Measured in the browser on 2026-09-14, the column and the panel beside the memory hold one width across every tab: MIPS and RISC-V 175 px on all three tabs, x86 264 px on all three, with no horizontal overflow.

### Playgrounds

The lower-case tab label is a fence flag (`fpu`, `cp0`, `csr`, `sse`, `x87`) that opens a Playground on that tab. Without one a Playground opens on CPU, so no existing Lecture changes.

## Undo

- MIPS and RISC-V: the Core's backstepper already restores CP0, CP1, the condition flags, the floating-point registers and the CSRs (`COPROC0_REGISTER_RESTORE`, `COPROC1_REGISTER_RESTORE`, `COPROC1_CONDITION_*`, `FLOATING_POINT_REGISTER_RESTORE`, `CONTROL_AND_STATUS_REGISTER_RESTORE` and `_BACKDOOR`). The adapter re-reads every file after Undo, as it does the CPU file.
- x86: the wrapper's per-step snapshot gains the FPU block (`xmm[16]`, `mxcsr`, the x87 stack and its control, status and tag words, about 340 bytes), fetched and restored as one copy through one bridge call each way, so the cost per recorded step is flat whatever the instruction touched.
- Undo history entries name writes to any file as register writes under the file's register names. RISC-V's current "Floating point register restore f3" note and its CSR notes become register writes; x86 diffs the FPU block the way it diffs the general registers.

## Coding agent

- `get_emulator_state` returns every file in full, each register in the file's default Format, so the agent reads `3.5` rather than a bit pattern, with a file's Status flags beside its registers.
- `step`, `run_to_completion`, `undo` and `compile` return the CPU file as today plus, for each other file, only the registers whose value is not zero. Deterministic and stateless; on teaching programs most floating-point registers stay at zero, so the usual cost is a handful of entries. The tool description already tells the agent to call `get_emulator_state` only for fields the other tools did not return.
- The system prompt gets one paragraph on the files.

## Testcases

Deferred. A Testcase keeps presetting and expecting registers of the CPU file only, and validation keeps looking names up there, so `$f0` in a Testcase is rejected like any unknown name. Two rules are fixed now so the extension stays additive: register names are unique across a language's files (`$f0` and `$t0`, `ft0` and `t0`, `xmm0` and `rax`), and a Testcase value is always the raw bit pattern, as it is today. What the extension still has to decide is the float input in the editor and a tolerance, because exact-bit equality on computed floats fails on the first `0.1 + 0.2`. The Core setters ship with this version so that step needs no Core release.

## Core changes

Each package ships as a published version before the editor phase that consumes it, as the peripherals plan required; the editor never depends on an unpublished build.

| Package         | Adds                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@specy/mips`   | `getCoprocessor1Values()` (32 ints) and `getCoprocessor0Values()` (4 ints) in register order; a setter for each; the existing `getConditionFlags()` and a setter for a flag                                                                                                                                                                                                                                                                                              |
| `@specy/risc-v` | the 32 floating-point registers and the 17 CSRs as 64-bit values, returned as high/low int pairs (the shape `setRegisterValue` already takes) rather than the decimal strings the general registers use, because a `BigInteger.toString` per register per refresh is what the throughput work found expensive; a setter for each; the stale `getConditionFlags` declaration removed                                                                                      |
| `@specy/x86`    | a bridge export that copies the FPU block out of Blink's machine and one that copies it back (`getFpuState`/`setFpuState`, a 356-byte block; `X86_SSE_REGISTERS`, `X86_X87_REGISTERS`, `RegisterSize.Quad`), marshalled by `blink-js` into xmm, mxcsr, st and word values and used by both the panel and the undo snapshot. `st` is reported in logical order (st0 is the top of the stack), so one x87 push renames every live slot and the undo history lists them all |

Widths: MIPS FPU and CP0 are 32-bit. The RISC-V FPU is 64-bit on both targets (NaN-boxed singles); the CSR file has the target's word size, so RV32 shows the `*h` halves as RARS does. x86 SSE registers are 128-bit, the x87 stack entries 64-bit doubles, `fctrl`, `fstat` and `ftag` 16-bit.

## Facts learned while changing the Cores

Recorded on 2026-09-14 from the three package changes (MARS `d150f1e`, RARS `1c4b308`, Blink `36caf1f` and `cd9642d`), all consumed as local builds until released:

- The MARS and RARS facades hand arrays over as `Int32Array`, with values that are signed 32-bit ints: a pattern with the top bit set reads back negative, so the adapters take `value >>> 0` (MIPS) or compose high/low halves unsigned with `highLowToBigint` (RISC-V).
- This MARS fork has no `li.s`/`li.d` pseudo-instructions; programs load floats with `l.s`/`l.d` from `.float`/`.double` data or `mtc1` of a bit pattern. The documentation must not promise `li.s`.
- `c.lt.s $f0, $f2` writes condition flag 0; the flagged form `c.lt.s N, $f0, $f2` writes flag N.
- RARS's CSR getter always returns the full 64-bit value; showing the target's word size (RV32 with the `*h` halves) is the adapter's job.
- Blink's `config.h` is generated by `init_blink.sh` and gitignored; anyone rebuilding the wasm runs that script first, now with `--enable-x87`. MMX, BCD, BMI2 and the disassembler stay disabled.
- A step that moves only the x87 op/ip/dp pointers records an FPU change that names no register; the undo history wording allows for it.

- A RARS CSR backstep entry's `param1` is the architectural CSR number (`ustatus` 0x000 ... `instreth` 0xC82), not a position in the file, while an FP restore's `param1` is the register number and does index the file. `CONTROL_AND_STATUS_REGISTER_BACKDOOR` is only ever the simulator's own sample of the host clock into `time` (once at the start of each run, then every 64 instructions), so only `CONTROL_AND_STATUS_REGISTER_RESTORE` becomes a register write in the undo history; the backdoor entries are dropped.
- The coding agent's non-zero listing keeps a zero register that is the even half of a MIPS double pair whose odd half is not zero, since dropping it would hide the only row that reports the double; every float register also carries an `other` array with the raw hex and the other precision.
- An x87 stack slot the tag word marks empty holds whatever it last held, commonly a NaN. The x87 file blanks those rows, as gdb's `info float` prints Empty, through a per-refresh blanking hook beside the values and flags; the raw bits stay a hover away.
- Throughput measured after the change on 2026-09-14 (`npm run measure`, two runs): MIPS 12.2 to 12.5 thousand instructions per millisecond against a constant of 11.0, RISC-V 6.0 to 6.5 against 5.4, x86 10.1 against 10; no regression from the file reads. M68K (11.9 to 12.3 against 15.0) and Z80 (9.5 to 10.0 against 10.0) have no files and were already below their constants.

## Editor surface

- `Emulator.registers` stays the CPU file for every existing caller (the panel, Testcases, the agent); a new `registerFiles` list has the CPU file first and the others after it. Before a Build every file shows zeros, as the CPU file does today.
- The `BaseEmulator` configuration names the files an adapter has; `GenericEmulator` reads, diffs and publishes them beside the CPU file on the same refresh path.

## Documentation

Each language's registers page describes each of its Register files: MIPS gains FPU (the `$f` registers, the even/odd pairing rule for doubles, the condition flags) and CP0 sections; x86 gains SSE and x87 sections, including Blink's 64-bit x87 precision; RISC-V gets the registers page it does not have today, with the general registers, the FPU and the CSRs. The pages stay data-driven from the `*-documentation.ts` modules so the hover and the coding agent's reference read the same text.

## Order of work

1. Cores: the MARS and RARS wrapper exports with smoke tests, the Blink bridge and `blink-js` marshalling; three releases.
2. Editor model: the Register file type, `registerFiles` on `GenericEmulator`, the MIPS, RISC-V and x86 adapters, x86's undo snapshot.
3. Panel: tabs, the Format selector, float rendering and hover, a file's Status flags row; the playground flag.
4. Coding agent snapshot and prompt; undo history names.
5. Documentation pages.
6. Measure with `npm run measure` and compare against the current numbers.
