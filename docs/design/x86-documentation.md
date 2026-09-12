# x86 documentation: where the data comes from

Sourcing study written on 2026-09-12 and implemented the same day; the implementation is recorded at
the end. It answers one question: what can an x86 instruction reference, a directive page, a register
page and a syscall page be built out of, given that the editor is AGPL-3.0 and Intel's manual is not
ours to ship. Every number below is produced by [`scripts/x86-docs-coverage.mjs`](../../scripts/x86-docs-coverage.mjs),
which parses the sources and joins them; re-run it with `--fetch` on a clean checkout.

## Why x86 cannot follow the other languages

Every other language reads its documentation out of its Core at import time: `MIPS.getInstructionSet()`
and `RISCV.getInstructionSet()` carry a description and an example per instruction, and `@specy/z80`
ships `mnemonicMap` with flags, timings and opcodes. `@specy/x86` exports emulator and assembler
plumbing only (`BlinkRuntime`, `assemblers`, `nasmDiagnostics`, the project helpers); there is no
instruction table in it and nothing upstream to add one to, because blink decodes x86 rather than
describing it. So x86 is the M68K case: the data lives in the editor. What follows is how much of it
can be generated instead of typed.

## Scope

- An instruction reference: which forms assemble, what each instruction does, which extension it
  belongs to.
- The assembler's own surface: directives, the preprocessor, prefixes, size specifiers.
- Registers and flags, and the Linux syscalls a program here can actually make.
- Interactive examples, the way the other languages have them.

Out of scope: documenting the gas and fasm front ends. `DEFAULT_ASSEMBLER_ID` is NASM, both usable
prose sources are NASM syntax, and the gas manual is GFDL, which we cannot fold into an AGPL page.
The other assemblers get a link.

## The sources

### Already vendored, and true for the toolchain we assemble with

| File                                                          | What it gives                                                                                                                                                                                                               | Licence |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `emulators/x86/wasm_nasm/nasm/x86/insnsn.c`                   | Every mnemonic NASM 3.00 accepts, condition forms (`jz`, `setnbe`, `cmovg`) already expanded. 2642 of them once the pseudo-ops are dropped.                                                                                 | BSD-2   |
| `emulators/x86/wasm_nasm/nasm/x86/insns.xda`                  | The macro-expanded instruction table: operand forms, encodings, CPU level and feature flags, under the 112 `;#` section headings NASM builds its own manual from. 8588 forms after templates are expanded onto their names. | BSD-2   |
| `emulators/x86/wasm_nasm/nasm/asm/tokens.dat`                 | 53 prefixes and specifiers in 38 groups: `lock`, `rep`, `o64`, `byte`/`qword`, `abs`/`far`/`near`.                                                                                                                          | BSD-2   |
| `emulators/x86/wasm_nasm/nasm/doc/*.src`                      | The NASM manual: `directiv.src`, `preproc.src`, `macropkg.src`, `syntax.src`, `64bit.src`. The directive and assembler-feature pages come from here.                                                                        | BSD-2   |
| `emulators/x86/libblink/blink/syscall.c` and `blink/strace.h` | 179 syscalls with number, name, arity and per-argument types (`FD`, `I_BUF`, `BUFSZ`).                                                                                                                                      | ISC     |

The first two matter more than their size suggests: they are the only sources that are true by
construction. A form listed in `insns.xda` is a form this editor accepts, because it is the table the
vendored assembler compiles from. The same holds for the syscall table: it lists what blink
implements, not what Linux defines, which is the distinction a reader hits the moment a program
calls something unimplemented.

### Fetched and cached, not vendored (see the licence question below)

- **`insref.src`**, NASM's own "x86 Instruction Reference" appendix, pinned at `nasm-2.05.01`. 337
  entries in NASM syntax, each with a form table and prose. Removed from NASM in 2.06; the tree was
  relicensed from LGPL to BSD-2 in 2.07, so the last released copy of this file carries the old
  licence.
- **`x86_64.xml`** from the [Opcodes project](https://github.com/Maratyszcza/Opcodes) (BSD-2,
  Facebook and Georgia Tech). 1441 mnemonics with a one line summary each, plus operand direction,
  implicit registers and the ISA extension, current to AVX-512 and AMX. Its README declares the gaps:
  no x87, no string instructions, no `LOCK`/`REP` prefixes, no privileged instructions.

### Looked at and rejected

- **ref.x86asm.net** (`x86reference.xml`) is the only free source with structured flags-affected data
  per instruction. Its licence requires the author's permission to publish any derived file, plus
  attribution and no printed sales. Usable only after asking MazeGen, so it is not on the critical
  path.
- **felixcloutier.com/x86**, the Intel SDM and the AMD APM are Intel's and AMD's copyright. They are
  the right target for a "full reference" link per instruction, never a source to copy.
- **Wikipedia's x86 instruction listings** are CC BY-SA 4.0. One-liners, with share-alike reaching
  into whatever page includes them. Last resort.
- **iced, Zydis, asmjit** are permissive and carry flags read, written, set, cleared and left
  undefined per instruction, with no prose. They are the answer to the flags gap if we want one that
  is generated rather than written.

## Measured coverage

```
node scripts/x86-docs-coverage.mjs
```

|                                      | mnemonics   |
| ------------------------------------ | ----------- |
| accepted by NASM 3.00                | 2642        |
| with insref prose                    | 565 (21.4%) |
| with an Opcodes summary but no prose | 1096        |
| with neither                         | 981 (37.1%) |

The flat percentage is misleading, because it is dominated by the vector extensions nobody documents
by hand either. Per section, for the sections a course reaches into:

| Section                               | mnemonics | prose | summary |
| ------------------------------------- | --------- | ----- | ------- |
| Integer data move instructions        | 3         | 1     | 1       |
| Load effective address                | 1         | 1     | 1       |
| The basic 8 arithmetic operations     | 8         | 8     | 8       |
| Bitwise testing                       | 1         | 1     | 1       |
| The basic shift and rotate operations | 14        | 8     | 12      |
| Other basic integer arithmetic        | 9         | 8     | 9       |
| Sign and zero extension               | 14        | 6     | 9       |
| Bit operations                        | 8         | 8     | 6       |
| Stack operations                      | 23        | 9     | 2       |
| Jumps                                 | 56        | 41    | 33      |
| Conditional instructions              | 121       | 91    | 60      |
| Call and return                       | 13        | 4     | 2       |
| Interrupts, system calls, and returns | 18        | 13    | 3       |
| Flag register instructions            | 20        | 16    | 7       |
| String instructions                   | 26        | 21    | 2       |
| No operation                          | 2         | 1     | 1       |

Against what the editor already highlights, `X86Instructions` in
[`X86-grammar.ts`](../../src/lib/languages/X86/X86-grammar.ts): 383 names listed, 323 of the 369 that
NASM accepts have prose (87.5%).

The grammar list is also wrong in both directions, which the join makes visible:

- 14 names NASM does not accept as instructions: `lock`, `rep`, `repe`, `repne`, `repnz`, `repz` and
  `wait` are prefixes and belong to `tokens.dat`; `cmps`, `ins`, `lods`, `movs`, `outs`, `scas` and
  `stos` are the string operations, which NASM spells with the size suffix (`movsb`, `stosq`).
- 2275 accepted names it does not list.

Generating the grammar's instruction list from `insnsn.c` fixes both and removes a hand-maintained
list. That is a separate change from the documentation, and a cheap one.

## What the join has to handle

1. **Templates.** Both NASM's table and insref write families as patterns: `Jcc` for the 30
   condition spellings, `SETcc`, `CMOVcc`, `CCMPscc` for the APX conditional compares, and `POPAx`
   and `PUSHFx` for size families. The script expands a pattern against the accepted mnemonic list
   rather than hardcoding suffixes, so a suffix is whatever turns a template into a name NASM
   accepts. Two traps: `adcx` and `bndldx` end in `x` and are names, not templates (only spellings
   NASM does not accept are expanded), and `CCMPscc` puts an `s` in front of the condition.
2. **Size-suffixed names insref predates.** NASM spells the operand size into names like `retq`,
   `pushfw` and `enterd`; insref documents the base only. A blind "strip the trailing w/d/q" rule
   would attach prose to 60 more mnemonics and is wrong at least once: `aadd` is the APX atomic add,
   not `aad`. This needs a reviewed alias map, written once, not a rule.
3. **insref is a 2008 document.** Of its 1248 form lines, 2 name a 64 bit operand. Its prose is still
   right, because `ADD` still adds, but its form tables are not: they stop at `ADD r/m32,imm32` while
   the editor runs 64 bit programs. So forms always come from NASM 3.00 and insref contributes prose
   only. Its own form table is kept in the merged record under `proseForms` for diffing, and is not
   rendered.
4. **Dangling cross references.** The prose points at five tables (condition codes, SSE condition
   predicates, register values, effective address encoding, status flags) that `nasm-2.05.01` no
   longer contains. There are 15 such references. They resolve to sections we write ourselves.

A merged record today looks like this (`--sample jnz`, abridged): NASM 3.00 forms including
`sdword64|near` with its `X86_64,LONG` flags, the Opcodes summary `Jump if not zero (ZF == 0)`, the
`Jcc` prose with its markup converted to markdown, and
`https://www.felixcloutier.com/x86/jnz` as the reference link.

## Proposed decisions

1. **Generate, then commit.** A script reads the five in-repo tables plus the two cached files and
   writes `src/lib/languages/X86/X86-documentation.ts`, which is committed. Not derived at import
   time like the Z80, because two of the inputs are not npm packages, and not hand-written like the
   M68K, because 8588 forms are not worth typing.
2. **Forms from NASM 3.00, always.** Prose never contributes a form.
3. **Prose in three tiers:** insref where it exists, the Opcodes summary where it does not, and a
   felixcloutier link on every entry regardless. An entry with neither renders as its form table and
   its section heading, which is still more than nothing.
4. **Hand-write the taught set.** The instructions the courses use get descriptions in the project's
   voice, the way M68K's are written, replacing the generated prose per mnemonic. The generated
   corpus is the floor, not the ceiling.
5. **Syscalls are generated from blink**, not from the Linux man pages, so the page says what works.
6. **Directives and the preprocessor come from the vendored NASM manual**, converted the way insref
   is converted.
7. **Prefixes, size specifiers and `abs`/`far`/`near` get their own page** from `tokens.dat`; they are
   not instructions and the grammar currently pretends they are.

## What no source gives us

- **Flags affected per instruction.** insref mentions flags in prose when it feels like it; the
  Opcodes XML has none; NASM's table has none. Either lift it from iced or asmjit (permissive,
  generated) or write it for the taught set only. The Z80 page sets the expectation that a flags
  table is there, so this is the one real gap.
- **The condition code, register value and status flag tables** the prose cross references.
- **Examples.** Every other language's documentation has runnable snippets. `MIPS.getInstructionSet()`
  ships one per instruction; for x86 they are ours to write, and only for the taught set.

## Open questions

1. **The insref licence.** The last released copy is LGPL (NASM went BSD-2 one release later, with a
   relicensing agreement covering the same authors). LGPL 2.1 or later upgrades to GPL-3, which
   combines with our AGPL-3, so shipping it with its notices intact is defensible. The alternatives
   are to ask the NASM authors to confirm the BSD-2 relicence covers it, or to use only the BSD-2
   Opcodes summaries and write the rest. This decision gates whether `insref.src` is vendored or
   stays a cached fetch.
2. **Whether to ask MazeGen** for permission on `x86reference.xml`, which would close the flags gap
   with structured data instead of hand writing it.
3. **How many instructions the documentation pages should show at all.** 2642 mnemonics is a search
   problem, not a page. The Z80 panel caps groups; MIPS and RISC-V list everything because there are
   a few hundred. x86 probably wants the taught set by default with everything behind a filter.
4. **Whether the x86 course lands first.** `docs/courses/plan.md` defers it until the syntax settles,
   and the taught set is defined by that course.

## What was built, 2026-09-12

Every proposed decision above was taken as written. The parsers live in
[`scripts/x86-docs/sources.mjs`](../../scripts/x86-docs/sources.mjs), shared by the coverage script
and by [`scripts/x86-docs-generate.mjs`](../../scripts/x86-docs-generate.mjs), which writes five
committed modules under `src/lib/languages/X86/generated/`:

| Module               | Holds                                                                                                              | From                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `x86Instructions.ts` | 2642 instructions, 8165 operand shapes, each with the oldest processor that has it, its extension and its notes    | `insns.xda`, `insnsn.c`, `iflags.ph`, Opcodes summaries                            |
| `x86Mnemonics.ts`    | the names alone, so highlighting does not pull the table                                                           | `insnsn.c`                                                                         |
| `x86Descriptions.ts` | 586 descriptions, converted to markdown                                                                            | `insref.src`                                                                       |
| `x86Syscalls.ts`     | 181 syscalls with numbers, arity and argument types                                                                | `syscall.c`, `strace.h`                                                            |
| `x86Tokens.ts`       | directives, standard macros, preprocessor directives, prefixes, size specifiers, 344 register names, flag meanings | `directiv.dat`, `standard.mac`, `pptok.dat`, `tokens.dat`, `regs.dat`, `iflags.ph` |

[`X86-documentation.ts`](../../src/lib/languages/X86/X86-documentation.ts) is the curated layer on
top: the documented set, the written descriptions that outrank the generated ones, the registers,
the flags, the condition code table, the directive and syscall prose, and the accessors the pages
and the editor use.

### What the join needed beyond the plan

Four things the study did not predict, each now covered by a test:

1. **Templates can be infix, and they can collide.** `CMPccXADD` puts its condition in the middle,
   and `CCMPscc` spells it `scc`. Worse, expanding a template by prefix match hands `Jcc` every name
   beginning with `j`, which gave `jmp` and `jecxz` the conditional branch description. Expansion now
   runs over NASM's own condition list, so a template can only produce names that condition actually
   makes.
2. **Merging encodings overstates what an instruction needs.** `setg r/m8` exists twice, as a P6
   instruction and as an APX re-encoding; taking the union of their extensions made `setg` an APX
   instruction and dropped it out of the documented set. A shape now keeps the features of its
   oldest encoding.
3. **The appendix wraps headings and quotes TeX style.** `\S{insAAA}` runs its title onto a second
   line, which was landing in the prose and turning the form tables into examples, and `` `mental' ``
   reads as an unclosed code span in markdown. Both are handled in the converter; no description now
   ships unbalanced backticks.
4. **blink answers three syscalls outside its dispatch table.** `exit`, `exit_group` and
   `clock_gettime` never reach the traced table, so they were missing entirely: `exit` most of all,
   which every program calls. They are read from the case arms instead, and their argument names are
   written in the curated layer because a trace signature is the only place the others declare theirs.

### Coverage as built

263 of the 273 documented instructions carry prose from the appendix (96%), and five of the ten left
over are written by hand here, so 268 of 273 say something. The documented set is the twenty integer
sections minus anything that needs an extension in every form, which is what keeps the 100 APX
conditional moves, the 30 `CMPccXADD` forms and the BMI2 shifts off the sidebar; they stay on the
complete documentation page with their forms.

### The pages

- `/documentation/x86` and `/documentation/x86/{instruction,directive,registers,syscall,all}`,
  mirroring the Z80 routes, with a page per documented instruction under `instruction/[name]`.
- The instruction pages carry a runnable example, generated the way the Z80's are:
  [`example.ts`](../../src/routes/documentation/x86/instruction/[instructionName]/example.ts) fills
  the widest form it can with concrete registers, writes out the ones that need a label, a pointer or
  a cleared `rdx`, and returns null for the 43 that long mode dropped or that stop the program.
  `X86Examples.test.ts` assembles all 226 of them against the real assembler and runs twelve.
- `X86Documentation.svelte` puts the same content in the editor's floating panel.

### The editor

`X86-grammar.ts` lost its 880 hand written lines: the mnemonics, registers, directives and
specifiers now come from the generated tables, so the highlighter cannot claim a word the assembler
rejects. Hover shows the summary, the processor level, the forms and the first paragraph of the
description with a link to the page; completion shows the summary as its detail; signature help
shows the six widest real forms instead of `destination, source`.

The language detector reads the wider list too. Its own test is new: the x86 and Z80 programs are
told apart, AVX is recognised, and the RISC-V templates are recorded as being read as MIPS, which
they were before this work.

## Still open

- Question 1, the `insref.src` licence, is unchanged: the file stays a cached fetch and the prose it
  produces is committed with its notice in the header of `x86Descriptions.ts`.
- Flags affected per instruction: still nothing. The condition code table says which flags each
  condition reads, and no instruction says which it writes.
- The x86 course, which is what would define the taught set that deserves hand written prose. Five
  instructions have it today (`syscall`, `movabs`, `cdqe`, `cqo`, `movsxd`), chosen because the
  appendix predates them or because they mean something particular here.
