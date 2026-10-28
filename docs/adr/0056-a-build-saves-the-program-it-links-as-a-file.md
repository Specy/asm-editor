---
status: accepted
date: 2026-10-23
---

# A Build saves the program it links as a File

Supersedes [ADR 0050](./0050-the-built-program-is-a-build-output-never-saved.md), at the owner's request, so that the program stays in the Project to be inspected again, disassembled and decompiled later.

An x86 Build saves the executable it links as a **File** of the **Project**, the **Build output**, at the path the **Command line** runs it as: the Entry path without its extension (`main.asm` and `main.c` give `main`, `src/game.asm` gives `src/game`). It is an **Executable** like an uploaded one: the **Hex editor**, the **Listing** and the **Pseudocode** show it, it takes **Byte edits** and **Annotations**, the Search panel searches it, and it can be a **Program** of its own. A **Build record**, saved Project metadata beside the **Compilation records** ([ADR 0028](./0028-persist-compilation-records-with-transient-source-maps.md)), names the Entry it was built from and holds fingerprints of the Files the Build read (the Build outputs excepted), of its Build configuration and of the File it saved. While the File holds that program unchanged, with no Byte edits and no Annotations, it is derived from the sources: the next Build replaces it without asking, the Explorer dims it as **From an earlier Build** once a File it was built from, its Entry or its configuration changes, and it is left out wherever the Project leaves the browser (a share link, an archive, a downloaded or linked source file, together with its record and the tabs on it), since a Build makes it again. Anything else at its path is replaced only once the person agrees; a No keeps it, the Build goes on without saving its program, and the Log says why. A folder at the path, or the Entry itself (an Entry without an extension), keeps it out with a Log note.

ADR 0050's reasons, measured on 2026-10-23: a share link compresses its payload, so an assembled hello world (9.4 KB) adds about 1,150 of its 32,000 characters and a small C program (12.6 KB) about 5,500, the ELF's zero padding compressing well, and derived Files are left out anyway; staleness is kept by the record across reloads, as a Compilation record keeps it; overwriting asks, as Compile asks before replacing Generated assembly edited by hand; and autosave writes 10 to 60 KB per Build.

## Considered options

- **Keep ADR 0050**: the program beside the Files until the next Build, "Keep as File" to copy it in. Rejected by the owner: it was gone after a reload, and a copy had to be kept by hand each time.
- **Share derived Files too.** A link would carry a program the recipient's Build makes again, and a stale one would not match the sources beside it.
- **Leave them out of share links only, keeping them in archives and downloads.** A one-File Project downloads as its source text and saves back to a file opened from disk only while it has one File; the first Build would turn both into an archive. An archive is also how a Project too large for a link is shared.
- **Never ask, as `ld` overwrites; or always ask.** Never asking would drop a person's Byte edits and Annotations, which are keyed by addresses that a rebuild moves; always asking would interrupt every Build.
- **End the Build at No, as Compile ends.** A Build is mostly for running; the program runs from memory whether or not it is saved.
- **A provenance field on the File record instead of a Project-level record.** A File record already carries Byte edits and Annotations that every write must keep in step; a separate record, dropped when the File is renamed or removed, follows the Compilation record's pattern.

## Consequences

- Only x86 links a program, as before: MIPS and RISC-V assemble into memory, s68k writes no S-records, and the Z80 output formats are a separate feature. Amended by [ADR 0065](./0065-the-m68k-build-output-is-an-easy68k-s-record.md): an M68K Build now saves its program as EASy68K's S-record, `main.S68`, a Build output like this one.
- The Emulator hands the program to its host, the Workbench, after linking and before the Debug session takes the Files, through `setBuildOutputHost` (`claim`, `save`, `isBuildOutput`); a question still open when the Build is cancelled is taken back. Without a host, and in a Project that cannot change, the program is only presented to the running program, outside the Files, as ADR 0050 had it.
- During the Debug session the running program reads its own File but cannot write, truncate, rename or remove it (ETXTBSY, EBUSY), as Linux keeps a running executable; it is now a File of the Project, published with the others and counted toward the 16 MiB limit. The Debug session's **Build sources** include it.
- Its Listing and Pseudocode are an Executable's: Breakpoints set in them are for running it as its own Program, and while its source runs they show no program counter, since the debugger follows the source.
- A Testcase's program takes the place of an unchanged Build output in that Testcase's own FileSystem, and is presented beside the Files where nothing has its path; a File of the person's own at the path stays, as before.
- Renaming or removing a Build output drops its record: a renamed one is the person's own File, which later Builds leave alone and which travels with the Project. This replaces "Keep as File", and the Explorer's separate Build output list goes.
- A Build that links a different program changes the Project, so it is autosaved, or marked unsaved without autosave. Editors older than this read the File as an ordinary Executable and drop the records they do not know.
