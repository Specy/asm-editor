# Searching in plain English: implementation plan

Companion to [documentation-search.md](./documentation-search.md), section "Searching in plain
English", whose decisions this plan implements, with
[ADR 0079](../adr/0079-entry-questions-are-written-once-and-committed.md) and the 2026-11-09
amendment of [ADR 0026](../adr/0026-hybrid-search-in-the-browser-over-a-build-time-index.md). Written on
2026-11-09 and revised the same day after a review of the plan against the code and a review of the
idea, both of which tested their claims on the real index. Terms are the glossary's: **Documentation
entry**, **Lecture section**, **Search scope**, **Entry question**, **Search modifier**, **Workbench**.

**Status, 2026-11-09:** phases 1 to 8 are implemented on the branch, uncommitted, and reviewed; what
shipped, the tuned values and what is left for the owner are in the design record's "Status"
section.

Paths are relative to `packages/asm-editor/` unless they start at the repository root (`docs/`).

## Ground rules

- **Where the work happens.** Branch `feat/plain-english-search`, cut from `main` at `aa40949d`, in the
  worktree `.cache/wt/plain-english-search` (its `node_modules` and Core folders are symlinks into the
  main checkout; the model and the vector cache are symlinked in `packages/asm-editor/.cache/`).
    - Never run `pnpm` there: it re-links the main checkout. Use `node_modules/.bin/vp`.
    - Tests, from `packages/asm-editor`:
      `node_modules/.bin/vp test run --config .cache/wt.config.mts <paths>`.
    - Types, from the worktree root: `node_modules/.bin/vp run --ignore-depends-on asm-editor#check`.
    - Lint and format, from the worktree root: `node_modules/.bin/vp lint <paths>` and
      `node_modules/.bin/vp fmt <paths>` (`--check` to check).
    - Vitest 5 caches `import.meta.glob` on disk: after adding a golden file, delete the
      `node_modules/.vitest-cache` entries that mention `golden/` (`grep -rl golden/ … | xargs rm`).
    - Nothing is committed; the owner reviews the branch and commits.
- **Every phase ends clean**: the search tests (`src/lib/search`, `src/components/search`,
  `src/components/documentation/browser`), the type check and lint pass, and the files touched are
  formatted. The golden queries' meaning half runs because the model is in `.cache/`.
- **The golden files guide, they do not bind.** When a deliberate ranking change breaks a golden
  query, read the new order; if it is as good or better, rewrite the query's expectation and list it
  in the phase's report. Do not tune a weight to the last decimal to make one query pass.
- **The search core stays plain TypeScript.** `src/lib/search` imports no component. What the box
  needs without Orama (reading Search modifiers) lives in a module of its own, as `queryTerms.ts`
  does, so the palette does not bring Orama to every page.
- **One path for a query.** The worker and the golden test prepare a query the same way (reading its
  modifiers, choosing the text to embed): one exported function both call.
- **The agents get the same search.** `search_documentation` goes through the worker, so every rule
  but the Problems boost reaches it.
- **Visible style changes are registered** in [design-system-changes.md](./design-system-changes.md),
  in the same change. **Text a reader sees** follows `.agents/skills/user-facing-text`.
- **Subagents.** Opus for code and reviews; Haiku writes Entry questions after the pilot allows it.

## Phase 1: the engine ranks on fixed scales, with its own stemming (`engine.ts`)

1. **Two databases.** The words database keeps today's units without their `embedding`. Every vector
   moves to a meaning database of its own (`id`, `shard`, `kind`, `ref`, `embedding`), so vector-only
   units never count in the words half's document count or average field length.
2. **Two halves, fused on fixed scales.** For a query: one full-text search over the words database,
   and, with a query vector, one vector search over the meaning database (the scope's `where`,
   `RANKING.similarity`, `RANKING.candidates`).
    - Collapse each half to results first: an entry's or a section's score in a half is its best
      unit's.
    - Words: `s / (s + c)`, with `c` near a typical top score of a good match (measure it on the
      golden queries). Meaning: the cosine, at least 0.
    - Fused: `wWords · words + wMeaning · meaning`, a half that misses a result adding 0.
    - Then the multipliers (`sectionWeight`, `extensionGroupWeight`, `runtimeFunctionWeight`), retuned
      for this scale, then the fixed rules (exact names first, a section once).
    - Without a vector, the order is the words half's alone, multipliers applied.
3. **Stemming by the engine.** Orama's own stemming stays off. The engine adds stemmed copies of the
   prose fields as properties of their own (an English Porter-style stemmer; `@orama/stemmers` if it is
   already a dependency, otherwise a small one in `src/lib/search`), and runs the words half as two
   full-text searches: the query as typed over names, title, context, code and the unstemmed prose,
   and the stemmed query over the stemmed copies with whole-word matching (no prefix match on a stem:
   check Orama 3.1.18's `exact` option), the two scores added per unit. Titles of instructions and
   other code-named entries are never stemmed (`bts`/`bt`, `loope`/`loop`).
4. **Weights by the share of names.** Replace `hybridWeightsOf(query)` with a method using the names
   of the scope's shards only (`this.names` holds every loaded shard's), numbers and code-shaped words
   (`$`, `.`, `#`, `%`), stop words left out: share 1 gives 0.7 / 0.3, share 0 gives 0.35 / 0.65, in
   proportion between; a single word keeps 0.7 / 0.3. Word-like names count as words (phase 2 gives
   the list; until then, an empty list).
5. **Tests.** `engine.test.ts`: the fixed-scale fusion (a result found by one half only, a weak best
   match staying weak), each multiplier's effect at the new scale (×1.25 breaks a near tie and does
   not lift a weak result over a strong one), the weights table, stemming (`divides` finds `divide`;
   `movs` does not find `mov`; `operation` does not find `operand`). The golden files in both modes.

Done when the golden files pass in both modes, every rewritten query is listed, and 20 hybrid queries
take about as long as today in the worker.

## Phase 2: shard format 2

1. **Format 2**, in one change to `payload.ts` (`PAYLOAD_FORMAT = 2`):
    - `EntryDocument.questions?: string[]` (empty until phase 5);
    - `entryWindows: { entry: number }[]`: an entry's extra vectors, after its first; the payload ships
      no text for them (the build embeds the text, the browser needs only the vector);
    - `wordLikeNames: string[]` on a Documentation shard (below);
    - the vectors in this order: each entry's first, then `entryWindows`, then the Lecture windows
      (no shard has both entries and Lecture windows). Say so in the type's comment and `unitCount`.
2. **An entry's text in windows.** `documents.ts`: an entry's first vector reads its questions (none
   yet), then its embedding text, cut at `ENTRY_EMBEDDING_CHARACTERS`; the text past the cut is read in
   further windows of about that length with an overlap, each starting with the entry's Chapter and
   name. The x86 Extensions get no windows. The windows go to the meaning database only.
3. **Word-like names.** `shards.ts`, for a Documentation shard: the language's entry names that the
   Lectures (every Course) use at least three times as ordinary words, counted in their prose without
   code blocks or inline code. The engine reads the list from the shard.
4. **Old shards.** `isPayload` refuses format 1. When the worker meets a shard of another format, its
   error says the site was updated and the page needs a reload, and the box says so instead of "Check
   the connection".

Done when the payload round trip, the shard tests and the golden files pass, and `build/search` grows
only by the windows' vectors and the word-like lists (compare sizes with the main checkout's
`build/search`).

## Phase 3: Search modifiers and the name boost

1. **`src/lib/search/queryModifiers.ts`**, pure, used by the engine, the worker and `SearchField`:
   `readQuery(query, scope, kinds?) → { text, languages, kinds, marks }`.
    - Language names and aliases count only in a scope of several languages (site, Courses), and only
      for the languages it searches. `text` is the query without them, unless one is the whole query.
    - Kind words, from the design record's list, count only with other words and only where the scope
      has a Chapter of that kind (the engine knows; the box asks with what the scope can have, so an
      Exam has no "lecture" and M68K no "port"). Kind words stay in `text`.
    - `marks`: `{ start, end, modifier: 'language' | 'kind', label }` in the typed query's offsets.
    - Matched as whole words, case-insensitive, longest first ("system call", "trap task", "risc v",
      "x86-64", "addressing mode", "condition code", "screen command", "c function").
2. **The engine applies them after fusion.**
    - Languages: in a scope of several languages with one or more named, a result of another language
      counts 0.25; a General course section counts fully.
    - Kinds: a result in a favoured Chapter (one holding entries of the favoured kind, its prose
      included; Lecture sections for the lecture words) gets a small lift, starting at 1.5. Two kind
      words lift both.
    - Exact names use `text`, and in a scope of several languages the named languages' entries are
      pinned first.
3. **Names inside a question.** Split on white space, commas and brackets (keeping `$`, `.`, `#`, `%`
   inside words); a piece that is an exact name in the scope's shards, not a stop word, and not
   word-like unless typed as code (all capitals, a size suffix, `$`, `.`, `#`, `%`), multiplies its
   entries' scores. Start at 1.5 and tune.
4. **One preparation for a query.** An exported function reads the modifiers and gives the text to
   embed and the options for `engine.search`; the worker and `golden.test.ts` call it, so the golden
   files test what the worker does. Result highlighting (`queryTerms`) leaves out the stripped
   language words.
5. **Tests.** `queryModifiers.test.ts`, table-driven (every alias, multi-word aliases, a name as the
   whole query, a single-language scope leaving names alone, kind words alone, with other words, and
   outside their scope, offsets with odd spacing and capitals). `golden/site.json` and the site scope
   in `golden.test.ts`: "m68k multiply numbers" (M68K's multiply first), "mips print integer", "riscv
   exit program", "mips add" (MIPS `add` pinned first), and in language files "how does dbra work",
   "add two numbers", "why does my loop not stop" (no `STOP`/`END`/`NOT` first), a pasted
   `lw $t0, 4($sp)`, "directive for strings", "what is the instruction pointer" (`rip` stays).

## Phase 4: Search modifiers in the box (`SearchField.svelte`)

1. **The text drawn twice.** When `scope` is set, the input sits in a positioned wrapper with a layer
   behind it drawing the same text; the input's own text is transparent, with a visible caret. The
   layer copies the input's font, padding, letter spacing and indent, and follows its horizontal
   scroll (`input`, `scroll`, `select`, `keyup`, `pointerup`). If the input and the layer ever measure
   differently, draw no marks rather than misplaced ones.
2. **The marks.** `readQuery(value, scope).marks` in the accent colour, checked for contrast in the
   light and dark themes.
3. **The Tooltip.** Pointing at a mark shows the shared Tooltip at its span. `tooltip.svelte.ts` cannot
   open a card from code today (its instances are private): add the smallest export that shows and
   hides a Tooltip for an element, used with the span; no second tooltip system.
4. **Screen readers.** The marks' labels go in a visually hidden span beside the status; the status
   itself stays as it is, since it is visible while the model loads.
5. **Records and checks.** An entry in `docs/design/design-system-changes.md`. A `*.dom.test.ts` for
   the marks and the hidden words. In headless Chrome: a long query scrolled to its end, a mark under
   the pointer, the caret and a selection, both themes, a phone-width palette. Rows in
   `docs/manual-verification.md`.

## Phase 5: Entry questions

1. **The files.** `src/lib/documentation/questions/<language>.json`, sorted by entry id:
   `{ "<entry id>": { "hash": "<first 16 hex of the sha256 of summary, text and detail>",
   "questions": ["…", "…", "…"] } }`.
2. **The script.** `scripts/entry-questions.mjs`, reading built Documentation shards (format 1 or 2;
   the main checkout's `build/search` will do, since the Documentation is the same):
    - `check [dir]`: missing, stale and orphaned entries per language, the x86 Extensions left out;
      prints, exits 0.
    - `packets <language> [--chapter <title>] [--missing|--stale] [dir]`: one JSON packet per Chapter
      in `.cache/entry-questions/packets/`, each entry's fields plus the Chapter's other entries' names
      and summaries.
    - `merge <result.json>`: validates and writes into the language's file with each entry's hash.
      Rejects fewer than three questions, duplicates, a question over 140 characters, another
      language's name or alias, more than half naming the entry itself.
    - The prompts, committed: `scripts/entry-questions/writer.md` and `checker.md`. The checker flags a
      question the entry does not answer, and one another entry of the Chapter answers as well.
3. **The pilot.** Haiku and Opus each write MIPS Syscalls (50 entries) and M68K Exceptions (20); an
   Opus checker reads both. If Haiku's flag rate is much higher, the hard Chapters (prose, exceptions,
   Screen and devices, interrupts) go to Opus. The flagged questions and a sample of about fifty go in
   the report for the owner.
4. **The run.** Every language, one writer per language, Chapter by Chapter; a checker per language;
   flagged questions rewritten or dropped, an entry keeping at least three.
5. **Indexing.** `shards.ts` reads the language's file into `EntryDocument.questions` (stale ones
   included, orphans ignored). The engine gives the entry's unit a `questions` property (and its
   stemmed copy) with its own boost, starting at 2. The entry's first vector reads its questions first
   (phase 2).
6. **Tests.** The script's validation and `check` on fixture shards; the shard builder reading
   questions; the golden files in both modes; the Courses golden file especially, since Entry
   questions may push lectures down (`sectionWeight` is the lever).

## Phase 6: the synonym table

1. Run the golden files with the Entry questions in, and write down the plain-English queries that
   still fail, plus the reader's words the 27 hard-coded synonyms covered.
2. `src/lib/search/synonyms.json`: rows of `{ "reader": "for loop", "documentation": ["loop",
   "counter", "branch"] }`, only for those. Phrases matched longest first on the typed words before
   stop words are dropped, then single words; the Documentation's words go to the words half only.
   It replaces `SYNONYMS` and `expandedTerms`.
3. Tests: phrase before word, a phrase across a stop word, a single word left alone; the golden files.
   The rows are listed in the report for the owner to review.

## Phase 7: the Problems panel

1. **What is favoured.** In `SidePanel.svelte`, from `session.activeDiagnostics`: errors only; a
   diagnostic without a `file` belongs to the entry File; Arguments diagnostics are skipped; the File's
   language from `editorFileLanguage` (as `liveBuildHasErrors` does), assembly only; the line from
   `fileText`, or from the Build's own files in the snapshot view. The word is the line's first after
   its label: a word ending in `:`, or, in M68K, any word in the first column (`FPS equ 30` has the
   label `FPS`). Only words that are entry names. The list is compared by content, so a re-analysis
   with the same errors changes nothing.
2. **Down to the engine.** `DocumentationBrowser` takes `favour`, `LiveSearch` takes it with the
   query, `searchClient.search` and the worker's `search` request carry it, and the engine multiplies
   a named entry's score by 1.25. A change of `favour` joins the refresh key (as a new shard does), not
   the query effect, so it never clears the reader's hold. The palette and the agents' tool never pass
   it.
3. **Tests.** The words taken from diagnostics (a label with and without a colon, a C File, a warning,
   a file-less error, an Arguments error, an empty line); the boost breaking a near tie and not lifting
   a weak result over a strong one; a hold surviving a `favour` change.

## Phase 8: records

- The design record's section gets a "Status" paragraph: what shipped and the values the tuning
  settled on (`c`, the weights, the multipliers and lifts).
- `docs/manual-verification.md` rows for phases 3, 4 and 7, walked in the browser.
- `CONTEXT.md` checked against what shipped.

## Risks

- **Retuning all at once.** Two databases, fixed-scale fusion and stemming land together in phase 1.
  Take them one at a time inside the phase and run the golden files after each.
- **Questions crowding out lectures.** Question text lifts entries' vectors (by about 0.1 in the
  review's test). Watch the Courses golden file after phase 5.
- **The layer behind the input.** Font loading, sub-pixel widths, scrolling and IME composition can
  misalign it; test in Chrome and Firefox, and fall back to no marks.
- **Ordinary words among the kind words.** "port" as in porting code, "course" as in "of course". The
  lift is small and the highlight shows what happened; drop a word if it misfires.
- **Stale questions.** An entry rewritten to say something else keeps questions that no longer fit
  until someone runs `check`. Run it before each release.

## Left to implementation

- `c`, the weights, the lifts and the boosts, and the three existing multipliers' values at the new
  scale.
- Window length and overlap for long entries.
- The stemmer, and how whole-word matching of stems is done in Orama 3.1.18.
- The exact list of hard Chapters after the pilot.
