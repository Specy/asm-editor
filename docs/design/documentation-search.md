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
  always first.
- **The Documentation counts more than the Courses.** Revised on 2026-10-01 at the owner's request,
  after the first implementation: a lecture uses many of the words of every topic it touches, so it
  matched too readily. A Lecture section's score is multiplied by 0.75, so the Documentation comes
  first wherever it has an answer ("call a function and return" gives `$ra` and `jal`), and a
  lecture still leads a question the Documentation has no entry for ("what is the stack", "go 64
  bit"). A flat 0.6 was tried first and dropped every lecture out of such questions.
- **The same order everywhere.** No place puts its own kind of result first.

## The Documentation panel

The owner's complaints, besides search, were that the panel gives **no overview** (one long page of
collapsed headings) and that **entries look heavy** (large monospace headings, "Op 1/Op 2" chips,
boxed descriptions, FiraCode for prose). What an entry contains is not a complaint, and the editor's
hover is not to link into the panel; both stay as they are.

- **Compact rows that expand.** Every Documentation entry is one row (its name, operands or number,
  and a one-line summary) under its **Chapter**'s heading, which stays pinned at the top while its
  rows scroll. Chapter chips at the top, wrapping onto as many lines as they need, jump between
  Chapters. Clicking a row expands the full entry in place.
- **Chapters fold.** Clicking a Chapter's heading folds it to the heading and back (added on
  2026-10-01); a chip unfolds the Chapter it jumps to.
- **Long prose is cut in the panel.** A prose entry, like a Chapter's opening "Making a syscall",
  shows its text in place rather than as a row. In the Workbench's panel, past about five lines it is
  cut with a fade and a Show all button in the middle of it, and Show less under the whole text cuts
  it back, so the rows after it stay a glance away; prose that runs only a line or two past shows
  whole, and a followed link shows it whole. The documentation pages, `/all` and the Chapter pages,
  show prose whole, to be read through (added on 2026-10-20).
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
  and the single ranked list below it, ↑ and ↓ to move, Enter to go, Esc to close. It keeps one height
  whether or not it has results yet. On a phone it is a full-screen sheet.
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
- 2026-11-09 (owner, after a Lighthouse audit): the documentation pages and the Courses no longer
  load their scope's word index on arrival either. It starts downloading when the reader points at
  or focuses a search box or opens a palette, with the model; the Workbench still loads its scope
  once the page is idle. The Courses page had fetched all six lecture indexes (1.4 MB of its
  1.8 MB) for readers who mostly never search. The palette itself loads with the page:
  it had brought the Markdown parser and Orama to every page, which now stay with the entries and
  the search worker (`entryKinds.ts`, `queryTerms.ts`), leaving it about 7 KB compressed.
- It does not download when the browser asks to save data (`navigator.connection.saveData`). That
  is the only way to stop it: the owner chose no Preference and no switch, so a reader without a
  data saver always gets the model.
- Until it is ready, search is full-text only, and a spinner in the search box shows while the reader
  types. The first query typed after it is ready uses both; results already on screen are not
  reordered under the reader.
- 2026-11-09 (owner, "Words first"; amends the bullet above): on a slow connection a search showed
  nothing at all while the box said the model was loading. Measured on the live site through a
  10 Mbps link, the navbar's search answered 8.8 s after typing and the model came at 24 s: the 11
  index shards (2.5 MB compressed) downloaded beside the model (22 MB of weights, 3.8 MB of ONNX
  Runtime) and shared the link with it, and every search waited for all 11. Now:
    - The index comes first. A search box asks for its scope's shards, one request each, and the
      model only once the shards on their way are in (`searchClient.warm`); the worker fetches the
      shards at high priority and the model's files at low, so a scope asked for while the model
      downloads still comes first over HTTP/2 and HTTP/3. ONNX Runtime still fetches its own
      WebAssembly, after the weights: fetched beside them and handed over as bytes it would save
      one request's wait on a first visit, but Chrome keeps compiled WebAssembly only when it is
      streamed, so every later visit would compile it again.
    - A search box answers from the shards already in, and asks again each time another shard or
      the model arrives (`LiveSearch`), until the reader starts on the results: moving through them
      with ↑ and ↓ or pointing at one in the palette (a pointer that moved, not one the rows slid
      under), scrolling them, clicking or opening one in the panel. They then stay as they are
      until the query changes. The agents' tool still waits for the whole scope.
    - While the index loads, the list says "Loading search…" rather than nothing, and never
      "Nothing matches" before the index is in; while the model loads, the box says "Matching words
      until meaning search loads…". An index that could not be loaded says so.

## Guarding the ranking

Golden queries in vitest: a small file per Search scope, eight to ten queries each (mnemonics,
misspellings, plain questions such as "print a number"), each naming the Documentation entry or
Lecture section that must be in the top three, run against the real index. The full-text half
always runs; the meaning half runs wherever `.cache/` holds the model, which includes CI, because
PR validation gets the same cached fetch step as the build.

2026-11-09 (owner): the golden files guide the tuning rather than fix it. A deliberate change to the
ranking that breaks a golden query rewrites the query; no graded measure or held-back set of
queries is kept, as not worth it at this project's scale, and no weight is tuned to the last
decimal to make a file pass.

## Searching in plain English

Grilled with the owner on 2026-11-09, after a brainstorm of what would make search answer questions
typed in plain English better, then revised the same day after two reviews: one of the plan against
the code, one of the idea, both of which tested their claims on the real index (a copy of the engine
reproduced all 142 golden queries first). The owner took every revision the reviews led to. Terms
are the glossary's, with two new ones: **Entry question** and **Search modifier**. The
[implementation plan](./plain-english-search-plan.md) orders the work. Every number below is a
starting value, tuned against the golden files during the work.

### Entry questions ([ADR 0079](../adr/0079-entry-questions-are-written-once-and-committed.md))

- **Every Documentation entry has Entry questions, except the x86 Extensions.** Usually three, more
  for an entry that answers more kinds of question. Lecture sections have none: they are long, written
  to teach, and already use the reader's words. The Extensions are lists of other instructions, whose
  questions would only compete with the real entries.
- **Written once, checked, committed.** A language model writes them and the build only reads the
  committed file; the questions are not made again on every build, and no model provider or key is
  in the repository or in CI.
    - Haiku writes them; Opus checks each entry's questions beside the entry and flags any the entry
      does not answer. A pilot first has both models write the questions of two Chapters, MIPS
      Syscalls (50 entries, plain) and M68K Exceptions (20, hard); if Haiku's questions are flagged
      much more often than Opus's, the harder Chapters go to Opus. (x86 SSE was the first choice of
      a hard Chapter, but its instructions are in the Extensions, which have no Entry questions.)
    - The writer sees the Chapter's other entries, and the checker also flags a question that another
      entry of the Chapter answers as well: M68K trap tasks 3, 20 and 17 all answer "how do I print a
      number" within 0.01 of one another today, and questions that do not tell them apart would not
      help.
    - The owner reads a sample of about fifty, and afterwards what the checking agent flags.
    - They read like a student asking, in English: tasks ("how do I…"), ideas ("what is…") and
      symptoms ("why is my number negative"). At least half leave out the entry's own name, and none
      names another language.
- **Nothing breaks, nothing blocks.** Each entry's questions are stored with a hash of the text they
  were written from. An edited entry keeps its questions, marked stale; a new entry has none until the
  script is run; questions of an entry that was renamed or removed are ignored. A check lists what is
  missing, stale or orphaned and never fails the build.
- **In the index, words and the entry's own vector.** An entry's questions are words of its own,
  searched with the rest of its text, and they come first in the text its one vector is made from.
  A hand test on 14 M68K entries found this as good as a second vector made from the questions
  alone (the right answers' ranks summed 13 against 12, from 36 without questions), and it adds
  nothing to the download, where the second vector would have added about 0.65 MB to the 2.45 MB
  index. An entry longer than the 1,800 characters the model reads (72 of them, the Extensions left
  out) gets more vectors for the rest of its text, which carry no words of their own.

### Matching

- **Stemming on prose, done by the engine.** "divides" finds "divide" and "strings" finds "string".
  Orama splits a query into words once for every field, so its own stemming would stem the query
  against names too ("movs" found `mov`) and would merge 26 pairs of mnemonics in titles (`bts` and
  `bt`, `loope` and `loop`). The engine instead keeps a stemmed copy of the prose in fields of its own
  and searches it with a stemmed query, and names, titles and code with the query as typed. A stem
  matches whole words only, not as the start of longer ones, or "operation" (stem "oper") would match
  "operand" everywhere.
- **The words half and the meaning half, fused on fixed scales.** Orama's hybrid mode divides each
  half by its own best score, so a weak best match looks as certain as a strong one. The meaning
  half's similarity is already absolute; the words half's score is brought to a fixed scale (a
  saturation such as score / (score + c)); the two are then weighted and added. Rank fusion, the first
  choice, was dropped: it loses how strong a match is just as much, and with it every multiplier below
  turned into a filter or a pin (with the usual constant, ×1.25 lifted the 16th result above the
  first). The fixed rules (the exact name first, a section at its best window) and every weight apply
  after the fusion.
- **Question or name, by its words.** How much the meaning half counts follows the share of a query's
  words, stop words aside, that are names, numbers or code (`$t0`, `.data`, `move.l`): all of them, as
  in `syscall 10`, leans on words; none, as in "print integer", leans on meaning; a share in between,
  in proportion. A single word leans on words, as before.
- **A name that is also an English word counts as a word.** M68K has 46 entry names that are English
  words, MIPS 49, x86 113 and Z80 57: `stop`, `end`, `not`, `set`, `break`, `leave`, `loop`, `test`,
  `if`, `zero`. "why does my loop not stop" already answers with `STOP`, `END` and `NOT`. A name the
  Lectures use at least three times as an ordinary word, outside code, is word-like: in a question it
  counts as a word, for the share above and for the boost below, unless it is typed as code (in
  capitals, or with a size suffix, a `$`, a `.` or a `#`). The list is worked out by the build from the
  Lectures, so nobody keeps it.
- **Names inside a question are boosted, not pinned.** "how does dbra work" lifts `dbra`: a name in a
  question raises its entry, which must still match the rest of the question. Word-like names and
  stop words are not boosted (`add` is word-like in every language, so "add two numbers" finds `add`
  by meaning instead), nor are syscalls, whose names are everyday verbs (`rename`, `read`). A query
  that is only a name is still pinned, and in a search over several languages the named language's
  entries are pinned first. Commas and brackets split names, so a pasted `lw $t0, 4($sp)` lifts `lw`,
  `$t0` and `$sp`; an operand written as code (`$t0`, `#15`, `d0`) makes the line count as code, so
  `add $t0, $t1, $t2` lifts `add`, while a plain number does not ("wait 5 seconds" leaves MIPS `wait`
  alone). Nor does a stop word or a word in capitals, unless the line looks like code (a comma, or an
  operand written as code): "what does the test I added check" leaves x86 `test` alone, as "we" does.
  With its kind's noun beside it, a name is pinned instead: a couple (Search modifiers, below).
- **A scope scores the same whatever else is loaded.** The browser's one search worker holds every
  shard any box has loaded, and the navbar's search loads them all. Orama's BM25 reads the number of
  documents, each field's average length and how many documents hold a word, so in one database for
  every shard a language's box ranked differently once the site's search had been used (70 of the
  322 golden query and mode pairs changed their top 3, and six failed). Each shard is now a database
  of its own, and its words are scored with the statistics of the scope's shards together, as one
  database of them would score them: the results are those of a database of the scope alone. Each
  shard's own statistics were tried first and lost the tuning: a shard that says the most about a
  word counts it the least, so the General course's lecture fell out of "what is the stack" and
  `djnz` out of "decrement b and jump if not zero" (six golden failures, mean reciprocal rank 0.916 to
  0.881 by words). Each half keeps the scope's best 80 units of a search, each shard asked for as many.
- **A hyphenated word is searched in its parts too.** "sign-extend a byte" finds what "sign extend a
  byte" finds: the stemmed query splits it as the stemmed text does, and the words as typed get its
  parts beside it, since Orama keeps `sign-extend` whole.
- **A synonym table, written after the Entry questions.** One committed table of the reader's words
  and phrases and the Documentation's words for them, added to the words half only, replacing the
  hard-coded list of 27 synonyms. Rows were written only for the golden queries that still failed
  once the questions were in: four shipped (print → display, read → input, colour → color, pause →
  sleep and delay). Of the old list, nothing else helped any golden query and several rows hurt
  (exit → end put the `end` directives ahead of the exit syscalls), so they were dropped. The owner
  reviews the table.

### Search modifiers

- **A language's name, where a search covers several languages.** In the site's and the Courses'
  scopes, a query naming one ("m68k multiply numbers") ranks that language first: every other
  language's results count a quarter, the General course's count fully, and two named languages both
  count fully. It prefers rather than filters. The name is left out of both halves unless it is the
  whole query. Its aliases count: 68k, 68000, Motorola, EASy68K; MARS; RARS, riscv, risc v, rv32, rv64;
  x64, x86-64, amd64, Intel, NASM. In a scope of one language a name is an ordinary word, neither
  stripped nor shown: rv64, NASM and 68000 are subjects of their own language's Documentation ("which
  instructions are rv64 only").
- **A kind word favours the Chapters of its kind.** With other words, these lift the Chapters that
  hold that kind of entry, their overview prose included: directive, pseudo-op; syscall, system call,
  trap task (the syscalls and the M68K trap tasks alike); addressing mode; condition code; port;
  screen command; library, libc, C function (the Runtime library); lecture, lesson, tutorial, course
  (Lecture sections). Singular or plural. The favoured results get a small lift; the rest are left as
  they are. A kind word counts only where the scope has such a Chapter, and the word stays in the
  query. Halving every other kind, the first rule, broke five golden queries, because each Chapter's
  overview entries are prose, and made ordinary questions misfire ("what is the instruction pointer"
  lost `rip`). So instruction, opcode, mnemonic, register, flag, trap, service and runtime are not kind
  words, nor are "function" ("call a function" means a subroutine) and "example" (the Courses and the
  instructions both have them). Beside a name, most of them make a couple instead (below).
- **A name with its kind's noun beside it is a couple, and comes first.** "test instruction", "end
  directive", "printf function", "sp register", or the other way round, "instruction tst",
  "register $t0": a name next to a noun of its kind, with only white space between them, pins the
  entries of that kind it names, as a query that is only a name pins them, before everything else.
  The rest of the query ranks what follows. The nouns, singular only: instruction, opcode, mnemonic
  (an x86 Extensions entry counts, as its instructions name it); directive, pseudo-op, pseudo op;
  syscall, system call, trap task (the syscalls and the trap tasks); register; flag; condition code;
  addressing mode; port; screen command; function (the Runtime library). The name is matched as an
  exact name is, a directive's dot optional and an M68K size suffix read, and with a MIPS register's
  `$` optional ("sp register"), but not for a number or a stop word ("CP0 register 13", "look at
  register $t0"). In a scope of several languages the named language's entries come first, then the
  scope's order; several couples pin in the order typed. A couple's noun is not also a kind word:
  "end directive" lifts no other directive. Only the engine knows the names, so the worker's answer
  reports each couple's offsets and words, and the box marks them once it has the answer.
    - Why: alone, `test` counts as English, since the Lectures use it so, and "test instruction" put
      x86 `test` second in x86, behind the Testcases page, and out of the navbar's first five. The
      noun says the word is a name. Both orders, because readers write both ("the tst instruction",
      "the instruction tst").
    - Before its noun any name of that kind counts, a word-like name or a stop word too ("and
      instruction", "in instruction" for x86 `in`), since the noun makes it plain. An article is the
      exception, unless typed as code ("A register"): it stands where a name stands and is often one
      (the Z80 register `a`, the x86 condition code `a`, the M68K addressing mode `an`), so "what is a
      register" would pin `a`. After its noun only a name that is not word-like counts, unless typed
      as code: "what is an instruction set" must not pin Z80 `set`, while "instruction tst" pins
      `tst`. A word of a two-word noun names nothing else ("system call instruction" is not `call`).
    - The cost, accepted: a word before a noun is read as a name wherever one exists. Over the 7,975
      Entry questions and 16,740 sentences of the Lectures the rule found 24 and 74 different
      couples, and the wrong ones were of four sorts: a preposition or a conjunction ("in instruction
      operands" pins x86 `in`, "registers and instruction names" MIPS `and`, "bytes or instruction"
      RISC-V `or`), "illegal instruction exception" (M68K `illegal`), "FP register" meaning a
      floating-point one (MIPS `$fp`), and a sentence that starts "A register pair" (the Z80 `a`,
      its article in capitals).
- **Shown in the text, not beside it.** The palette's and the Documentation panel's boxes draw a
  Search modifier in the accent colour, in place in the text, with no chip or line of their own.
  Pointing at one shows a Tooltip saying what it did ("M68K results first", "Directives first"); a
  screen reader hears the same, in words kept off the screen. On a phone the colour stands alone. The
  Symbols and Search panels' filters, which search the Project, have none. A couple is one mark over
  its two words and the space between them ("The tst instruction first"), drawn once the answer that
  found it is in and only while the box holds the query it answers, since after another keystroke its
  offsets could be another word's.

### The Problems panel

- **An error lifts the instruction on its line, a little.** In the Workbench's Documentation panel,
  the instruction or directive that starts the line of each error in an assembly File (after any
  label) counts 1.25 times. Not warnings, not C, not the message's words, which differ across the five
  Cores. Nothing in the box shows it, since it does not come from what was typed. The agents see the
  errors themselves and do not get it. The line is read from the text the Diagnostics are about,
  the last complete analysis's (or the Build's, in the snapshot view), so typing on the line changes
  nothing until the analysis catches up, and an edit above it never shifts it onto another line.
- **A deliberate exception.** It is the one place where the order depends on more than the scope and
  the query, against "the same order everywhere" (Ranking) and the search as a plain function of
  scope and query (The agents' search tool). It is kept small for that reason.

### Status (2026-11-09)

Implemented on `feat/plain-english-search` by agents following the
[plan](./plain-english-search-plan.md), uncommitted for the owner's review.

- **Entry questions.** All 2,421 entries have them, 7,975 questions in all. A pilot of Haiku against
  Opus on MIPS Syscalls and M68K Exceptions, checked blind, flagged about 19% of Haiku's questions
  (on the plain Chapter as much as on the hard one) and under 2% of Opus's, so Opus wrote every
  Chapter. An Opus checker then read every Chapter, flagged 1 to 3% and rewrote what it flagged. The
  Runtime library's questions, and those of the Chapters MIPS and RISC-V share, were written once and
  copied by identical text.
- **The values the tuning settled on** (`RANKING` in `engine.ts`): words saturation 40; weights 0.7 /
  0.3 for names and 0.35 / 0.65 for words; questions boost 2; Lecture sections 0.85 (from 0.75, so
  that "what is the stack" keeps its lecture against entries whose questions mention the stack);
  x86 Extensions 0.6 and Runtime library functions 0.3, unchanged; other languages 0.25; kind lift
  1.25 (at 1.5 a golden query held by 0.001); name boost 1.5; Problems boost 1.25. A Runtime library
  function counts fully when "library" or "libc" asks for it.
- **Measured on the golden queries that existed before this work** (mean reciprocal rank, words
  only / words and meaning): 0.891 / 0.929 before, 0.928 / 0.957 after; the queries added with the
  work pass too. The site scope's own queries went from 0.38 to 0.96 with the language preference.
  On 57 questions in a student's own words, written apart from the golden files, 0.28 / 0.48 before
  the Entry questions were indexed and 0.46 / 0.70 after. The index grew by 4% (2.47 to 2.57 MB
  compressed), and a search takes about as long as before.
- **Not solved:** "why does my loop not stop" still answers with M68K `STOP` and the x86 `loop`
  instructions first. Not matching word-like names against names inside a question fixed it but
  broke eight golden queries ("clear the screen", "print a character").
- **Couples** (2026-11-09, the owner's rule): a name with its kind's noun pins its entries ("test
  instruction" puts x86 `test` first); 11 golden queries added, none of the others' expectations
  changed.
- **Small calls made in the work:**
    - A kind word works with a language's name as its other word ("mips syscalls").
    - The lecture kind words do nothing in the Courses' scope, where every result is a lecture.
    - Search modifiers are not drawn while text is selected or composed, so selection and input
      methods stay the browser's own.
    - In M68K, a word in the first column is a label only where s68k reads it as one: a mnemonic
      there (`rts`) is still the instruction. In Z80 every word in the first column is a label, with
      or without its colons, a mnemonic too, as the Z80 assembler reads it: `loop    djnz loop`
      favours `djnz`, and `nop` alone in the first column is a label.
    - A shard of another format says that the site was updated and the page needs a reload. The
      search remembers it: no shard is fetched again, and a later search says so at once.
- **Reviewed.** An independent review of the whole branch found six problems, all fixed: word
  statistics shared by every loaded shard, so a language's results changed once the navbar's search
  had loaded the rest (70 of 322 golden query and mode pairs moved; now none, and the golden test
  runs every query on an engine holding all 11 shards to keep it so); "I" or a capitalised word
  counting as code; hyphenated words left out of the stemmed half; an outdated index fetched again
  on every query; the favoured names following every keystroke; Z80 labels without a colon.
- **For the owner:**
    - The accent colour as text is below 4.5:1 contrast in some themes (MIPS 3.3:1, a light custom
      theme 1.6:1), the question S3-97 left open for all accent text.
    - Scoring a shard with its scope's statistics reaches into Orama 3.1.18's index component (its
      `relevance` object and the index's fields). An Orama upgrade can break it; the all-shards
      golden test would then fail.
    - About 95 x86 syscall entries have no description, only registers, so their questions can only
      use the call's name; MIPS `mulo`'s text never says what it does on overflow.
    - The editor's Z80 highlighting and label list read a mnemonic in the first column as an
      instruction, where the Z80 assembler reads it as a label.
    - Review the synonym table (four rows) and a sample of the Entry questions, as agreed.

### Considered and left out

- **A graded test set of plain-English queries and held-back Entry questions.** Not worth it at this
  scale (above).
- **Rank fusion** and **a second vector per entry for its questions**: see Matching and Entry
  questions.
- **Spelling corrections** from the index's own words, with a dotted underline in the box. Tried on
  the real vocabulary: "devide" is one edit from divide, device and decide, so it was never
  corrected, and 6 to 7% of correctly spelled words missing from a scope were "corrected"
  (segfault to default, dereference to reference). The meaning half copes with typos, and a single
  word keeps Orama's tolerance.
- **Comparisons** ("lw vs lb" pinning both): little use for its complexity; the boost already lifts
  both names.
- **A pasted line of code as a rule of its own**, pinning the instruction and its registers: the name
  boost covers it, and the editor's hover already explains the instruction under the cursor.
- **Retrying without a preference** when the named language has no close match: the Search modifier
  is on show, so the reader can delete it, and silently overriding it would contradict the highlight.
  Orama's words half already matches any of a query's words, so dropping the weakest word changed
  nothing either.
- **A reranker**, a second model reordering the first twenty results.
- **Number notations** (`$FF`, `0FFh`, `0xff`), **"the MIPS equivalent of `movem`"**, **reading the kind
  of question** ("what is" favouring lectures), **a preference for the reader's current language**
  (each language's pages already search that language alone), and **indexing the Examples or the
  editor's own how-tos**.
- **Anything new in the results**, such as an answer card, why a result matched, or an "Ask the
  assistant" row: not now.
- **Languages other than English.** The search is English only; `mdbr-leaf-ir` is too.

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
