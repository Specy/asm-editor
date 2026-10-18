# One instruction layout: implementation plan

Status: written on 2026-10-18 after the grill recorded in [instruction-layout.md](./instruction-layout.md) (decisions 1-12, [ADR 0052](../adr/0052-instruction-documents-are-built-in-the-editor-from-core-facts.md)), and implemented the same day, uncommitted (see [State](#state)). The user left the remaining calls to me ("write an implementation plan with your own decisions then implement"); they are decisions 13-28 below, marked as mine, 23-28 made while implementing; 29-33 are the owner's reviews of the result. Mechanical writing (long names, summaries) ran on Haiku agents, the rest on Opus.

## Planning decisions (mine, 2026-10-18)

13. **MIPS and RISC-V keep their register placeholders.** Rows keep MARS's `$t1 $t2 $t3` and RARS's `t1 t2 t3` (and `$f0`, `f1`…) as the register symbols, because every per-form description names them ("Set $t1 to contents of effective memory word address"); renaming them to `$rt`/`$rs` would make every note disagree with its row. Only the example values become symbols: `-100` is `imm16` (signed), `100` is `uimm16`, `100000` is `imm32`, `10` is `imm5`, `label`/`target` is `label`. This narrows decision 7's illustration (`lw $rt, imm16($rs)`); the rule it states, symbols explained by the legend instead of silent example values, holds.
14. **Width chips are for operand sizes only.** x86 rows carry chips for the sizes they come in (`8 16 32 64`, the size of the first sized operand). MIPS and RISC-V immediates of different widths in one Form pattern merge into `imm` with no chips: the width there is about encoding, not about what the program means, and the expanded row lists each concrete form with its own note and expansion (`li $t1, imm` stands for the 16-bit signed, 16-bit unsigned and 32-bit forms).
15. **x86 `nolong` forms.** They are left out only when the mnemonic has forms that work in 64-bit mode. The 25 documented mnemonics with no 64-bit form (`aaa`, `pusha`, `into`…) keep their forms, and the header says "Not available in 64-bit mode". NASM's `LONG` note is dropped as redundant once the list is 64-bit; `LOCK` and `LOCK1` read "takes LOCK"; `OBSOLETE` reads "removed from the architecture".
16. **x86 operand decorators read as NASM writes them.** `imm8 {short}` is written `short imm8`, `imm32 {near}` is `near imm32`, `imm16:imm16 {far}` is `far imm16:imm16`; the decorator is part of the Form pattern, so `jmp short imm` and `jmp near imm` are separate rows.
17. **Z80 classes.** `r` is A B C D E H L (a second one is `r'`), `rr` a register pair, `cc` a condition, `b` a bit number 0-7. The IX form stands for IY too, as the Registers and flags Chapter's `(ix+dd)` entry already says ("`iy` works the same way"), so `ld ix, nnnn` and `add a, (ix+dd)` cover their IY forms and the legend says so. A row whose forms cover only part of a class says which on its fact line (`ld ixh, r` takes A B C D E). The row's note is the forms' own sentence with the class members replaced by the symbols, used only when that gives one sentence for every form of the row; otherwise each form keeps its own sentence in the expanded row.
18. **M68K operands.** An operand position with one addressing mode is written as that mode (`Dn`, `An`, `#imm`, `sr`, `ccr`, `label`), one with several as `<ea>`. The expanded row lists, per operand, the modes it takes as chips, and names the set where it is one of the 68000's classes (all modes, data, memory, control, alterable, data alterable, memory alterable). s68k's mode names become the manual's: `Im` is `#imm`, `Ea/<label>` is `abs` (an absolute address or a label).
19. **Tag badges keep each language's accent.** The badges are drawn in the language's own theme colour (`--accent2`), which is why the critique saw grey on MIPS, blue on RISC-V and green on the Z80. That is the theme, not drift: within one language every badge matches. With tags said once per section (decision 3) most badges go anyway.
20. **Typography.** On the page, the description keeps the documentation's prose style. Everything else the view draws (header facts, section headings, notes, fact lines, the legend) is in the UI font, and every code fragment in the editor font, so a row never mixes three families.
21. **Examples.** Their content is not redesigned here (x86 and Z80 examples stay generated, M68K's hand-written ones stay). The example frame keeps its components; its glitches go to the follow-ups unless they sit in the documentation's own components.
22. **Hovers.** Each language's instruction hover starts with the mnemonic's long name and its summary from the shared tables, then keeps what it shows today. The name tables are small modules of their own, so the hovers import them without loading the documentation.

23. **The flags strip says what most rows do.** When the rows of a mnemonic disagree, the strip shows the most common marks and only the rows that differ carry their own on their fact line, with a line under the strip saying so. Z80 `ld` has 35 rows of which two touch the flags (`ld a, i`, `ld a, r`); with decision 5 as written, all 35 would have said "flags unchanged". A tie goes to the first row.
24. **Rows with a sentence of their own share one box.** A note shared by several rows heads their box (MIPS `lw`'s pseudo-instructions); consecutive rows that each have their own note (most of the Z80's) are one box with the note under each row, which reads as a table rather than 28 boxes.
25. **A panel row's signature is its first Form patterns.** The text after the mnemonic in a Documentation panel row and a search result is the operands of the first three untagged Form patterns (`r/m, reg | reg, r/m | r/m, imm`), bracketed when the operands are optional (`[imm16]`), the same rule for every language; x86 leaves out its accumulator and `moffs` encodings, which the general rows cover. This replaces MIPS's `$reg, [imm($reg) / imm / id / …]` and four other rules.
26. **Hovers show the document, not only its header.** Decision 22 said the hover starts with the long name and summary; it now draws them from the same document as the page: the name and long name with the italic line (category, tags, header facts), the summary, the flags as one line, the first six Form patterns with their sizes, facts and section tags, and the page's link. The Z80's line for the exact form under the cursor stays, between the heading and the rest.
27. **Every long name is written.** The tables name every mnemonic in sentence case, one per mnemonic so a family's members are told apart (`loopz` is "Loop while zero", not the appendix's shared "Loop with Counter"); the derivation rules stay as the fallback a test keeps unused. x86's summaries were rewritten in one voice for 64-bit code, where NASM's appendix still speaks of `SP` and `ESP`.
28. **Left-out forms open in place.** The line saying which x86 forms the list leaves out opens to list them, with their extension, instead of linking to the "Complete documentation" page: that page lists the mnemonics that need an extension in every form, not an integer instruction's APX forms, and the prerender caught the link pointing nowhere.
29. **The owner's review, 2026-10-18 evening.** The mnemonic's long name and category sit beside the name, muted, on one line that wraps after the dot rather than before it; a click anywhere on a row opens it (its toggle covers the row, the symbols and chips stay above it); the flags legend is a row of separate pills, "Reads" one of them; an opened row's mode lists have room around them and a space before "(memory alterable)".
30. **The owner's second review.** The header no longer names the **Instruction category**, which the sidebar and the Chapter's headings already group by (the hover keeps it on its italic line), and the long name is quieter still. An opened row lists each form highlighted as the editor highlights it, beside the real instructions it becomes in a tinted box, the expansion going under its form when the row is too narrow, with no indentation beyond the row's own text. The Operands legend's lines are ruled apart, and every piece of running text on the page stops at 80ch. The description has room above and below it.
31. **The owner's third review.** The boxes of Form patterns and the Operands legend are drawn with rules and no fill: the box's edge, a rule under its note and between its rows, a dashed rule between the forms of an opened row. A form and its expansion sit in the same tinted code box with an arrow icon between them, the form's box filling its column up to the arrow and its own sentence above the pair, across the row; forms that are only their code (`add a, b`, `add a, c`…) flow along a line instead of one a line. The header's tags are centred on the long name.
32. **The documentation sidebar is alphabetical again.** The site's sidebar lists a language's instructions in one alphabetical list, for finding a mnemonic by name; the Workbench's Documentation panel (and the language's "all" page) keeps them under their **Instruction categories**, with the category heading pinned edge to edge under a rule and a soft shadow so the rows read as passing beneath it. This reverses the sidebar half of [instruction-categories.md](./instruction-categories.md) decision 10.
33. **Small rows.** Rows alone with their note, or with none, share one box with any note under its row; a row that cannot open leaves no room for a toggle unless another row of its box has one, so the names still line up; RARS's "Alias for fscsr t1" reads "Same as `fscsr t1`."

## The shape

`src/lib/documentation/instructions/document.ts`, plain data (it crosses SvelteKit's `load`):

```ts
type InstructionDocument = {
    name: string                    // the mnemonic
    longName: string
    summary: string                 // one sentence, plain text
    category?: InstructionCategory
    tags: InstructionTag[]          // tags every form has
    headerFacts: string[]           // facts every row shares
    flags?: FlagStrip               // decision 5
    sections: FormSection[]         // decision 3, in order: untagged, then by tag set
    omitted?: { count: number; reason: string; href?: string }  // decision 10
    operands: OperandSymbol[]       // decision 7, only the symbols used on the page
    description?: string            // markdown, when there is more than the summary
}
type FormSection = { tags: InstructionTag[]; collapsed: boolean; groups: NoteGroup[] }
type NoteGroup = { note?: string; patterns: FormPattern[] }
type FormPattern = {
    parts: SyntaxPart[]             // { text, symbol? }: symbols link to the legend
    chips: { label: string; title?: string }[]   // x86 sizes
    facts: string[]                 // decision 4
    flags?: FlagMarks               // only when the mnemonic's patterns differ
    forms: ConcreteForm[]           // what expanding shows
    details: { label: string; values: string[]; note?: string }[]  // M68K modes per operand
}
type ConcreteForm = { code: string; note?: string; facts: string[]; expansion?: string }
type FlagStrip = { order: string[]; marks: FlagMarks; legend: FlagMarkKind[] }
type FlagMarks = Record<string, { kind: FlagMarkKind; title?: string }>
type FlagMarkKind = 'changed' | 'cleared' | 'set' | 'undefined' | 'unchanged'
type OperandSymbol = { symbol: string; meaning: string; href?: string }
```

`instructions/formPatterns.ts` holds the one grouping algorithm every adapter calls: concrete forms in, each operand classified by the language (`classify(operand, position) → { symbol, member, width? } | literal`), forms merged when their symbols, decorators, tags and splitting facts match, first-appearance order kept, then sections by tag set and groups by note. A row never merges forms whose tags differ (decision 2).

## Milestones

**M1. Shape, grouping and view** (Opus, me).
- `document.ts`, `formPatterns.ts` + `formPatterns.test.ts`.
- `src/components/documentation/instruction/InstructionDocumentView.svelte` with `density: 'page' | 'panel'`, and its parts: `InstructionHeader`, `FlagStrip`, `FormSectionList` (rows, chips, fact lines, expand, "Show all" past six rows in the panel, collapsed Undocumented on the page), `OperandLegend` (hover/tap on a symbol shows its line). Phone: the fact line drops under the syntax; no table scrolls sideways.

**M2. Adapters**, each `src/lib/documentation/<language>/instructionDocument.ts` with a test (Opus).
- x86 (me, as the reference): decisions 14-16, header processor level, notes in words, omitted line, legend for `reg r/m imm mem moffs acc segreg creg dreg`.
- Z80: decision 17, facts `N bytes · M cycles` (`taken/not taken`), flags per pattern from the Core's flag string, strip when every pattern agrees.
- MIPS and RISC-V (one shared MARS adapter): decision 13, notes from the per-form descriptions with the "Title :" prefix and stray whitespace removed, a note dropped when it repeats the description, RV64 only as a section.
- M68K: decision 18, sizes in the header when every form shares them (with the default size), flags strip from `affectsFlags`.
- Row order follows the language's manual where the source order puts rare forms first (x86 `mov`'s `moffs`).

**M3. Long names and summaries** (Haiku writes, Opus checks).
- `src/lib/documentation/<language>/instructionNames.ts`: `Record<mnemonic, { longName: string; summary?: string }>`.
- Derived first: MARS/RARS "Title :" prefix and first sentence of the main form's body; x86 Opcodes summary (long name) and the first sentence of the appendix text (summary); M68K first sentence. The tables supply what is missing or reads badly ("ADDition", "Branch if EQual"), all of the Z80's, and every M68K long name.
- A test per language: every documented mnemonic has a long name and a summary; summaries are one sentence.

**M4. Pseudo-instruction expansions** (Opus agent, Cores).
- MARS and RARS export each form's template (`JsInstruction`), with the TypeScript wrapper and type; built locally (`vp run build:<core>`), not released.
- The MARS adapter rewrites the placeholders (`RG1`, `VL2`, `VH2`, `$1`…) into the row's symbols; a template with a placeholder it does not know shows no expansion, and a test reports how many forms get one.

**M5. x86 data** (Opus agent).
- Flags from Intel XED (Apache-2.0) through `scripts/x86-docs-generate.mjs` into `generated/x86Flags.ts`, per mnemonic, with the attribution in the generated header and the licence notice where the others are.
- The description bugs the critique found, in the same script: raw `\c{MOV DS,EAX}`, references that lost their link ("see the condition codes"), doubled parentheticals ("DEC ( DEC )").

**M6. Wiring** (me).
- `EntryView` gets one `{ type: 'instruction'; document: () => InstructionDocument }`, built lazily and cached; `EntryBody` draws it with the panel density; the four per-language views, `MarsVariantList`, `X86InstructionForms`, `M68KInstructionForms`, `Z80FlagsCell` and `DocsOperand` (if unused elsewhere) go.
- The five instruction routes build the document in `+page.server.ts` and draw `InstructionDocumentView` with their example in a snippet; the page's title, meta and JSON-LD use the long name and summary.
- Entries' `summary` (search rows) and the hovers use the new long name and summary.

**M7. Checks.**
- `vp test`, `svelte-check`, lint, a production build, the search goldens (re-recorded only where a better summary moved a result, with the reason).
- Headless Chrome: two instructions per language at 1440×900 and 390×844, and the panel for `mov`, `ld` (Z80), `lw` (MIPS), `move` (M68K); no horizontal page scroll at 390.

## State

Implemented on 2026-10-18 on `feat/pseudocode`, nothing committed.

- **Shared:** `instructions/document.ts` (shape, `documentSignature`, `descriptionAfterSummary`), `instructions/formPatterns.ts` (the grouping), `instructions/hoverLine.ts` (`documentHover`), the view in `src/components/documentation/instruction/` (`InstructionDocumentView`, `FormPatternRow`, `FlagStrip`, `OperandLegend`, `InstructionPageHead`). `EntryView` has one `instruction` type; the per-language views, `MarsVariantList`, `X86InstructionForms`, `M68KInstructionForms`, `Z80FlagsCell`, `InstructionFormList`, `formGroups.ts`, `m68kForms.ts`, `z80DocsUtils.ts` and `DocsOperand` are gone.
- **Adapters:** `x86/`, `z80/`, `mars/` (MIPS and RISC-V, with `expansion.ts`), `m68k/`, each with `operands.ts`, `instructionNames.ts` and tests. Row counts: x86 `mov` 65 forms to 14 rows, `add` 38 to 4; Z80 `ld` 192 to 35, `set` 192 to 4; MIPS `lw` 12 to 9 (one real form, then pseudo-instructions under three notes); M68K unchanged in count.
- **Cores (M4):** MARS `JsInstruction.expansion` / `compactExpansion`, RARS `getExpansion()`, built locally with smoke tests, in the `packages/mips` and `packages/risc-v` submodules on top of the uncommitted `isPseudo` work. Not released.
- **x86 data (M5):** `generated/x86Flags.ts` from Intel XED v2026.08.23 (vendored extract `scripts/x86-docs/xed-flags.txt`, `XED-LICENSE.txt`), 270 of 273 instructions; the description generator's raw markup, lost cross references and doubled names fixed (0 left of 20, 60, 129).
- **Data fixes:** M68K descriptions (typos, `dbra`, `lea`, `clr`, `divs`/`divu`, `asl`/`asr`), family members' condition words, `asr` clearing V.
- **Checks:** the whole suite (4887 tests), `svelte-check`, `vp lint`, eslint; headless Chrome on every language at 1440 and 390 wide and in the panel.

## Follow-ups (not in this plan)

- Example content: the x86 and Z80 examples are one boilerplate; the critique found the M68K ones the best model.
- Example frame glitches: the Build bar over the last lines, clipped comments, an empty console box on x86 and Z80, the Z80 register panel listing PC twice, the x86 register panel cut mid-row.
- Publishing the MARS and RARS releases with the template export and bumping the editor's dependency.
- Core bugs found on the way: the Z80 assembler reads `rst` operands as decimal (`rst 38h` and `rst 0x38` fail, `parseInt(token, 10)` in `makeTrieNodeFromVariants`); RARS adds its 64-bit pseudo-instructions after the 32-bit ones although they should win, so on RV64 `li t1, 0x7ffff800` assembles the RV32 way and sign-extends; RARS's 64-bit `li` form is not tagged RV64 only.
- Shared code: give `templateNote` the row's sibling forms and let the algorithm assign primes (the Z80 adapter copies the row key to do it); link a `ConcreteForm` back to its input (the MARS adapter keys by code).
