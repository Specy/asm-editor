# The Project size limit at 64 MiB — 2026-11-04

The owner has decided to raise `FILE_BYTE_LIMIT`, the bytes all of a Project's Files may take together, from 16 MiB to 64 MiB. The 16 MiB was set on 2026-09-08 "for now" ([multiple-file-compilation.md](../design/multiple-file-compilation.md), Accepted: FileSystem resource limits). asmOS is the reason it matters now: its MIPS and RISC-V ports take 14 to 15 MiB, and a recompile with source annotations about 20 MiB.

This records:

- what the change touches;
- how a Project is stored and held in memory;
- what large Projects cost today, measured in headless Chrome;
- what browsers allow;
- how to keep large Projects fast.

Nothing in the source was changed.

Paths are under `packages/asm-editor/src/` unless they start with `packages/` or `docs/`.

## Decisions (owner, 2026-11-04)

Recorded in [ADR 0076](../adr/0076-a-project-holds-64-mib-of-files.md).

1. **Per-change work no longer depends on the Project's size** (options 1a to 1e):
    - each File record's byte length is kept with it;
    - no `$state.snapshot` of the frozen Files maps;
    - `normalizeBuildInput` trusts a map that `cleanFiles` returned;
    - symbols are cached per File record, so completion and document symbols read again only what changed;
    - `writeText` is cheaper for Monaco's text;
    - `cleanFiles(…, checked)` saves work.
2. **Saves and pages stop reading every Project** (2a and 2b):
    - `ProjectStore.save` replaces that Project's entry in the list instead of `await load()`;
    - the Projects store is loaded only where the list is shown: `SHARE_ID` moves out, and `OpenEditorButton` and the home page count the stored Projects;
    - opening a Project reads only that Project.
3. **Autosave waits for 3 seconds without changes**, up from 250 ms. Nothing may be lost: it saves at once on `pagehide` and on `visibilitychange` to hidden, when leaving the Workbench (navigation or unmount), on the Save shortcut, and before anything reads the stored Project rather than the one in memory. What the interface shows while a save is pending must stay honest.
4. **A linked `.asmproj`** is written with that same idle autosave, never per keystroke, zipped off the main thread with fflate's asynchronous `zip`. Archive export and import use the asynchronous `zip` and `unzip` too (§5).
5. **`FILE_BYTE_LIMIT` becomes 64 MiB:**
    - every message and document that states the limit derives from the constant or is updated;
    - `ARCHIVE_BYTE_LIMIT` follows it; the 1 MiB manifest stays;
    - the FileSystem's guest-visible capacity (ENOSPC, EFBIG) follows it;
    - the legacy Byte-edit bounds stay at 16 MiB;
    - the 4,096-File and path limits stay;
    - the FileSystem Undo budget stays at 64 MiB;
    - no separate cap on one File (question 3).
6. **The Compile answer cap**, `ASSEMBLY_BYTE_LIMIT`, becomes 32 MiB (question 4), and its message derives from the constant.
7. **Share refuses at once** when a Project clearly cannot fit in a link (§5), saying it is too large to share as a link.
8. **asm-examples:** its copy of the limit moves; the MIPS asmOS archive gets `videos/` back; asmOS's README loses its warning to turn source annotations off before compiling. DOOM stays at -Os, and nothing is compiled again.

**Deferred:** per-File storage (option 3), the summaries table (2c), two tabs on one Project (question 2) and testing on phones (question 8). Question 7, rollbacks of a deploy, concerned only option 3's migration.

## Measured after the decisions (2026-11-04)

The same fixtures, machine and headless Chrome as [Measurements](#measurements), on the base commit with the limit served at 64 MiB ("before") and on the change ("after"), both run again that day. "Blocked" is the time the page's thread did nothing else, from a 5 ms heartbeat.

| What                                                        | 16 MiB before → after                                                                                                     | 64 MiB before → after                                                                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typing 5 keys 120 ms apart: long tasks in all               | 5.5-8.5 s → 0.75-0.9 s                                                                                                    | 18.7-22.2 s → 1.15-1.2 s                                                                                                                             |
| The same, longest task while typing                         | 0.5-1.1 s → 0.15-0.21 s                                                                                                   | 1.7-2.7 s → 0.16-0.19 s                                                                                                                              |
| `FileSystem.writeText` of one small File                    | 30-127 ms → 2-3 ms                                                                                                        | 527-551 ms → 3-4 ms                                                                                                                                  |
| Autosave                                                    | two saves during typing, each a `put` of 1.0-2.6 s and the list read again → one `put` 3 s after the last key, 0.1-0.13 s | two saves, each a `put` of 3.5-6.5 s and the list read again → one `put` 3 s after the last key, 0.48-0.59 s, 0.31-0.39 s of it on the page's thread |
| `ProjectStore.save` with five stored, the list loaded       | 1.15-1.2 s → 0.1 s                                                                                                        | 5.3-5.4 s → 0.85-0.88 s                                                                                                                              |
| Opening a Project in the Workbench (one stored)             | 4.3 s, longest task 0.69 s → 3.1-3.8 s, 0.21-0.23 s                                                                       | 6.0 s, 1.8 s → 3.6-4.4 s, 0.72-0.76 s                                                                                                                |
| Opening one of three stored, the store and the Project read | 1.45 s → 0.27 s                                                                                                           | 2.9 s, 5.3 s blocked in all → 0.58 s, 0.43 s blocked                                                                                                 |
| `/projects` to its first card, five stored                  | 1.48 s → 1.07 s                                                                                                           | 4.68 s → 2.85 s                                                                                                                                      |
| Documentation, Learn and home pages, three 64 MiB stored    |                                                                                                                           | one long task of 2.8-3.3 s, the list read → none, nothing read                                                                                       |
| Share                                                       | refused after 12.3 s → at once (4 ms)                                                                                     | a `RangeError` after 28.8 s → "too large", at once (2 ms)                                                                                            |
| Archive export                                              | 0.95-1.03 s, all blocked → 1.06-1.1 s, 0.5 s blocked, longest 0.2 s                                                       | 4.5-4.6 s, all blocked, peak +100-215 MiB → 4.0-4.4 s, 1.8-1.9 s blocked in tasks of at most 0.28 s, peak +99-108 MiB                                |
| Archive import                                              | 0.64-0.66 s, all blocked → 0.44-0.47 s, 0.32-0.36 s blocked                                                               | 2.56-2.57 s, all blocked, peak +216-252 MiB → 1.7-1.8 s, 1.2 s blocked, peak +90-110 MiB                                                             |
| Leaving the Workbench (`projectContentEquals`)              | 60 ms → 12-17 ms                                                                                                          | 0.87 s, peak +381 MiB → 45-54 ms, peak +214 MiB                                                                                                      |
| The Workbench idle, three stored: renderer, used JS heap    |                                                                                                                           | 1,388 MiB, 484 MiB → 1,115 MiB, 270 MiB                                                                                                              |

- **fflate's own `unzip`** starts a Worker for every large entry at once and sends each one the whole archive: at 64 MiB that was 28 Workers and +1.35 to 1.42 GiB. The import inflates the large entries from their own bytes, two Workers at a time, which is the +90 to 110 MiB above.
- **fflate's own `zip`** likewise starts a Worker for every File of 160 KB or more at once: at 64 MiB the export peaked at +313 to 326 MiB and took 2.6 to 2.7 s, blocking the page 1.3 to 1.5 s, the longest task 1.1 to 1.2 s. The export compresses them through fflate's streaming `Zip`, two Workers at a time, which is the row above: a third of the memory, longer in all, in short tasks.
- **What a keystroke still costs** is the same at 16 and 64 MiB: about 50 to 90 ms of the edited File's own work (Monaco, live checking), in two tasks a key.
- **A tab closed right after typing.** A small Project's save started as the page closed was stored 9 times in 15 before and 15 in 15 after, once each save commits its IndexedDB transaction at once. A 64 MiB Project's was stored 2 times in 12: its row was still being written when the tab went. Closing such a tab while its save is written now asks first, and with the question answered after 0.7 s it was stored 9 times in 9. A 16 MiB Project's was stored 6 times in 6 without asking.

## In short

- **Nothing in a browser stops 64 MiB.** A 64 MiB Project is a row of about 70 to 90 million characters. That is far below every quota, value limit and string limit found.
- **What a large Project costs is mostly not IndexedDB.** At 64 MiB, each keystroke in the Workbench blocks the page for 1.0 to 2.3 s; at 16 MiB it is 0.26 to 0.41 s. On every change the editor:
    - validates the whole Project twice;
    - deep-copies every File once;
    - recounts every text File's UTF-8 length in a JavaScript loop;
    - has completion and document symbols split every text File into lines.
- **Every save re-reads and re-validates every stored Project.** `ProjectStore.save` ends in `load()`.
- **Every page that imports the store does the same**, because the store loads on import. That includes Documentation and Learn.
- With five 64 MiB Projects stored, that is 4.3 s, and the page grows by 1.2 GB.
- **Writing the whole row is the smaller cost.** It takes 0.36 to 0.45 s at 64 MiB, of which 0.24 to 0.33 s is on the main thread. Writing one File's row takes 3 to 12 ms.
- **Recommendation:**
    1. Make per-change work independent of the Project's size.
    2. Stop reading every Project where only one is needed.
    3. Then store a Project as a metadata row plus one row per File. Do this in the same release as the raise, so that the migration only ever moves rows of at most 16 MiB.

## Findings

### Where the limit is used

| Place                                                                                                                                                    | What it is                                                                                                                                                            | At 64 MiB                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/projectFiles.ts:56`                                                                                                                                 | `FILE_BYTE_LIMIT`, every File's bytes together (UTF-8 or binary), checked by `cleanFiles` (`:733`)                                                                    | Move                                                                                                                                                                                         |
| `lib/projectFiles.ts:759-760`, `:774-775`                                                                                                                | `cleanFiles`'s checks: one File's base64 length, the running total; message "Project exceeds the 16 MiB file limit"                                                   | Move; derive the message from the constant                                                                                                                                                   |
| `lib/projectFiles.ts:619`, `:669-670`                                                                                                                    | Bounds on legacy Byte edits, applied as rows saved before ADR 0063 are read: at most `FILE_BYTE_LIMIT` inserted, at most 8 × `FILE_BYTE_LIMIT` copied                 | Stay at the 16 MiB values. Only data written under 16 MiB has edits; at 64 MiB a crafted link could make the page copy 512 MiB                                                               |
| `lib/projectFiles.ts:57-58`                                                                                                                              | 4,096 Files and 1,024-byte paths                                                                                                                                      | Stay                                                                                                                                                                                         |
| `lib/languages/peripherals/FileSystem.ts:403-404`                                                                                                        | `changeBytes` (Hex and Pixel editors, Edit journal) checks the total from stored lengths                                                                              | Move                                                                                                                                                                                         |
| `FileSystem.ts:760-773`, `:1030`; enum docs `:103-105`                                                                                                   | Guest errors: EFBIG "File too large (16 MiB)" for one File; ENOSPC "FileSystem capacity exceeded (16 MiB / 4,096 Files)"; `lseek` past the limit is EINVAL            | Move (see [Other limits](#other-limits-to-decide-alongside)); derive the messages                                                                                                            |
| `FileSystem.ts:489-491`, `lib/projectSettings.ts:163-169`                                                                                                | FileSystem Undo budget, 64 MiB by default, a Project Setting                                                                                                          | Needs thought ([below](#other-limits-to-decide-alongside))                                                                                                                                   |
| `lib/projectArchive.ts:52-55`                                                                                                                            | `ARCHIVE_BYTE_LIMIT` = limit + 1 MiB manifest + 4,096 × 2,304 bytes of ZIP records (26 MiB today)                                                                     | Moves with it, to 74 MiB                                                                                                                                                                     |
| `projectArchive.ts:238-239`                                                                                                                              | Import check on expanded sizes; message "Project archive exceeds the 16 MiB file limit"                                                                               | Move; derive the message                                                                                                                                                                     |
| `projectArchive.ts:48`                                                                                                                                   | `MANIFEST_BYTE_LIMIT`, 1 MiB, which holds the metadata and Annotations (at most 256 KiB, `projectFiles.ts:63`)                                                        | Stay                                                                                                                                                                                         |
| `lib/sourceCompilation/compilerExplorer.ts:43-50`, `:703-706`                                                                                            | `ASSEMBLY_BYTE_LIMIT`: 16 MiB of Compiler Explorer's JSON answer (`body.length`, characters), plus 400,000 lines. The message says "The editor supports up to 16 MiB" | Needs thought ([below](#other-limits-to-decide-alongside)); the message should not name the Project limit                                                                                    |
| `compilerExplorer.ts:41`                                                                                                                                 | `COMPILE_BYTE_LIMIT`, 1 MiB of request                                                                                                                                | Stay; unrelated                                                                                                                                                                              |
| `lib/buildOutput.ts:120-124`                                                                                                                             | An x86 Build output that cannot be saved, "as at the Project's 16 MiB limit"                                                                                          | Wording only                                                                                                                                                                                 |
| `components/specific/workbench/hex/hexGrid.ts:8-12`                                                                                                      | Hex scroller capped at 8,000,000 px, its scrollbar scaled past that                                                                                                   | Stay. At 64 MiB on a phone (8 bytes a row, 24 px rows) the rows are 201 million px: 25 px, about one row, per px scrolled. Offsets take 7 digits, which `offsetDigits` (`:40`) already gives |
| `lib/pixels/bmp.ts:13-17`                                                                                                                                | `PIXEL_LIMIT`, 2,048 × 2,048, justified by "a 16 MiB File at 1 bit a pixel"                                                                                           | Stay; reword the comment                                                                                                                                                                     |
| `lib/projectSearch/searchClient.ts:15-19`                                                                                                                | 2 s search limit, "plain … queries take milliseconds over 16 MiB"                                                                                                     | Stay                                                                                                                                                                                         |
| `lib/editJournal.ts:44-48`                                                                                                                               | Edit journal budgets: 1 MiB per File, 4 MiB per Project, 1,000 steps                                                                                                  | Stay; independent                                                                                                                                                                            |
| `lib/examples.ts:113-118`                                                                                                                                | Examples are fetched archives, read by `makeProjectFromArchive`                                                                                                       | Follows the archive limits                                                                                                                                                                   |
| `packages/examples/scripts/lib/files.mjs:5`, `pack.mjs:76`                                                                                               | asm-examples' own copy of `FILE_BYTE_LIMIT` and its message                                                                                                           | Move (separate repository)                                                                                                                                                                   |
| `packages/examples/shared/asmos/build.mjs:62-64`; asmOS `README.md:91`, `:166-168`                                                                       | MIPS asmOS leaves out `videos/` because of the limit; the README says to compile at -Os and without source annotations for it                                         | `videos/` can come back; the README changes                                                                                                                                                  |
| `components/shared/agent/defaultCodingAgent/tools.ts`                                                                                                    | No value derived from the limit. Writes go through the FileSystem and get its errors. `list_files` splits every text File into lines on each call                     | Stay                                                                                                                                                                                         |
| `packages/x86/blink-js/README.md:394`                                                                                                                    | "the editor uses 16 MiB / 4,096 Files"; the Core's own tests fake a 16 MiB capability (`tests/project-file-system.test.ts:118-148`)                                   | README wording; the tests can stay                                                                                                                                                           |
| `utils.ts:104` `SHARE_PAYLOAD_LIMIT`                                                                                                                     | 32,000 characters of lz-string                                                                                                                                        | Unrelated (confirmed), but what it costs to find out grows with the Project ([measured](#one-project-one-operation))                                                                         |
| `packages/mips/mars/.../assembler/GnuAssembler.java:40`, `packages/risc-v/rars/.../GnuAssembler.java:34`                                                 | `MAX_BYTES`, 16 MiB of bytes one Build emits, `.bss` not counted                                                                                                      | Unrelated (confirmed): it counts a program's machine code and data, not its Files                                                                                                            |
| `lib/pseudocode/programImage.ts:34`                                                                                                                      | `ZERO_FILL_LIMIT`, zero bytes past an ELF segment's file bytes in the decompiler's image                                                                              | Unrelated (confirmed)                                                                                                                                                                        |
| Screen history (`peripherals/screen/ScreenHistory.ts:91`), x86's 16 MiB of history per instruction (`blink-js/README.md:158`), `sitemap.xml` `maxBuffer` | Other 16 or 64 MiB values                                                                                                                                             | Unrelated                                                                                                                                                                                    |
| Tests                                                                                                                                                    | See the list below                                                                                                                                                    | Update                                                                                                                                                                                       |
| ADRs and design docs                                                                                                                                     | See the list below                                                                                                                                                    | Update notes                                                                                                                                                                                 |

**User-facing Documentation** does not state the limit. This was checked in `content/`, `lib/documentation/` and `packages/runtime`. The only places a person meets "16 MiB" are the error messages above and asmOS's README.

**Tests that pin it:**

- **`lib/languages/peripherals/FileSystem.test.ts`:**
    - It uses the constant at `:134-156`, `:520-530`, `:900-916`, `:989` and `:1052`.
    - It pins the text "16 MiB" at `:145`, `:156` and `:916`.
    - At 64 MiB its buffers take four times the memory.
- **`lib/fileOverwrites.test.ts:154-193`:** legacy edits. Its bounds stay, so it can keep 16 MiB written out.
- **`lib/sourceCompilation/compilerExplorer.test.ts:270-284`:** the answer cap and its message.
- **`lib/languages/X86/X86BuildOutput.test.ts:198-202`:** the message, as a literal.
- **`hex/hexGrid.test.ts:29`, `:51-52` and `HexEditor.svelte.dom.test.ts:509`:** a 16 MiB File. These are still valid; a 64 MiB case would test the new maximum.
- **`lib/projectArchive.test.ts:447`:** a comment.
- **asm-examples' pack checks.**
- **`lib/storage/db.test.ts`:** gets the upgrade tests if the schema changes.

**ADRs and design docs that state it:**

- **ADRs:** [0047](../adr/0047-byte-edits-are-kept-apart-from-the-original-bytes.md):22 and [0056](../adr/0056-a-build-saves-the-program-it-links-as-a-file.md):27.
- **The accepted resource profile:** [multiple-file-compilation.md](../design/multiple-file-compilation.md):5 and :416-423.
- **Other current-state statements:**
    - [environment-library-plan.md](../design/environment-library-plan.md):289, :522;
    - [examples-repository.md](../design/examples-repository.md):146;
    - [annotations-and-search.md](../design/annotations-and-search.md):45;
    - [pixel-editor.md](../design/pixel-editor.md):124;
    - [pixel-editor-journal-plan.md](../design/pixel-editor-journal-plan.md):29;
    - [file-views-plan.md](../design/file-views-plan.md):112.
- **Records of past work, which stay as written:**
    - [file-views.md](../design/file-views.md) E1, E3 and E10;
    - [asmos-stage2.md](../design/asmos-stage2.md):173-176;
    - [asmos-stage2-plan.md](../design/asmos-stage2-plan.md):26, :150, :408, :436, :458;
    - [asmos-portability.md](../design/asmos-portability.md):123, :180;
    - [asmos-stage2-baselines.md](./asmos-stage2-baselines.md):100-104, :624-646.

A new ADR would record the new limit and, if it changes, the storage. The two ADRs and the accepted profile would each get an update note.

### How a Project is stored

**The database.** Dexie database `mips-m68k-db` (`lib/storage/db.ts:62-102`). Dexie stores version × 10 as the IndexedDB version, so it is 30 today.

- **Version 1:** `projects: '++id'`.
- **Version 2:** the same table. Its upgrade rewrites every row through `normalizeProjectData`, which brought the Files map and later the Programs.
- **Version 3:** adds `editJournals: '[project+path], project'`, one row per File's Edit journal ([ADR 0063](../adr/0063-a-file-holds-its-current-bytes-and-undo-is-a-journal-beside-it.md)).

A Project is one `projects` row. Its `ProjectData` holds every File's content as a string, in `files`: the text itself for a `plain` File, base64 for a binary one.

**From a keystroke to `projects.put`:**

1. **Monaco reports the change.** Its `onDidChangeContent` listener in `EditorModels` calls `edited(path, model.getValue())` (`lib/workbench/editorModels.ts:47-54`). That builds the whole File as one string at every keystroke.
2. **The FileSystem takes the File.**
    - `WorkbenchSession.fileEdited` (`lib/workbench/WorkbenchSession.svelte.ts:3150`) calls `fileSystem.writeText` (`FileSystem.ts:438`).
    - That runs `fileBytes`, which encodes the text and decodes it again as a check, then `bytesFile`, which decodes it again.
    - Then `commit` (`:469`) runs `cleanFiles(files, this.files)`. The changed File is checked whole. Every other File is a kept record, but its size is counted again: `fileByteLength` calls `utf8Length` (`projectFiles.ts:308`), a JavaScript loop over every character of every text File.
3. **The session is told.** `notify` calls `WorkbenchSession.filesChanged` (`:1408`). It marks the page as changed and starts the 250 ms autosave debouncer (`:642`).
4. **The same change triggers reactive work:**
    - `sourceInput` (`:678-680`) takes `$state.snapshot(this.project.files)`. The Files map is frozen and has a null prototype, which Svelte's `snapshot` (`node_modules/svelte/src/internal/shared/clone.js`) does not walk. It falls through to `structuredClone`, so every File's string is copied.
    - The copy goes to `GenericEmulator.setSources` (`lib/languages/GenericEmulator.svelte.ts:2266`) and to `ProjectLanguageSession.update` (`lib/languages/service/ProjectLanguageSession.ts:127`).
    - Each of them calls `normalizeBuildInput`, which runs `cleanFiles(input.files)` without `checked` (`projectFiles.ts:974`). That is two full validations.
    - Monaco then asks for completions and document symbols. For each request, `sourceSymbols` (`lib/languages/service/projectAssemblyLanguage.ts:70`) splits every text File of the Project into lines.
5. **Typing pauses for 250 ms, and the save starts.**
    - `saveFileChanges` calls `changed()` (`:1388`), which calls the host's `onSave` (`routes/projects/[project]/+page.svelte:469`).
    - That calls `saveChanges`, then `save` (`:269`), then `ProjectStore.save` (`stores/projectsStore.svelte.ts:106`).
    - `ProjectStore.save` takes `project.toObject()` (`lib/Project.svelte.ts:674-712`), which makes the same `structuredClone` of the Files at `:693`, and takes the changed journals.
    - Then `db.updateProject` (`db.ts:147`) runs `projects.put(row)`. With changed journals, it shares one transaction with `editJournals`.
6. **A linked file is written, if there is one.** An `.asmproj` link zips the whole Project again on every save (`projectsStore.svelte.ts:77-97`).
7. **The list is read again.** `await load()` (`projectsStore.svelte.ts:119`) calls `db.getProjects()` (`db.ts:109`). That runs `projects.toArray()`, and then `makeProject` on every stored Project, each with a full `cleanFiles`, a `$state` and a FileSystem.

**Everything else that reads or writes a whole Project:**

- **The store loads every Project when its module is evaluated** (`projectsStore.svelte.ts:29-31`). Several imports reach it:
    - `lib/utils.ts:1` imports `SHARE_ID` from it. `utils.ts` is imported by `ErrorState.svelte`, `ClientOnly.svelte` and 25 other modules.
    - `OpenEditorButton.svelte` reads `ProjectStore.projects.length`. It is in `DocumentationLayout.svelte:22,96` and the course layout (`routes/learn/courses/[courseId]/+layout.svelte:15,124`).
    - So every Documentation, Learn and home page reads and validates every stored Project, and then keeps them all in memory.
- **Opening a Project** reads all of them twice over:
    - `ProjectStore.getProject` (`:160-167`) loads the whole list when it has not been loaded.
    - `project.set(loaded)` then validates the Project again, through `normalizeProjectData`.
- **Leaving the Workbench** (`changePage`, `[project]/+page.svelte:401-414`) reads the stored copy. It compares the two with `projectContentEquals`, which builds a JSON string of each.
- **Renaming from the list** (`saveDetails`) reads one Project, then calls `save`, which calls `load()`.
- **Edit journals** have rows of their own, keyed by `[project+path]`. They are read once per Workbench (`db.ts:35-44`) and written in the save's transaction.
- **Archives:**
    - `projectToArchive` (`lib/projectArchive.ts:85`) and `makeProjectFromArchive` (`:193`) call fflate's synchronous `zipSync` (level 6) and `unzipSync` on the main thread.
    - Export is the single download of the Project card or the Workbench (`projectDownload`, `:165`).
    - Import is through `/projects` and its drop zone (`lib/projectImport.ts`).
- **A share link** (`createSharePayload`, `utils.ts:118-127`) runs lz-string over the whole Project's JSON. Only then does it check the 32,000-character cap.
- **Examples:**
    - `loadExample` (`examples.ts:113-118`) fetches an archive and imports it into memory as an unsaved Project.
    - The page keeps `example.toObject()`, a full copy, to compare against 250 ms after each change (`checkExample`, `[project]/+page.svelte:61-69`).
- **The service worker** (`service-worker/index.ts`) caches only the app. Hashed assets are kept for two generations, and HTML is fetched network-first. No Project passes through it. It matters only because a tab running an older build can meet a newer database ([below](#3-per-file-storage)).

**Copies of a Project's Files while it is open.** Strings are shared where a record is reused and copied where something clones.

1. **The Workbench's Project:** a `$state` over the `ProjectData`, and the FileSystem's frozen Files map (`Project.svelte.ts:639-648`).
2. **`sourceInput`'s clone:** a second full copy. The emulator's and the language session's sources keep it until the next change.
3. **The store's list:** after the first save, `load()` rebuilds every stored Project from IndexedDB. It then holds an independent copy of the open Project and of every other one, each with its own FileSystem.
4. **The language Worker:** every File when it connects (`ProjectLanguageSession.ts:58-72`), then each change.
5. **Monaco:** a model for each text File open in a tab.
6. **The Hex editor:** the File it shows, decoded to bytes.
7. **A Debug session, and each Testcase run:**
    - `FileSystemSession` decodes every File to bytes (`FileSystem.ts:556-557`).
    - Testcases make a FileSystem of their own (`GenericEmulator.svelte.ts:2494`, `:2625`).
    - Undo history is kept on top, up to its budget.
8. **Search:** its Worker receives every text File once the panel searches.
9. **The decompiler:** an Executable's bytes, plus up to `ZERO_FILL_LIMIT` of zeros.
10. **An opened example:** the snapshot it is compared with.
11. **Transient copies:** each save's clone, the `put`'s serialization, and the list's rebuild.

## Measurements

**Setup:**

- **Server:** my own `vp dev`, from a config kept under `node_modules/.cache` (deleted afterwards). It had its own port and cache directory, and HMR off.
- **Limit:** a Vite `transform` served `lib/projectFiles.ts` with `FILE_BYTE_LIMIT` at 64 MiB, so that 64 MiB Projects could be stored and opened. The file itself was not edited.
- **Browser:** headless Chrome 153.0.8010.12 (chrome-headless-shell, driven by Playwright), with a fresh profile and real IndexedDB. Flags: `--js-flags=--expose-gc --enable-precise-memory-info`.
- **Machine:** an Intel i7-10750H with 23 GB of RAM, under WSL2.
- **What the page ran:** the real modules, imported in the page (`projectFiles`, `Project.svelte`, `storage/db`, `projectArchive`, `projectsStore`, `utils`), timed with `performance.now()`. The Workbench numbers are the real `/projects/<id>` route, opened once to warm its modules, then timed from navigation to the first editor line. Typing went through Playwright's keyboard; long tasks came from a `PerformanceObserver`. Autosave was measured by wrapping `db.updateProject` and `db.getProjects` on the module instance the page uses.
- **Memory:** the renderer process's RSS, read from `/proc`. Before each call, a GC was forced and the peak reset (`clear_refs` 5). "Peak" is how far `VmHWM` then rose above the starting RSS. RSS includes ArrayBuffers and the strings Blink externalises, which V8's heap counters leave out: V8's own heap figures stayed between about 96 and 135 MB whatever was open.
- **Runs:** two or three of each; they varied by up to about 20%.
- **Caveat:** the dev server serves unbundled modules and Svelte's dev runtime, so the app's own code is slower than in production. Native work (IndexedDB, `TextEncoder`, `atob`, `structuredClone`), fflate and lz-string are not affected.

**Fixtures** came from asmOS (`packages/examples/shared/asmos`):

- **16 MiB:** the RISC-V port's Files, that is everything but the `.mips` and `.asm` Generated assembly. 480 Files, 15.57 MiB:
    - 8.67 MiB of text: C sources, `.riscv` Generated assembly and documents;
    - 6.90 MiB of binary stored as base64: `doom1.wad` (4.0 MiB), `bad-apple.vid` (2.4 MiB) and BMPs.
- **64 MiB:** four copies of that, at the root and under `r2/`, `r3/` and `r4/`. 1,920 Files, 62.27 MiB, 34.7 MiB of it text.
- **Metadata:** both took the metadata (Programs, compilation records, tabs) from the RISC-V asmOS archive's manifest.
- **One 20 MiB File:** `.riscv` and `.mips` Generated assembly joined together, 844,353 lines.

### One Project, one operation

| Operation                                                              |                                          16 MiB |                                     64 MiB |
| ---------------------------------------------------------------------- | ----------------------------------------------: | -----------------------------------------: |
| `cleanFiles`, whole                                                    |                                        74-92 ms |                                 312-360 ms |
| `cleanFiles` with `checked`, one small File changed                    |                                           45 ms |                                     345 ms |
| `makeProject` (normalize, `$state`, FileSystem)                        |                                          164 ms |                                     657 ms |
| `project.toObject()`                                                   |                          26-40 ms, peak +33 MiB |                   99-101 ms, peak +131 MiB |
| `projects.put` of the row: whole, of it synchronous                    |          104-185 ms, 68-104 ms; peak +39-54 MiB |      356-450 ms, 238-327 ms; peak +214 MiB |
| `projects.get`, no validation                                          |                                           67 ms |                                     120 ms |
| `db.getProject` (read and `makeProject`)                               |                            398 ms, peak +68 MiB |                      890 ms, peak +279 MiB |
| `projectToArchive` (export)                                            |               1.10 s, 5.9 MiB ZIP, peak +89 MiB |        3.65 s, 23.7 MiB ZIP, peak +228 MiB |
| `makeProjectFromArchive` (import)                                      |                           0.81 s, peak +104 MiB |                      2.31 s, peak +231 MiB |
| `createSharePayload`                                                   | 8.7 s, then `ShareTooLargeError`; peak +422 MiB | 28.7 s, then a `RangeError`; peak +803 MiB |
| `projectContentEquals` (leaving the Workbench)                         |                             52 ms, peak +87 MiB |                      419 ms, peak +358 MiB |
| `FileSystem.beginSession` (Debug session, Testcase run)                |                             70 ms, peak +41 MiB |                       280 ms, peak +88 MiB |
| `fileSystem.writeText` into `welcome.txt` (1,189 bytes) in the Project |                                       35-112 ms |                                 432-452 ms |
| `storedFilesSize` (`utf8Length` over every text File)                  |                                          112 ms |                                     426 ms |
| `TextEncoder` over the same text, for comparison                       |                                           21 ms |                                      82 ms |

A File on its own, written through `writeText` (the FileSystem's share of a keystroke in it), and its `fileFingerprint`:

| File size | `writeText`                   | `fileFingerprint` |
| --------: | ----------------------------- | ----------------: |
|     2 MiB | 17 ms                         |            8.5 ms |
|     8 MiB | 64-76 ms                      |             28 ms |
|    20 MiB | 165-176 ms, peak +120-140 MiB |             67 ms |

### Stored Projects: the list and a whole save

`db.getProjects()` is what the list, every page that imports the store, and every save run. `ProjectStore.save` is a whole autosave: the snapshot, the `put`, and the list read again.

|     Stored | `getProjects` | of it reading |   Peak during it | RSS after | `ProjectStore.save` |   Peak during it |
| ---------: | ------------: | ------------: | ---------------: | --------: | ------------------: | ---------------: |
| 1 × 16 MiB |        210 ms |      25-40 ms |       +73-91 MiB |    0.6 GB |          315-325 ms |         +160 MiB |
| 3 × 16 MiB |        641 ms |     85-113 ms |     +166-214 MiB |    0.8 GB |          723-733 ms |     +258-275 MiB |
| 5 × 16 MiB |      1,010 ms |    153-191 ms |     +343-359 MiB |    1.1 GB |      1,124-1,223 ms |     +351-360 MiB |
| 1 × 64 MiB |        848 ms |    117-120 ms |         +276 MiB |    1.0 GB |      1,292-1,301 ms |     +518-600 MiB |
| 3 × 64 MiB |      2,553 ms |    360-379 ms |     +533-584 MiB |    1.6 GB |      3,398-3,404 ms |     +780-891 MiB |
| 5 × 64 MiB |      4,328 ms |    567-699 ms | +1,151-1,198 MiB |    2.5 GB |      4,426-4,472 ms | +1,378-1,393 MiB |

- **Validation dominates:** reading the rows is about 15% of `getProjects`; the rest is `makeProject` validating each one.
- **The `/projects` page**, from a reload to its first card, took:
    - 0.63 s with one 16 MiB Project and 1.57 s with five;
    - 1.28 s with one 64 MiB Project and 5.2 s with five.
- **Pages that do not list Projects pay the same.** With three 64 MiB Projects stored, `/documentation/m68k` and `/learn` each started with a single 2.3 to 2.4 s long task. Their renderer was at 1.1 to 1.3 GB, against about 460 MiB with none stored.

### The Workbench

Each row is:

- **Open:** the time from navigation to the first editor line, and the longest task during it.
- **RSS:** the renderer's RSS once idle, after a GC.
- **Typing:** five keys pressed 120 ms apart into `os/main.c.riscv` (0.9 MiB), then 6 s idle, with the long tasks seen in that time.

| Project         |   Open |        Longest task |       RSS | Typing                                                                                                                                                                            |
| --------------- | -----: | ------------------: | --------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A tiny one      |  1.8 s |               83 ms |   713 MiB | No long task; the save's `put` took 2 ms                                                                                                                                          |
| 1 × 16 MiB      |  4.1 s |              603 ms | 1,046 MiB | 4.1 s of long tasks: 0.26-0.41 s per key, in two tasks a key; `put` 1.2 s, then `getProjects` 1.1 s                                                                               |
| 5 × 16 MiB      |  3.8 s |              991 ms | 1,125 MiB | 6.0 s of long tasks; `getProjects` 1.2-2.0 s after each save                                                                                                                      |
| 1 × 64 MiB      |  5.1 s |            1,571 ms | 1,251 MiB | 18.5 s of long tasks: 1.0-2.3 s per key. The first save started 7.4 s after the first key, then `put` 5.9 s and `getProjects` 3.9 s, both while the keys were still being handled |
| 5 × 64 MiB      | 12.7 s | 7,024 ms (the list) | 1,710 MiB | 13.2 s of long tasks; `getProjects` 7.6 s                                                                                                                                         |
| One 20 MiB File |  4.3 s |            1,282 ms | 1,247 MiB | 1.4-1.8 s per key                                                                                                                                                                 |

- **The 20 MiB File loses its colours.** Monaco reports the model `isTooLargeForTokenization`.
- **`performance.memory.usedJSHeapSize`**, with the Workbench open, was 234 MiB at 16 MiB, 342 MiB at 64 MiB, and 228 MiB with the 20 MiB File.

**Where one keystroke's time goes.** This is V8's sampling profiler (200 µs) on one key in the open Workbench, with autosave off so that only the keystroke is in it. The profiler adds overhead: the page was busy 1.07 s at 16 MiB and 3.7 s at 64 MiB.

| Work                                                                               |        16 MiB |         64 MiB |
| ---------------------------------------------------------------------------------- | ------------: | -------------: |
| `sourceSymbols`, for completion and document symbols, every text File's lines      |        428 ms |       1,912 ms |
| `normalizeBuildInput`, a whole `cleanFiles`, twice (emulator and language session) |        231 ms |         803 ms |
| `writeText` → `commit` → `cleanFiles` with `checked`, of it `utf8Length`           | ~50 ms, 16 ms | 370 ms, 325 ms |
| Svelte `clone` → `structuredClone` of the Files (`sourceInput`)                    |         30 ms |         136 ms |

### Per-File storage, as a prototype

This was a scratch database in the same Dexie, with `meta: 'id'` and `files: '[project+path], project'`.

| Operation                                                           | 16 MiB (480 Files) | 64 MiB (1,920 Files) |
| ------------------------------------------------------------------- | -----------------: | -------------------: |
| Write a whole Project: metadata and every File, in one transaction  |              98 ms |               323 ms |
| Save one changed File and the metadata: `welcome.txt`               |             2.6 ms |               3.4 ms |
| Save one changed File and the metadata: `os/main.c.riscv` (0.9 MiB) |            11.6 ms |               7.1 ms |
| Read one Project's File rows (open)                                 |              45 ms |               196 ms |
| List: every metadata row                                            |             0.9 ms |                      |

**A real upgrade.** `mips-m68k-db` at version 3, holding five 64 MiB rows, was upgraded to a version 4:

- **What it did:** moved each row's Files into rows of their own and left `files: null`. It handled one row at a time, inside the versionchange transaction.
- **Time and memory:** 2.36 s, with the renderer peaking at +597 MiB. It made 9,600 File rows.
- **The list afterwards:** reading the five metadata rows took 0.9 ms.
- **Storage:** `navigator.storage.estimate()` then said 202 MiB used of a 10.4 GB quota.

## Browser limits

Sources were read on 2026-11-04. Source code was read on the default branches of the GitHub mirrors that day.

**Quotas** are not a concern for a few 64 MiB Projects.

- **Chrome, desktop and Android:** an origin may use up to 60% of the disk, best-effort or persistent ([MDN, Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), January 2026).
- **Firefox:** best-effort storage gets the smaller of 10% of the disk and 10 GiB, the latter shared by every origin of a site. Persistent storage gets up to 50% of the disk (same MDN page). MDN gives no separate figure for Android.
- **Safari 17 and iOS 17 onwards:**
    - A browser app's origin gets up to 60% of the disk. An app that embeds web content (WKWebView) gets up to 15%.
    - A Home Screen web app has the browser's quota.
    - "Safari 17.0 no longer prompts users about a website wanting to use more space."
    - Source: [WebKit, Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/), August 2023.
- **Earlier Safari:** an origin got 1 GiB, then a prompt (MDN). Per [web.dev](https://web.dev/articles/storage-for-the-web), an older article, each prompt added 200 MB.
- **Past the quota,** a write fails with `QuotaExceededError` (WebKit, MDN). The editor already reports a failed save (`projectsStore.svelte.ts:66-76`).

**Eviction:**

- **When storage runs low,** best-effort storage is evicted by origin, least recently used first (MDN, WebKit 2023).
- **Safari, with cross-site tracking prevention:** it deletes "all of a website's script-writable storage after seven days of Safari use without user interaction on the site", IndexedDB included ([WebKit, March 2020](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/); still on MDN in 2026).
    - Home Screen web apps are exempt ([webkit.org/tracking-prevention](https://webkit.org/tracking-prevention/)).
    - Tracking prevention is on by default in WKWebView apps from iOS 14 ([WebKit, App-Bound Domains](https://webkit.org/blog/10882/app-bound-domains/)).
- **`navigator.storage.persist()`:**
    - Chrome and Safari decide on heuristics without a prompt: engagement, an installed or bookmarked site, a Home Screen app ([web.dev, Persistent storage](https://web.dev/articles/persistent-storage); WebKit 2023).
    - Firefox shows a prompt (MDN).
    - The editor asks once, when the first Project is added (`lib/storage/persist.ts`, `projectsStore.svelte.ts:51`).
    - A 64 MiB Project is a lot to lose to Safari's seven days.

**One large value:**

- **Chrome:**
    - Values over 64 KiB (`kIDBWrapThreshold`, `third_party/blink/public/mojom/indexeddb/indexeddb.mojom`) are compressed with Snappy if that saves 10%. They are then stored as blob files outside LevelDB (`idb_value_wrapping.h`, `blink/common/features.cc`).
    - The constant's comment says LevelDB "was not designed with large values in mind".
    - New data moves to an SQLite backend from M150 ([blink-dev PSA](https://groups.google.com/a/chromium.org/g/blink-dev/c/jS0khnC5IWA), April 2026).
    - No cap on one value was found.
- **Firefox:**
    - Values over 1 MB are compressed and stored outside the database (`dom/indexedDB/IndexedDatabaseManager.cpp`, `kDefaultDataThresholdBytes`).
    - A structured clone over 1,042 MB fails with "The structured clone is too large" (`IDBObjectStore.cpp`, bug 1943951, 2025).
- **WebKit:** a value is stored in place as an SQLite BLOB (`SQLiteIDBBackingStore.cpp`). No cap was found.
- **The specification:**
    - `put` replaces the whole record.
    - The value is serialised, and deserialised as a check, synchronously on the calling thread (IndexedDB 3.0, "store a record").
    - That is the 0.24 to 0.33 s of main thread measured above at 64 MiB.

**Strings and clones:**

- **Longest string:**
    - V8: 2^29 − 24 characters (`include/v8-primitive.h`);
    - SpiderMonkey: 2^30 − 2;
    - JavaScriptCore: 2^31 − 1 ([MDN, String length](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/length)).
    - A 64 MiB binary File is about 89.5 million characters of base64, and the JSON of a whole 64 MiB Project about the same. Both are far below.
    - lz-string over the 64 MiB Project still ended in a `RangeError` (measured above).
- **Bytes per character:** V8 and SpiderMonkey store Latin-1 strings at one byte a character. So base64 and ASCII text cost about their length (V8 `string.h`; [Mozilla, 2014](https://blog.mozilla.org/javascript/2014/07/21/slimmer-and-faster-javascript-strings-in-firefox/)).
- **ArrayBuffers** can reach 8 GiB in 64-bit Firefox 89 onwards, and 32 GiB in V8's sandbox (MDN, `v8-array-buffer.h`).

**Tab memory on phones:**

- **iOS:**
    - "WebContent processes on iPhone are subject to a "soft" limit of around 1.5GB … It will be somewhat lower on iPhone models with less RAM" ([WebKit bug 277848](https://bugs.webkit.org/show_bug.cgi?id=277848), 2024).
    - A process past it is killed (bug 227636). The page has "not really a way to know from JS".
    - One reporter measured 300 to 500 MB for a Wasm page after a reload (bug 269777). That is a reporter's measurement, and the bug was closed as a duplicate.
- **Android Chrome:**
    - V8's old generation is a quarter of the RAM: 256 MB to 4 GB on 64-bit, at most 1 GB on 32-bit (`src/heap/heap.cc`). A 2 GB phone gets about 512 MB of JS heap.
    - Renderers are killed by Android's userspace low-memory killer.
    - Blobs get RAM/100 of memory on Android before going to disk (`storage/browser/blob/README.md`).
- **What this means for the measurements:**
    - One 64 MiB Project in the Workbench measured 1.25 GB of RSS (a desktop dev build) and 342 MiB of used JS heap. That is near the iPhone's soft limit.
    - Five such Projects stored put the Workbench at 1.7 GB, through the store's copies alone.
    - Nothing here was measured on a phone.

## Options

### 1. Per-change work, needed whatever the storage

- **a. Each File record's byte length, kept with it.**
    - What: `cleanFiles` knows each record's length as it makes it. Keep it in a `WeakMap<ProjectFile, number>`, or in the frozen record. `fileByteLength`, `storedFilesSize` and `cleanFiles(…, checked)` then cost O(Files), not O(bytes).
    - Effort: small.
    - Gain: about 0.33 s per keystroke at 64 MiB, and it makes `checked` worth something ([4](#4-incremental-validation)).
- **b. No snapshot of a Files map.**
    - What: the maps are frozen and never mutated. `toObject` (`Project.svelte.ts:693`) and `sourceInput` (`WorkbenchSession.svelte.ts:679`) can hand out the map itself.
    - Effort: small. Keep the server-build note in `toObject`'s comment in mind.
    - Gain: one full copy fewer per keystroke and per save. Records keep their identity, which (c) and option 3 rely on.
- **c. `normalizeBuildInput` trusts a map that `cleanFiles` returned.**
    - What: a `WeakSet` of checked maps, or `checked` passed through.
    - Effort: small.
    - Gain: two full validations per keystroke, 0.8 s at 64 MiB.
- **d. Symbols kept per File record.**
    - What: cache `sourceSymbols`' result for each File in a `WeakMap` keyed by its record or content. Completion then scans only a File that changed. Document symbols need only the model's own File.
    - Effort: small to moderate.
    - Gain: about 1.9 s per keystroke at 64 MiB.
- **e. Cheaper `writeText` for Monaco's text.**
    - What: it encodes and decodes the edited File three times today. Text from Monaco needs only `String.prototype.isWellFormed()` (Chrome 111, Firefox 119, Safari 16.4) and one UTF-8 length count.
    - Effort: small.
    - Gain: most of the 165-176 ms of a 20 MiB File. `getValue()` per keystroke stays O(File) in any case.

### 2. Saves and the list, keeping one row

- **a. No list read after a save.**
    - What: `save` holds the snapshot it wrote, so it can replace that Project's entry in the list instead of `await load()`.
    - Effort: small.
    - Gain: 0.2 to 4.3 s, and up to +1.4 GB of peak, per save.
- **b. The store loaded only where the list is shown.**
    - What: move `SHARE_ID` to a module of its own. Let `OpenEditorButton` and the home page ask `db.projects.count()`, which reads no values.
    - Effort: small.
    - Gain: Documentation, Learn and the home page stop reading every Project. With three 64 MiB Projects that was 2.4 s and about 0.7 GB.
- **c. A light list record.**
    - What: a summaries table, written in each save's transaction, with id, name, description, language, dates, `isSingleSourceProject` (the card's download label), File count and bytes. That is everything `ProjectCard.svelte` reads. Download, share and rename from a card read their one row when used. Dexie version 4 fills the table in its upgrade.
    - Effort: about a day.
    - Gain: the list in about 1 ms.
- **d. What a single row keeps.**
    - The whole-row `put`: 0.36 to 0.45 s at 64 MiB, 0.24 to 0.33 s of it on the main thread, and about 70 to 90 MB written per autosave. On a phone's slower CPU that hitch would be longer.
    - A longer autosave pause for large Projects would make it rarer, not shorter.
    - Storing contents as Blobs would avoid serialising the strings, but would make every read of a File asynchronous. Not recommended.

### 3. Per-File storage

**Schema**, as Dexie version 4:

- `projects: '++id'` stays, and its rows become metadata. A row is the `ProjectData` without File contents, with `files: null`, the list's fields and a `revision`.
- `projectFiles: '[project+path], project'` holds rows of `{ project, path, encoding, content, annotations? }`.
- `editJournals` is already one row per File and does not change.

**Save** is one read-write transaction over `projects`, `projectFiles` and `editJournals`:

- **What changed:** compare the Files map last saved with the current one by record identity. The FileSystem keeps every unchanged record ((1b) keeps that true through the Workbench), so this costs O(Files) and reads no content.
- **Writes:** put the changed records, delete the removed paths, put the metadata row and the journals. A rename is a delete and a put.
- **On failure:** keep the last-saved map, so that the next save writes those Files again, as the journals' `putBack` does.
- **Consistency:** the transaction is atomic. What is stored is always one save's state, so the File rows, the Programs and the compilation and Build records written with them always agree.

**Open** reads the metadata row and `where('project').equals(id)`: 196 ms at 64 MiB. It then validates the Files once, as today.

**The list** reads the metadata rows alone.

**Migration:**

- **What the upgrade does:** it moves each row's Files into rows of their own, one row at a time, inside the versionchange transaction.
    - Measured: 2.4 s and +0.6 GB for five 64 MiB rows.
    - If it ships with the raise or before it, no stored row is over 16 MiB. Five such rows should take about a quarter of that.
- **It is all-or-nothing.** An aborted upgrade (a closed tab, the quota) leaves version 3 and every row as it was. Dexie's open then fails, and the list says the Projects could not be read (`loadFailed`).
- **Space:** during the upgrade the database briefly holds both forms. It needs about as much free quota as the Projects take.

**`files: null`, not a missing `files`.**

- An older build reads a row without `files` as a version 1 Project and makes up a default Entry File for it (`normalizeProjectData`, `Project.svelte.ts:289-298`). It could then save that File over the row.
- `cleanFiles(null)` throws instead. An older build therefore skips such a row in its list (`db.ts:109-121`), cannot open it, and cannot rename it.

**An older build meeting the new database:**

- **It can still open it.** Dexie 4 opens a database newer than it declares: on `VersionError` it retries without a version (`node_modules/dexie/dist/dexie.mjs`, the `VersionError` case of its open). `verifyInstalledSchema` ignores tables it does not declare.
- **A tab opened before the deploy keeps working after another tab upgrades.** The Project it has open saves a whole row with `files` again, over the metadata row. It can also still create and import Projects that way.
- **Such a row is complete, and newer than the File rows.** So the new build must move it out when it reads it: the upgrade's own function, run on any `projects` row whose `files` is a map. Without that step, the edits made in that tab are lost.
- **An older tab's delete leaves File rows behind.** The new build removes File rows whose Project has no row, cheaply, through the `project` index.
- **When an older build can appear:** the service worker keeps hashed assets for two generations and fetches HTML network-first. So an older build appears only in a tab opened before a deploy, or after a deploy is rolled back.
- **A rollback** would hide every migrated Project until the next deploy, without losing any.

**Two tabs on one Project:**

- **Today:** the last save wins wholesale, and nothing warns.
- **Per File:** the two tabs' saves merge by File. That can bring back a File one tab deleted, and the metadata goes to whichever tab saved last.
- **Possible remedies:**
    - A `revision` in the metadata row, checked and increased in the save's transaction, tells a tab that another one saved since it read. The tab can then say so.
    - Web Locks (Chrome 69, Firefox 96, Safari 15.4) could keep one Workbench per Project.

**Archives, export, share and examples:**

- They work on an in-memory `ProjectData` and do not change.
- From the list (a card's download, share or rename), they read the one Project's rows when used.
- Examples load from archives into memory and are stored through `addProject`.
- Write-back to a linked `.asmproj` still zips the whole Project on each save.

**Effort:** moderate, about three to five days. That includes:

- upgrade tests with fake-indexeddb, as `db.test.ts` has for version 2;
- the older-row path and orphan clean-up;
- a browser check of the upgrade, with old rows seeded first as in the 2026-09-07 recipe.

### 4. Incremental validation

- **`checked` does not help today.** `cleanFiles` already takes it, but each kept File is still measured with `utf8Length`. At 64 MiB, `checked` took 345 ms against 312 to 360 ms for the whole check.
- **With (1a), it costs O(Files).**
- **Two callers never pass it:** `normalizeBuildInput` and `normalizeProjectData`. (1c) covers the first. The second runs on open, where one full validation (0.3 s at 64 MiB) is worth keeping, since the rows may have been written by another build.

### 5. Other costs the measurements showed

- **Share.**
    - Today a 16 MiB Project freezes the page for 8.7 s before Share says it is too big.
    - A 64 MiB one freezes it for 28.7 s and then fails with a `RangeError`. The Workbench reports that as "Could not create a share link for this Project", not as too big (`[project]/+page.svelte`, `share`).
    - Fix: refuse before compressing when the Project clearly cannot fit. For example, 32,000 characters at 6 bits each is 24,000 bytes, so JSON over 1 MiB would need more than 40:1 compression.
- **Archives.**
    - fflate's asynchronous `zip` and `unzip` run in Workers. They would take the 3.65 s export and the 2.31 s import at 64 MiB off the main thread.
    - A linked `.asmproj` is zipped again on every autosave.
- **Monaco's large-File thresholds** (`textModel.js:119-122` in monaco-editor 0.57):
    - over 20 MB of characters or 300,000 lines, a model loses tokenization, so it has no colours;
    - bracket-pair colours stop at 5 million characters (`bracketPairsImpl.js:15`);
    - over 50 MB, it is not synced to Workers.
    - Generated assembly is about 25 bytes a line, so a File over about 7 MiB passes 300,000 lines. That can already happen at 16 MiB. With a 64 MiB limit, one File can be 64 MiB.
- **Memory:**
    - The store's copies of every Project go away with 2a to 2c, or with option 3.
    - The language Worker's copy is needed.
    - A Debug session holds a decoded copy (+64 MiB at 64 MiB) plus its Undo history.

## Other limits to decide alongside

- **The answer cap per Compile:**
    - `ASSEMBLY_BYTE_LIMIT` is 16 MiB of JSON, counted in characters, with 400,000 lines.
    - asmOS's units at -O2 answered 17 to 31 MB ([asmos-portability.md](../design/asmos-portability.md):123).
    - An answer is about 70 to 120 bytes a line; the Generated assembly made from it about 25 to 31.
    - 32 MiB would take asmOS at -O2. The body is read whole before the check, so a larger answer is a transient string of its size plus its `JSON.parse`.
    - In any case, the message should stop saying "The editor supports up to 16 MiB".
- **What programs see through the FileSystem:**
    - One constant gives both ENOSPC (all Files) and EFBIG (one File) (`FileSystem.ts:760-773`).
    - It is stated in `FileSystem.ts:103-105`, [environment-library-plan.md](../design/environment-library-plan.md):289 and blink-js's README:394. No user-facing Documentation states it.
    - At 64 MiB a program may write 64 MiB.
    - If one File is to stay smaller (question 3), EFBIG takes that cap.
- **4,096 Files:** unaffected by bytes; it stays. Per File it is 4,096 rows, about 0.4 s to read (from 196 ms for 1,920).
- **Archive limits:** `ARCHIVE_BYTE_LIMIT` follows the limit. The 1 MiB manifest stays. The legacy Byte-edit bounds are pinned at 16 MiB (first table).
- **FileSystem Undo budget** (64 MiB by default):
    - A program that rewrites one 64 MiB File once fills it, and Undo stops there, as designed ([multiple-file-compilation.md](../design/multiple-file-compilation.md):267).
    - A Debug session of a 64 MiB Project already holds +64 MiB of decoded Files. A larger budget adds to that on phones.
    - Keeping 64 MiB seems right.
- **Edit journal budgets:** unaffected.

## Recommendation

1. **Make per-change work independent of the Project's size (options 1a to 1e) before or with the raise.**
    - Without them, typing in a 64 MiB Project blocks for 1 to 2 s a key in these measurements.
    - In any Project, the cost grows with its size: 0.26 to 0.41 s a key at 16 MiB.
2. **Stop reading every Project after each save and on pages that do not list them (2a, 2b).**
3. **Store a Project as a metadata row and one row per File (option 3), with its metadata rows as the light list.**
    - Ship it in the same release as the raise, or before it, so that the migration only moves rows of at most 16 MiB and no 64 MiB single row is ever written.
    - Include:
        - the `files: null` marker;
        - moving out any whole row an older tab writes;
        - removing orphaned File rows;
        - the revision check, or whatever the owner chooses for two tabs.
4. **Then raise `FILE_BYTE_LIMIT` to 64 MiB:**
    - derive every message from it;
    - move asm-examples' copy;
    - give MIPS asmOS its `videos/` back;
    - pin the legacy-edit bounds at 16 MiB;
    - write a new ADR, with notes on ADRs 0047 and 0056 and on the accepted profile.
5. **Also:** the share pre-check, and fflate's asynchronous archive functions.

Afterwards, measure again with the same fixtures, and once on a phone.

**Without option 3,** steps 1 and 2 still bring a keystroke back to about the cost of its own File, and the list to milliseconds with 2c. An autosave at 64 MiB would remain the whole-row `put`: 0.36 to 0.45 s, a third of a second of it on the main thread.

## Open questions for the owner

1. **Per-File storage now, with the raise?** Or only steps 1 and 2 (with or without the light list), accepting a 0.25 to 0.45 s whole-row write per autosave at 64 MiB?
2. **Two tabs on one Project:**
    - warn through a revision check;
    - keep one Workbench per Project with Web Locks;
    - or leave last-writer-wins, as today?
3. **Should one File stay capped below the Project's 64 MiB?** For example at 16 MiB, or for text Files only. Monaco drops highlighting past 20 MB or 300,000 lines, and every keystroke costs O(File).
4. **The Compile answer cap:** keep it at 16 MiB, or raise it to 32 MiB to fit asmOS's units at -O2? And its message.
5. **The FileSystem Undo budget:** keep 64 MiB?
6. **A linked `.asmproj`:** keep zipping it again on every autosave (3.65 s at 64 MiB), or write it on Save, or after a longer pause?
7. **Rollbacks of a deploy:** are they something to plan for? An older build hides migrated Projects until the next deploy, and loses nothing.
8. **Phones:** which ones must a 64 MiB Project work on? Nothing here was measured on a phone, and iOS's soft limit is about 1.5 GB a tab.
