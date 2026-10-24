---
status: accepted
date: 2026-10-23
---

# Restore the Terminal on Undo

Supersedes decision 12 of the [environment library plan](../design/environment-library-plan.md), which left the **Terminal** out of Undo.

Instruction Undo puts the Terminal back as the instruction found it, with the **Core**, as it does the **Screen** ([ADR 0005](./0005-restore-screen-state-on-undo.md)) and the **FileSystem** ([ADR 0015](./0015-restore-file-operations-on-undo.md)). What an instruction printed leaves the transcript, an echo of what was typed included. A clear, MARS's form feed, gives back the transcript it threw away. A character a byte write left incomplete is held back again, and the rest of a standard-input line goes back to what the program had not read yet. Stepping forward again then prints the same text once, not twice.

What a read took from typed input is not put back: stepping the read again asks again, so a person can try another answer from the same point. A keystroke a polled device took, MARS's receiver data register, is put back at the front of its queue instead, since no read asked for it and the program would otherwise find nothing where it found a key.

The Terminal keeps its own journal. Each adapter tells it which instruction is running, by the identity the Core's history already uses for it: M68K's step id, the Z80's t-state count, the instruction serial of MARS, RARS and Blink. The first time an instruction changes the Terminal, the journal records the transcript's length, the bytes held back by the decoder, the standard-input line, and, where the instruction clears the transcript or a device takes a keystroke, what that threw away or took. An Undo of the instruction restores that record. An instruction that leaves the Terminal alone costs nothing.

## Considered options

- **Replay the answer.** Put a taken line back at the front of the typed input, so the read takes it again without stopping. It makes stepping forward again deterministic, as a File read is, but trying a different answer would need a way to throw the replayed one away first.
- **A snapshot of the transcript per instruction.** It needs no length bookkeeping, but every retained string is a copy once the engine flattens it, and a program printing in a loop would hold one per instruction.
- **Records in the FileSystem session's frames.** MARS and RARS already run every handler inside one. M68K runs only its file tasks there and the Z80 and x86 none, and the Terminal's records would be evicted under the Files' byte budget.

## Consequences

- The journal holds one record per instruction that changed the Terminal, for as many instructions as the Core's history keeps, so it never stops an Undo the Core can make. A record is a few numbers, plus a transcript only where a clear threw one away.
- Type-ahead is never put back: characters typed but not yet read stay queued, and characters a read took are gone.
- A Poke changes nothing in the Terminal and is undone by the Core alone ([ADR 0022](./0022-core-native-poke-records.md)).
- A Build starts the journal and Stop ends it, with the transcript. Testcases keep no history, so the Terminal journals nothing while they run.
- x86 still treats an instruction that consumes standard input as an Undo barrier. Undo takes back what x86 printed, but cannot cross a read until the Core journals input.
- Output written between instructions, such as the replacement character for a character still incomplete when a MIPS, RISC-V or x86 program ends, belongs to no instruction and stays.
