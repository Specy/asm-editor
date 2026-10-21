# 68010 and 68020 as CPU dialects for s68k

Gathered 2026-10-21 for decision 3 of the [M68K machine design](../design/m68k-machine.md) ("One CPU, the 68000"). The owner asked whether the 68010 and the 68020 could be offered as a per-program choice of processor, instead of refusing the two non-68000 instructions s68k accepts today: `extb.l` (68020) and `move ccr,<ea>` (68010).

This is a fact base, and its last section is a recommendation. It builds on [EASy68K's machine behaviour](./easy68k-machine-behaviour.md) (decision 3 and §12 there) and on [the 68000 verification and timing references](./m68k-verification-references.md).

"Measured here" means one of two things. Either sample files were downloaded and checked with throwaway scripts outside the repository, or Musashi was built and probed outside the repository. Nothing under `packages/` was changed.

## Sources

| Short name   | Document                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M68000UM** | _M68000 8-/16-/32-Bit Microprocessors User's Manual_, Rev 8, 1993 ([Bitsavers](http://bitsavers.trailing-edge.com/components/motorola/68000/68000/M68000UM_AD_M68000_Microprocessor_Users_Manual_Rev8_1993.pdf)). It covers the MC68010. The 68010 parts are §6.1–6.4 (exceptions), Section 9 (MC68010 instruction execution times) and Appendix A (loop mode).                                                                                          |
| **M68000PM** | _M68000 Family Programmer's Reference Manual_, M68000PM/AD Rev 1, 1992 ([Bitsavers](http://bitsavers.trailing-edge.com/components/motorola/68000/68000/M68000PM_AD_Rev_1_Programmers_Reference_Manual_1992.pdf)). Appendix A, Table A-1, is the per-processor instruction cross-reference. Sections 4 and 6 give each instruction's processor list and addressing-mode tables.                                                                           |
| **M68020UM** | _MC68020/MC68EC020 Microprocessors User's Manual_; its page footers read "UM Rev 1, 9/29/95" ([mirror](https://media.nostalgianerd.com/file/mc68020.pdf); 1984 first edition on [Bitsavers](http://bitsavers.trailing-edge.com/components/motorola/68000/68020/MC68020_32-Bit_Microprocessor_Users_Manual_1984.pdf)). Section 4 covers the cache, Section 6 exceptions and frames, Section 7 the coprocessor interface and Section 8 instruction timing. |
| **68010 DS** | _MC68010/MC68012 16-/32-Bit Virtual Memory Microprocessors_ data sheet, ADI942R2, May 1985 ([Bitsavers](http://bitsavers.trailing-edge.com/components/motorola/68000/68010/MC68010_68012_Data_Sheet_May85.pdf)). §7.1.3 covers loop mode and §7.2 instruction execution times.                                                                                                                                                                           |
| **68881 UM** | _MC68881/MC68882 Floating-Point Coprocessor User's Manual_, 1st ed. 1987 ([Bitsavers](http://bitsavers.trailing-edge.com/components/motorola/68000/68020/MC68881_MC68882_Floating-Point_Coprocessor_Users_Manual_1ed_1987.pdf)). Only its existence and scope are cited here.                                                                                                                                                                            |
| Emulators    | [Musashi](https://github.com/kstenerud/Musashi) 4.10 (MIT), [Moira](https://github.com/dirkwhoffmann/Moira) (MIT core), [m68k-rs](https://github.com/benletchford/m68k-rs) (MIT), [WinUAE](https://github.com/tonioni/WinUAE) `gencpu.cpp`, `table68k` and [cputest/readme.txt](https://github.com/tonioni/WinUAE/blob/master/cputest/readme.txt).                                                                                                       |
| Assemblers   | GNU as ([M68K options](https://sourceware.org/binutils/docs/as/M68K_002dOpts.html), [M68K directives](https://sourceware.org/binutils/docs/as/M68K_002dDirectives.html), `gas/config/tc-m68k.c`), binutils `bfd/cpu-m68k.c` and `opcodes/m68k-dis.c`, and the [vasm manual §25, M68k cpu module](http://sun.hasenbraten.de/vasm/release/vasm_25.html). EASy68K 5.16.1 source and help, cited as in the EASy68K fact base (`ASM/`, `SIM/`, `HELP/`).      |
| Test data    | [SingleStepTests/m68000](https://github.com/SingleStepTests/m68000) (MIT, MAME-derived) and [SingleStepTests/680x0](https://github.com/SingleStepTests/680x0) (`map/68000.official.json`).                                                                                                                                                                                                                                                               |

---

## 1. The 68010 delta from the 68000

M68000UM §1.3 summarises the 68010 as the 68000 plus "virtual memory/machine support" and "high-performance looping instructions". The address bus is still 24 bits. The SR still has only T, S, I2–I0 and the CCR (mask `$A71F`). Word and long data at odd addresses still raise address errors.

### 1.1 New instructions

| Instruction                       | Encoding                                                              | Privileged | What a program sees                                                                                                                                                                                                                                                                                                                                                                | Source                                                      |
| --------------------------------- | --------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `MOVE CCR,<ea>`                   | `$42C0` + data-alterable ea. It is the 68000's illegal CLR size `11`. | no         | A word store whose high byte is 0. It is the user-mode replacement for `MOVE SR,<ea>`.                                                                                                                                                                                                                                                                                             | M68000PM Table A-1; M68000UM Table 9-18 (4 cycles, or 8+EA) |
| `MOVEC Rc,Rn` / `MOVEC Rn,Rc`     | `$4E7A` / `$4E7B` + one extension word                                | yes        | Control registers on the 68010: SFC `$000`, DFC `$001`, USP `$800`, VBR `$801`. "Any other code causes an illegal instruction exception."                                                                                                                                                                                                                                          | M68000PM MOVEC (6-22, 6-23)                                 |
| `MOVES <ea>,Rn` / `MOVES Rn,<ea>` | `$0E00` + size + ea + one extension word                              | yes        | A move into or out of the address space named by SFC or DFC.                                                                                                                                                                                                                                                                                                                       | M68000PM MOVES; M68000UM Table 9-16 (18–28 cycles)          |
| `RTD #d16`                        | `$4E74` + d16                                                         | no         | Pops the PC, then adds the sign-extended displacement to SP: callee-pops-arguments.                                                                                                                                                                                                                                                                                                | M68000PM RTD; M68000UM Table 9-18 (16 cycles)               |
| `BKPT #n`                         | `$4848`–`$484F`                                                       | no         | On the 68010 it runs a breakpoint-acknowledge bus cycle, then "whether the … cycle is terminated with DTACK, BERR, or VPA, the processor always takes an illegal instruction exception". On a 68000 the same words are simply illegal. So the visible effect is identical (vector 4); only the timing differs: 45 cycles on the 68010, 34 for an illegal instruction on the 68000. | M68000PM BKPT; M68000UM Tables 8-14, 9-19                   |

### 1.2 Behaviour changes

| Change                                         | Detail                                                                                                                                                                                                                                                                                                                                                                                                               | Visible in user mode?                                                                                                                              | Source                                                          |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `MOVE SR,<ea>` becomes privileged              | "To implement virtual machine concepts in the MC68010, the move from status register (MOVE from SR), move to/from control register (MOVEC), and move alternate address space (MOVES) instructions are also privileged." In user mode it raises a privilege violation. This contradicts M68000UM §1.1's claim that "any user-mode programs using the MC68000 instruction set will run unchanged" on later processors. | **Yes**: the one user-mode incompatibility with the 68000.                                                                                         | M68000UM §6.1.2 note; M68000PM Table A-1 note 4                 |
| VBR                                            | "The vector offset is added to the 32-bit vector base register (VBR) to obtain the 32-bit absolute address of the exception vector." VBR is 0 at reset, so the 68010 behaves like a 68000 until `MOVEC` changes it.                                                                                                                                                                                                  | No (supervisor only)                                                                                                                               | M68000UM §6.2.1 note, Figure 6-4                                |
| Format/vector-offset word in every frame       | The group 1 and 2 frame is four words: SR, PC (2 words), then format (bits 15–12) plus vector offset. "Group 0 exceptions (except reset) stack 29 words and group 1 and 2 exceptions stack four words." Format `$0` is the short frame and `$8` the long one; all other formats are "unassigned, reserved".                                                                                                          | Visible to handlers. A handler that reads SR at `(SP)` and the PC at `2(SP)` still works. One that pops the frame by hand (`addq.l #6,sp`) breaks. | M68000UM §6.2.4, Figure 6-6, Table 6-4                          |
| 29-word bus/address error frame (format `$8`)  | SR, PC, the format `$8` word, a special status word (RR, IF, DF, RM, HB, BY, RW, FC2–FC0), fault address, data output buffer, data input buffer, instruction input buffer, a version number and 16 internal words. "The stack pointer is decremented by 29 words, although only 26 words of information are actually written." Address errors stack the same frame.                                                  | Handler-visible (supervisor)                                                                                                                       | M68000UM §6.3.9.2, Figures 6-8 and 6-9, §6.3.10                 |
| Instruction continuation, not restart          | The long frame "is reloaded by the RTE instruction to continue the instruction that caused the error". The stacked PC "may be advanced by as many as five words" by prefetch. A handler may instead complete the access in software and set RR.                                                                                                                                                                      | Supervisor only                                                                                                                                    | M68000UM §6.3.9.2                                               |
| RTE checks the frame                           | RTE reads SR, PC and the format word. An unknown format raises a **format error** (vector 14, 50 cycles). For format `$8` it checks the version number (a mismatch costs 70 cycles) and the readability of the last frame word before reloading. A bus error during that reload is a double fault.                                                                                                                   | Supervisor only                                                                                                                                    | M68000UM §6.4, Table 6-2 (vector 14 "MC68010 only"), Table 9-19 |
| Loop mode                                      | A one-word "loop mode instruction" followed by a `DBcc` with displacement −4 runs with no instruction fetches after the second iteration (§1.4).                                                                                                                                                                                                                                                                     | Timing only, with one edge: a looped instruction that is modified in memory is not re-fetched until the loop ends.                                 | M68000UM Appendix A                                             |
| `CLR`, `MOVE from SR/CCR` no longer read first | The 68010 tables give CLR to memory with no operand read, `8(1/1)` for (An), where the 68000 gives `12(2/1)`. MOVE from SR and CCR to memory use the "nonfetching effective address calculation time". vasm's manual agrees: "CLR will execute a read-modify-write cycle on the 68000 … With 68010 and higher [MOVE #0 → CLR] is a generic standard optimization."                                                   | Only to a device that reacts to reads. EASy68K's devices do not.                                                                                   | M68000UM Tables 9-10, 9-18; vasm §25.2 `-opt-clr`               |
| Timing                                         | See §1.5.                                                                                                                                                                                                                                                                                                                                                                                                            | Through the cycle counter                                                                                                                          | M68000UM Section 9                                              |

Unchanged on the 68010: the 24-bit address bus, odd-address address errors, the vector table layout (apart from vector 14), autovectors, and `TRAP`, `TRAPV`, `CHK` and divide-by-zero semantics. These still use a format `$0` frame.

### 1.3 What a program sees under each mode

- **User mode:** `MOVE CCR,<ea>` and `RTD` work. `MOVE SR,<ea>` traps. `BKPT` traps as illegal, as on a 68000. The timing is different. Nothing else changes.
- **Supervisor mode** (where s68k programs start, since the reset SR is `$2000` per [decision 2](../design/m68k-machine.md)):
    - every exception frame is 8 bytes instead of 6;
    - bus and address errors push 58 bytes instead of 14;
    - `RTE` validates the frame;
    - `MOVEC`, `MOVES` and VBR exist.

### 1.4 Loop mode in detail (M68000UM Appendix A)

- **Entry:** "The loop count and branch condition of the DBcc instruction must result in looping, the branch displacement must be minus four, and the branch must be to a one-word loop mode instruction preceding the DBcc instruction." The looped instruction and the DBcc word are fetched twice when the loop is entered. After that, no fetches happen until the count expires or the condition becomes true.
- **Exit:** interrupts end loop mode; they are taken after each DBcc, not after the looped instruction. Trace makes loop mode unavailable, and reset or a bus error also end it.
- **Loop mode instructions (Table A-1):** one-word forms only, with (An), (An)+ or −(An) memory operands:
    - `MOVE.B/W/L` between those modes, and Ry to (Ax)/(Ax)+;
    - `ADD`, `AND`, `CMP`, `OR`, `SUB` and `ADDA`, `CMPA`, `SUBA` with a memory source, and `ADD`, `AND`, `EOR`, `OR`, `SUB` with a memory destination;
    - `ABCD`, `ADDX`, `SBCD`, `SUBX` with −(Ay),−(Ax), and `CMPM`;
    - `CLR`, `NEG`, `NEGX`, `NOT`, `TST`, `NBCD`, and the memory shifts and rotates.
- **Example:** `MOVE.W (A0)+,(A1)+` / `DBEQ` costs 14 cycles per continued iteration in loop mode (Table 9-3). Outside loop mode it costs 12 for the MOVE plus 10 for the DBcc, so 22.
- **Timing tables:** loop mode has its own tables, 9-3, 9-5, 9-7, 9-11, 9-13 and 9-17. Each has three columns: continued, terminated by condition, and terminated by count.

### 1.5 Timing differences from the 68000 (M68000UM Section 8 against Section 9)

| Operation                                        | 68000      | 68010            |
| ------------------------------------------------ | ---------- | ---------------- |
| `MOVE SR,Dn`                                     | 6          | 4                |
| `CLR.B/W (An)` / `CLR.L (An)`                    | 12 / 20    | 8 / 12           |
| `Bcc.S` not taken                                | 8          | 6                |
| `DBcc`: cc true / counter expired                | 12 / 14    | 10 / 16          |
| `MULU`/`MULS` (maximum)                          | 38+2n (70) | 40 / 42 (maxima) |
| `DIVU`/`DIVS` (maximum)                          | 140 / 158  | 108 / 122        |
| `RTE` (short frame)                              | 20         | 24               |
| `RESET`                                          | 132        | 130              |
| Illegal, privilege violation, trace, TRAP, TRAPV | 34         | 38               |
| CHK / divide by zero                             | 40+ / 38+  | 44+ / 42+        |
| Interrupt                                        | 44         | 46               |
| Bus or address error                             | 50         | 126              |
| Format error / RTE with a bad revision           | —          | 50 / 70          |

- **Published tables:** the 68010 tables are complete and in the same `n(r/w)` style as the 68000's (M68000UM Section 9, 68010 DS §7.2).
- **MUL and DIV:** the manual gives only maxima for the 68010's MUL and DIV. Moira models them per operand in `MoiraALU_cpp.h`:
    - MULU is a flat 36;
    - MULS is 36 or 38, depending on the sign bit;
    - DIVU is data-dependent;
    - DIVS is 118 or 120, or 16 on overflow.

    These come from a core verified against cputester (§4.4).

- **Musashi** uses fixed per-CPU bases instead (`m68k_in.c`: `muls` 32, `mulu` 30, `divs` 122, `divu` 108 for the 68010).

---

## 2. The 68020 delta from the 68010

Sources: M68000PM Table A-1 and Appendix A.2; M68020UM Sections 1, 4, 6, 7 and 8.

The 68020 has every 68010 instruction, including privileged `MOVE SR`, `MOVEC`, `MOVES`, `RTD`, `BKPT` and VBR. The groups below are what it adds.

**Size** is a rough implementation cost for an interpreter like s68k, covering the assembler, encoder, decoder, executor, disassembler, documentation entry and tests:

- **S**, small: up to about 1 person-day;
- **M**, medium: 2–5 days;
- **L**, large: more than 5 days.

**User?** says whether a user-mode program can observe the item.

### 2.1 Addressing modes and branches

| Group                                    | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Size | User? |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----- |
| Scaled index in the brief extension word | `(d8,An,Xn.SIZE*SCALE)` and `(d8,PC,Xn*SCALE)` with scale 1, 2, 4 or 8 in bits 10–9. Bit 8 = 0 marks the brief format.                                                                                                                                                                                                                                                                                                                                                                                                                  | S    | yes   |
| Full extension word                      | Bit 8 = 1 marks it. BS (bit 7) suppresses the base and IS (bit 6) the index. BD SIZE (bits 5–4) is null, word or long. I/IS (bits 2–0) selects no memory indirection, pre-indexed or post-indexed, and the outer displacement as null, word or long. These give:<br>• `(bd,An,Xn)` and `(bd,PC,Xn)` with a 16- or 32-bit base displacement;<br>• memory indirect pre-indexed `([bd,An,Xn],od)` and post-indexed `([bd,An],Xn,od)`;<br>• the same forms on PC.<br>"18 addressing modes" in all (M68020UM Table 1-1, M68000PM Table A-7). | L    | yes   |
| 32-bit branch displacement               | Bcc, BRA and BSR with displacement byte `$FF` take a 32-bit displacement: `Bcc.L`. On the 68000 and 68010, `$FF` is the byte displacement −1.                                                                                                                                                                                                                                                                                                                                                                                           | S    | yes   |

The new addressing modes apply to every instruction that takes an effective address. The cost is in four places:

- the syntax, with optional parts, suppressed base or index (`ZA0`, `ZPC` in some assemblers), and `.W`/`.L` displacement sizes;
- size selection in pass 1, where s68k's no-relaxation rule ([decision 5](../design/m68k-machine.md)) must be extended to `bd` and `od`;
- the encoder and decoder, including reserved I/IS and BD SIZE combinations. M68020UM leaves these undefined, and cputester says "68020+ undefined addressing mode bit combinations are not tested".
- the per-mode EA timing table (M68020UM §8.2.1–8.2.5).

#### Measured: the 68000's decoder must not read the 68020's index word

On the 68000 and 68010, bits 10–8 of the brief extension word are ignored. Musashi's `m68ki_get_ea_ix` returns `An + Xn + d8` before it looks at bit 8 when `CPU_TYPE_IS_010_LESS`.

The MAME-derived suite relies on this, because its extension words are random:

| File  | `(d8,An,Xn)` tests | Bits 10–8 nonzero | Bit 8 set |
| ----- | ------------------ | ----------------- | --------- |
| LEA   | 738                | 641               | 374       |
| CLR.w | 404                | 359               | 199       |
| TST.l | 392                | 343               | 201       |
| CHK   | 409                | 378               | 210       |

All 738 LEA results match the 68000 computation with bits 10–8 ignored, including 551 tests with nonzero scale bits.

So a decoder shared by the dialects must interpret the extension word per dialect. A 68020 reading of these words fails hundreds of 68000 tests. Words that s68k's own assembler writes always have bits 10–8 clear, so assembled programs behave the same under every dialect.

#### Measured: `$FF` branch displacements

The 68000 suite has 9 Bcc and 10 BSR tests with displacement byte `$FF`, all expecting a byte displacement of −1. This is also [m68000#4](https://github.com/SingleStepTests/m68000/issues/4).

### 2.2 New integer instructions

| Instruction                                         | Encoding (first word)                               | What it does                                                                                                                                                                                                                                                         | Size | User? |
| --------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----- |
| `EXTB.L Dn`                                         | `$49C0`+n                                           | Sign-extends a byte to a long. s68k already executes it.                                                                                                                                                                                                             | S    | yes   |
| `MULS.L`/`MULU.L`                                   | `$4C00`+ea + extension                              | 32×32→32 (V on overflow) or →64 into `Dh:Dl`.                                                                                                                                                                                                                        | M    | yes   |
| `DIVS.L`/`DIVU.L`/`DIVSL.L`/`DIVUL.L`               | `$4C40`+ea + extension                              | 64/32 → 32r:32q, 32/32 → 32q, or 32/32 → 32r:32q. Overflow and divide-by-zero behave as for the word forms.                                                                                                                                                          | M    | yes   |
| `CHK.L <ea>,Dn`                                     | `$4100` pattern (`0100 ddd 100 ea`)                 | Long bound check.                                                                                                                                                                                                                                                    | S    | yes   |
| `CHK2`/`CMP2` `<ea>,Rn`                             | `$00C0`/`$02C0`/`$04C0`+ea + extension              | Checks against a lower/upper bound pair in memory, signed for An and by size for Dn. CHK2 traps through vector 6.                                                                                                                                                    | M    | yes   |
| `CAS`/`CAS2`                                        | `$0AC0`/`$0CC0`/`$0EC0`+ea; `$0CFC`/`$0EFC`         | Compare and swap (read-modify-write); CAS2 takes two register-indirect operands.                                                                                                                                                                                     | M    | yes   |
| `PACK`/`UNPK`                                       | `$8140`/`$8180` (Dn,Dn or −(An),−(An)) + adjustment | Packs or unpacks BCD with an adjustment word.                                                                                                                                                                                                                        | S    | yes   |
| `LINK.L An,#d32`                                    | `$4808`+n                                           | `LINK` with a 32-bit displacement.                                                                                                                                                                                                                                   | S    | yes   |
| `TRAPcc`, `TRAPcc.W #`, `TRAPcc.L #`                | `$50FC`/`$50FA`/`$50FB` + cc                        | Conditional trap through vector 7 with a format `$2` frame. The operand is only for the handler.                                                                                                                                                                     | S    | yes   |
| `BFTST BFEXTU BFCHG BFEXTS BFCLR BFFFO BFSET BFINS` | `$E8C0`…`$EFC0`+ea + extension                      | Offset 0–31 or signed from Dn; width 1–32 or from Dn. On Dn the field wraps. In memory the field can span 5 bytes, and the offset can address any byte (±2^31 bits). N and Z come from the field.                                                                    | M    | yes   |
| `CALLM`/`RTM`                                       | `$06C0`+ea / `$06C0`–`$06CF`                        | Module call and return through descriptors with access levels and stack copying. **68020 only.** Table A-1 lists them under no other processor, and WinUAE's `table68k` marks them "not implemented in 68030 and later". Musashi flags them "not properly emulated". | L    | yes   |
| `BKPT #n`                                           | `$4848`+n                                           | On the 68020 the acknowledge cycle can supply an instruction word to execute. With nothing on the bus it takes the illegal instruction exception, as on the 68010.                                                                                                   | S    | yes   |
| Existing instructions, new forms                    | —                                                   | `TST` on An (word and long), PC-relative and immediate operands ("PC relative addressing modes do not apply to MC68000, MC68008, or MC68010"); `CMPI` with PC-relative destinations; `Bcc.L`; `CHK.L`; `LINK.L`.                                                     | S    | yes   |

**Encodings that collide with the 68000.** Every new first word above is an illegal word on the 68000, for example:

- `$49C0` is LEA with Dn;
- `$42C0` is CLR with size `11`;
- `$4C00` is not MOVEM, because bit 7 is clear;
- `$E8C0`–`$EFC0` have bit 11 set, so they are not memory shifts;
- `$50FC` is Scc with an immediate operand.

The only collisions are therefore in **legality**, not meaning: a dialect gate per opcode suffices. The exceptions are the two in §2.1, the index word and the `$FF` displacement, where a word legal on the 68000 changes meaning.

### 2.3 Data alignment

"The MC68000, MC68008, and MC68010 implementations allow long-word transfers on odd-word boundaries but force exceptions if word or long-word operand transfers are attempted at odd-byte addresses. … the MC68020/EC020 does not enforce any alignment restrictions for data operands." Only an instruction fetch at an odd address is an address error (M68020UM §5.2.2, §6.1.3).

- **Size:** S.
- **User-visible:** yes. A program that relies on the odd-address trap behaves differently.

### 2.4 Supervisor model

| Item                    | Detail                                                                                                                                                                                                                  | Size | User? |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----- |
| SR                      | `T1 T0 S M 0 I2 I1 I0 0 0 0 X N Z V C`, so the mask is `$F71F`. T1/T0 select tracing: `10` traces every instruction, `01` traces only changes of flow, and `11` is reserved (Table 6-2). A traced `STOP` does not stop. | S–M  | no    |
| MSP, ISP and the M bit  | "Two 32-bit supervisor stack pointers". M selects the master or the interrupt stack. An interrupt taken with M = 1 clears M and pushes a second, "throwaway" format `$1` frame on the interrupt stack. RTE unwinds it.  | M    | no    |
| CACR, CAAR              | MOVEC codes `$002` and `$802`. CACR bits 3–0 control the instruction cache: E (enable), F (freeze), CE (clear entry) and C (clear). Reset clears E and F. CAAR exists only on the 68020 and 68030.                      | S    | no    |
| MOVEC                   | Adds CACR `$002`, CAAR `$802`, MSP `$803` and ISP `$804` to the 68010's four. Other codes raise an illegal instruction.                                                                                                 | S    | no    |
| Privileged instructions | ANDI/EORI/ORI to SR, cpRESTORE, cpSAVE, MOVE from SR, MOVE to SR, MOVE USP, MOVEC, MOVES, RESET, RTE, STOP (M68020UM §6.1.6).                                                                                           | —    | —     |

### 2.5 Exception stack frames (M68020UM §6.4, Table 6-5)

| Format | Words | Used for                                                                                                                                                            | Stacked PC                                                                                           |
| ------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `$0`   | 4     | Interrupt, format error, TRAP #n, illegal, line A, line F, privilege violation, coprocessor pre-instruction                                                         | Next instruction for interrupts and TRAP; the instruction itself for illegal, line A/F and privilege |
| `$1`   | 4     | Throwaway frame on the interrupt stack when an interrupt arrives in master mode                                                                                     | Next instruction                                                                                     |
| `$2`   | 6     | CHK, CHK2, cpTRAPcc, TRAPcc, TRAPV, trace, zero divide, MMU configuration, coprocessor post-instruction. It adds the **address of the instruction that caused it**. | Next instruction                                                                                     |
| `$9`   | 10    | Coprocessor mid-instruction, main-detected protocol violation, interrupt during a coprocessor instruction                                                           | Next word to fetch                                                                                   |
| `$A`   | 16    | Short bus fault: an address or bus error at an instruction boundary                                                                                                 | Next instruction                                                                                     |
| `$B`   | 46    | Long bus fault: an address or bus error in mid-instruction, with internal registers and a version number                                                            | The instruction in execution                                                                         |

- M68020UM warns: "The system software should not depend on a particular exception generating a particular stack frame."
- **Sizes:** `$0`/`$2` are M (with the RTE format check, and including the 68010's `$0`). `$1` is S once MSP exists. `$9` is needed only with a coprocessor. `$A`/`$B` are M–L for real continuation.
- **What Musashi does:** its 68020 RTE handles formats `$0`, `$1` and `$2`. For `$A` and `$B` it raises a format error ("Not handling long or short bus fault"). Its 68010 RTE pops a format `$8` frame and resumes at the stacked PC, which is a reasonable model for a teaching tool.

### 2.6 Address bus

- **The 68020** drives 32 address bits. **The 68EC020** is the same CPU with "a 24-bit address bus", fewer bus signals, and no other ISA difference (M68020UM Section 1). Musashi, Moira and m68k-rs all model both.
- **Effect on s68k:** the machine design keeps EASy68K's 16 MB memory masked to 24 bits ([decision 14](../design/m68k-machine.md)), and its devices sit at `$E00000`. A 68020 dialect with a 32-bit bus would need a sparse memory and a rule for addresses above 16 MB. The 68EC020 needs neither.
- **Size:** S for the 68EC020; M for a full 32-bit bus with a memory model.

### 2.7 Instruction cache

- **What it is:** a direct-mapped cache of 64 long words, tagged with A31–A8 and FC2. It caches instructions only: "Data accesses are not cached." Reset invalidates it and clears E, so it starts disabled (M68020UM §4.1–4.2).
- **What it changes:** it changes only timing, and the visibility of self-modifying code once it is enabled. Without a cache model, self-modified code always takes effect, which is what hardware does with the cache disabled or flushed.
- **Size:** M for a model like Moira's (`MoiraCache.h`: 64 lines, used only for timing). Not user-visible except through cycles and stale code.

### 2.8 Coprocessor interface, F-line and FPU

- **The coprocessor interface:** F-line words with bits 11–9 ≠ 000 are coprocessor instructions for coprocessor ID 0–7. The CPU runs a CPU-space bus cycle to the coprocessor. "If the addressed coprocessor is not included in the system and the cycle terminates with the assertion of BERR, the instruction takes an unimplemented instruction (F-line opcode) exception" (M68020UM §6.1.5, Section 7).
    - So **without a coprocessor, F-line behaves as on the 68000**: vector 11 with a format `$0` frame stacking the instruction's address. EASy68K's SIMHALT `$FFFF $FFFF` is unaffected.
    - The instruction families are cpGEN, cpBcc, cpDBcc, cpScc, cpTRAPcc, cpSAVE and cpRESTORE (Table A-1).
- **The 68881/68882 FPU:** it adds eight 80-bit registers, FPCR, FPSR and FPIAR, packed-decimal and extended formats, transcendental functions, FSAVE/FRESTORE frames, mid-instruction frames (`$9`) and exception vectors 48–54 (68881 UM; M68000PM Table A-1).
    - **Size:** very large, about 30–60 person-days, with an 80-bit soft-float as a dependency.
    - **User-visible:** yes.
    - **Reproducibility:** transcendental results are hard to make bit-exact.
- **The 68851 MMU:** an external chip on the 68020. Out of scope.

### 2.9 What EASy68K's bit-field option already covers

- **What it does:** EASy68K executes the eight BFxxx instructions, and only them, "patterned after the 68020 simulator code used in the UAE" (SIM/CODE7.CPP:313-315). It does so behind an opt-in:
    - the simulator's "Enable Bit Field Instructions" option, off by default;
    - or the assembler's `OPT BIT`, which writes `*[sim68k]bitfield` into the `.L68` listing so the simulator turns the option on (ASM/DIRECTIV.CPP:620-625).
- **The limit:** "Only 68000 addressing modes are supported", meaning Dn and the 68000 control modes with the brief index word (HELP/Directives/opt.htm, HELP/options.htm, HELP/SIMHELP/SimOptions.htm).
- **Its own quirks:**
    - The memory form always reads 5 bytes.
    - Its cycle counts are 68020 cache-case figures plus the 68000 EA time. For example, BFEXTU Dn is 8 and BFCHG on fewer than 5 bytes is 16, against M68020UM Table 8.2.14's cache case of 8 and 16.
- **What it does not cover:** everything else in §2. The help says so: "EASy68K does not include support for any other non 68000 instructions" (HELP/options.htm).
- **No way back:** "There is not a matching NOBIT option because there is no way to selectively disable bit field support in Sim68K during program execution" (HELP/Directives/opt.htm).

---

## 3. Timing

### 3.1 The 68010

The tables are published and instruction-granular:

- **M68000UM Section 9:**
    - effective address, MOVE, standard, immediate, single operand, shift, bit, conditional, JMP/JSR/LEA/PEA/MOVEM, multiprecision, miscellaneous and exception tables;
    - loop-mode variants of the MOVE, standard, single operand, shift and multiprecision tables.
- **The 68010 data sheet, §7.2:** the same tables.

The model is the 68000's: a base time plus EA time, read and write counts, and four-clock bus cycles. The gaps are:

- only maxima for MUL and DIV (Moira has measured models; §1.5);
- no MAME-style single-step oracle (§4).

### 3.2 The 68020: three numbers per instruction

M68020UM §8.1 lists four factors that "make MC68020/EC020 instruction set timing difficult to calculate on a single instruction basis since instructions vary in execution time from one context to another":

- the instruction cache and prefetch;
- operand misalignment;
- concurrency between the bus controller and the sequencer;
- instruction execution overlap.

§8.2 therefore gives three values for every instruction and EA mode, assuming a 32-bit bus, aligned operands and no wait states (three-clock bus cycles):

- **Best case (BC):** "the instruction is in the cache and benefits from maximum overlap due to other instructions".
- **Cache case (CC):** "the instruction is in the cache but has no overlap".
- **Worst case (WC):** "the instruction is not in the cache or the cache is disabled and there is no instruction overlap".

The manual then states: "Calculating exact timing from the timing tables is impossible because the tables cannot anticipate how the combination of factors will influence every particular sequence of instructions." Its four-instruction example sums to 10 (BC), 15 (CC) and 21 (WC) clocks (Table 8-2). The observed timings in Table 8-3 include values found in no column.

Sample rows (BC/CC/WC):

| Row                                             | BC      | CC      | WC      |
| ----------------------------------------------- | ------- | ------- | ------- |
| `ADD <ea>,Dn` (plus fetch EA)                   | 0       | 2       | 3       |
| `MULS.L`/`MULU.L` (plus EA)                     | 41      | 43      | 44      |
| `DIVS.L` (plus EA)                              | 88      | 90      | 91      |
| Bcc taken                                       | 3       | 6       | 9       |
| BSR                                             | 5       | 7       | 13      |
| RTS                                             | 9       | 10      | 12      |
| Fetch EA `([d32,B],I,d32)`                      | 17      | 20      | 24      |
| TRAP #n, illegal, line A/F, privilege violation | 20      | 20      | 27      |
| Interrupt, I-stack / M-stack                    | 26 / 41 | 26 / 41 | 33 / 48 |

### 3.3 What emulators do

- **Musashi** keeps one 68020 number per opcode in `m68k_in.c`, plus a per-mode EA table, with no cache or overlap model. The numbers are the M68020UM **cache case**:

    | Instruction        | Musashi | Cache case      |
    | ------------------ | ------- | --------------- |
    | `ADD <ea>,Dn`      | 2       | 2               |
    | `ADD Dn,<ea>`      | 4       | 4               |
    | `MULS.W`           | 27      | 27              |
    | `DIVU.W`           | 44      | 44              |
    | `DIVS.W`           | 56      | 56              |
    | `MULx.L`           | 43      | 43              |
    | Bcc taken          | 6       | 6               |
    | BSR                | 7       | 7               |
    | `MOVEC` (each way) | 6 / 12  | 6 / 12          |
    | `BFCHG Dn`         | 12      | 12              |
    | `DIVx.L`           | 84      | 78 (U) / 90 (S) |

    `DIVx.L` is the only clear departure: Musashi uses one 84 for both, between the two cache-case values.

- **Moira** gives the 68020 per-instruction counts (`CYCLES_68020` in `MoiraExec_cpp.h`). Since 2026-08 it adds a 64-line instruction cache model whose hits are "modelled as a discount", plus a cycle-budget accumulator (`Moira.h`, `syncCp`).
    - Its test runner turns off cycle comparison with Musashi for the 68020 and later, because "Moira's cache-aware fetch timing (tuned against WinUAE/Amiberry, not Musashi) legitimately diverges from that flat model" (`Runner/Testrunner.cpp`).
    - Its precise per-access timing (`MOIRA_PRECISE_TIMING`) is "available only for 68000 and 68010 emulation".
- **WinUAE's** 68020 "cycle-exact" core has a head/tail/cycles model whose "timing tables are from 030 which has 2 clock memory accesses, 68020 has 3 clock memory accesses" (`gencpu.cpp`), together with instruction cache and prefetch emulation. Its release notes describe the mode as approximate. cputester checks cycles for "68000/68010, Amiga only".
- **EASy68K's** bit-field cycles track the cache case (§2.9).

So no emulator offers an exact, context-free per-instruction 68020 cycle count, and the manual says none exists. The available choices are:

- a deterministic per-instruction figure, which is Musashi's cache case;
- a context-dependent model tuned to hardware, as in Moira and WinUAE, which needs the cache, the prefetch and the bus speed.

### 3.4 What a 68020 dialect's cycle counter should report

**Recommendation:** the M68020UM **cache case**, summed per instruction, with the §8.2.1–8.2.5 EA tables added as the footnotes direct.

Why:

- It is published and deterministic, so Undo, Testcases and tasks 30/31 stay reproducible.
- It agrees with Musashi, so it can be cross-checked.
- EASy68K's bit-field timing already approximates it.
- It needs no cache model.

Present it as an estimate. The status or hover could say "68020 timing is the manual's cache case; real time depends on the cache and on overlap with neighbouring instructions", and show the BC–WC range for the instruction.

**Alternatives:**

- Report the worst case: an upper bound, and the number for cache-disabled code.
- Report nothing under the 68020 dialect, with tasks 30/31 returning 0.

Both are weaker for teaching, since the CC numbers already show which instructions are expensive.

---

## 4. Verification options for the 68010 and 68020

### 4.1 Single-step suites

**None exist for the 68010 or 68020.**

- The [SingleStepTests organisation](https://github.com/SingleStepTests) has `680x0` (directories `68000` and `map` only) and `m68000`, whose maintainers call it "very 68000 specific" ([m68000#4](https://github.com/SingleStepTests/m68000/issues/4)).
- Its other suites are 8088, 8086, 80186, 80286, 80386, V20, Z80, 65x02, 65816, SM83, SPC700, SH4, R3000, ARM7TDMI, HuC6280 and TLCS900H.
- A web search found no other 68010 or 68020 single-step suite.

The 68000 suite cannot be reused unfiltered for the other dialects. Measured here:

- **MOVEfromSR:** 1,232 of 2,500 tests start in user mode and expect the 68000's unprivileged store.
- **RTE:** the 1,214 supervisor tests pop a 6-byte frame with no format word.
- **Exception frames:** every test that takes an exception expects a 68000 frame. That is about 38% of DIVU and DIVS, mostly address errors.
- **Odd-address word and long accesses** expect address errors that the 68020 does not raise.
- **The 68020 cases from §2.1:** the index words with bits 10–8 set and the `$FF` branch displacements.

A filtered run is useful as a regression check of the shared instruction semantics under the 68010/68020 dialects: no exception, supervisor-insensitive, no indexed modes for the 68020, and no cycle check. It is not an oracle for what differs.

### 4.2 Musashi as a differential reference from Rust

**What it is:** MIT; version 4.10 per `readme.txt`; it emulates the 68000, 68010, 68EC020, 68020, 68EC030, 68030, 68EC040 and 68040.

**Measured here: building it.** It built and ran natively in one `gcc` invocation:

1. Compile `m68kmake.c` and run it on `m68k_in.c`. It generates `m68kops.c` and `m68kops.h`: "Generated 1967 opcode handlers from 518 primitives".
2. Compile `m68kcpu.c`, `m68kops.c`, `m68kdasm.c` and `softfloat/softfloat.c` with `-lm`. `m68kcpu.c` includes `m68kfpu.c` and `m68kmmu.h`.
3. The host supplies `m68k_read_memory_8/16/32`, `m68k_write_memory_8/16/32` and `m68k_read_disassembler_8/16/32`.
4. `m68k_init()` must be called first, or the probe segfaults.

**Measured here: a probe.** It ran `moveq #-128,d0`, `$49C0` (`extb.l d0`) and `$42C1` (`move ccr,d1`):

| CPU   | `m68k_is_valid_instruction` and `m68k_disassemble`  | Execution                            |
| ----- | --------------------------------------------------- | ------------------------------------ |
| 68000 | `$49C0` and `$42C1`: invalid, `dc.w $49c0; ILLEGAL` | `extb.l` takes vector 4 in 34 cycles |
| 68010 | `$49C0` invalid; `$42C1` valid, `move CCR, D1`      | `$49C0` takes vector 4 in 38 cycles  |
| 68020 | both valid: `extb.l D0`, `move CCR, D1`             | 2 and 4 cycles                       |

**Practicality as a Rust dev-dependency:**

- **Build:**
    - `build.rs` compiles and runs `m68kmake` for the host, or the two generated files are vendored;
    - the `cc` crate compiles the four C files, with a `MUSASHI_CNF` config header;
    - the Rust test crate defines the memory callbacks as `#[no_mangle] extern "C"` functions.
- **Stepping:** `m68k_execute(1)` steps one instruction; Moira's runner uses exactly this. But the first call after `m68k_pulse_reset()` only consumes the reset cycles, so a harness should either call it once after reset or set state through `m68k_set_reg`.
- **Global state:** Musashi keeps one CPU context in a global, so differential tests must be serialised with a mutex or run as one test.
- **Licences:** MIT, plus SoftFloat 2b's licence. Neither matters for a dev-dependency that is never shipped.
- **Oracles it provides:** `m68k_is_valid_instruction(word, cpu)` for decoder legality per dialect, and `m68k_disassemble(…, cpu)` for disassembler cross-checks. Its syntax differs from EASy68K's, so only the operation and operands can be compared.
- **Estimate:** about 1–2 days for the harness. It shares the state loader with the MAME runner.

**Known weaknesses:**

- no 68010 loop mode;
- address errors are emulated only in 68000 mode (`history.txt` 3.4);
- the 68010 format `$8` RTE pops the frame rather than continuing, and the 68020 RTE raises a format error on `$A`/`$B` ("bus fault not emulated" in the opcode table);
- `callm`/`rtm` are "not properly emulated", and `rtm` only logs "called unimplemented instruction";
- Moira's runner skips ABCD, SBCD, NBCD and all BFxxx when comparing with Musashi, as "broken in Musashi";
- 68020 timing is the flat cache case (§3.3).

### 4.3 Moira

- **What it is:** C++20 with an MIT core; the CPU of vAmiga.
- **Coverage:** it emulates the 68000, 68010, 68EC020 and 68020, and its disassembler covers up to the 68040 (`Documentation/HowTo/HowToUseTheCpu.md`).
- **Strengths for the 68010:**
    - it implements 68010 loop mode (`Moira.h`, `loopModeDelay` and the `*_LOOP` handlers);
    - it times the 68000 and 68010 precisely;
    - it is validated against cputester disk images for the 68000, 68010, 68020, 68030 and 68040, which ship in `Cputester/` (§4.4).
- **Its own differential runner** against Musashi and binutils is GPL-3 (`Runner/config.h`).
- **Using it from Rust** needs a small `extern "C"` shim over a C++ subclass, compiled with `cc` in C++20 mode. Its template-heavy cores make the build slower than Musashi's.
- **Verdict:** the better 68010 oracle, especially for loop-mode timing; slightly more build work (about 2–3 days with the shim).

### 4.4 Toni Wilen's cputester (WinUAE)

**What it is:** a generator built from UAE's CPU core (`gencpu` with `CPU_TEST=1`). It writes binary test sets that a native m68k program then runs on real hardware ([readme](https://github.com/tonioni/WinUAE/blob/master/cputest/readme.txt)).

**What it checks:**

- the registers, the FPU registers, exception stack frames and memory writes;
- every CCR combination, every addressing mode (68020+ modes optional), and T0/T1/S/M combinations;
- loop mode;
- cycles, but only "68000/68010, Amiga only".

**Status per CPU:**

| CPU   | Status                                                                                                               |
| ----- | -------------------------------------------------------------------------------------------------------------------- |
| 68000 | "Complete. Including bus and address error stack frame/register/CCR modification undocumented behavior."             |
| 68010 | "Almost complete … Loop mode is also fully supported. NOTE: DIVS overflow undocumented N-flag is not fully correct." |
| 68020 | "Almost complete (DIV undocumented behavior is not yet known)". The 68030 is the same.                               |

The RTE tests cover only frame types 0, 2 and 8. MMU and cache instructions are not tested.

**Prebuilt sets:** Moira's [Cputester/HDF](https://github.com/dirkwhoffmann/Moira/tree/master/Cputester) ships them as Amiga hard-disk images, run under Kickstart 2.04:

- `simple_000` through `simple_040`;
- `AEDST_010`, `IRQ_010`, `LOOP2/3/4/6_010`, `ODDEXC_010`, `ODDIRQ_010`, `ODDSTK_010`;
- `BASIC_020`, `BASIC1_020`, `BASIC2_020`;
- `FBASIC_040`.

**Using it from s68k is impractical:**

- The runner is an AmigaOS (or Atari, `atari.S`) program that loads files through the OS.
- The generator is a WinUAE build target.
- Reading the data from Rust would mean extracting files from an Amiga filesystem image, then reimplementing the undocumented binary format from GPL-2 sources (`cputest/main.c`, `cputest.cpp`).
- The licence of the generated data is not stated.

**Estimate:** 5–10 days, with licence questions. It is better used indirectly: Moira is the core that passes it.

### 4.5 m68k-rs (the `m68k` crate)

- **What it is:** pure Rust and MIT ([README](https://github.com/benletchford/m68k-rs/blob/master/README.md)). It models the 68000 to the 68060, the EC/LC variants and the SCC68070, including an FPU and an MMU.
- **Its validation:**
    - the MAME 68000 suite, with all cycle and bus-access totals matching;
    - Musashi's 68000 and 68040 test binaries;
    - its own per-generation tests, for example `m68010_tests.rs`, `m68020_tests.rs`, `loop_mode_timing_tests.rs`, `illegal_extb_pack_tests.rs` and `illegal_ccr_tests.rs`.
- **Practicality:** as a `[dev-dependencies] m68k = "0.14"` it is the cheapest differential reference: no FFI, no build script, and a per-instance CPU. Its `step()` returns cycles and surfaces A-line, F-line, TRAP, BKPT and illegal instructions to the host.
- **The caveat:** it is not independent. Beyond its own tests, its 68010/68020 behaviour is checked against Musashi's binaries.
- **Verdict:** a third opinion beside Musashi and Moira, not a hardware-derived oracle.

### 4.6 Self-checking programs

- **Musashi's `test/mc68000/*.s`:** 60 programs; MIT; usable unchanged under every dialect.
- **Musashi's `test/mc68040/*.s`:**
    - **Coverage:** `bfchg`, `bfclr`, `bfext`, `bfffo`, `bfins`, `bfset`, `bftst`, `cas`, `chk2`, `cmp2`, `divs_long`, `divu_long`, `interrupt`, `jmp`, `mul_long`, `rtd`, `shifts3` and `trapcc`, added in October 2025 (`git log`).
    - **How they are built:** `m68k-elf-as -march=68040`, run with `M68K_CPU_TYPE_68040` (`test/Makefile`, `test/test_driver.c`).
    - **Use for s68k:** they exercise 68020 user-mode integer instructions, and some use `move.w %ccr,%d1`. So they suit a 68020 dialect.
    - **Caveat:** the provenance of their expected checksums (hardware or emulator) is not stated.

### 4.7 GNU binutils as an encoder and decoder cross-check

- **Assembler options:** `-m68000`, `-m68010` and `-m68020`, or `-march=`/`-mcpu=`.
    - The default "is normally the 68020", so the 68000 cross-check must pass `-m68000` explicitly, or 68020 forms such as `bra.l` would be accepted ([M68K options](https://sourceware.org/binutils/docs/as/M68K_002dOpts.html)).
    - `-m68881` is the default for the 68020; `-mno-68881` for the 68000 and 68010.
- **Disassembler:** `objdump -m m68k:68000`, `m68k:68010` or `m68k:68020`, among others (`bfd/cpu-m68k.c`). The selected machine restricts which **instructions** are accepted (`arch_mask` in `opcodes/m68k-dis.c`).
- **Measured here, from the source:** objdump does not restrict the **index word**. `print_indexed` always treats bit 8 as the full format, and `print_index_register` always prints a scale from bits 10–9, whatever the machine.

    So for the 68000 dialect, objdump mis-decodes a legal 68000 instruction whose brief word has bits 10–8 set, including its length. Two consequences:
    - Comparisons must use canonical encodings (bits 10–8 clear), as an assembler produces.
    - Hand-made words should be cross-checked with Musashi's disassembler instead.

    This also affects the 68000-only plan in [decision 35](../design/m68k-machine.md).

---

## 5. How assemblers let the source choose the processor

| Assembler         | Command line                                                                                            | In the source                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Source                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| vasm (mot syntax) | `-m68000` (default), `-m68010`, `-m68020`, … , `-m68020up`, `-m68881`/`-m68882`, `-m68851`              | Three ways:<br>• `machine <cpu_type>`, with 68000…68060, 68080, 68851, 68881, 68882, cpu32 or ColdFire;<br>• `mc68000` … `mc68060`;<br>• `fpu <cpID>`;<br>• `opt p=<type>[/<type>]`, which "Sets the CPU type to any model vasm supports (Devpac only allows 68000-68040, 68332, 68881, 68882 and 68851)".<br>`__VASM` has one bit per CPU.                                                                                                                                      | [vasm §25.2.1, §25.4, §25.5](http://sun.hasenbraten.de/vasm/release/vasm_25.html)                           |
| Devpac (HiSoft)   | —                                                                                                       | `OPT P=68020` (also `P=68020/68881`), per the vasm manual above. The Devpac 3 manual itself was not consulted.                                                                                                                                                                                                                                                                                                                                                                   | vasm §25.5                                                                                                  |
| GNU as            | `-m68000`, `-m68010`, `-m68020`, `-march=`, `-mcpu=`                                                    | `.arch name` and `.cpu name`: "This directive cannot be specified after any instructions have been assembled." Repeats must agree. `.chip 68020` (and `CHIP 68020` with `-M`) is the MRI-compatible form. It has no such check (`mri_chip` in `tc-m68k.c`) and takes `/68881` and `/68851` suffixes.                                                                                                                                                                             | [M68K directives](https://sourceware.org/binutils/docs/as/M68K_002dDirectives.html); `gas/config/tc-m68k.c` |
| ASM-One / AsmPro  | —                                                                                                       | Not verified. No in-source CPU directive was found in the material available. AsmPro's 1.20 release notes refer to "the selected CPU", which suggests an environment setting.                                                                                                                                                                                                                                                                                                    | (unverified)                                                                                                |
| EASy68K 5.16.1    | Options dialog: "Assemble Bit Field Instructions" (simulator: "Enable Bit Field Instructions", or `/b`) | `OPT BIT`. It writes `*[sim68k]bitfield` into the `.L68` listing, which the simulator reads to enable bit fields. There is no `NOBIT` and no other CPU selection.<br>`OPT` takes comma-separated **alphanumeric** words (`CRE`, `MEX`, `NOMEX`, `SEX`, `NOSEX`, `WAR`, `NOWAR`, `CEX`, `NOCEX`, `BIT`; only the first 8 characters of each are read), and anything else is a syntax error. So `OPT P=68020` is an error in EASy68K, as every 68010/68020 instruction already is. | ASM/DIRECTIV.CPP:564-630, ASM/INSTLOOK.CPP:114-116, HELP/Directives/opt.htm                                 |

### Which spelling would surprise EASy68K users least

`OPT P=68010` / `OPT P=68020`.

- EASy68K users already reach for `OPT`, and `OPT BIT` is the EASy68K precedent for enabling non-68000 instructions.
- `P=` is the Devpac spelling, and vasm accepts it in its default mot syntax, so such a source stays portable to vasm.
- `MACHINE 68020` and `MC68020` (vasm) introduce a directive EASy68K users have never seen.
- `.cpu`/`.arch` (GNU) bring a dotted directive style EASy68K does not use.

Whatever the spelling, it should obey three rules:

- **One CPU per Program.** It must come before the first instruction, as GNU requires. Repeats with the same value are harmless. A different value is an error, because the decoder, the frames and the timing are whole-program properties.
- **The Program carries it,** like `memory` ([decision 15](../design/m68k-machine.md)): it travels with the source, a Playground fence and the S-record listing, and the editor only displays it.
- **`OPT BIT` keeps its EASy68K meaning** in the 68000 dialect (§2.9), and is implied by `P=68020`.

---

## 6. Recommendation

### 6.1 Scope per dialect

| Dialect             | First scope                                                                                                                                                                                                                                                                                                                                                                                                            | Leave out                                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **68000** (default) | As designed, plus `OPT BIT` as in EASy68K (optional).                                                                                                                                                                                                                                                                                                                                                                  | —                                                                                                                                                               |
| **68010**           | **Complete:**<br>• MOVE from CCR, RTD, BKPT, MOVEC (SFC, DFC, USP, VBR), MOVES;<br>• privileged MOVE from SR, VBR;<br>• format `$0` frames, and the format `$8` frame for bus and address errors, with RTE resuming at the stacked PC;<br>• RTE format checks and the format error;<br>• Section 9 timing with loop mode;<br>• VBR, SFC and DFC in the System register file.                                           | True instruction continuation from the 16 internal words: model them as zeros or reserved, and document that RTE restarts at the stacked PC, as Musashi does.   |
| **68020**           | **As a 68EC020** (24-bit bus, keeping the 16 MB map, devices and SSP):<br>• all user-mode integer instructions in §2.2 except CALLM/RTM, and all addressing modes in §2.1;<br>• unaligned data;<br>• SR with T1/T0 and M, ISP/MSP with the `$1` throwaway frame, frames `$0`/`$2`;<br>• CACR and CAAR stored with no cache behind them;<br>• F-line without a coprocessor as vector 11;<br>• cache-case timing (§3.4). | The FPU, the MMU and the instruction cache model. CALLM/RTM as unsupported or illegal, documented. Bus fault frames `$A`/`$B` simplified like the 68010's `$8`. |

### 6.2 What is shared and what is per dialect

Every reference core shares one handler per instruction and gates it by CPU:

- **Musashi:** per-CPU mode and cycle columns in one table, plus `CPU_TYPE_IS_*` checks.
- **Moira:** `AVAILABILITY(Core::…)` and `CYCLES_68000/68010/68020` inside one templated handler.
- **UAE:** a "CPU level / privilege level" column in `table68k`, for example `MVSR2.W` marked "unprivileged only on 68000".
- **binutils:** an arch mask per opcode.

s68k should do the same:

| Shared                                                                                                         | Per dialect                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Instruction`/`Operand` types, ALU and flag code, operand access and the executor for every common instruction | A minimum CPU per decoder entry and per assembler form. A word outside the dialect is an illegal instruction, or a privilege violation as the tables say.                                                                                                                                                     |
| One decoder and one disassembler, one encoder and one assembler front end                                      | **Extension-word interpretation:** the 68000/68010 ignore bits 10–8 of the brief word; the 68020 has the scale and the full format (§2.1). **The `$FF` branch displacement**, and the meaning of `bra.l` in the assembler (word on the 68000 per [decision 5](../design/m68k-machine.md), long on the 68020). |
| Exception dispatch: priorities, vector fetch, the "no handler" termination                                     | The frame builder and RTE parser (6/14 bytes; formats `$0`/`$8`; formats `$0`/`$1`/`$2`(/`$A`/`$B`)), the vector base (0 or VBR), stack pointers (USP/SSP or USP/ISP/MSP), the SR mask (`$A71F` or `$F71F`) and trace modes.                                                                                  |
| Memory, the memory map and devices                                                                             | Data alignment checks (68000/68010 only); the address width, 24 bits in all three recommended dialects.                                                                                                                                                                                                       |
| The cycle counter and journaling                                                                               | Timing tables: M68000UM Section 8, Section 9 with loop mode, and the M68020UM cache case.                                                                                                                                                                                                                     |
| Editor plumbing                                                                                                | The register file rows (VBR, SFC, DFC; then CACR, CAAR, MSP, ISP); Documentation entries tagged with their minimum CPU, completions and hovers filtered by dialect; the "Exception vectors" region following VBR.                                                                                             |

**Making the 68000 work dialect-ready** costs little if it is done while building the 68000 decoder and frames ([plan](../design/m68k-machine-plan.md) C2 and C4): a CPU column in the opcode table, a dialect parameter in the EA decoder, and the frame builder behind one function. Estimate **+1–2 days**. Retrofitting later costs more.

### 6.3 Stages and rough cost

These are person-days on top of the 68000 machine plan, at the same granularity as that plan.

**Stage 1: dialect plumbing and a complete 68010 (≈ 10–15 days)**

| Work                                                                                                                                                | Days |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `OPT P=`, `Program.cpu`, the Core API, availability gates in the assembler and decoder, an editor indicator, the S-record warning (§6.4), docs tags | 2–3  |
| MOVE from CCR, RTD, BKPT, MOVEC, MOVES, privileged MOVE from SR                                                                                     | 1–2  |
| VBR, format `$0`/`$8` frames, RTE checks and the format error, register file rows, Memory region                                                    | 3–4  |
| Section 9 timing with loop mode, and Moira's MUL/DIV models                                                                                         | 3–4  |
| A differential harness against Musashi, m68k-rs or Moira (reused by stage 2), and hand tests for frames and loop mode                               | 2–3  |

**Stage 2: the 68020 as a 68EC020, user-mode integer set (≈ 22–34 days)**

| Work                                                                                                        | Days |
| ----------------------------------------------------------------------------------------------------------- | ---- |
| Addressing modes: syntax, pass-1 sizing, encoder, decoder, executor, disassembler, EA timing                | 6–9  |
| `Bcc.L`/`BSR.L`, and EXTB, CHK.L, LINK.L, the TST/CMPI forms, TRAPcc, PACK/UNPK                             | 2–4  |
| MUL.L and DIV.L family                                                                                      | 2    |
| CHK2/CMP2, CAS/CAS2                                                                                         | 2–3  |
| Bit fields                                                                                                  | 2–3  |
| Unaligned data, SR `$F71F` with T1/T0, ISP/MSP with M and the `$1` frame, frames `$0`/`$2`, MOVEC additions | 3–5  |
| About 35 Documentation entries, with completions, hovers and grammar                                        | 3–4  |
| Tests: Musashi's mc68040 programs, the differential harness, GNU `as -m68020` encodings                     | 2–4  |

**Stage 2b: the 68020 cycle counter, cache case (≈ 3–5 days).** It can ship after stage 2, with the counter showing "not modelled" until then.

**Not recommended for now:**

| Work                                         | Days         |
| -------------------------------------------- | ------------ |
| CALLM/RTM                                    | 3–5          |
| Real bus-fault continuation (`$8`/`$A`/`$B`) | 4–8          |
| Instruction cache model                      | 3–5          |
| Full 32-bit 68020 bus with a sparse memory   | 2–4          |
| 68881/68882 FPU with frame `$9`              | 30–60        |
| MMU                                          | out of scope |

**What else changes:**

- **The S-record Build output** ([decision 32](../design/m68k-machine.md)) stops being runnable in EASy68K for any non-68000 Program, except bit fields under `OPT BIT`. The Build should say so.
- **The MAME suite** keeps validating only the 68000 dialect (§4.1).

### 6.4 The alternative: keep `extb.l` and `move ccr,<ea>` as lenient 68000 extensions

**Measured here:**

- **Decoder legality.**
    - **Which words change:** 58 opcode words decode differently from a 68000:
        - `$42C0`–`$42F9` (50 words), MOVE from CCR with a data-alterable destination;
        - `$49C0`–`$49C7` (8 words), EXTB.L.
    - **What a real 68000 does:** raises an illegal instruction (vector 4) for each. EASy68K's simulator does the same: `$42C0` decodes as CLR with an invalid size, and `$49C0` as LEA with Dn, both `BAD_INST` (EASy68K fact base §12).
    - **The oracles agree:** both Harte's `map/68000.official.json` and Musashi's `m68k_is_valid_instruction(…, 68000)` mark them invalid.
    - **What it does not change:** no legal 68000 word changes meaning, because both slots are unused on the 68000.
- **The MAME suite has no test that expects these words to be illegal.**
    - **Generic illegal tests:** its only illegal-instruction files are `ILLEGAL_LINEA` and `ILLEGAL_LINEF`. There is no `ILLEGAL` (`$4AFC`) file, no generic illegal-opcode file, and no MOVE from CCR file.
    - **The `$4xxx` files:** every file in the `$4xxx` opcode group was scanned, 42 files and 105,000 tests (145,000 across the 58 files read). No test executes any of `$42C0`–`$42FF`, `$49C0`–`$49C7`, BKPT, RTD, MOVEC, LINK.L, CHK.L, MUL.L, DIV.L or `$4AFC`.
    - **CLR and LEA in particular:** CLR tests use only sizes `00`–`10` (`$4200`–`$42B9`, 50 opcodes per size). LEA uses its 224 control-mode opcodes.

    So leniency is invisible to the conformance oracle. Only the opt-in legality cross-checks need an allowlist of the 58 words. The GNU `as -m68000` comparison must skip the two forms, since it rejects `extb.l` and `move %ccr,%d0`.

- **Other consequences:**
    - **EASy68K compatibility:** an S68 Build output containing these instructions traps or halts in EASy68K, which breaks [decision 32](../design/m68k-machine.md)'s promise for those programs.
    - **Cycles:** the 68000 has no timing for them. 68010 figures for MOVE from CCR (4, or 8+EA) and EXT's 4 for EXTB.L would have to be borrowed.
    - **Teaching:** students learn two instructions that EASy68K, real 68000 boards and exam environments reject.
    - **A machine that never existed:** a 68000 with the 68010's MOVE from CCR but without the 68010's privileged MOVE from SR, and with one 68020 instruction.
- **Is it defensible?**
    - **Defensible:** as an opt-in, or as a warned compatibility path for saved programs. EASy68K sets the precedent by executing 68020 bit fields on its 68000, but only behind `OPT BIT` or an option that is off by default, and documented as an educational extension.
    - **Not defensible:** as a silent default. It contradicts [decision 1](../design/m68k-machine.md) ("a 68000 as EASy68K simulates it") and EASy68K's own statement that it "does not include support for any other non 68000 instructions".
- **Cost:** about 0.5–1 day for decoding, timing, the warning and the allowlist.

**If dialects are adopted, a cheaper middle path:** the assembler refuses both instructions in 68000 Programs with a two-part hint:

- the 68000 equivalent: `ext.w`+`ext.l`, or `move sr,<ea>`;
- or "add `OPT P=68010`" (for `move ccr`) or "`OPT P=68020`" (for `extb.l`) at the top.

The editor can offer the `OPT` line as a quick fix, so saved programs migrate in one click and the 68000 stays a 68000.
