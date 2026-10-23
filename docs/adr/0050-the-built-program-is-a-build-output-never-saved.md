---
status: superseded by ADR-0056
date: 2026-10-15
---

# The built program is a Build output, never saved

An x86 Build already links a real Linux executable (`ld … -o /program`, `assemblers.ts`), and the editor now shows it as the **Build output**: listed in the Explorer as built and read-only, present in the program's **FileSystem** at its path, which the program can read but not write, as a running **Executable**'s own File (binary import decision 16), and opened in the **Hex editor**, the **Listing** and the **Pseudocode** like any Executable, or downloaded. Each Build replaces it, and it is never saved in the **Project**, its archive or a share link; "Keep as File" copies it into the Project as an Executable. A share link carries the whole Project in a URL capped at 32,000 characters, which even a 10 KB executable, about 13,600 characters of base64, would mostly use up; and a saved copy is derived data that goes stale at the next edit, which the editor does not save ([ADR 0028](./0028-persist-compilation-records-with-transient-source-maps.md), [ADR 0048](./0048-decompiled-code-is-a-view-not-a-file.md)).

## Considered options

- **A Project File written by every Build**, as `ld` writes `main` into a directory: literal, but it bloats shares past their limit, autosaves on every Build, goes stale, and overwrites whatever File already has the path.

## Consequences

- Only x86 has one: MIPS and RISC-V assemble into memory with no executable, s68k writes no S-records and the Z80 output formats are a separate feature.
