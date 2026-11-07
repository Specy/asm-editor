# Design system audit

Date: 2026-11-07. Scope: every page and the Workbench of `packages/asm-editor`, after the search palette was moved onto the tray surface. No code was changed. Paths are relative to `packages/asm-editor/src/`.

Method: counted style declarations across the 286 `.svelte` files and the 10 stylesheets, ran three read-only audits (controls, surfaces and overlays, typography and colour), and screenshotted every route plus the Workbench in edit, Debug, Explorer context menu and Settings states. Screenshots are in `.cache/design-system-audit/shots/` (git-ignored).

## Summary

The app has good primitives, but most screens don't use them. Each screen rewrites the same values by hand, so they slowly drift apart:

| What                       | Distinct values today | Main cause                                                                 |
| -------------------------- | --------------------- | -------------------------------------------------------------------------- |
| `border-radius`            | 43                    | no radius tokens beyond `--wb-radius`                                      |
| `box-shadow`               | 39                    | no elevation tokens                                                        |
| `font-size`                | 66                    | no type scale                                                              |
| 1px divider colour         | 7 recipes, 6 aliases  | `--wb-line`, `--tray-line`, `--dock-line`, `--hex-line`… are the same mix  |
| muted text                 | 5 ways, 154 opacities | `--hint`, `--background-text-muted`, opacity, `color-mix`, local `--muted` |
| hover / selected tint      | ~30 variants          | no `--hover-bg` / `--selected-bg`                                          |
| icon-button sizes          | 9 sizes, ~18 recipes  | no `IconButton`                                                            |
| text-input backgrounds     | 4 families            | `Input.svelte` used by 4 files, 43 raw `<input>`                           |
| floating surface languages | 2 + ~10 one-offs      | `tray.surface` vs `CardOutline`, plus bespoke popovers                     |
| `kbd` chips                | 6 blocks              | no `Kbd`                                                                   |
| spinners                   | 4 keyframes           | no `Spinner`                                                               |
| badges / pills             | ~12                   | no `Badge`                                                                 |

The Workbench is the most consistent part of the app: it has `workbench.css` tokens, `tray.scss` and `SegmentedControl`. The public pages (projects, create, docs, courses, blog, exam, embed, changelog) each have their own look.

## Bugs found on the way

These are bugs, not just inconsistencies:

- **Undefined variables:**
    - `--shadow-rgb` (`shared/layout/Card.svelte:44`), so `withShadow` draws nothing.
    - `--border-color` (`shared/InteractiveInstructionEditor.svelte:1114`).
    - `--border-color-dark` (`routes/exam/session/+page.svelte:1142`).
    - `--warning`, which the theme never defines, so the hard-coded fallback always applies (`Editor.svelte:1424`, `LogView:127`, `PixelEditor:1856`).
- **No keyboard focus ring in 23 button files.** `global.css` sets `* { outline: none }`, so any control without its own `:focus-visible` shows nothing. Examples: IconRail, FileTabs, BottomPanel, SidePanel, TopBar, Explorer (12 buttons, no rule), DefaultNavbar, Sidebar, `Icon` with `onClick`, both search `.clear` buttons. `Input.svelte` and `Textarea.svelte` have no focus style either.
- **Text fields in the browser's default font.** `Input.svelte` sets no font and inputs don't inherit one; `global.css` gives Rubik to `button` only. The create-project placeholders differ from each other: Name is a small sans, Description is monospace.
- **Code-like views in the system monospace font.** 24 `font-family: monospace` uses in 14 files, so registers, memory, hex, cycles, the terminal and value diffs aren't in Fira Code like Monaco is. One `sans-serif` (`MemoryRenderer:846`).
- **Synthesised bold Fira Code.** Only the Medium weight is loaded (`global.css:9`), yet bold Fira Code is used.
- **Exam page starts under the navbar.** The first card's top edge is cut off (`/exam` screenshot).
- **Scrollbars ignore the theme in Firefox** (no `scrollbar-color`), and in Chromium they use hard-coded `rgba(44,44,44,.9)` and `#555`.
- **Hard-coded colours break custom light themes.** Five warning yellows (`#d19a3f`, `#d6a83c`, `#dcb864`, `#e5c07b`, `#d49a30`), `#c74444` + `#fff` for errors in Explorer, `rgb(116,116,116)` placeholders, and `color-mix(…, white)` hovers in `variants.scss` and `tray.scss`. All built-in themes are dark, so this only shows with a custom theme.
- **Dead code.** `button/style.scss` is imported by nothing. The `classic` Button variant is never chosen; it survives only as the base layer under `workbench`.

## What looks different, screen by screen

- **Page titles: six styles.**
    - `/documentation`, `/learn/courses`, `/donate`: 2.75rem / 700, tight tracking (`contentPages.css`).
    - Blog: 3.2rem / 700.
    - Home: Rubik 500.
    - `/projects`: 1.8rem.
    - `/projects/create` and `/changelog`: browser-default `h1`, because `Header.svelte` sets no size or weight.
    - Exam: 2.6rem.
    - Page widths differ too: changelog and create are narrower and left-indented differently from projects and docs.
- **Cards: at least four looks for one role.**
    - `/documentation` and `/donate`: 1px border, ~0.6rem radius, a rule above the buttons.
    - `/documentation/<lang>` tiles: filled, no border.
    - Project cards: Workbench tokens, a header strip, 0.4rem.
    - Blog: 1rem radius.
    - Course lecture list: a filled panel with a left rule.
    - `Card.svelte` itself has only 7 users.
- **Prose fonts.** Course lectures are in Noto Serif; docs pages, blog paragraphs and the home page use Rubik, Noto Serif 500 and Fira Code respectively. Sidebar chapter headings ("Introduction", "Instructions") are Fira Code, while the items under them are Rubik.
- **Sidebar.**
    - Bullet dots for top-level links, none for nested ones.
    - The docs navbar puts the logo in a filled square; the home navbar doesn't.
    - Two search boxes on `/documentation/<lang>`: one in the sidebar, one in the page.
- **Workbench panels: two heading styles in one panel.** Settings mixes collapsible "Project"/"Program" headers with an uppercase "DISPLAY" label. Panel titles are uppercase and letter-spaced ("EXPLORER", "SETTINGS"); elsewhere they are sentence case.
- **Debug top bar.** The floating-tool toggles ("Call stack", "History", "Stack pointer") are outlined pills with an eye-slash icon, unlike any other button.
- **Tabs: four implementations.**
    - Register files CPU/FPU/CSR: SegmentedControl `tabs` mode.
    - File tabs and the bottom panel: one strip recipe, two copies.
    - The playground's file tabs: a third recipe.
    - The embed page's register tabs (CPU/System) match none of them.
- **Embed and exam look older than the Workbench.**
    - Embed: its own settings cards, plain "Copy" text buttons, and an older register view.
    - Exam: the instructions editor is on a grey Monaco theme, and there is a wall-of-text paragraph.
- **Toggles.** Settings uses Switch, NumberStepper-like selects and raw number inputs side by side, with left-aligned small numbers next to larger select values.

## Foundations: proposed tokens

Put these in one place (`global.css`, or a `tokens.css` that `ThemeProvider` scopes). Every value below already appears in the code, so this mostly names what exists.

| Group     | Tokens                                                                                                                                                                  | Replaces                                                                                                                                                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fonts     | `--font-ui` (Rubik), `--font-mono` (Fira Code), `--font-serif` (Noto Serif)                                                                                             | ~120 hand-written stacks, the landing page's local `--mono`/`--serif`, 24 bare `monospace`. Add `input, textarea, select { font: inherit }`.                                                                                      |
| Type      | `--fs-micro .65`, `--fs-caption .75`, `--fs-small .85`, `--fs-body 1`, `--fs-lead 1.2`, `--fs-h2 1.6`, `--fs-h1 clamp(2.2rem, 4vw, 3.2rem)`                             | ~450 `font-size` declarations. Outliers to fold in: 0.48, 0.5, 0.82, 0.875, 0.92, 1.05, `16px`.                                                                                                                                   |
| Weights   | 400 / 500 / 600 / 700, written as numbers                                                                                                                               | `bold` ×20 and `normal` ×20 next to their numeric twins; 800 ×1.                                                                                                                                                                  |
| Radius    | `--r-chip .25rem`, `--r-control .4rem` (= `--wb-radius`), `--r-overlay .6rem`, `--r-sheet 1rem`, `--r-pill 999px`                                                       | ~250 declarations. Outliers: 0.35, 0.45, 0.7, 0.75, 0.8, 1.2, 1.5, 10rem. TooltipCard uses 6px while the menus use 6.4px.                                                                                                         |
| Elevation | `--shadow-1` (rows, sticky headers), `--shadow-2` (trays: `0 .25rem .8rem /.35`), `--shadow-3` (popovers/menus: `0 .5rem 1.5rem /.35`), `--shadow-4` (palette, windows) | 39 shadows. Outliers: `-2px -1px 27px 4px #00000057` (FloatingContainer) and `-4px 0 3rem 2rem /.3` (agent panel, copied into `/chat`).                                                                                           |
| Lines     | `--line` (`--tertiary` 60%), `--line-strong` (opaque `--tertiary`)                                                                                                      | `--wb-line`, `--tray-line`, `--dock-line`, `--hex-line`, `--pixel-line`, `--preview-line`, 70–85% variants, `--tertiary-text` 15/25%, `--accent2` borders, `#404040`. Also settle on 1px instead of the `0.1rem` (1.6px) borders. |
| Text      | `--text-muted` (one per surface, e.g. `--secondary-text-muted`) and `--hint`                                                                                            | 154 opacities on text, ~27 `color-mix` text tints, the landing page's `--muted`. The `--*-text-muted` tokens exist but only `--background-text-muted` is used.                                                                    |
| Tints     | `--hover-bg` (`--tertiary` 55%), `--selected-bg`, `--accent-soft` (accent 15%)                                                                                          | ~30 hover/selection variants: solid `--tertiary` ×26, 55% ×9, 45%, 35%, `tertiary-text 12%`, `rgba(var(--RGB-accent), .25)`, and 21 different accent percentages. Retire `--RGB-*` (10 uses).                                     |
| Status    | `--warning`, `--danger` (or keep `--red`), `--success`, defined in the theme                                                                                            | 5 yellows, `#c74444`, `--tc-fail`.                                                                                                                                                                                                |
| Focus     | one `:focus-visible` rule after the reset (2px `--accent`), plus a `focus-ring($inset)` mixin for inset cases                                                           | 71 hand-copied rules with 6 different offsets; 23 files with none.                                                                                                                                                                |
| Motion    | `--dur-fast 120ms`, `--dur-base 160ms`, `--ease-out` (Svelte's cubicOut), one reduced-motion rule                                                                       | durations 80, 100, 120, 130, 150, 160, 200, 250, 300, 400, 650ms; `transition: all` ×18; five overlays with no motion. Toasts fly in over 400ms.                                                                                  |
| Scrim     | `--scrim` (black 35%)                                                                                                                                                   | 6 recipes, from black .1 + 0.5rem blur to black .5.                                                                                                                                                                               |

## Components: what to merge into what

Ranked by value: how much drift each removes and how many call sites it touches.

1. **Focus ring.** Restore a global `:focus-visible` after the reset. This is an accessibility fix and it removes ~50 copied rules. Do it first; it's small.
2. **`IconButton`** (sm 1.4 / md 1.8 / lg 2.4rem, ghost hover = `--hover-bg`, `pressed` state, focus). It replaces ~18 bespoke recipes and 9 sizes: Explorer ×4, FileTabs close, SidePanel actions, the TopBar icon-button, ProjectCard actions, the LoggerProvider close, the search `.clear` ×2, `SearchPanel .details`, `Icon onClick`, and the MemoryControls/exam Button overrides. About 40 call sites.
3. **One ghost/compact button.** `tray.tool`, the FileStatusLine `.tool`, ProjectTopBar `.action`, `SearchPanel .lane-action`, PixelEditor `.action` and DocumentationBrowser `.tool` are one button at five heights. Make it a `ghost` variant plus `size="sm"` on Button. That also removes the 33 inline `style=` size overrides on Button/ButtonLink. Delete `style.scss` and the `classic` variant at the same time. "Cancel" then looks the same everywhere; today it is drawn three ways.
4. **One overlay surface.** Choose `tray.surface` (prompts, toasts, dock, palette) or the `CardOutline` look (context menu, share menu, tooltips) as the single floating language, or keep both with an explicit rule ("menus and tooltips have arrows, trays don't") and shared tokens. Then move the one-offs onto it:
    - the Select list (opaque `--secondary`, no border)
    - the PixelEditor tool popover (an opaque copy of ContextMenu)
    - ScreenDisplayConfiguration and HexFindBar
    - FloatingContainer
    - the floating debug window, which is three shapes today: header 0.4rem `--secondary`, body 0.7rem `--primary`, Screen window 0.4rem
    - the ExecutionDock's hand copy of the mixin
    - the notices (CompilationNotice, ReadOnlyNotice, MemoryRenderer)
    - the Monaco find widget and hover
    - the inline tooltips in HexEditor and ValueDiffer, a third tooltip look that should use `TooltipCard`

    TooltipCard should also share the menus' radius, and match their fill or say why it differs.

5. **`TextField`** (it replaces `Input.svelte`): one background, radius, focus ring and `--hint` placeholder. It covers ~15 raw text inputs, which today sit on four backgrounds (`--secondary`, `--tertiary`, `--primary`, `--tc-field`) with four focus treatments. Make `SymbolsPanel .filter` and `SearchPanel .query` use `SearchField`, which they copy almost exactly. Give `Select` a `compact` prop for the 4 identical inline overrides, and switch its `brightness(1.1)` hover to `--hover-bg`. Swap the 5 raw number inputs for NumberStepper and the 2 raw checkboxes for Switch. Use disabled opacity 0.5 everywhere (Select uses 0.6; tray.tool has none).
6. **`TabStrip`**: FileTabs, BottomPanel, the playground's file tabs, the embed register tabs, and SegmentedControl's `tabs` mode. Move `SegmentedControl` from `specific/project/cpu/` to `shared/input/`; 10 files import it, including shared ones. Then convert the PixelEditor tool palette (if it counts as a one-of-N choice) and the home demo tabs, which break the "visible options are a SegmentedControl" rule.
7. **Small shared pieces:**
    - `Kbd` (6 blocks)
    - `Badge`/`Pill` (~12 implementations, including the ENTRY mark three times at 0.48 and 0.5rem)
    - `StatusDot` (6)
    - `Spinner` (4 keyframes, plus five bespoke "Loading…" headings)
    - `EmptyState` (~12 bespoke `.empty` blocks)

    Use the global `.visually-hidden` (5 hand copies) and `.ellipsis` (39 hand copies) that already exist.

8. **Page shell and cards.**
    - Give `Header.svelte` the content-page title style so every page title is one style (~10 pages), with one content width.
    - Make one `Card`, on the same tokens as `.wb-cards`, with one hover (`--hover-bg`). It replaces ContentLinkCard, the docs tiles, blog cards, HeroLink, ChapterView, AgentDocs and the course and exam cards (~15 sites), and fixes `Card`'s dead shadow.
    - Move the agent panel copy out of `routes/chat/+page.svelte`.
9. **Icons.**
    - Stay on `fa-solid`. Swap the off-set icons: `fa-regular` ×4, `octicon` ×2, `ic` ×1.
    - Pick one sizing path. Today `<Icon size>` takes 17 values and 35 `:global(svg)` rules set 12 widths. Fold them into the type scale (icon = `1em` of its label, or sm/md/lg).

## Suggested order

1. **Fixes that need no design decision:**
    - the undefined variables
    - the global focus ring
    - `font: inherit` on form controls
    - `monospace` → Fira Code
    - load Fira Code bold or drop bold mono
    - the exam page offset
    - theme the scrollbar
    - delete `style.scss`
2. **Tokens:** add the foundation tokens and alias the old names to them (`--wb-line: var(--line)` and so on), so nothing changes visually. Then replace hard-coded values file by file; `pnpm lint:changed` keeps each step small.
3. **Shared components:** `IconButton`, ghost/compact Button, `TextField`, `TabStrip`, `Kbd`/`Badge`/`Spinner`/`EmptyState`, with the call sites moved in the same change as each component.
4. **Pages:** title style, page width, one `Card`, then bring embed and exam up to the Workbench's look.

A Stylelint (or Oxlint) rule that rejects raw `border-radius`, `box-shadow`, `font-family` and hex colours outside the token file would stop the drift from coming back.

## Decisions for the owner

- **Floating surfaces:** one language (tray), or two with a rule (arrowed CardOutline for menus and tooltips, tray for everything else)?
- **Typography by area:**
    - The home page uses Fira Code body and Noto Serif headings, lectures use Noto Serif body, and the app uses Rubik. Is that a deliberate split (marketing / reading / tool), or should one of them move?
    - Should sidebar chapter headings stay Fira Code?
- **Panel titles:** uppercase letter-spaced, like VS Code ("EXPLORER"), or sentence case like the rest of the app?
- **Button styles:** already mocked and deferred during the landing redesign. The ghost/compact work in item 3 needs that decision, or at least a temporary one.
- **Selected row:** a `--tertiary` tint with an accent edge (search palette), or an accent tint (context menu, Select)?
