# Documentation and search

Design record of the interview begun on 2026-10-01. Terms are the glossary's
([CONTEXT.md](../../CONTEXT.md)): **Documentation**, **Documentation entry**, **Chapter**, **Lecture
section**, **Search scope**, **Workbench**, **Course**, **Lecture**, **Playground**, **Preferences**.
The owner asked for hybrid search (Orama with `mdbr-leaf-ir`) in the Workbench's Documentation panel,
on each language's documentation pages and in the Courses, and for an overhaul of how the
Documentation panel shows the Documentation. Each decision below was agreed in turn; the two that are
hard to reverse are ADRs, and the rest can change.

## Where search looks

- **One Search scope per language, the same from every place.** A search in the Workbench, on
  `/documentation/<language>` or in that language's Language course looks through the language's
  Documentation, its Language course and the General course.
- **The General course searches every Course.** On a General course page, a search looks through the
  General course and every Language course, with no Documentation, since the General course has no
  language of its own.
- **An Exam searches the Documentation alone.** Lectures are left out so that no Example hands a
  student a finished program (the bubble sort Example answers a "sort" question outright).

## Ranking

- **One ranking, with the exact name first.** Documentation entries and Lecture sections share one list
  ordered by relevance; an entry whose name is exactly the query (`MOVE`, `syscall`, `.data`) is
  always first. A Lecture section may outrank an entry when it answers better ("print a number").
- **The same order everywhere.** No place puts its own kind of result first.

## The Documentation panel

The owner's complaints, besides search, were that the panel gives **no overview** (one long page of
collapsed headings) and that **entries look heavy** (large monospace headings, "Op 1/Op 2" chips,
boxed descriptions, FiraCode for prose). What an entry contains is not a complaint, and the editor's
hover is not to link into the panel; both stay as they are.

- **Compact rows that expand.** Every Documentation entry is one row (its name, operands or number,
  and a one-line summary) under its **Chapter**'s heading, which stays pinned at the top while its
  rows scroll. A row of Chapter chips at the top jumps between Chapters. Clicking a row expands the
  full entry in place.
- **Search filters and reorders the same rows.** With a query, the Chapters give way to the ranked
  results; a result whose name is exactly the query opens already expanded. Clearing the query brings
  the Chapters back.
- **Lecture sections are compact cards that expand in place.** A card shows Course › Lecture ›
  section title and two or three lines with the matched words highlighted. Expanding it shows the
  whole section, with its Playgrounds as plain highlighted code (no Emulator in the panel), and an
  "Open the lecture" link that opens a new tab at the section; the Workbench never navigates
  ([ADR 0024](../adr/0024-workbench-is-a-host-agnostic-shell.md)).
- **Links between entries stay in the panel.** A link from one Documentation entry to another puts the
  target's name in the search box, so its row comes first and opens expanded, and Back returns to
  the previous query. Nothing leaves the Workbench, so these links work in an Exam too. Links to
  anything else (a Lecture, an external page) open a new tab, and stay disabled in an Exam as today.
- **Monospace for code only.** Mnemonics, operands and examples keep FiraCode; prose takes the app's
  text font.
- **The panel shows everything the documentation pages show** (today it has no M68K trap tasks or
  exceptions, no MARS or RARS Screen, no RISC-V registers), which follows from the entry model.

## Search on the documentation pages and in the Courses

These pages may navigate, unlike the Workbench, so their results are places to go rather than rows
to read.

- **One palette per page.** Results appear in a palette overlay centred over the page: the search box
  and the single ranked list below it, ↑ and ↓ to move, Enter to go, Esc to close. On a phone it is a
  full-screen sheet.
- **Three ways in.** A full-width search box at the top of the landing page (`/documentation/<language>`,
  or the Course's own page), a search box at the top of the sidebar on every page, and Ctrl+K (⌘K on a
  Mac). Both boxes open the palette rather than showing results themselves. The sidebar box replaces
  the documentation's instruction-name filter; the sidebar's lists stay.
- **What a result opens.** An instruction goes to its own page; any other Documentation entry goes to
  its anchor on its Chapter's page; a Lecture section goes to its heading in the Lecture, which needs
  the Lectures' headings to carry ids.
- **The list of Courses searches too.** `/learn/courses` gets the full-width box and Ctrl+K with the
  General course's Search scope. `/documentation`, the grid of languages, gets no search: choosing a
  language is one click, and searching it would need a scope across every language.
- **`/documentation/<language>/all` becomes the panel's browser at full width**: Chapter chips, pinned
  Chapter headings and compact rows that expand in place, each expanded row linking to its own page
  (an instruction's page with its runnable example, or its Chapter's anchor). It replaces today's
  full-length listing.

## Ctrl+K in the Workbench

Ctrl+K (⌘K) opens the Documentation panel with its search box focused, from anywhere in the
Workbench, the editor included, so the key means search on every page. Monaco gives up its Ctrl+K
chords (Ctrl+K Ctrl+C and the folding commands; Ctrl+/ still toggles a comment). It is a new
shortcut in Settings › Shortcuts and can be rebound there. Shift+D still toggles the panel.

## The Documentation as entries ([ADR 0025](../adr/0025-documentation-is-a-list-of-entries.md))

Each language's Documentation is one list of Documentation entries with an id, a kind, names,
searchable text and a renderer. The panel, the documentation pages and the index read the same
list. The prose components move to markdown split at their headings; widgets that cannot be
markdown stay components an entry names.

## The search engine ([ADR 0026](../adr/0026-hybrid-search-in-the-browser-over-a-build-time-index.md))

- Orama, full-text and vector together, over an index the build makes.
- `MongoDB/mdbr-leaf-ir`, int8, used for both documents and queries. Queries carry the model's query
  prompt (`Represent this sentence for searching relevant passages: `); documents carry none.
- It runs on ONNX Runtime with `@huggingface/tokenizers`, not on transformers.js: `onnxruntime-node`
  in the build and the tests, the CPU-only WebAssembly build of `onnxruntime-web` in the browser.
  transformers.js's browser build needs the 27 MiB WebGPU runtime, over Cloudflare Pages' 25 MiB file
  limit. Checked on 2026-10-01 with the real files: the ONNX graph's `sentence_embedding` output
  already includes the pooling and the 384→768 projection, and six sample queries ("how do I print
  a number", "avoid flicker when drawing", "loop a fixed number of times") each ranked the right M68K
  entry first, at full width and at the first 256 dimensions alike.
- Vectors keep their first 256 dimensions. Cosine similarities of right answers were 0.30 to 0.48,
  so Orama's default vector threshold (0.8) would drop every result; the threshold is tuned with the
  golden queries.
- What the reader downloads: 21.9 MiB of weights and 13.6 MiB of runtime, about 18 MiB over the wire
  when compressed.
- The build fetches the model at a pinned Hugging Face commit, checks the files' hashes, and keeps the
  files and every document's vector (keyed by a hash of its text) in the gitignored `.cache/`; CI
  keeps that directory with `actions/cache`. The files are served from our origin under
  `/_app/immutable/`.

### Loading in the browser

- The model starts downloading in a Web Worker as soon as a page with a search box is entered, once
  the page is idle: the documentation pages, a Course's pages, and the Workbench, whose Documentation
  panel is one click away.
- It does not download when the browser asks to save data (`navigator.connection.saveData`). That
  is the only way to stop it: the owner chose no Preference and no switch, so a reader without a
  data saver always gets the model.
- Until it is ready, search is full-text only, and a spinner in the search box shows while the reader
  types. The first query typed after it is ready uses both; results already on screen are not
  reordered under the reader.

## Guarding the ranking

Golden queries in vitest: a small file per Search scope, eight to ten queries each (mnemonics,
misspellings, plain questions such as "print a number"), each naming the Documentation entry or
Lecture section that must be in the top three, run against the real index. The full-text half
always runs; the meaning half runs wherever `.cache/` holds the model, which includes CI, because
PR validation gets the same cached fetch step as the build.

## The agents' search tool

- **A `search_documentation` tool in this work**, for every agent built on the default coding agent
  harness: the Workbench's agent, the lecture agent, `/chat` and the teacher's review agent in an
  Exam. It searches the Search scope of the place the agent runs in, so in an Exam the Documentation
  alone, the teacher's agent included. A student's Exam has no agent at all (`agent: 'off'`).
- **The prompt tables stay.** The generated tables of trap tasks, syscalls and ports in `prompts.ts`
  keep the service numbers in front of the agent; the tool adds everything else. Whether the tables
  can go is a later decision, made on evidence.
- **The search is a plain function** (scope and query in, ranked entries and sections out) that the
  panel, the palette and the tool all call; nothing in it knows about the UI.

## Settled while planning (2026-10-01)

Small calls the [implementation plan](./documentation-search-plan.md) had to make, inside the
decisions above. Any of them can be overruled.

- **The agents' scope where the place has no language.** On `/chat`, a General course lecture or an
  Exam review of a non-assembly section, the tool searches the language it is given. Failing that, it
  uses the editor's language. Failing that, it uses the General course's scope. An Exam is always
  Documentation only.
- **The Exam's scope is a host capability.** The Workbench gets `searchLectures`, false in the Exam,
  rather than knowing it is in an Exam (ADR 0024). Its Documentation panel and its AI panel both
  follow it.
- **`/all` has no search box of its own.** The palette serves it, as it does every site page.
- **What is not indexed.**
    - Course and module `index.md` files are not Lectures, so they are left out.
    - Exercise solutions inside `<details>` are left out.
    - Long sections are embedded in overlapping windows, and the comments in their code are embedded
      with the prose.
- **x86 Extensions are one entry per NASM section.** That includes the 108 instructions of documented
  sections that need an extension, which no page lists today.
- **Without the model files, a dev server falls back to full-text only.** A build without them fails.
- **The service worker copies an unchanged immutable asset forward** across deploys. Otherwise the model
  would be downloaded again every other push to main.

## Constraints

- Every URL under `/documentation` that exists today keeps working, instruction pages and Chapter
  pages alike, because search engines and course links point at them.

## Not in this work

- **Linking the editor's hover to the panel.** The owner did not count the missing way in from the
  code among the problems.
- **Richer entries in the panel.** An expanded row shows what the panel shows today; flags, per-size
  detail and the runnable example stay on the instruction pages, reached through the expanded row's
  link on `/all`.
- **A switch for the model download.** Only the browser's Save-Data signal stops it.
