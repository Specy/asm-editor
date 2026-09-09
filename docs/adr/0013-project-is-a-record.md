---
status: accepted
date: 2026-09-07
---

# A Project is a record, not a folder

The project format is growing a map of Files so that a Project can later hold several source files and, through the planned drive peripheral ([#76](https://github.com/Specy/asm-editor/issues/76)), show them to the running program. We decided that a Project stays a record of typed parts, language, Files, Settings, Testcases, Display configuration and metadata, and that the Files map holds only what the assembler and the program can see: Settings and Testcases are structured fields edited through the GUI, never a configuration file inside the tree. A config file would give the same data two editors, a text one and a GUI one, with a parse-and-validate step on every change, and it would sit inside the tree the drive mounts, where a program could read or clobber it.

## Considered options

- **Virtual folder**: sources and a `project.json` (settings, maybe testcases) all inside `files`, the GUI rewriting the JSON file on each change. Rejected for the reasons above. A folder with a `project.json` remains a possible _export_ format; it is not the in-app model.

## Consequences

- A File's content is always stored as a string together with an `encoding` (`plain` for valid UTF-8 text and `base64` for arbitrary bytes), so one form survives IndexedDB and share-link serialization. A reader that meets an encoding it does not know fails; it never reads the string as text.
- [ADR 0019](./0019-zip-project-archives.md) subsequently chose a standard ZIP container for lossless whole-Project export. Its manifest and archive-only `files/` prefix serialize the Project record without turning that representation into the program-visible Files tree.
