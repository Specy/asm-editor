---
status: accepted
date: 2026-10-18
---

# Build one instruction document per mnemonic in the editor, from facts the Cores export

Every language's instruction **Documentation entry** is drawn by one shared view, on the documentation page and in the Workbench's Documentation panel ([the design record](../design/instruction-layout.md)). That view reads one data shape, an instruction document: the header (long name, summary, **Instruction category**, mnemonic-level **Instruction tags**, the facts every row shares), the flags strip, the list of **Form patterns** in sections by tag with their fact lines and the **Instruction forms** each stands for, the Operands legend and the description. An adapter per language under `src/lib/documentation/<language>/` builds it. What the adapter adds is the editor's: which operands are one class and the symbol that names it, the legend's wording, long names and summaries where the source has none, the order of the rows. What it reads about a form comes from the Core that assembles it: its tags, its pseudo-instruction expansion, its bytes, cycles and flags. This is the split [ADR 0051](./0051-instruction-categories-in-the-editor-tags-from-the-core.md) made for categories and tags, applied to the whole page: a teaching vocabulary that runs across five languages is the editor's, and a fact that has to change when the assembler changes is the Core's.

## Considered options

- Each Core exports a finished documentation shape: rejected. The editor's notation, wording and row order would live in five packages that are used outside the editor, and every wording fix would need five releases.
- Each language keeps its own page and panel components, made to look alike: rejected. That is how the five pages drifted apart, and how the panel and the pages drifted apart from each other.

## Consequences

- MARS and RARS gain a per-form export of their pseudo-instruction templates; the editor rewrites the templates' placeholders into the page's symbols. The Cores release before the editor reads it.
- x86 has no instruction table of its own in its Core, so its flags come from Intel's XED tables through the editor's generator script, like the rest of its generated data.
- A new language gets its instruction pages by writing one adapter and its tables, not a page.
