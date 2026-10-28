---
status: accepted
date: 2026-10-28
---

# The M68K Build output is an EASy68K S-record

Amends the consequences of [ADR 0056](./0056-a-build-saves-the-program-it-links-as-a-file.md), which said that only x86 makes a program file and that s68k writes no S-records, and so the last consequence of [ADR 0050](./0050-the-built-program-is-a-build-output-never-saved.md), which it superseded.

An M68K Build writes the program it assembled as the S-record file EASy68K's assembler writes, from the Core's `Program.toSRecord()`: the `68KPROG` header, the code and data in S1, S2 or S3 records of up to 32 bytes, the memory map's ranges as EASy68K's extra S0 records, and the entry point in an S8 record, each record ending with CR LF. It is the **Build output** of ADR 0056, saved through the same host with a **Build record**, at the Entry path without its extension and with EASy68K's `.S68`: `main.x68` gives `main.S68`, `src/game.s` gives `src/game.S68`. It is stored as text, so it opens in the editor to be read, record by record. Everything ADR 0056 says of a Build output holds: the next Build replaces it without asking while nobody changed it, the Explorer dims it as **From an earlier Build** once its sources change, anything else at its path is replaced only when the person agrees, and an untouched one is left out of share links, archives and downloads, since a Build makes it again. Downloaded, it loads and runs in EASy68K's simulator ([m68k-machine.md](../design/m68k-machine.md), decision 32).

The program now lives in memory at its real encoding (the Core's own ADR 0006), so the file is what the Debug session runs, written out: a learner can take a program built here to EASy68K, a lab machine or an exam environment that runs it, and read what an assembler hands a simulator.

## Considered options

- **No file, as before.** The program ran from memory and nothing left the editor but the source; EASy68K had to assemble it again, with its own choices of sizes.
- **A raw image of memory.** It loses the addresses, the entry point and the memory map, and EASy68K does not load one.
- **Stored as bytes, as an executable is.** It would open in the Hex editor, where an S-record is ASCII digits; text shows the records.
- **At `main`, as x86's.** `main` is the name a shell runs, which means nothing for a 68000 program, and EASy68K names its output `.S68`; the extension also tells the person what the file is.
- **Presented only, with a download button**, as ADR 0050 had it. ADR 0056 keeps every Build output as a File, and one mechanism serves both Targets.

## Consequences

- An M68K Build in the Workbench changes the Project, as an x86 Build does: it is autosaved, or marked unsaved without autosave. A playground or an embed, which has no host, and a Project that cannot change, only present it to the running program.
- During the Debug session the running program can read `main.S68` through its file tasks but not write, rename or remove it, as ADR 0056 keeps a running program's own File.
- It is not an **Executable**: nothing loads it back as a Program or a Listing, which the design defers with the S-record Executables (decision 33).
- A Testcase's own FileSystem takes the S-record in place of an unchanged Build output, as it takes x86's program.
- Once the Core has the 68010 and 68020 dialects, a Build of a non-68000 Program says in the Log that its S-record does not run in EASy68K (the plan's milestone E5); the Core has none yet.
