# Documentation and search: implementation plan

Companion to [documentation-search.md](./documentation-search.md), whose decisions and
[ADR 0025](../adr/0025-documentation-is-a-list-of-entries.md) and
[ADR 0026](../adr/0026-hybrid-search-in-the-browser-over-a-build-time-index.md) this plan implements.
Written on 2026-10-01, after the interview closed. It rests on a spike that ran the real model, and on
three read-only surveys of the code: the Documentation of each language, the course pipeline, and the
agent and shortcut plumbing. Terms are the glossary's: **Documentation**, **Documentation entry**,
**Chapter**, **Lecture section**, **Search scope**, **Workbench**.

## Ground rules

- **Work on a branch.** Use `feat/documentation-search`, cut from `feat/workbench` once the Workbench
  edits in progress there are committed. This work changes `SidePanel`, `WorkbenchShell`,
  `WorkbenchUi`, `WorkbenchSession` and `shortcutsStore`, which those edits also touch.
- **Every phase ends clean.**
    - `npm run check`, `npm run lint`, `npm run format:check` and `npm test` pass.
    - The phase's S rows are added to [manual-verification.md](../manual-verification.md) and walked in
      the browser.
- **The entries are a layer on top, not a rewrite.** The Documentation entries sit over the existing
  data modules: the `*-documentation.ts` files, `M68K-traps.ts`, `Z80-model.ts`, `trs80Display.ts` and
  the x86 generated tables.
    - Those modules keep their exports and shapes. The Monaco providers, the grammars,
      `languageDetector`, the agent prompts and their tests all read them, and none of these change.
    - The entry layer imports the data modules, never the other way round.
    - Nothing in `Project.svelte.ts`'s import graph imports the entry layer.
- **The search core knows nothing about the UI.** `src/lib/search` is plain TypeScript with no
  component imports, tested under node. It takes the embedding function as a parameter, so a test runs
  either the real model, when `.cache/` holds it, or a fake.
- **No transformers.js.** Use ONNX Runtime and `@huggingface/tokenizers` directly
  ([ADR 0026](../adr/0026-hybrid-search-in-the-browser-over-a-build-time-index.md)).
- **Keep the design system.** Theme tokens, `Button`, `Card`, `Input` and the icon sets. The panel and
  the palette get visual review rounds after phase 6, as the Workbench did.
- **Test at three levels.**
    - Pure logic under node (`*.test.ts`).
    - Components with behaviour worth pinning under jsdom (`*.dom.test.ts`).
    - The panel, the palette and the model loading in headless Chrome, as in the earlier plans.

## Target structure

```
scripts/search-model.mjs           pinned download of the model files, sha256-checked, into .cache/
scripts/search-model-plugin.ts     Vite plugin: virtual:search-model, the files as hashed assets
src/lib/documentation/
  entries.ts                       DocumentationEntry, Chapter, EntryKind, DocumentationLanguage
  documentation.ts                 documentationFor(language): the Chapters, imported lazily
  m68k/ mips/ riscv/ x86/ z80/     adapters over the data modules, and the prose as markdown
  mars/screen.md                   the MARS and RARS Screen prose, with variant placeholders
  links.ts                         a /documentation href to the entry it names
src/lib/content/
  headings.ts                      headingSlug: one slug for the rendered ids and the index
  lectureSections.ts               splitLecture: a Lecture's markdown to its Lecture sections
src/lib/search/
  scope.ts                         SearchScope, its shards, and the scope of an agent's place
  model.ts                         revision, file list and hashes, shared with the script and plugin
  embedding.ts                     query prompt, tokens, first 256 dimensions, normalising, int8
  embeddingNode.ts                 the onnxruntime-node session, for the build and the tests
  documents.ts                     entries and Lecture sections to search units
  payload.ts                       the shard payload: format, encode, decode
  engine.ts                        Orama over loaded shards, the hybrid query and the fixed rules
  searchWorker.ts                  Web Worker: onnxruntime-web (CPU), tokenizer, engine
  searchClient.svelte.ts           main thread: preload, search, status
  golden/<scope>.json, golden.test.ts
src/routes/search/[shard].json/+server.ts     the prerendered shard payloads
src/components/documentation/
  browser/DocumentationBrowser.svelte  the panel and /all: Chapter chips, pinned Chapters, rows, results
  browser/EntryRow.svelte, LectureSectionCard.svelte
  entries/                         one renderer per entry kind, and the widgets
  ChapterView.svelte               a Chapter page on the site
src/components/search/
  SearchPalette.svelte, SearchLauncher.svelte, searchHotkey.ts
```

**Shards.**

- **Documentation:** `docs-m68k`, `docs-mips`, `docs-risc-v`, `docs-x86`, `docs-z80`.
- **Lectures:** one per Course, `lectures-assembly-basics` and `lectures-<language>`.

A Search scope loads the shards it needs, and the browser keeps each one cached on its own.

| Search scope                                                            | Shards                                             |
| ----------------------------------------------------------------------- | -------------------------------------------------- |
| A language: its Workbench, its documentation pages, its Language course | `docs-L`, `lectures-L`, `lectures-assembly-basics` |
| The General course's pages and `/learn/courses`                         | the six `lectures-*`                               |
| An Exam                                                                 | `docs-L`                                           |

## Phase 0: the search core, without UI

- **Dependencies.**
    - Add `@orama/orama` 3.1.18, `onnxruntime-web` 1.30.0, `onnxruntime-node` 1.30.0 (dev) and
      `@huggingface/tokenizers` 0.2.0, all at exact versions.
    - Make `unified`, `remark-parse`, `remark-gfm`, `mdast-util-to-string` and `hast-util-to-string`
      direct dependencies. Today they come only through carta-md.
    - Measure 1.30.0's `ort-wasm-simd-threaded.wasm` against the 25 MiB limit. The dev build of
      1.31 measured 13.6 MiB.
- **`model.ts`** pins `MongoDB/mdbr-leaf-ir` to one Hugging Face commit. It lists
  `onnx/model_quantized.onnx`, `onnx/model_quantized.onnx_data`, `tokenizer.json` and
  `tokenizer_config.json`, each with its sha256.
- **`scripts/search-model.mjs`** downloads into `.cache/search-model/<revision>/`.
    - It fetches a file only when it is missing or its hash is wrong, writes it to a temporary name and
      renames it, and fails on a hash mismatch.
    - Run it as `npm run search:model`. The `predev`, `prebuild` and `pretest` hooks also call it.
    - Under `predev` and `pretest` it only warns when the network is down. Under `prebuild` it fails
      the build.
- **The Vite plugin** provides `virtual:search-model`.
    - In a build it emits the four files as hashed assets under `/_app/immutable/assets/` and exports
      their URLs. It fails when a file is missing.
    - In dev it serves them from `.cache` and exports `null` when they are absent, so search runs
      full-text only.
    - Only the main thread imports it, and hands the URLs to the worker.
    - `server.watch.ignored` gains `.cache`.
- **`embedding.ts`** exports `embed(texts, kind: 'query' | 'document')` over an injected session.
    - Queries get the model's query prompt; input is cut at 512 tokens.
    - It reads `sentence_embedding`, keeps the first 256 dimensions and normalises them.
    - It quantizes to int8 with the model card's ±0.3 calibration (scale 127/0.3, clamped).
    - Tests: the dimensions, the normalisation and the quantization round-trip error. With the model in
      `.cache`, the spike's six M68K queries keep their first results.
- **`payload.ts`.** A shard is `{ format: 1, model: <revision>, dims: 256, documents: […], vectors:
<base64 Int8Array> }`. A Lecture section that is embedded in several windows is stored once, with
  several vectors. Tests: a round trip.
    - Orama's own `save()` was ruled out by the spike: 44.6 MiB of JSON against 3.1 MiB for this format,
      for every Course together.
- **`engine.ts`** inserts the loaded shards into one Orama database with `insertMultiple`. The spike
  measured about 0.75 s for 3.5k units on node.
    - **Query mode:** hybrid when the caller gives a query vector, full-text otherwise.
    - **Full-text tuning:** boosts rank names and titles above text, and text above code. Typos are
      tolerated.
    - **Vector tuning:** `similarity` and `hybridWeights` are constants tuned in phase 3. The default
      threshold of 0.8 must go: right answers measured 0.30 to 0.48.
    - **Fixed rules, after Orama:**
        - An entry whose name equals the normalised query comes first. Normalising lowercases and trims,
          and a directive matches with or without its dot.
        - A Lecture section appears once, at its best window.
        - The limit applies last.
    - **Tests, with fake vectors:**
        - An exact name beats a higher score.
        - Windows collapse into one result.
        - An Exam scope never returns a section.
- **The service worker copies forward.** An immutable asset served from an older cache generation is
  copied into the current one. Today it is dropped once its generation is two deploys old and
  downloaded again even though it is unchanged. Deploys follow every push to main, so readers would
  download the 35 MiB of model files again every other push.
- **CI.**
    - `deploy.yml` and `pr-validation.yml` cache `.cache/search-model` (keyed by the revision) and
      `.cache/search-vectors` (keyed by a hash of the shard inputs, with a restore prefix) using
      `actions/cache`.
    - The `prebuild` and `pretest` hooks fetch the model on a cache miss.

## Phase 1: Lecture sections and heading anchors

- **`headingSlug(text)`.** Lowercase the text and keep inline code as text. Drop punctuation and turn
  spaces into dashes. Add `-2` when a slug repeats within a lecture.
    - Some names are stripped by DOMPurify: `title`, `length`, `images`, `links`, `forms`, `body`,
      `head`, `cookie`, `location`, `submit`, `action`, `hidden`, `children`, `attributes` and the
      rest of its list. They get `-section` appended.
    - No current heading hits that list, and none repeats within its lecture.
- **Heading ids in MarkdownRenderer.**
    - A new `headingIds` prop adds a synchronous rehype transformer. It gives h2 and h3 their slug in
      both of Carta's passes.
    - The ids are then in the prerendered HTML, which matters because SvelteKit fails the prerender on
      a `#` link whose id is missing.
    - Lecture pages pass the prop; agent and documentation markdown do not.
    - Test: the ids are present in the SSR render under jsdom.
- **The lecture page** sets `scroll-margin-top` on h2 and h3, so a heading isn't hidden under the fixed
  navbar. After Carta's async pass replaces the HTML, the page scrolls to `location.hash` again,
  unless the reader has already scrolled.
- **`splitLecture(markdown)`** parses with remark. That handles the eight fences indented inside list
  items, which `parseMarkdownFences` misses.
    - **Where sections break:**
        - One section per `##`, with `###` folded in.
        - The intro before the first `##` is a section of its own.
        - A leading `# Title` is dropped. 52 lectures repeat their title that way.
    - **What each section records:**
        - Title and slug.
        - Prose, with inline code kept.
        - Code, from playground and plain fences, with testcase fences dropped.
        - The comments from that code.
        - The section's markdown.
    - **Exercise solutions** (`<details>`, 242 blocks) are left out of the prose and the code but kept
      in the markdown.
    - **Course and module `index.md`** files are not Lectures and are not split.
- **Tests over every lecture in `src/content`.**
    - The 946 sections.
    - Slugs are unique within each lecture.
    - Every id survives DOMPurify.
    - No section starts at a `#` line inside a fence. There are 295 such lines in the MIPS, RISC-V and
      General course code.

## Phase 2: the Documentation entries ([ADR 0025](../adr/0025-documentation-is-a-list-of-entries.md))

### 2a. The model, and the Chapters that are already data

`entries.ts` defines the types:

```ts
type DocumentationLanguage = 'm68k' | 'mips' | 'risc-v' | 'x86' | 'z80'

interface DocumentationEntry {
    id: string // 'm68k/instruction/move': stable and unique within the language
    language: DocumentationLanguage
    chapter: string // the Chapter's id
    kind: EntryKind // instruction, directive, syscall, trap-task, register, flag,
    //                 condition-code, addressing-mode, port, screen-command,
    //                 extension-group, prose
    title: string
    names: string[] // what an exact-name search matches, lowercase
    signature?: string // what the row shows after the name: operands, a number, a port
    summary: string // one line of plain text
    text: string // every searchable word, plain text
    code: string // examples, searched with a lower weight
    href: string // its own page, or its Chapter's page and anchor
    anchor: string
    data: EntryData // per kind, read by that kind's renderer
}

interface Chapter {
    id: string
    language: DocumentationLanguage
    title: string
    href: string
    description: string
    entries: DocumentationEntry[]
}
```

- **Lazy loading.** `documentationFor(language)` imports a language's adapter dynamically.
    - The data modules then load only where the Documentation is shown. So do the `@specy/*` Cores
      that the MIPS, RISC-V and Z80 instruction text comes from.
    - The RISC-V module still flips the Core's global 64-bit flag at import, as it does today.
- **Entries per language.** Counts are from the 2026-10-01 survey.

| Language | Chapters and entries                                                                                                                                                                                                                                                                                                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M68K     | Instructions (69; a family's names list its 126 mnemonics, so `beq` finds Bcc); Addressing modes (9); Condition codes (16, plus the explanation); Shift directions; Trap tasks (39, plus the group introductions, colours, key codes and unsupported tasks); Exceptions; Directives (18); Assembler features                                                                                                |
| MIPS     | Instructions (224, variants inside); Directives (39); Syscalls (36); Registers (12, plus FPU 3 and CP0 4); Screen                                                                                                                                                                                                                                                                                           |
| RISC-V   | Instructions (263, RV64-only variants marked); Directives (31); Syscalls (37); Registers (general 12, FPU 5, CSR 13); Screen                                                                                                                                                                                                                                                                                |
| x86      | Instructions (273 in their 20 NASM sections); Extensions (one entry per NASM section, 81 of them, holding every instruction that needs an extension, including the 108 from documented sections that no page lists today); Directives (26; comma-joined names split); Registers & flags (11 registers, 7 flags, 6 register-file rows, 16 condition codes); Syscalls (181: 14 described, 167 from the table) |
| Z80      | Instructions (68, variants and flags inside); Directives (21, with 49 spellings in the names); Registers & flags (26 registers, 6 flags, 10 condition codes, 7 operand placeholders); Input/Output (27 ports, 16 screen commands, the TRS-80 display, colours, mouse views)                                                                                                                                 |

- **Searchable text.** An entry's `text` is its markdown reduced to plain text with
  `mdast-util-to-string`. Some entries have no description: four x86 instructions, for example. Those
  fall back to their summary, and then to their title.
- **Anchors.** Every id that exists today is kept: `task-<n>`, the Z80 port names, the register-file
  ids, the Screen section ids and the mnemonic ids on `/all`. Every other entry gets one.
- **Tests.**
    - Ids are unique within each language.
    - Every entry has a title, a summary and some text.
    - Every name is lowercase.
    - Each name in today's instruction indexes has an entry with that name.
    - Every href points at a route that exists.

### 2b. The prose Chapters as markdown

- **Where the prose moves.** It goes to `src/lib/documentation/<language>/*.md`, outside `src/content`,
  so neither the Course loader nor `content.test.ts` reads it; Prettier still formats it. Each file is
  split at `##`, and each section becomes a `prose` entry.
    - **M68K:** Exceptions, the condition-code explanation, Shift directions, Assembler features, and
      the trap task introductions and notes.
    - **MIPS and RISC-V:** one Screen file, `mars/screen.md`, with `{simulator}`, `{service}` and
      `{argument}` placeholders filled in for each, plus their syscall and register introductions.
    - **Z80:** the I/O introductions and the TRS-80 text.
    - **x86:** the register, directive and syscall introductions and notes.
- **Widgets stay components** that an entry names:
    - M68K: the colour swatches, the key codes and the flags grid.
    - x86: the instruction forms table and the condition-code table.
    - Z80: the flags cell, the variants table and the colours.
    - MIPS and RISC-V: the MARS parameter and register cards.
- **Links written in Svelte markup become markdown links,** so an Exam disables them like every other
  link. Today the NASM manual link stays live in an Exam.

### 2c. The site reads the entries

- **Chapter pages render from entries.** Each `/documentation/<language>/<chapter>` route renders
  `ChapterView` for its Chapter, at the same URL. It shows every entry in full, each at its anchor.
- **Instruction pages read their entry.** They keep everything they show: the flags grid, the forms and
  variants tables, and the runnable example.
- **Every `instruction/[instructionName]` route exports `entries()`,** built from the entries.
    - Today only M68K does. The other 828 pages exist only because the crawler finds them through the
      sidebar lists, which phase 6 changes.
    - A test compares the generated set with today's 954 names.
- **Shared pieces leave the M68K folder.** `InstructionsMenu`, `MenuLink`, `ClientOnly` and
  `style.scss` live under the M68K routes but are imported by every language. They move to
  `src/components/documentation/`.
- **Fixed during the move:**
    - The PreIndirect chip is labelled "Post increment".
    - 16 M68K instruction pages open an empty editor, because `makeIns` always sets `{ code: '' }`, so
      the page's fallback never fires.
    - RISC-V's "Try it" path is `/documentation/riscv/…`.
    - x86 `/all` has a duplicate `directives` id, and its section ids contain commas.
    - The panel and the site render M68K condition codes and shift directions differently. After the
      move there is one rendering.
- **Verify:** every Chapter page, and one instruction page per language, against today's.

## Phase 3: the index

- **`documents.ts`** turns everything into search units.
    - An entry is one unit.
    - A Lecture section gives one unit per window of its prose: about 200 words, overlapping by 40,
      with its code's comments joined in. It is embedded as `Course › Lecture › Section` followed by
      that text.
    - Prose goes into the full-text fields, and code goes into a separate field with a lower weight.
- **`src/routes/search/[shard].json/+server.ts`** has `prerender = true` and an `entries()` listing the
  eleven shards.
    - It builds the shard's units and embeds the missing ones. It imports `onnxruntime-node` lazily,
      inside the handler.
    - It reads and writes the vector cache at `.cache/search-vectors/<revision>/<sha256 of the text>`.
    - It returns the payload.
    - SvelteKit prerenders one page at a time, so embedding runs sequentially. A cold build embeds about
      3,500 units; the spike measured about 16 long sections per second.
- **Golden queries.** `src/lib/search/golden/<scope>.json` holds 8–10 queries for each language and for
  the Courses. For example:
    - **M68K:**
        - `move`: the MOVE entry first.
        - `beq`: Bcc first.
        - `mvoe`: MOVE.
        - `print a number`: trap task 3, or the "Print and read numbers" section, in the top three.
        - `avoid flicker when drawing`: the double-buffering Screen entry.
    - **Other languages:** MIPS `.data`, Z80 `djnz`, x86 `write syscall`.
    - **Courses:** `what is the stack`.
    - `golden.test.ts` builds each scope in process, from the same code as the endpoint. The full-text
      expectations always run; the hybrid ones run when the model is in `.cache`. PR validation runs
      it, which matters because PR validation never builds.
- **Tuning.** `hybridWeights`, the vector threshold, the boosts and the typo tolerance are tuned until
  the golden queries pass. The values and the shard sizes are recorded in this plan's status.

## Phase 4: search in the browser

- **`searchWorker.ts`** runs everything off the main thread.
    - **The model runtime** is `onnxruntime-web/wasm`, the CPU build. Its `wasmPaths` points at the
      hashed `ort-wasm-simd-threaded.wasm`. It runs one thread unless the page is cross-origin
      isolated.
    - **The tokenizer** is built from the model files.
    - **The engine** runs here too.
    - **Messages:** `loadShards`, `loadModel(urls)`, `search(scope, query, limit)`.
- **`searchClient.svelte.ts`** is the main-thread side.
    - `preload(scope)` fetches the scope's shards. It starts the model too, unless
      `navigator.connection?.saveData` is set.
    - `search(scope, query)` returns the results with `mode: 'text' | 'hybrid'`.
    - A reactive status reports the shards and the model: `idle`, `loading`, `ready`, `skipped`
      (Save-Data) or `failed`.
    - A query typed once the model is ready uses it, but results already on screen are not reordered.
- **Preloading.** Every page with a search box calls `preload` once the page is idle
  (`requestIdleCallback`, with a timeout). That covers the documentation layouts, the course layout,
  `/learn/courses` and the Workbench; the Workbench preloads as soon as it is mounted, not when its
  Documentation panel opens.
- **Verify in headless Chrome:**
    - A first visit: the download, the spinner while typing, then full-text results, then hybrid ones.
    - A reload served from cache.
    - Offline after one visit.
    - Save-Data: no request for the model at all.
    - Two deploys later, the model is still cached (the copy-forward).

## Phase 5: the Documentation panel and `/all`

- **`DocumentationBrowser.svelte`.** Props: `language`, `scope`, `variant: 'panel' | 'page'` and
  `links: boolean`.
    - **Browsing:**
        - Chapter chips scroll to their Chapter, and Chapter headings stay pinned while their rows
          scroll.
        - `EntryRow` shows the name, signature and summary. Only the name and signature are in FiraCode.
        - Clicking a row expands the entry's body in place.
    - **Searching** (the panel variant):
        - The search box shows its spinner while the model downloads.
        - Results replace the Chapters, and an exact-name result opens expanded.
        - A Lecture section appears as a `LectureSectionCard`: Course › Lecture › section title, plus
          two or three lines with the matched words highlighted.
        - Expanding a card shows the section's markdown. Its Playgrounds render as plain code, through a
          MarkdownRenderer option that skips both the playground marker and the iframe pass.
        - "Open the lecture" opens a new tab at `#slug`.
    - **Links:**
        - A link to another Documentation entry (resolved by `links.ts`) puts that entry's name in the
          search box and pushes the previous query onto a Back stack.
        - Any other link opens a new tab. With links off, as in an Exam, it is plain text.
        - A rehype transformer marks entry links before DOMPurify runs, because the no-links Carta
          instance forbids `<a>`.
- **In the Workbench.**
    - `SidePanel` renders the browser in place of `LanguageDocumentation`.
    - A new host prop, `searchLectures` (default true), is false in the Exam. It is a capability like
      `documentationLinks`, as ADR 0024 asks of hosts. The AI panel's search follows it.
- **Ctrl+K (⌘K).**
    - **The shortcut store:**
        - `shortcutsStore` gains a platform `Mod` token: ⌘ on macOS, Ctrl elsewhere. A `Mod` shortcut
          is matched from the event's modifier flags, not from `pressedKeys`, so left and right keys
          and press order stop mattering for it.
        - A new definition, id 9, defaults to `Mod+KeyK`: "Search the documentation".
        - The recorder writes `Mod+` when the platform's modifier is held, and labels read `Ctrl+K` or
          `⌘K`.
        - Tests: the store has none today.
    - **Catching the key before Monaco.** The Workbench listens for `Mod` shortcuts on `window` in the
      capture phase, before Monaco's own listener. Monaco would take Ctrl+K as the start of a chord and
      stop it.
        - It calls `preventDefault`, which stops the browser's own Ctrl+K search, and
          `stopPropagation`.
        - It stands aside while the Shortcuts section is recording.
        - Keys pressed inside the AI assistant's iframe never reach the page. This is a known limit.
    - **Opening the panel.**
        - `session.panels.searchDocumentation()` opens the Documentation panel unless it is already the
          active one. It never closes it or un-maximizes it, and on phones it opens the drawer.
        - A one-shot `ui` intent focuses and selects the search box after `tick()`, as
          `ui.openSettings(section)` does for Settings.
    - **The macOS stuck key.** On macOS the browser sends no keyup for a key released while ⌘ is held.
      `pressedKeys` drops that key after a `Mod` shortcut, and clears entirely on Meta's keyup.
- **`/documentation/<language>/all`** renders the browser's page variant.
    - It has no search box of its own: the sidebar box and Ctrl+K open the palette, so no page offers
      two kinds of search.
    - Each expanded row links to its own page.
- **Removed:** `LanguageDocumentation.svelte`, and the search effects in the five panel components.

## Phase 6: the palette on the site

- **`SearchPalette.svelte`** is a modal dialog.
    - **Semantics:** `role="dialog"` and `aria-modal`, with a focus trap. Escape or a backdrop click
      closes it, and focus returns to whatever opened it.
    - **Contents:** the box with its spinner, then one ranked list. ↑ and ↓ move, Enter goes, and the
      mouse works too.
    - **Each row:** a kind badge, the title, Course › Lecture for a section, and one line of summary or
      snippet.
    - **Phones:** below 600px it is a full-screen sheet.
    - Nothing in `src` is a dialog today. `Select.svelte`'s listbox keys are the model to follow.
- **Mounting.** It sits beside `Sidebar`, inside each layout's `ThemeScope`.
    - A fixed element inside the sidebar, the navbar or a page would be broken by their transforms and
      filters.
    - The theme variables live on the scope, not on `:root`, so mounting on `<body>` would lose the
      theme.
- **`SearchLauncher.svelte`** is a box that opens the palette and hands it whatever is typed.
    - **Full width** at the top of `/documentation/<language>`, `/learn/courses/<course>` and
      `/learn/courses`.
    - **Compact** at the top of the sidebar in the course layout and in the five documentation layouts.
      There it replaces the `fuzzy-search` filter, and the instruction lists stay.
- **`searchHotkey.ts`** is the Workbench's capture-phase `Mod` listener, reading the same shortcut. It
  serves those layouts and `/learn/courses`, so Ctrl+K also works from the Monaco editors on
  instruction pages and in lecture demos.
- **Navigation** uses `goto(href)`. An entry or section reached at an anchor is briefly highlighted.
- **Verify:**
    - Keyboard-only use.
    - Phones.
    - Each language's theme colours.
    - Ctrl+K from inside an instruction page's editor.

## Phase 7: the agents' search tool

- **The tool.** `search_documentation` joins `DefaultCodingAgentToolName` and the tools record.
    - **Arguments:** `{ query, language?, limit? }`. The limit defaults to 8, with a maximum of 20.
    - **Returns:** `{ mode, results: [{ kind, title, where, summary, text, href }] }`. `text` is the
      entry's text, or the section's prose cut to a budget.
- **The tool calls `context.searchDocumentation?.(query, language)`.** That function is injected through
  `DefaultCodingAgentToolContext`.
    - `tools.ts` therefore imports nothing from search, and tests pass a fake.
    - Without the function, the tool returns `failure('unavailable')`.
- **The scope is decided at run time.** It is read through a getter, because `AiAgent` registers a tool
  only once by name.
    - **The rule:**
        1. The place's language, when the place has one.
        2. Otherwise, the tool's `language` argument.
        3. Otherwise, the editor's language.
        4. Otherwise, the General course's scope.

        An Exam searches the Documentation only.

    - **What each agent passes:**
        - **Workbench agent:** the Project's language, plus `searchLectures` from the host.
        - **Lecture agent:** `courseLanguage(slug)`, which gives none on a General course lecture.
        - **`/chat`:** no language.
        - **The Exam review agent:** the section's language, or the argument on other sections, and
          Documentation only.
    - `scopeForAgent` in `scope.ts` holds the rule as a pure function, with tests.
- **Wiring.** `ExamReviewAgent`'s allow list gains the tool, and `renderToolSelectionTips` gets a tip
  for it. The `prompts.ts` tables stay.
- **Tests:** `tools.test.ts` with a fake search.

## Phase 8: removals and records

- **Deleted:**
    - The five `*Documentation.svelte` panel components.
    - Whatever else the site no longer uses.
    - `string-similarity`, `fuzzy-search` and their `@types`.
- **Records:**
    - This plan's status.
    - The S rows in [manual-verification.md](../manual-verification.md).
    - A changelog version. Search, the panel and the palette are reader-facing.

## Risks

- **Weight on the reader.** The cache holds 21.9 MiB of weights and 13.6 MiB of runtime.
    - The Workbench preloads them on phones too, and only Save-Data stops it.
    - Cloudflare may send the weights uncompressed, as `application/octet-stream`: 21.9 MiB rather
      than 15.2.
- **Two runtimes.** The build embeds with `onnxruntime-node` and the browser with `onnxruntime-web`, and
  their numbers can differ slightly. The golden queries run on node, so an S row repeats a few of them
  in the browser.
- **A heavier build.** The prerender now loads ONNX Runtime and embeds, and a cold cache needs Hugging
  Face.
    - PR validation never builds, so a prerender failure first appears on main. The golden test builds
      the same units in process to catch most of it.
    - The build already needs a 6 GB heap.
- **Text that comes from the Cores.** The MIPS, RISC-V and Z80 instruction text comes from the
  `@specy/*` packages. A Core release changes the index, and golden queries may need updating.
- **991 URLs.** That is 37 static pages plus 954 instruction pages. The generated `entries()` and the
  sitemap test must keep every one, and search engines index them.
- **The capture-phase listener takes Mod+K from everything.** That includes every input and the focused
  Screen, which ADR 0008 lets own the keyboard but which already leaves Ctrl and ⌘ combinations to the
  browser. The Shortcuts recorder is the one exception.
- **Panel length.** The x86 and Z80 Chapters are long. If the panel stutters, rows may need
  virtualising (to be measured in phase 5).

## Left to implementation

- The tuned weights, threshold, boosts and tolerance (phase 3).
- The window size and overlap.
- How matched words are highlighted, and the rows' exact design (the visual rounds).
- The Chapter chips on a narrow panel: one scrolling row, or wrapped.
- The vector cache's layout on disk.
- How a `Mod` shortcut reads on Linux and Windows (`Ctrl+K`) and on macOS (`⌘K`).

## Status, 2026-10-01

All eight phases implemented on `feat/workbench` on 2026-10-01, the M68K, x86 and Z80 Documentation
entries by three agents in parallel following the MIPS and RISC-V adapters. Browser rows S1 to S10
in [manual-verification.md](../manual-verification.md).

**Tuned in phase 3** (`RANKING` and the functions beside it in `src/lib/search/engine.ts`), against
the golden queries of every Search scope:

- **The vector threshold is 0.15.** Right answers measured 0.30 to 0.48 in the spike.
- **A Lecture section's score is multiplied by 0.75** (`sectionWeight`), so the Documentation comes
  first where it has an answer; the owner asked for it after the first implementation. 0.6 dropped
  every lecture out of conceptual questions, and 0.85 still let a lecture lead "shift left" and
  "call a function and return".
- **Boosts:** names 3, title 2, context 1.2, text 1, code 0.4.
- **No fixed hybrid weights.** They follow the query's length: one word is 0.7 text and 0.3 vector,
  two words are even, three or more are 0.35 text and 0.65 vector. A mnemonic is found by its letters
  and a question by its meaning.
- **Typos are forgiven only in a single word of four letters or more.** With a tolerance of 1
  everywhere, "the" matched MIPS `tne` and `tge`, "an" matched `$a0 - $a3`, and those entries topped
  every question.
- **Stop words come out of a question's full-text half.** "and" and "or" are among them; a single
  word keeps them, so `and` still finds the instruction.
- **Synonyms join a question's full-text half:** print and display, exit and end, key and keyboard,
  and a few more. The M68K Documentation says trap task 3 "displays" a number, and a reader asks how
  to print one.

**What changed from the plan:**

- **File names.** The Vite plugin is `scripts/search-model-plugin.ts`, and the model
  manifest is `src/lib/search/searchModel.json`, which the plain-node fetch script can read.
- **Instruction pages still read their data modules.** They show more than an entry holds (the flags
  grid, the forms and variants tables, the runnable example), so only their `entries()` comes from
  the entries.
- **`/all` gained Expand all and Print as PDF.** The old page printed every entry, and a browser of
  folded rows would have printed nothing.
- **Fields views gained an `after` list** for what a sample prints or shows, and entries a `codeName`
  flag for kinds named both ways (M68K addressing modes in words, Z80 operands in code).
- **Text fixed while moving it:** the Z80 F register is the _low_ half of AF, and the M68K `-(An)`
  mode decrements. Found but left for the owner: the M68K Assembler features heading says
  "Immediate" over a sentence about indirect values, and the trap "differences" list names modes 17
  and 94, but 94 is a task.
