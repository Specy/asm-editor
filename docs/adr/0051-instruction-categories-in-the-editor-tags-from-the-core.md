---
status: accepted
date: 2026-10-18
---

# Author Instruction categories in the editor and read Instruction tags from the Cores

Each instruction's **Documentation entry** gets one **Instruction category**, which groups the Instructions **Chapter** and is named on the instruction's page, and its **Instruction forms** get any number of **Instruction tags**. The categories come from one shared list that the editor defines. Each language maps its mnemonics onto that list in a table under `src/lib/documentation/<language>/`, editor-owned like its Instruction examples ([ADR 0038](./0038-instruction-examples-are-authored-in-the-editor.md)), and a test checks that every documented mnemonic has exactly one. The tags come from the Core that assembles the form, in the same way [ADR 0021](./0021-register-files-from-core-exports.md) reads Register files and [ADR 0042](./0042-memory-regions-from-core-layout-exports.md) reads layouts. The split follows what each one is: a category is a teaching vocabulary that runs across all five languages, while a tag (Pseudo-instruction, RV64 only, Undocumented, Privileged) is a fact about how the assembler and the processor treat a form, and it has to change when the Core does.

## Considered options

- Both authored in the editor: rejected for tags. MARS and RARS decide which forms are pseudo-instructions, and they share mnemonics with real instructions (`lw $t1, label` beside `lw $t1, -100($t2)`, `add` with an immediate). A table in the editor would go stale the first time a Core's pseudo-instruction table changed, and nothing would notice.
- Both exported by the Cores: rejected for categories. Every Core would have to carry the editor's shared list and agree with the other four about where `push`, `slt` or `lea` belongs. These are teaching choices, and they would then have to be released five times. The Cores remain packages that can be used outside the editor.
- x86 grouped by NASM's own sections, as its Extensions Chapter already is: rejected as the grouping. NASM has 20 documented integer sections, too many for a sidebar and sharing no words with the other languages. The `section` field stays x86 data and seeds that language's mapping, though not alone: NASM's "Conditional instructions" holds both `cmovcc` (Data movement) and `setcc` (Comparison).

## Consequences

- MARS and RARS need a new export saying, per form, whether it is a pseudo-instruction, and s68k's instruction table needs a Privileged flag per form. RISC-V's `isRv64Only` and the Z80's `undocumented` and `isPseudo` already exist. x86 has no instruction table of its own, so its tags come from NASM's, which the generated x86 data already carries (`PRIV`, `UNDOC`). The Cores release before the editor reads the new fields.
- Privileged is the processor's rule, not the emulator's. s68k runs every program in supervisor mode, as EASy68K does, so an M68K form tagged Privileged still runs, and the M68K Documentation says so once.
- A mnemonic shows a tag beside its name only when every one of its forms has it, so a fact that holds for only some forms never misdescribes a mixed mnemonic such as `lw` or M68K `move`.
