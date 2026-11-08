---
status: accepted
date: 2026-11-07
---

# Every page wears the Workbench's look but the home page

Every page of the site draws with the **Workbench**'s tokens and shared components: Rubik for interface and reference text, **Cards** on the `.wb-cards` tokens, the Workbench's hairlines, **Trays** and **Popovers**. That holds for the public pages (`/projects`, `/projects/create`, the documentation index and pages, the course indexes, the blog, `/donate`, `/changelog`, `/examples`), the tool pages (`/exam`, `/chat`, `/embed`, the MARS and RARS apps) and the Workbench itself. A page outside the editor is always in the Cards surface style, whatever a person's Lines Preference, which only applies inside the Workbench.

The home page is the one exception. It keeps its own motifs (the frame and its side guides, the full-width rules with dots, the hex-byte bands, the ruled tile grids, the serif section heads over a Fira Code body, the browser frame around its demo) but builds them from the shared tokens and components rather than from values of its own. The navbar and the hex footer are site chrome, shared by every page, not the home page's own.

The audit that led here ([design-system-audit.md](../research/design-system-audit.md)) found every public page with a look of its own and most screens rewriting the same values by hand. The decisions that follow from this one, from the font roles to the page title, are in [design-system.md](../design/design-system.md).

## Consequences

- A new public page starts from the Workbench's components and the page shell (`Header.svelte`'s title, the 70rem column), not from the home page's motifs.
- The home page's frame, rules, hex bands and tile grids stay in `routes/+page.svelte` and `components/specific/landing/`; nothing else reuses them.
- The reading pages (a lecture's body, a blog post's body) differ from the rest only by their font role and a step larger type, not by a look of their own.

## Considered options

- **The home page's look on every public page**: the frame, the rules, the ruled tiles and the serif heads carried to the documentation, the courses, the blog, the projects pages and the changelog, the Workbench staying a separate tool look. Rejected: the motifs suit one long page read once, not pages dense with content that people come back to, such as the documentation index or the changelog, and the site would then have two looks, one each side of the Workbench's door.
- **Each area keeping its own look over shared tokens**: rejected, as it keeps the per-page looks the audit found, only with shared values underneath, and the values drift again with the looks.
