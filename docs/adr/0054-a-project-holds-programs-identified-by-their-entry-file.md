---
status: accepted
date: 2026-10-21
---

# A Project holds Programs, each identified by its Entry file

Amends [ADR 0013](./0013-project-is-a-record.md) and [ADR 0014](./0014-settings-split-by-effect.md).

A Project had one Entry path, and everything that described how its program runs or is checked (Settings, Display configuration, Testcases) hung off the Project. A second program in the same Files meant moving that one Entry around: "Set file as entry" on every other assembly File, "Build entry" wherever the displayed File was not the Entry, and Compile silently moving the Entry to its Generated assembly. We decided that a Project holds **Programs**, each an Entry file with its own Settings, Display configuration and Testcases, while the Target, the Files, the Compilation records and the metadata stay on the Project. A Program is identified by its Entry file and has no name of its own: a File is the Entry of at most one Program, a host rename moves it and a host deletion removes it, so "does this File already have a Program" always has an answer and there is no naming UI. A Project stores them as `programs`, a map from Entry path to the Program's parts, so two Programs over one Entry cannot be written down. Earlier saved data loads as one Program, and archives of a one-Program Project keep the earlier shape so older editors still read them. The design and its other decisions are in [docs/design/programs.md](../design/programs.md).

## Considered options

- **Rename today's Project to a workspace and call the new unit a project.** It matches IDE vocabulary, but would touch `/projects`, the IndexedDB store, archives, share links, exams, courses and about twenty ADRs, and change a word people already have saved work under.
- **A named Program pointing at an Entry path**, several per File, as IDE run configurations. It needs naming, renaming, duplicates and a rule for what deleting the File does to each. An optional name can be added to the chosen shape later without breaking it; names could not be taken away.
- **Moving the Target to the Program too**, so one Project mixes ISAs. Deferred, not rejected: every assembly File would first need a language of its own (`.s` and `.inc` belong to no one Target, and RISC-V and RISC-V-64 share `.riscv`), and switching Programs would rebuild the Emulator, the language service and the panels that are created once per Project language today. Done later, a Program gains an optional Target defaulting to the Project's.

## Consequences

- Settings remain decisions only, structured fields edited through the GUI and never Files (ADR 0013, ADR 0014); they now belong to a Program, as do Testcases and the Display configuration.
- A Program's Entry can still name a missing File, after the running program removed it through the FileSystem (instruction Undo brings it back, so the Program must outlive it) or in old saved data.
