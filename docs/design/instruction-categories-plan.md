# Instruction categories and tags: implementation plan

Written on 2026-10-18 after the design interview. The decisions are in [instruction-categories.md](./instruction-categories.md), the data sources in [ADR 0051](../adr/0051-instruction-categories-in-the-editor-tags-from-the-core.md), the vocabulary in [CONTEXT.md](../../CONTEXT.md) (**Instruction category**, **Instruction form**, **Instruction tag**). The plan covers four Core changes (MARS, RARS, s68k, Z80), five classification tables, and the editor's entries, search, panel, documentation site and hovers. Implemented on 2026-10-18 (M0 to M5) and verified the same day by the editor's suite, `vp check`, lint, a production build, each touched Core's tests and a headless Chrome pass ([Verification](#verification-2026-10-18)); uncommitted, in the editor and in the four Core submodules.

## Starting point

Checked on 2026-10-18 in this checkout. Paths are under `packages/asm-editor/src/` unless they name a package.

| Area                     | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documented sets          | MIPS `mipsInstructionNames` 224 mnemonics (623 forms); RISC-V `riscvInstructionNames` 263 (382 forms, read with the Core switched to 64 bit); x86 `x86DocumentedNames` 273 of NASM's 2642; Z80 `z80InstructionNames` 68 (1296 forms); M68K 69 entries in `instructionsDocumentationList`, about 126 names once families are expanded (`M68KUncompoundedInstructions`, `beq` from `bcc`).                                                                                                                                                                                                                                                                                                                        |
| Entry builders           | Each language builds its Instructions Chapter inline: `documentation/mips/mips.ts:33-63`, `riscv/riscv.ts:37-67`, `m68k/m68k.ts:69-96`, `x86/x86.ts:177-211`, `z80/z80.ts:111-141`. No shared helper; MIPS and RISC-V use `withInstructionContent` (`documentation/instructions/resolve.ts:5-23`). `documentationProblems()` (`entries.ts:225-252`) runs for every language in `documentation.test.ts`. Only MIPS and RISC-V have an `instructionContent.ts`.                                                                                                                                                                                                                                                   |
| Panel                    | `components/documentation/browser/DocumentationBrowser.svelte`: browsing renders each Chapter's entries in order (:397-405); searching calls `searchClient.search(scope, text, 30)` (:135) and renders results in the engine's order (:325-358), rebuilding rows from the index with `fromIndex()` (:183-199) where the entry is not loaded. `EntryRow.svelte` cannot tell browsing from searching. `EntryBody.svelte` switches on the view type (:45-109). `x86.test.ts:130-131` asserts the Chapter is alphabetical, so grouping happens at render time.                                                                                                                                                      |
| Forms on screen          | MIPS and RISC-V: `MarsInstructionView.svelte` groups forms by identical description and shows an RV64 badge per group; the pages list "Variants" as markdown bullets. RISC-V appends " (64bit)" to RV64-only descriptions (`languages/RISC-V/RISC-V-documentation.ts:7`). x86: `X86InstructionForms.svelte` (:38-42) already shows each form's notes as lowercase badges (`priv`, `undoc`). Z80: the page's Variants table shows an "undocumented" badge (:137-144); `isPseudo` is shown nowhere, and `dedupeZ80Variants` (`z80DocsUtils.ts:13-21`) merges pseudo spellings into their canonical row. M68K: **no list of forms** anywhere; `InstructionDocumentation.args` is one merged mode list per operand. |
| Site                     | Every `routes/documentation/<lang>/+layout.svelte` passes a flat name list to `components/documentation/site/InstructionsMenu.svelte`, reading the data modules, not the entries. Index pages group A to Z. `/all` pages render `DocumentationBrowser` with `variant="page"`, so panel grouping covers them.                                                                                                                                                                                                                                                                                                                                                                                                    |
| Search                   | `search/documents.ts:20-36` turns an entry into an `EntryDocument` (`payload.ts:118-136`); `engine.ts:264-265` builds `context` = chapter title and signature (boost 1.2) and `text` (boost 1). The palette shows `result.entry.chapterTitle` (`SearchPalette.svelte:204`). Golden queries (`search/golden/*.json`) at risk from category words: RISC-V "floating point registers" and "control and status registers", x86 and MIPS "what is the stack". Vectors are cached by a hash of the embedding text.                                                                                                                                                                                                    |
| Hovers                   | One provider per language, none shared, none reading entries: `M68K-language.ts:316-384`, `MIPS-language.ts:345-401`, `RISC-V-language.ts:376-437`, `X86-language.ts:355-417`, `Z80-language.ts:506-563`. None works out which form a line uses. Z80's completion does, exactly (`analyzeLine` and `walkTrie`, :125-210), but `variantOf` maps a pseudo spelling to its canonical variant, so `node.variant.isPseudo` must be read directly. MIPS and RISC-V hover tests require the markdown to start with `**name**`; x86 and Z80 have no hover tests.                                                                                                                                                        |
| MARS (`packages/mips`)   | `JsMips.getInstructionSet()` (`marsjs/.../JsMips.java:1075-1078`) maps MARS's single instruction list, Basic and Extended (pseudo) entries alike, through `JsInstruction.java:8-49` (name, example, description, tokens). Pseudo is `instanceof ExtendedInstruction`. The TS type is hand-written (`marsjs/ts/src/index.ts:285-290`); the only test is `ts/test/smoke.mjs:126`.                                                                                                                                                                                                                                                                                                                                 |
| RARS (`packages/risc-v`) | Same shape; `getIsRv64Only()` is an `@JSExport` method (`rarsjs/.../JsInstruction.java:51-54`, TS `rarsjs/ts/src/index.ts:284`). **Bug:** in the 64-bit list the editor reads, `slli`, `srli` and `srai` exist only as `SLLI64`/`SRLI64`/`SRAI64` (`INTEGER_6` shift), all `isRv64Only`, while RV32 has them with `INTEGER_5`. So `variantsForTarget` (`RISC-V-language.ts:68-70`) drops all three on RV32 today, and their pages say "(64bit)".                                                                                                                                                                                                                                                                |
| s68k (`packages/m68k`)   | `Form { operands: &[Modes], sizes, combination }` in `src/assembler/instructions/table.rs:301-309`; `Modes` has `SR` and `CCR`. `MOVE_FORMS` (768-774): [2] is `DATA,SR`; `IMMEDIATE_LOGICAL_FORMS` (781-785): [2] is `IMMEDIATE,SR`. `rte`, `stop` and `reset` are `not_implemented` with no forms, and the editor documents none of them; `usp` is not a mode. Nothing in the table reaches JS: the exports are `wasm_assemble`, `wasm_parse_line` and the interpreter, and `parseLine` reports `sr`, `ccr` and `usp` all as `"special_register"`. The editor's M68K Documentation is hand-written and its mode bit values differ from the Core's, so matching goes by mode name.                             |
| Z80 (`packages/z80`)     | `OpcodeVariant.isPseudo` covers synonyms (`add c` for `add a,c`, `(c)` for `(bc)`) and eight made-up combinations (`ld hl,bc`…), generated in `packages/z80-inst/opcodes/GenerateCode.ts:175-396`. The combinations are also `clr.undocumented: true`, so they would get both tags.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| x86                      | No Core change: the committed `languages/X86/generated/x86Instructions.ts` carries per-form `notes`. Among documented mnemonics, `PRIV` is on 8 of `mov`'s 65 forms (control and debug registers) and on all of `sysret` and `sysexit`; `UNDOC` on all of `cmpxchg486`, `ibts`, `salc`, `xbts`, 3 of `nop`'s 7 forms and 1 of `pop`'s 14 (`pop cs`).                                                                                                                                                                                                                                                                                                                                                            |
| Linking and builds       | The editor links the Cores through the workspace (`workspace:*`, Z80 through `link:`), so a Core change is a commit in its submodule plus a rebuild: `vp run build:mips`, `build:risc-v`, `build:m68k`, `build:z80` (Maven + TeaVM for MARS and RARS, cargo + wasm-pack for s68k, lerna for Z80). Restart the dev server after a rebuild. Tests: `pnpm --filter @specy/mips test`, `pnpm --filter @specy/risc-v test`, `cargo test` in `packages/m68k`, `npm test` in `packages/z80`.                                                                                                                                                                                                                           |

## Decisions taken while planning

Taken by default, for the owner to overturn.

1. **RV64 only means RV32 does not accept the form.** RARS's export reports `SLLI64`, `SRLI64` and `SRAI64` as not RV64-only: they are the RV64 width of instructions RV32 has. This also fixes the RV32 completion and hover bug and the "(64bit)" label on their pages.
2. **Z80 Pseudo-instruction covers synonyms and combinations.** A form is a pseudo-instruction when it is not in the manufacturer's own syntax and the assembler translates it, which is also true of MARS's `lw $t1, ($t2)`. So `add c` and `ld hl,bc` are both tagged.
3. **Undocumented is never on a combination.** z80-inst stops marking the eight combinations `undocumented`. Undocumented means an opcode the processor runs that its manual leaves out, and a combination is not an opcode. A synonym spelling of an undocumented opcode keeps both tags: `add ixh` is a pseudo spelling of `add a,ixh` (DD84), which the manual leaves out (34 such variants).
4. **M68K gets a list of forms from s68k.** s68k exports its instruction table: per mnemonic, each form's operand mode names, sizes and `privileged`. The M68K page and expanded row gain a Forms list from it, with the Privileged tag on `move <ea>,sr` and `andi`/`ori`/`eori #imm,sr`. The merged Operands section stays. No M68K mnemonic is wholly privileged, so M68K never shows the tag beside a name.
5. **M68K's category table is keyed by its 69 entries.** Family members (`beq`, `asl`) take their family's category in the sidebar.
6. **The category is its own field in the search index.** `EntryDocument` gains an optional `category`, which the engine matches together with the chapter title in `context` (boost 1.2), and which the palette and the panel show on result rows. It stays out of the embedding text, so no vectors change. The golden queries are the gate: a regression is fixed by weighting, not by dropping the field.
7. **Hovers show the form's tags only on Z80 for now.** Every hover shows the category and the mnemonic-level tags. Z80 also shows the tags of the exact form, from `analyzeLine`/`walkTrie`. For the other languages, form detection is deferred: M68K needs an s68k export of the chosen form (`parseLine` cannot tell `sr` from `ccr`), and MIPS, RISC-V and x86 have no operand matcher.
8. **RISC-V's " (64bit)" suffix is removed.** The RV64 only tag replaces it in the description, the search text and `MarsInstructionView`'s badge.
9. **Forms that differ in tags are never merged.** On the Z80 page `dedupeZ80Variants` keeps a pseudo spelling as its own row, with its tag; in `MarsInstructionView` the tags sit on each form, not on a description group.
10. **Index pages stay A to Z.** The decisions group the panel and the sidebar; `/documentation/<lang>/instruction` keeps its alphabetical index.
11. **Core changes stay in the submodules' working trees.** The editor reads them through the workspace, so nothing needs committing to test them; they are left uncommitted for the owner to review and commit (two of the submodules sat on detached heads). Version bumps, tags, npm publication and pushes follow the release recipe and are the owner's.

## Milestones and agents

M0 comes first. M1 and M2 are independent of each other and run in parallel. M3 needs M0, M1 and M2; M4 and M5 need M3's fields; M6 closes.

| Milestone                       | Agents                                       | Model                        |
| ------------------------------- | -------------------------------------------- | ---------------------------- |
| M0 Editor groundwork            | 1                                            | Opus                         |
| M1 Core exports                 | 4, one per Core                              | Opus                         |
| M2 Classification tables        | 5 writers, one per language, then 1 reviewer | Haiku writers, Opus reviewer |
| M3 Entries and search           | 1                                            | Opus                         |
| M4 Panel and documentation site | 1                                            | Opus                         |
| M5 Hovers                       | 1                                            | Opus                         |
| M6 Verification                 | 1                                            | Opus                         |

### M0: Editor groundwork

- `documentation/instructions/categories.ts`: the shared list as an ordered `const` (`data-movement`, `load-and-store`, `stack`, `arithmetic`, `logic`, `shifts-and-rotates`, `comparison`, `control-flow`, `floating-point`, `atomic`, `block-and-string`, `input-output`, `system`) with display labels; `InstructionCategory` is its union. `InstructionTag` is `pseudo | rv64-only | undocumented | privileged` with labels.
- `mnemonicTags(formTags: InstructionTag[][])`: the tags every form has.
- `DocumentationEntry` gains optional `category` and `tags` (mnemonic-level). `documentationProblems()` reports an instruction entry without a category.
- A helper beside `withInstructionContent` that sets `category` from a language's table, so the five builders share it.
- An empty `categories.ts` in each of `documentation/{mips,riscv,m68k,x86,z80}/`, typed `Record<string, InstructionCategory>`, so M2 fills them in place.
- Tests for the helpers.

### M1: Core exports

**MARS** (`packages/mips`).

- `JsInstruction` gains `isPseudo` (`ins instanceof ExtendedInstruction`) as a `@JSProperty`, following `JsCompilationResult.isWarning`.
- Add it to the TS type in `marsjs/ts/src/index.ts`.
- `smoke.mjs` asserts that some `lw` forms are pseudo and some are not.
- Document `MIPS.getInstructionSet()` in `marsjs/ts/README.md`, copying RARS's entry.

**RARS** (`packages/risc-v`).

- Make the same `isPseudo` export.
- Fix `getIsRv64Only()` for `SLLI64`/`SRLI64`/`SRAI64` (decision 1). The rule: false when the 32-bit set has the same mnemonic with the same operand count. Keep the fix in `rarsjs`, so the simulator's own RV64 checks are untouched.
- Update both READMEs, which omit `getIsRv64Only` today.
- Smoke tests cover `lw` pseudo forms and `slli` not being RV64-only.

**s68k** (`packages/m68k`).

- `Form` gains `privileged: bool`, defaulting to `false` in `form()` and `register_form()`. Set it on `MOVE_FORMS[2]` and `IMMEDIATE_LOGICAL_FORMS[2]` only (decision 4 and design 8).
- Add a new `wasm_get_instruction_table()` serialised with `to_plain_js`. It returns implemented mnemonics with their forms `{operands: string[] (Modes::names per position), sizes: string[], privileged}`.
- Declare the shape in `ts_types.rs` and expose it as an `S68k` static in `ts-lib/src/index.ts`.
- Write `table.rs` unit tests for the flags, and add the export to `test/smoke.mjs`.

**Z80** (`packages/z80`).

- `GenerateCode.ts` stops setting `undocumented` on the eight combinations (decision 3). Check whether `detectAliases` (:473) marks real opcodes or spellings, and leave real ones alone.
- Regenerate `Opcodes.ts` and run the package tests.

Rebuild each Core with its `vp run build:<core>` task and commit in the submodule.

### M2: Classification tables

One Haiku agent per language fills its `categories.ts`, working only from the mnemonic list and descriptions in the editor's data module and from the design's decisions 3 to 6.

Each agent gets these rules:

- Pick one category per mnemonic, by its main job.
- Floating point and Atomic outrank Load and store.
- Syscalls go in System.
- A mnemonic that copies both between registers and to or from memory is Data movement.
- Use only the categories the design's table lists for that language. Propose any other in a comment instead of using it.

Per language:

- **x86:** start from a NASM `section` to category mapping, then correct the mixed sections: `cmovcc` is Data movement, `setcc` Comparison, and the `loop*` forms Control flow.
- **M68K:** key by the 69 entry titles.

Each table ends in a test asserting its keys equal the documented set, which is "exactly one" by construction.

An Opus reviewer then reads all five tables against the design, fixes misplacements, and lists the judgment calls it made: sign extension, `lea`, MIPS conditional traps, Z80 `rst`, `cmovcc`, M68K `movem`, and `nop`.

### M3: Entries and search

- The five builders set `category` (through M0's helper) and the mnemonic-level `tags`.
- Each language's form type carries its tags:
    - `MIPSInstruction.isPseudo`.
    - `RISCVInstruction.isPseudo` and the corrected `isRv64Only`, with the " (64bit)" suffix removed (decision 8).
    - x86 forms map `PRIV`/`UNDOC` notes.
    - Z80 maps `isPseudo`/`undocumented`.
    - M68K reads `S68k` forms, matched to entries by mnemonic, family members included.
- `EntryDocument` gains optional `category`. `entryDocument()` fills it; `engine.ts` adds it to `context`; the embedding text is unchanged (decision 6).
- Tests:
    - `documentation.test.ts` covers categories per language.
    - `shards.test.ts` checks `add` has a category.
    - Add golden queries for "atomic" (RISC-V `amoadd.w` in the top results) and "shift" (M68K `asl`).
    - Run the existing golden suite and fix any regression by weighting.

### M4: Panel and documentation site

- **A grouping function.** One pure function groups a list of instruction entries by category in the shared order, stable so the entries stay alphabetical. It's tested directly.
- **Panel.**
    - `DocumentationBrowser` uses the grouping function for the Instructions Chapter while browsing, with sticky category headings under the Chapter's heading.
    - While searching, `EntryRow` gets a prop to show the category beside the signature. Rows built by `fromIndex` read it from `EntryDocument`.
    - `EntryBody` shows the category and the mnemonic-level tags at the top of an instruction.
- **Palette.** Result rows read `Instructions · Arithmetic`.
- **Tags on forms.**
    - `MarsInstructionView` shows them per form (decision 9).
    - `X86InstructionView` and `X86InstructionForms` map `priv`/`undoc` to the shared tag labels.
    - `Z80InstructionView` and the Z80 page's Variants table get a Pseudo-instruction badge, and the dedupe rule changes (decision 9).
    - M68K gets a Forms section on its page and in `M68KInstructionView` from the s68k table, with the Privileged tag. The page also gets a one-line note that s68k runs programs in supervisor mode.
- **Instruction pages.** Each of the five pages names the category under its `h1` and shows the mnemonic-level tags beside it.
- **Sidebar.**
    - `InstructionsMenu` takes groups (`{category, names}[]`) and renders a heading per group.
    - The five layouts build groups from the tables. M68K maps each family member to its family.
    - Remove the stale "sidebar search" comments in the x86 and Z80 layouts.
- **Tests.** Extend `instructions/integration.test.ts` (server render) to cover the category on the expanded body and a tag on a form.

### M5: Hovers

- **All five providers.** Each adds one line, category then the mnemonic-level tags (`Arithmetic · Pseudo-instruction`).
    - MIPS and RISC-V put it after the `**name**` header.
    - x86 puts it on the italic "since" line.
    - M68K puts it after the heading block.
    - Z80 puts it after its header.
- **Z80 form tags.** Z80 also parses the hovered line with `analyzeLine`, reading `node.variant.isPseudo` and the variant's `undocumented` directly (decision 7). That goes in a separate block, because the per-mnemonic hover is cached.
- **Tests.**
    - Extend the MIPS, RISC-V and M68K hover tests.
    - Add the first x86 and Z80 hover tests. For Z80, `add c` shows Pseudo-instruction and `add a,c` does not.

### M6: Verification

- Run the editor's whole suite (`pnpm test`), `vp check`, lint and a production build, with each touched Core's own tests.
- In Chrome, following the verification recipes:
    - The MIPS and M68K panels, grouped and while searching.
    - The site sidebar and an instruction page for each language.
    - One hover per language.
- Record the outcome in this plan and in the design's Status line.

## Follow-ups

- **The M68K lecture.** Align "The M68K instruction set" with M68K's categories through the course rewrite.
- **Hover form detection** for M68K (an s68k `formOfLine` export), and for MIPS, RISC-V and x86 (operand matching against the forms' token types).
- **Publication.** Version bumps, tags and npm releases of `@specy/mips`, `@specy/risc-v`, `@specy/s68k` and `@specy/z80`, then the editor's dependency pins.
- **Privileged on MIPS and RISC-V**, if MARS and RARS gain a kernel-mode flag.

## Verification (2026-10-18)

Run on `feat/pseudocode` with M0 to M5 uncommitted, while another session ran its own full suite in the same checkout.

| Check                               | Result                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vp test run` (packages/asm-editor) | 219 files, 4786 passed, 6 failed, all 5 s timeouts under the doubled load, none in this feature's files: `Project.test.ts`, `executables.test.ts`, `listing/generateListing.test.ts`, `X86/X86Executable.test.ts`. Re-run alone, 77 of 77 pass. The feature's own 35 files (documentation, search, panel and hover tests) pass; in a grouped re-run `searchClient.dom.test.ts` timed out the same way and passes alone. |
| `pnpm run check`                    | 1673 files, 0 errors, 0 warnings; the service worker's `tsc` passes.                                                                                                                                                                                                                                                                                                                                                    |
| Lint                                | `vp lint` clean; `lint:svelte` (ESLint) clean. `vp fmt --check` over the 90 changed files found 6 unformatted (both design records and four `categories.test.ts`); formatted with `vp fmt`.                                                                                                                                                                                                                             |
| Production build                    | `vp build` with the repository's configuration, written to a scratch directory: passes in 1 min 10 s. Prerendering renders the M68K Forms tables from the s68k table; the search shards give every instruction a `category` (MIPS 224, RISC-V 263, M68K 69, x86 273, Z80 68).                                                                                                                                           |
| MARS                                | `pnpm --filter @specy/mips test` passes, with the `isPseudo` assertions in `smoke.mjs`.                                                                                                                                                                                                                                                                                                                                 |
| RARS                                | `pnpm --filter @specy/risc-v test` passes: "162 of 311 RV32 forms are pseudo-instructions, slli/srli/srai not RV64 only".                                                                                                                                                                                                                                                                                               |
| s68k                                | `cargo test`: 622 pass, the table's privilege test and the export's API test among them; `ts-lib/test/smoke.mjs` passes.                                                                                                                                                                                                                                                                                                |
| Z80                                 | `npm test` passes in every workspace.                                                                                                                                                                                                                                                                                                                                                                                   |

In headless Chrome, against a private dev server:

- `/documentation/mips/all` and `/documentation/m68k/all`: the Instructions Chapter lists every entry under its category, in the shared order and alphabetical under each heading, and the heading pins under the Chapter's while its group scrolls. MIPS `lw` expanded shows "Load and store", and its Pseudo-instruction badges only on the eleven pseudo forms, none on `lw $t1,-100($t2)`. M68K `move` shows the Forms table with Privileged only on `…, sr`.
- The palette: "atomic" on a RISC-V page lists only instructions, each "Instructions · Atomic"; "shift" on an M68K page puts `asd`, `lsd`, `rod` and `roxd` as "Instructions · Shifts and rotates" among the lecture sections.
- Sidebars on every language's pages are grouped, with the current instruction highlighted. x86 `mov` names Data movement and shows Privileged on its eight control and debug register forms; Z80 `add` lists `add b`, `add (hl)`, `add nn`… as their own rows with Pseudo-instruction, and `add ixh` with both Pseudo-instruction and Undocumented. RISC-V `addw` shows "Arithmetic" with RV64 only beside it; `slli` shows neither RV64 only nor "(64bit)". M68K `beq` shows Control flow and its family's Forms table.
- At 390 px the sidebar headings, the category line and the pages stay inside the viewport.
- The Workbench's Documentation panel, for a RISC-V, a MIPS and an M68K Project: grouped and pinned while browsing, and each instruction row names its category while searching ("atomic", "shift").

Known gaps:

- Hovers were not checked in the browser: headless Chrome does not show Monaco hovers. The hover tests cover all five languages.
- At phone width a long form's badge sat past the right edge of its form list (MIPS `lw $t1,label+100000($t2)` at 390 px). Fixed the same day: a form's row now wraps, so the badge drops under the form; re-checked at 390 px with no sideways scroll.
- The Core changes are uncommitted in their submodules (decision 11).
