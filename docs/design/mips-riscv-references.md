# MIPS and RISC-V instruction pages: the manual link, the audit and written descriptions

Started 2026-10-27, after the same work for x86 ([x86-documentation.md](./x86-documentation.md),
"Intel's SDM preview"). A MIPS or RISC-V page shows a long name, one summary sentence, its forms,
the operand legend and a runnable example, and a MIPS page also MARS's own one or two lines. This
record covers the manual link and the audit that were added, and the written descriptions that were
tried and paused.

## Sources

- **The RISC-V ISA manual**, CC BY 4.0, served versioned at
  [docs.riscv.org](https://docs.riscv.org/reference/isa/v20260120/unpriv/rv32.html). It is written
  by chapter, not by instruction, but marks its rules with anchors (`norm:add_op`,
  `norm:fcvt-l-s_fcvt-w-s_op`) and gives each bit-manipulation instruction a section
  (`insns-andn`).
- **The RISC-V Unified Database**, [riscv/riscv-unified-db](https://github.com/riscv/riscv-unified-db):
  one YAML file per instruction under `spec/std/isa/inst`, BSD-3-Clause-Clear, with the extension
  that defines it, the widths that have it, its encoding and its operation. Its hosted
  per-instruction pages were the first choice for the link, and were dropped: they exist for about
  80 of the 197 real instructions the Core accepts (`add` has one, `mul`, `ld`, `addw` and
  `fadd.s` answer 404), and its newer documentation site does not load.
- **MIPS** has no openly licensed reference. Its pages rest on the MARS Core's own simulation code
  (`packages/mips/mars/.../InstructionSet.java`), which is what a program here actually meets.

## The RISC-V manual link

Every real RISC-V instruction links to the rule or section of the pinned manual (`v20260120`) that
defines it, labelled "RISC-V manual: sra", in the page header and in the hover, like x86's "Intel's
reference". A pseudo-instruction links to the instruction it becomes, `mv` to `add`, `call` to
`jalr`, `la` to `auipc`; the label names that instruction. 262 of the 263 mnemonics have a link,
all to an anchor; `uret`, which the manual no longer has, has none.

`node scripts/riscv-docs-generate.mjs --udb <checkout>` finds each instruction's page through the
extension the database names, fetches the manual's pages into `.cache/riscv-docs`, picks the anchor
(`scripts/riscv-docs/manual.mjs`) and writes the names-only extract
`scripts/riscv-docs/manual-links.txt`. Without `--udb` it only joins that extract with the Core's
instruction list into `src/lib/languages/RISC-V/generated/riscvManual.ts`, with no network.

## The audit

`node scripts/riscv-docs-udb-audit.mjs <checkout>` assembles every real form's own example with
the Core, at each width that has it, and checks the word against the database's encoding; it also
checks that a page says "RV64 only" exactly where the database has the instruction on RV64 alone.
The first run found nothing: all 197 mnemonics encode as the database says, and the width tags
agree. `uret` is the one expected difference.

## Written descriptions (paused)

A page can show `src/lib/documentation/{riscv,mips}/instructions/<name>.md`, beside the example,
after the operand legend. It follows the summary instead of restating it, so it is shown whole, and
the summary stays the entry's summary in search. Search reads it as a field of its own, `detail`,
weighted 0.5 against the text's 1: a first description pushed MIPS `div` out of the top three for
"divide and get the remainder" (a longer text field, and "get" matching `getc`, `getchar` and
`getenv` by prefix), and the lower weight keeps the existing ranking while adding the new words.
`instructionExamples.test.ts`, which used to assert that descriptions were deferred
([instruction-examples.md](./instruction-examples.md)), now checks that a description links only
instruction pages of its own language that exist.

No description ships. Ten written by hand in an edge-case style (masks, traps, what the emulator
does at the limits), and a `jalr` written by Codex (`gpt-6.1-terra`) and revised after a fact
review, first in that style and then for a learner, were all judged not good enough by the owner
on 2026-10-27, and removed. The loading and the search field stay, unused, for when the work
resumes. What was learned: a page is for a student learning what the instruction is and how to use
it, not for its edge cases or the emulator's internals.

## Still open

- Every MIPS and RISC-V description, paused by the owner.
- A prose review of the hand-written long names and summaries against the same sources.
