# Entry questions

The questions a student would type into the Documentation's search box that a **Documentation
entry** answers ([ADR 0079](../../../../docs/adr/0079-entry-questions-are-written-once-and-committed.md),
[the design record](../../../../docs/design/documentation-search.md), "Searching in plain
English"). A language model writes them once and they are committed in `src/lib/documentation/questions/`; the build only reads
them, and readers never see them. Every entry but the x86 Extensions has them.

## The files

One file a language, `<language>.json` (`m68k`, `mips`, `risc-v`, `x86`, `z80`), keyed by entry id
and sorted by it:

```json
{
    "mips/syscalls/1": {
        "hash": "0123456789abcdef",
        "questions": ["…", "…", "…"]
    }
}
```

A language with no questions yet has no file. Edit a file only through
`scripts/entry-questions.mjs merge`, which validates the questions and writes the hash.

## The hash

The text the questions were written from: the first 16 hex digits of the SHA-256 of the entry's
`summary`, `text` and `detail`, as the built shard (`build/search/docs-<language>.json`) holds
them, joined by a NUL character and encoded as UTF-8:

```
sha256(summary + "\0" + text + "\0" + (detail ?? ""))[0:16]
```

An entry whose hash differs today keeps its questions and is listed as stale. Anything that changes
those three fields in the shard, including a change to how the build turns an entry into plain
text, makes its questions stale.

## How to run

From `packages/asm-editor`; the last argument of each command is the built shard folder, by default
the repository's `build/search` (the main checkout's will do when the Documentation is the same).

1. Build the site, or use a build with the same Documentation.
2. `node scripts/entry-questions.mjs packets <language> [--chapter <title>] [--missing|--stale]`
   writes one packet per Chapter to `.cache/entry-questions/packets/<language>/`.
3. A writer agent follows `scripts/entry-questions/writer.md` with a packet and writes a result to
   `.cache/entry-questions/results/<language>/<packet>.json`.
4. A checker agent follows `scripts/entry-questions/checker.md` with the packet and the result, and
   writes flags to `.cache/entry-questions/flags/<language>/<packet>.json`; the writer revises the
   flagged questions.
5. `node scripts/entry-questions.mjs merge <result.json>` validates the result and writes the
   accepted entries here.
6. `node scripts/entry-questions.mjs check` lists entries that are missing, stale or orphaned
   (questions of an entry that no longer exists). It never fails; run it before each release.
