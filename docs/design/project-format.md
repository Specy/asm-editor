# Project format: per-project Settings and Files

Design record of the interview held on 2026-09-07 for [#72](https://github.com/Specy/asm-editor/issues/72) (settings per project) and the first step of [#76](https://github.com/Specy/asm-editor/issues/76) (a Project made of files). Terms are the glossary's ([CONTEXT.md](../../CONTEXT.md)): **Project**, **File**, **Entry file**, **Settings**, **Preferences**, **Display configuration**. Every decision below was taken on 2026-09-07; the two that are hard to reverse are ADRs, the rest are recorded here and can change.

## Scope

- Move the settings that affect the Emulator or the program into the Project; keep the view-only ones global.
- Replace the single `code` string with a map of Files and an Entry file, so a Project can later hold several source files.
- Keep every existing project, exported file and share link working.

Out of scope, deferred until multi-file editing is built: editing more than one File, a folder or zip export, binary Files, the drive peripheral, `#include` for the Z80 and `%include` for x86 (the Z80 Core already takes an in-memory file map; the x86 wrapper takes one string), inheritance of Settings between projects, per-project workspace layout.

Implementation update on 2026-09-11: the [multiple-file FileSystem design](./multiple-file-compilation.md) now supplies multi-file editing, a custom overlay sidebar, lossless ZIP Project archives, binary persistence, native Z80 and x86 includes, and the FileSystem Peripheral under the name adopted in the glossary. C compilation, x86 guest runtime file operations, guest file operations for M68K and Z80, and a permanent horizontal layout remain deferred.

## Agreed decisions

### The Project is a record ([ADR 0013](../adr/0013-project-is-a-record.md))

A Project is a record with typed parts: id, name, description, timestamps, language, `files`, `entry`, `settings`, `testcases`, `display`, and the legacy `exam` field, which stays. `files` holds only what the assembler and the program can see. Settings and Testcases are structured fields, never a configuration file inside `files`.

### Files

- `files` is a map from path to `{ encoding, content }`. `content` is always a string; `encoding` says how to turn it back into text or bytes. Day one knows `plain` only. An unknown encoding is an error on read, never treated as text.
- Paths are relative, `/` separated, without a leading slash, without `.` or `..` segments, case-sensitive, and end in an extension. Folders exist only implicitly through the paths of the Files in them; there are no empty folders to store.
- A new Project holds one File, `main.<ext>`, which is also the Entry file. Extensions are the ones the export uses today with one change: M68K becomes `m68k` (was `s68k`). Old `.s68k` exports still import; the importer reads the content, not the extension.
- Nothing changes a Project's language after creation, so the Entry file's extension is fixed at creation.

Update on 2026-09-08: the [multiple-file FileSystem design](./multiple-file-compilation.md) removes the filename-extension requirement and allows extensionless filenames and dotfiles. New Projects retain their `main.<ext>` default; the other canonical stored-path rules continue to apply.

Implementation update on 2026-09-09: `base64` is now a recognized lossless storage representation for arbitrary File bytes. `plain` means valid UTF-8 text; consumers that require text reject invalid UTF-8 instead of exposing the base64 storage string.

### Entry file

`entry` names the File a Build assembles first. Invariant: it is always a key of `files`. Today it is the only File. Later, choosing which File to build means changing `entry`, which is a different act from choosing which File the editor shows; the shown File is UI state and is not part of the format.

Update on 2026-09-08: [ADR 0017](../adr/0017-entry-path-can-name-a-missing-file.md) revises the existence invariant. `entry` is the configured Entry path and may name a missing File after deletion or rename; subsequent Builds report that condition. Explicit Files maps, including empty ones, must retain their contents and Entry path through saving and loading. New Projects and legacy code-only migration still create their default source File.

### Settings and Preferences ([ADR 0014](../adr/0014-settings-split-by-effect.md))

| Preferences (global, view or workflow only)                                                                   | Settings (per Project, affect the Emulator or the code)     |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Use decimal for registers                                                                                     | Maximum undo steps (sizes the Core's undo history at Build) |
| Auto scroll the stack tab                                                                                     | Screen undo budget (sizes the Screen's journal)             |
|                                                                                                               | FileSystem undo budget (sizes its inverse-diff journal)     |
| Auto save                                                                                                     |                                                             |
| Show pseudo instructions (MIPS only, editor view zones)                                                       |                                                             |
| Show memory tab, Show screen (the Screen peripheral is injected either way; the setting only hides the panel) |                                                             |
| Maximum visible history steps (how many undo entries are read for display, not how many the Core records)     |                                                             |
| Theme, Shortcuts (already separate stores)                                                                    |                                                             |

- **One schema, gated per key.** Every Setting is declared once in code: display name, type, default, and the languages it applies to (a list, or a predicate such as "languages with a Screen"). Defaults may differ per language. A Project stores values only, keyed by setting id; descriptors never reach storage. Loading is tolerant: unknown keys dropped, missing keys fall back. No version number, no reset on mismatch.
- **Decisions only.** A Project stores a Setting only when it was changed for that Project. Everything else follows the app's default for its language, so a changed default reaches every project nobody touched. The panel shows which values are decisions and offers a per-setting reset that clears the decision.
- **No inheritance.** A new Project starts with no decisions. Surfaces without a Project (course and documentation Playgrounds, the embed page, exam sessions) run on the defaults. Preferences apply everywhere as today.
- **When a Setting takes effect:** at the next Build. The undo size is already a Build argument; the Screen budget is read at the same point. Nothing resizes under a running program. (Accepted on 2026-09-07 when the interview closed.)
- **The Preferences store** keeps its localStorage key but loses its version reset: it loads the way Settings do, so a release never wipes preferences again.

### Display configuration

Stays its own project field, outside Settings, because the program can state it in the `@screen` comment. The two are kept in sync:

1. The program has a directive and the user changes a value beside the Screen: the directive line is rewritten in the source, so code and popover agree and the next Build reads the new value. The current "hand edit wins until the next Build" rule disappears.
2. The program has no directive and the user changes a value beside the Screen: stored in the Project as today; no comment is inserted into the user's program.
3. The user edits the directive by typing: applied at Build, as designed, so the Screen is configured before the first instruction and does not resize on every keystroke.

Update accepted on 2026-09-08: in a multi-file Project, only the Entry file's `@screen` directive configures the display. Included directives are ignored with warnings, and display controls rewrite the Entry file rather than whichever File is displayed; the Debug session's file-write lock still applies. A base label may be defined in an included File. See the [multiple-file design](./multiple-file-compilation.md#accepted-screen-across-source-files).

### Saving

One rule for every part of a Project (code, Settings, Testcases, Display configuration): a change is saved at once when autosave is on, otherwise it waits for Save, and the unsaved-changes prompt compares the whole Project, not only the code. Consequences: Testcase changes start triggering autosave; the display stops saving on its own when autosave is off, so a Build that reads a directive leaves the Project dirty until saved. A shared Project, which is nobody's yet, keeps its changes in memory until the user chooses to save it, as today.

### The settings panel

One floating panel behind the cog, with a Preferences section and, when a Project is open, a Project section. Playgrounds show only the Preferences section.

### Serialization and migration

- **IndexedDB:** Dexie version 2 with an upgrade that rewrites every stored project once: `code` becomes `files["main.<ext>"]` with the `plain` encoding, `entry` is set, `settings` starts empty (existing projects start from the defaults; their old global values are not carried over, which the changelog should say), everything else is kept. The normalizer used for imports and share links also runs on read as a cheap defence.
- **Legacy exported file:** the source-plus-commented-metadata representation remains readable and is still used when writing back a linked, compatible single-text-file Project. It cannot losslessly represent every multi-file, binary, empty, or missing-Entry Project; the archive update below is the whole-project format.
- **Import:** a version 1 file or a raw source goes through the same normalizer: `code` becomes `main.<ext>`, the Entry file, no decisions. A metadata version newer than the app knows imports the code only and says so in a toast, instead of silently dropping the metadata as today.
- **Share links** carry the new shape; old links and legacy exam links go through the normalizer. The embed page (code and flags in the query string) and exam sections (starter code and testcases) are not Projects and do not change. Templates go into `main.<ext>`.

Update accepted on 2026-09-08: new whole-project exports use a ZIP Project archive named `<project-name>.asmproj`, and the same valid archive can also be imported with a `.zip` extension. The archive contains a versioned `project.json` manifest and actual file bytes under `files/`, which is an archive-only prefix, not part of emulator paths. Individual-file downloads preserve the selected File's exact bytes; legacy raw-source and source-plus-metadata imports remain supported. See [ADR 0019](../adr/0019-zip-project-archives.md). A linked legacy source keeps write-back only while it represents a compatible single-text-file Project; otherwise writes to it stop and the user is offered an explicit `Save As .asmproj`, while ordinary browser saving continues. See the [accepted linked-file migration](./multiple-file-compilation.md#accepted-migrating-linked-local-source-files); the original assembly file is never silently replaced with an archive.

Update accepted on 2026-09-11: a Project has a single download, chosen by its shape rather than by the user. A Project of one plain-text File at its Entry path downloads as that source with the commented metadata block, the same representation a compatible linked file is written back in; anything else downloads as the `.asmproj` archive. See [ADR 0019](../adr/0019-zip-project-archives.md).
