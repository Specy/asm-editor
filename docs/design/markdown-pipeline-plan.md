# Markdown pipeline and code-block highlighters: implementation plan

Written on 2026-10-20 after the design interview. The decisions are in [ADR 0053](../adr/0053-markdown-is-rendered-by-our-own-synchronous-pipeline.md); the vocabulary is the glossary's (**Lecture**, **Playground**, **Blog post**, **Documentation entry**, **Preview**, **Exam**). The plan replaces carta-md and Shiki with one synchronous unified pipeline, adds a C/C++ code-block highlighter beside the assembly one, lets the Workbench's Markdown Preview and the Exam pages colour other languages with Monaco, and rebuilds the Exam builder's Markdown editor on Monaco. Implemented on 2026-10-20 (M0 to M6, M1 by a separate agent) and verified the same day ([Implementation](#implementation-2026-10-20)); uncommitted.

## Starting point

Checked on 2026-10-20 in this checkout. Paths are under `packages/asm-editor/src/` unless they name a package.

| Area             | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renderer         | `components/shared/markdown/MarkdownRenderer.svelte` (1080 lines) builds six Carta instances, one per mode (`cartaNormal` :540 to `cartaUntrusted` :673), picked at :760; each recreated when the Shiki theme name changes. Everything specific is already a unified plugin: playground marking (`transformPlaygrounds` :232, `markPlayground` :192), the embed swap (`rehypePlaygroundIframes` :370, async only), heading ids (:404), plain playgrounds (:430), disabled links (:461), stripped styles (:633), external links (`rehype-external-links`), sanitizers (:478, :652). Rendering is carta's `<Markdown>` inside `{#key …}` (:843), so it never updates in place; `live` mode (:784) re-renders asynchronously; `prepare` (:775) edits the HTML through a `<template>`; a `MutationObserver` (:811) re-scrolls to `#hash` after the second render. |
| Code blocks      | `lib/content/codeBlocks.ts` is a carta `Plugin` (type import :1) with a sync and an async pass of `decorateCodeBlocks`; it colours assembly fences with `highlightedAssemblyCode` (`assemblyHighlight.ts`, 576 lines, classes from `assemblyPalette.ts`) and adds the line-number gutter. `codeBlocks.css` forces every `pre.code-block`'s background and text colour, so Shiki's inline background never showed.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Hosts            | `MarkdownRenderer` is used by `EntryBody`, `InstructionDocumentView`, `LectureSectionCard` (`playgrounds="code"`), the Lecture and Course pages (`headingIds`), Blog posts, `BelowLineContent` (`simpleCode`), the Workbench's `MarkdownPreview` (`untrusted live prepare`, :150, its own 150 ms pause at :29) and the Exam session (`disableLinks`, `routes/exam/session/+page.svelte` :867, :885, :895).                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Editor           | `MarkdownEditor.svelte` (carta's editor, its own Carta, `md.scss` is entirely carta editor styling) is used only by the Exam builder (`routes/exam/+page.svelte` :236 instructions, :322 each section's prompt; boxes 13 to 24 rem tall, :507-572). Carta splits text and preview above 768 px, tabs below. The builder already loads Monaco (`Editor.svelte`, which accepts `language="markdown"` and `bind:code`).                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Fence languages  | Authored content uses assembly (`m68k`, `mips`, `riscv`, `riscv64`, `x86`, `z80`), `c`, `cpp`, `text` and `testcase`. Two `asm` fences remain that would go plain: x86 `enter`'s description (`languages/X86/X86-documentation.ts` ~:286) and the Z80 macro expansion shown below a line (`languages/Z80/Z80Emulator.svelte.ts:740`, written `asm` "because shiki has no z80 grammar"). MIPS and RISC-V expansions already say `mips`/`riscv`. The `cpp`/`c` fences in `sourceLanguageHelp/*` and `sourceRuntime/runtimeLanguage.ts` are Monaco hover text and never reach the renderer.                                                                                                                                                                                                                                                                      |
| Monaco's C/C++   | One grammar, `monaco-editor/languages/definitions/cpp/cpp.js` (8 KB, no imports, exports `conf` and `language`; 174 keywords), registered as `c` (aliases C, c; `.c`, `.h`) and `cpp` (aliases C++, Cpp, cpp; `.cpp`, `.cc`, `.cxx`, `.hpp`, `.hh`, `.hxx`). Tokens: `keyword.*`, `identifier`, `type.identifier`, `keyword.directive`, `keyword.directive.include*`, `string`, `string.escape`, `string.include.identifier`, `string.raw*`, `number`, `number.float`, `number.hex`, `number.octal`, `number.binary`, `comment`, `comment.doc`, `delimiter`, `annotation`, brackets. The editor theme (`lib/monaco/editorTheme.ts:31-55`) colours them from `ASSEMBLY_TOKEN_COLORS` where a rule exists and from Monaco's base theme (`inherit: true`) otherwise.                                                                                             |
| Monaco colouring | `BelowLineContent.svelte` (:30-60) already colours rows with `monaco.editor.colorize`, the precedent for the opt-in pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Dependencies     | `carta-md` ^4.11.3 and `@cartamd/plugin-code` ^4.2.0 (which bring Shiki 3.23); `unified`, `remark-parse`, `remark-gfm`, `rehype-raw`, `rehype-external-links`, `hast-util-to-string`, `isomorphic-dompurify` are direct already; `remark-rehype` 11.1.2 and `rehype-stringify` 10.0.1 are in the store only through carta. The last build carries about 300 lazy Shiki grammar and theme chunks (~13 MB); only the app shell is precached, so they cost deploy weight, not visitors.                                                                                                                                                                                                                                                                                                                                                                          |
| Tests            | `MarkdownRenderer.dom.test.ts` (17 tests, many waiting on the async render: `waitForIframe`, `waitForShikiCodeBlock`), `fenceLanguages.dom.test.ts` (2, Shiki-specific, added 2026-10-20), `MarkdownEditor.dom.test.ts` (4 cases on `.carta-renderer`), `MarkdownPreview.svelte.dom.test.ts` (4, reads `.markdown-body p`), `documentation/instructions/integration.test.ts` (SSR renders of `EntryBody`). Unrelated and already failing: the M68K golden search query "post increment" (the uncommitted heading rename in `m68k/addressing-modes.md`).                                                                                                                                                                                                                                                                                                       |

## Decisions taken while planning

Taken by default, for the owner to overturn.

1. **The pipeline is plain TypeScript.** `lib/content/markdown.ts` exports `renderMarkdown(source, options)` returning sanitized HTML; no runes, no DOM beyond DOMPurify's, so the server, the component and tests call the same function. One processor per option set, built once and kept in a module-level map.
2. **Options replace the six instances:** `links: 'same-tab' | 'new-tab' | 'disabled'`, `headingIds`, `playgrounds: 'embed' | 'code'`, `untrusted`. The component's props stay as they are and map onto them.
3. **The output depends only on the source and the options.** Nothing in the pipeline reads the theme, the window or the time, because Svelte keeps the server's HTML for `{@html}` while hydrating and only warns (`hydration_html_changed`) when the browser computes something else. Theme colours stay CSS variables on the wrapper, so a theme change re-renders nothing.
4. **`live` goes; `prepare` stays.** A synchronous render needs no "keep the last render until the next is ready"; `MarkdownPreview` keeps its own 150 ms pause. `prepare` keeps editing the rendered HTML through a `<template>` in the browser.
5. **The `#hash` re-scroll observer goes.** There is one render, and a Playground's iframe takes exactly its code block's box (`playgroundBox`). The browser pass checks a heading link still lands.
6. **Playground embeds are built in the browser from the rendered page.** An effect after mount replaces each `[data-playground]` element with its iframe, using the existing `createCodeUrl` and the data attributes the marking already writes. The effect reruns only when the HTML changes.
7. **The Monaco pass is a prop, `monacoColors`.** With it, an effect waits for `Monaco.get()`, resolves each remaining `code.language-*` through `monaco.languages.getLanguages()` (id, alias or extension, ignoring case), and replaces the block's text with `monaco.editor.colorize` output. Results are cached per language id and text at module level, so a re-render while typing keeps its colours. An unresolved language stays plain. Monaco's colours follow its theme stylesheet, so a theme change needs no recolouring. Passed by `MarkdownPreview`, the Exam session's three renderers and the Exam builder's preview.
8. **One colour table still.** Where the editor colours a C/C++ token from Monaco's base theme rather than from `ASSEMBLY_TOKEN_COLORS` (likely `type.identifier`, `string.escape`, `annotation`; M1 measures), the colour is added to the table and given an explicit rule in `editorTheme.ts`, so the editor and code blocks read one value, per the 2026-10-11 rule.
9. **Names keep their `asm-` prefix.** `assemblyPalette`, `ASSEMBLY_TOKEN_COLORS` and the `asm-*` classes now also colour C/C++; renaming them to "code" is churn with no behaviour, left for later.
10. **Fence names are resolved in one module**, `lib/content/fenceLanguage.ts`: Playground names for assembly, Monaco's C/C++ ids, aliases and extensions (from `register.js`, copied as data because that file imports Monaco's contribution machinery), anything else left for the Monaco pass. Its tests list the names.
11. **The two remaining `asm` fences are rewritten:** x86 `enter` becomes `x86`, the Z80 expansion `z80`. A guard test reads every authored fence (Courses, Blog posts, every language's Documentation, instruction descriptions) and fails on a language that is not assembly, C/C++, `text` or `testcase`.
12. **The Exam builder's preview renders as the Exam session does:** `disableLinks` and `monacoColors`.
13. **Today's interim fixes are superseded.** The `shikiCode()` helper and `fenceLanguages.dom.test.ts` from 2026-10-20 go with carta; the `EntryBody` example-language fix stays.
14. **Nothing is committed.** The work stays in the working tree for the owner to review and commit (no `Co-Authored-By` trailers).

## Milestones and agents

M0 comes first. M1 and M2 are independent and run in parallel against the interface M0 fixes. M3 needs both; M4 needs M3; M5 needs M3 and M4; M6 closes.

| Milestone                   | Agents | Model |
| --------------------------- | ------ | ----- |
| M0 Groundwork               | 1      | Opus  |
| M1 C/C++ highlighter        | 1      | Opus  |
| M2 Pipeline                 | 1      | Opus  |
| M3 Renderer component       | 1      | Opus  |
| M4 Exam builder editor      | 1      | Opus  |
| M5 Removal and test rewrite | 1      | Opus  |
| M6 Verification             | 1      | Opus  |

### M0: Groundwork

- Add `remark-rehype` and `rehype-stringify` as direct dependencies (the versions already in the store).
- `lib/content/fenceLanguage.ts`: `fenceLanguage(info)` → `{ kind: 'assembly', language } | { kind: 'c-cpp' } | { kind: 'other', name } | { kind: 'none' }`, reading the first `|`-separated word; tests for every name in decision 10 and for `asm`, `text`, `testcase`, an empty info string.
- Fix the interface M1 delivers: `tokenizeCpp(source): CppToken[][]` (lines of tokens that rebuild the source exactly), and a `highlightedCppCode(source)` returning hast children with classes, matching `highlightedAssemblyCode`.
- Rewrite the two `asm` fences (decision 11) and add the guard test.
- Done when: the new module and guard test pass, and nothing else has changed behaviour.

### M1: C/C++ highlighter

- First, measure in the browser (recipe in the verification notes): colour a sample holding every token kind of the grammar with `monaco.editor.colorize` under the editor theme, dark and light, and read each token's computed colour; record which come from `ASSEMBLY_TOKEN_COLORS` and which from Monaco's base theme, and whether brackets are coloured by nesting level in C/C++ models as they are in assembly.
- Extend the table and `editorTheme.ts` with explicit rules where needed (decision 8), and `assemblyPalette.ts` with the classes.
- `lib/content/cppHighlight.ts`: a hand-written tokenizer beside `assemblyHighlight.ts` that follows the grammar's rules (line and block comments with doc comments, strings with escapes, raw strings `R"tag(…)tag"`, character literals, the number forms with suffixes and `'` separators, `#include <…>` and `"…"`, other preprocessor lines, `[[…]]` annotations, delimiters, brackets with levels if the editor colours them) and takes its keyword list from `language.keywords` imported from `monaco-editor/languages/definitions/cpp/cpp.js`.
- Tests in the style of `assemblyHighlight.test.ts`: the tokens rebuild the source; every Monaco keyword is a keyword; one case per rule; a snippet from each `using-c.md` comes out as expected.
- Done when: the tests pass and the header comment of `assemblyHighlight.ts` no longer mentions Shiki.

### M2: Pipeline

- `lib/content/markdown.ts` per decisions 1 to 3: remark-parse, remark-gfm, remark-rehype (`allowDangerousHtml`), rehype-raw, the mode's plugins moved out of `MarkdownRenderer.svelte` unchanged in behaviour (playground marking, plain playgrounds, heading ids, disabled links, stripped styles, external links), code-block decoration, rehype-stringify, then the mode's DOMPurify configuration.
- `codeBlocks.ts` becomes a plain rehype plugin: assembly through `highlightedAssemblyCode`, C/C++ through `highlightedCppCode`, other languages keep their `language-*` class for the Monaco pass; the gutter as today.
- Tests (node): each option set on a small fixture; a Lecture with a Playground, its testcase fence and named C files; the disabled-links marks; untrusted stripping; the same input rendered twice gives byte-identical output.
- Done when: those pass without carta imported anywhere in the new module.

### M3: Renderer component

- `MarkdownRenderer.svelte` keeps its props and wrapper classes (`_markdown`, `markdown-body`), renders `{@html html}` with `html = $derived(prepared(renderMarkdown(source, options), prepare))`, and adds `monacoColors`.
- Effects: the Playground embed swap (decision 6) and the Monaco pass (decision 7). Removed: the six Carta instances, `ext`'s theme loading, `{#key}`, `live`, the re-scroll observer, the `@cartamd/plugin-code/default.css` import.
- `MarkdownPreview` drops `live` and passes `monacoColors`; the Exam session's three renderers pass `monacoColors`.
- Done when: every host renders as before in the browser pass, minus the flash.

### M4: Exam builder editor

- `MarkdownEditor.svelte` rebuilt: `Editor.svelte` with `language="markdown"` bound to the value, and a `MarkdownRenderer` preview with `disableLinks` and `monacoColors`.
- `layout: 'split' | 'switch' | 'auto'` (default `auto`). `split` shows the text and the preview side by side; `switch` shows one with a Text · Preview `SegmentedControl` (`components/specific/project/cpu/SegmentedControl.svelte`); `auto` is a container query on the editor's own width, side by side from 768 px.
- `md.scss` is deleted; the Exam builder keeps its box heights.
- Done when: both Exam builder fields edit, preview and save as before, in both layouts.

### M5: Removal and test rewrite

- Remove `carta-md` and `@cartamd/plugin-code` from `package.json`, reinstall, and check that nothing imports `carta-md`, `@cartamd/*`, `shiki` or `@shikijs/*`.
- Rewrite `MarkdownRenderer.dom.test.ts` around the single render (server render via `svelte/server` holds the code block; mounted, the iframe arrives from the effect), replace `fenceLanguages.dom.test.ts` with tests of the C/C++ blocks and the Monaco pass (with `Monaco.get` mocked), rewrite `MarkdownEditor.dom.test.ts` for both layouts, and keep `MarkdownPreview`'s.
- Done when: the editor's suite passes apart from the known golden-query failure.

### M6: Verification

- The editor's suite, `vp check`, `vp lint` with ESLint on the touched Svelte files, `vp fmt --check` on touched files, and a production build; count the build's grammar chunks (expect none).
- Headless Chrome on a private dev server (own `cacheDir`, `hmr: false`):
    - a Lecture with Playgrounds: the prerendered HTML holds coloured code blocks, the iframes replace them after mount without moving the text around them, and no `hydration_html_changed` warning appears;
    - a heading link (`#…`) lands on its heading;
    - the Documentation panel and pages for M68K Directives, Z80 ports, the x86 Runtime library and each Using C chapter: every example coloured;
    - the Workbench Markdown Preview with ` ```python ` and ` ```c ` fences: Python coloured by Monaco, C by ours, colours kept while typing;
    - the Exam builder in both layouts and the Exam session's instructions and prompts;
    - the theme switched light and dark on a Lecture and in the Workbench.
- The one-time parity check: every C/C++ block in the Documentation, Courses and Blog posts coloured by `monaco.editor.colorize` and by `highlightedCppCode`, compared character by character in computed colour, dark and light; every difference fixed or written down here.

## Implementation (2026-10-20)

Built as planned, with these differences:

- **Tests.** The pipeline's tests are `lib/content/markdown.dom.test.ts`, in the jsdom project: jsdom is not a direct dependency, so a node test had no parser for the output. The renderer's are `MarkdownRenderer.svelte.dom.test.ts` (the `.svelte.` infix compiles the runes its props use), and the editor's stub Monaco with `markdown/__fixtures__/EditorStub.svelte`.
- **The Monaco pass** (`lib/content/monacoCodeBlocks.ts`) does three things the plan did not foresee. It applies the editor's theme itself (`Monaco.setCustomTheme(generateTheme())`) when it changes, because where only a Preview is open no editor has set it and Monaco paints in its default light theme; the renderer computes that theme inside its effect, so a theme change colours the blocks again, and the cache is cleared with it because `colorize` names colours by their place in the theme's table. It creates and disposes a model of a language before colouring, and waits for its tokenizer, because JSON, CSS, HTML and TypeScript register theirs only then and `colorize` paints plain what has none. And it turns Monaco's no-break spaces back into spaces. A block seen before is coloured a microtask after the render rather than within it, which is still before the next paint.
- **The palette follows the scoped theme.** The renderer chose its token colours from the reader's own theme even on a page a layout dresses in a language's theme (the Workbench, a Lecture), so a light reader theme painted light-theme colours on a dark surface. It now prefers `ScopedTheme`, as `CodeSample`, `InstructionDocumentView` and `generateTheme()` already did.
- **M1** (separate agent): `lib/content/cppHighlight.ts` (+ 19 tests), `monacoCppGrammar.d.ts`, `cppTokenOf`/`cppTokenClass` and a shared bracket helper in `assemblyPalette.ts`, `annotation` added to the colour table (the one C/C++ colour that came from Monaco's base theme), its CSS rule. The editor colours C/C++ brackets by level, one count across `()`, `[]` and `{}`, and the tokenizer does too. Its comparison script is in the session scratchpad (`m1/parity.mjs`): 0 differences in 5,221 characters per theme over the listed files and rule corpus, 0 in 9,656 over every Markdown file, dark and light.

Found along the way, not changed:

- **Links meant for a new tab open in the same one, and have since the Svelte 5 migration (d1c971ea):** DOMPurify drops `target`, so `rehype-external-links` has had no effect on the Documentation panel, a Lecture section in it or a Project File's Preview. Making it work means `ADD_ATTR: ['target']` with `rel="noopener"`; it would change where those links open, so it is the owner's call.
- **Two failures from the 2026-10-20 documentation commit (815d400b), present without this work:** the M68K golden query "post increment" (the heading now says "postincrement") and `environmentLibrary.test.ts`'s x86 `<sim.h>` descriptions. `generateListing.test.ts` timed out once under load and passes alone.

### Verification (2026-10-20)

- The editor's suite: everything passes but the failures above. `svelte-check` 0 errors, `vp fmt --check` and `vp lint` clean on every touched file, ESLint clean on the touched Svelte files.
- Production build: succeeds; no Shiki theme chunks, no `shiki` or `carta-` in the client chunks, 6 chunks containing `displayName` where there were about 300.
- Headless Chrome on a private dev server:
    - Lectures (RISC-V Hello world, General course Loops, Flappy Bird in C): the prerendered HTML carries the coloured code blocks (98 `asm-` spans on Loops, no plain `language-c`); the embeds replace them after mount with the same height and gaps, and a code block and its iframe measure the same width in one page; no hydration warning.
    - A heading link (`addressing-modes#a-fixed-displacement-4a0`) lands 72 px from the top and stays.
    - Documentation: every block coloured on the three Using C pages, the x86 Runtime library (171 of 171) and x86 `enter`.
    - The Workbench's Markdown Preview: C and RISC-V coloured by ours, Python and JSON by Monaco in the editor's colours; under the Workbench's scoped theme a change of the reader's theme changes neither, and with the scope cleared both turn to the light palette.
    - The Exam builder: the full-width instructions box side by side (942 px), a section's prompt behind the switch (464 px), the instructions behind the switch once narrower than 768 px; typing in Monaco updates the preview, whose Python Monaco colours.
    - Not opened in the browser: the Exam session, which needs a sealed Exam. Its three renderers take the same `monacoColors` path as the Preview and the builder.

## Risks

- Monaco's grammar file is an internal path that moved in 0.57 (`basic-languages` to `languages/definitions`). An upgrade that moves it again fails the build, not silently.
- `isomorphic-dompurify` runs on jsdom on the server and on the real DOM in the browser. A difference in their output would show as a `hydration_html_changed` warning; the browser pass looks for it.
- A long Markdown File in the Workbench now renders on the main thread at each typing pause. The 150 ms pause stays; if a large File stutters, the render can move behind `requestIdleCallback` without changing the pipeline.

## Out of scope

- Rendering authored Markdown at build time (deferred in ADR 0053).
- A bare `asm` fence coloured as the Project's Target in the Workbench.
- Monaco colouring on Lecture, Blog and Documentation pages.
- Renaming the `asm-` classes and the colour table.
