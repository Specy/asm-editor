# Instruction categories and tags

Status: decided on 2026-10-18 in a grill session and implemented the same day, uncommitted, following [instruction-categories-plan.md](./instruction-categories-plan.md), which records the verification. Terms are in [CONTEXT.md](../../CONTEXT.md) (**Instruction category**, **Instruction form**, **Instruction tag**). Where the data comes from is [ADR 0051](../adr/0051-instruction-categories-in-the-editor-tags-from-the-core.md).

## What it is

Each instruction's **Documentation entry** names the kind of work it does (arithmetic, loads and stores, control flow…), so the Instructions **Chapter** and the documentation sidebar can list instructions in groups rather than as one flat list of 200 or more mnemonics. Its forms also carry tags for facts that cut across those groups, such as being a pseudo-instruction.

## Decisions

1. **What a category is for.** It groups the instruction list and labels each instruction. Filtering a search by category and comparing categories across languages were not asked for.
2. **One shared list.** The editor defines the list once. Each language uses the categories that apply to it, and adds one of its own only where nothing in the shared list fits.
3. **Exactly one per mnemonic.** Its main job decides it, whatever each of its forms does: M68K `move` is Data movement even though one form writes `sr`.
4. **The list**, in the order it is shown:

    | Category           | Covers                                                                                                                                                                                                                             | Used by            |
    | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
    | Data movement      | Register copies, immediates and addresses (`li`, `la`, `lui`, `auipc`, `mv`, `mfhi`), exchanges, conditional moves, and every mnemonic that copies both between registers and to or from memory (M68K `move`, x86 `mov`, Z80 `ld`) | all                |
    | Load and store     | Instructions whose only job is moving a value between a register and memory: MIPS `lw`/`sw`/`lb`/`ulw`, RISC-V `lw`/`sd`/`lwu`, M68K `movem`                                                                                       | MIPS, RISC-V, M68K |
    | Stack              | `push`/`pop`, `link`/`unlk`, `pea`, `enter`/`leave`                                                                                                                                                                                | M68K, x86, Z80     |
    | Arithmetic         | Add, subtract, multiply, divide, negate, increment and decrement, sign and zero extension, decimal (BCD)                                                                                                                           | all                |
    | Logic              | And, or, xor, not, single-bit test, set and clear, bit counting (`clz`, `cpop`)                                                                                                                                                    | all                |
    | Shifts and rotates |                                                                                                                                                                                                                                    | all                |
    | Comparison         | `cmp`, `tst`, set on condition (`slt`, `seq`, `scc`, `setcc`)                                                                                                                                                                      | all                |
    | Control flow       | Branches, jumps, calls, returns, loops (`dbcc`, `djnz`)                                                                                                                                                                            | all                |
    | Floating point     | Everything on the FPU's registers, its loads, stores, compares, conversions and branches included: `add.s`, `flw`, `lwc1`, `c.eq.s`, `fcvt`, `mfc1`, `bc1t`                                                                        | MIPS, RISC-V       |
    | Atomic             | `ll`/`sc`, `lr`/`sc`, `amo*`, `cmpxchg`, `xadd`, `sync`, `fence`                                                                                                                                                                   | MIPS, RISC-V, x86  |
    | Block and string   | Z80 `ldir`/`cpir`, x86 `movs`/`stos`/`cmps`                                                                                                                                                                                        | Z80, x86           |
    | Input/output       | Port instructions only: Z80 `in`/`out`/`otir`, x86 `in`/`out`                                                                                                                                                                      | Z80, x86           |
    | System             | `syscall`, `ecall`, `trap`, breakpoints, interrupts, `halt`/`stop`, `nop`, CSRs, coprocessor 0, flag register instructions                                                                                                         | all                |

5. **Precedence.** Floating point and Atomic outrank Load and store: `flw` and `lwc1` are Floating point, and `lr.w` and `ll` are Atomic.
6. **Syscalls are System.** `syscall`, `ecall` and `trap #15` ask the environment for any service, not only input and output, so they are System. "How do I print" is answered by the Syscalls and Trap tasks Chapters.
7. **Tags.** Pseudo-instruction, RV64 only, Undocumented and Privileged, from one shared list, and 68010 and 68020, the first M68K processor of a form a later processor brought ([m68k-machine.md](./m68k-machine.md), decision 3). A tag belongs to a form. A mnemonic shows a tag beside its name only when every one of its forms has it (RISC-V `li`, Z80 `sll`, x86 `sysret`); otherwise the tag sits on the forms that have it in the page's list of forms.
8. **Privileged is the processor's rule.** It marks forms the real processor reserves for supervisor or kernel mode. On a 68000 those are `move <ea>,sr` and `andi`, `ori` and `eori` with `sr` as destination; `move sr,<ea>` became privileged only on the 68010, and the `ccr` forms never were. `rte`, `stop` and `reset` are refused by s68k and have no entries. s68k runs every program in supervisor mode, as EASy68K does, so on M68K the tag explains a form rather than predicting a fault, and the M68K Documentation says this once.
9. **Sources (ADR 0051).** Categories come from an editor table per language under `src/lib/documentation/<language>/`, with a test that every documented mnemonic has exactly one; x86's table is seeded from NASM's `section`, then corrected where a section mixes kinds (its "Conditional instructions" holds both `cmovcc` and `setcc`). Tags come from the Cores: MARS and RARS gain a per-form pseudo-instruction export, and s68k's instruction table gains a Privileged flag per form. RISC-V's `isRv64Only` and the Z80's `undocumented` and `isPseudo` already exist. x86 reads NASM's `PRIV` and `UNDOC` from its generated data.
10. **Where they show.**
    - Browsing: the Instructions Chapter in the Workbench's Documentation panel shows the categories in the order of (4), with mnemonics alphabetical under each. The sidebar of the documentation site did too until the owner made it one alphabetical list again ([instruction-layout-plan.md](./instruction-layout-plan.md), decision 32).
    - Searching: the groups drop away and results come back best first ([ADR 0025](../adr/0025-documentation-is-a-list-of-entries.md)), each row carrying its category.
    - The instruction's page and its expanded row name its mnemonic-level tags, and the list of forms shows each form's tags. They named its category too until the shared instruction layout left that to the sidebar and the Chapter's headings ([instruction-layout-plan.md](./instruction-layout-plan.md), decision 30).
    - The editor's hover shows the tags. It showed the category too until the owner dropped it on 2026-10-30 to shorten the hover, which the Documentation's grouping does not need.
11. **Search text.** The category's name is indexed with the entry, as x86 already indexes its NASM section, so "shift" or "atomic" matches every member. A large group (Floating point has about 100 mnemonics on MIPS and on RISC-V) is still cut at the panel's 30 results; browsing is how a whole group is seen.

## Follow-ups

- **The M68K lecture.** "The M68K instruction set" teaches a six-way map (Moving data, Arithmetic, Logic and bit operations, Comparing and testing, Changing execution order, Processor and system operations). Align it with M68K's categories through the course rewrite process, not as part of this change.

## Open

- **Which form a hover is on.** The hover shows the tags of the form under the cursor. Where the language service cannot tell which form a line uses, it shows the mnemonic-level tags. For now only Z80 can tell (the plan's decision 7).
- **Mapping each mnemonic.** The per-mnemonic calls at the edges (sign extension, `lea`, MIPS conditional traps, Z80 `rst`, x86 `cmovcc`) are made while writing the tables, following the main-job rule (3).
- **Privileged on MIPS and RISC-V.** MARS and RARS do not mark kernel-mode forms (`mfc0`, `mtc0`, `eret`). They get the tag only if their Cores add the flag.
