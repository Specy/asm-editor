---
status: accepted
date: 2026-10-15
---

# Decompiled code is a view, not a File

An **Executable**'s decompiled code, like its **Listing**, is generated from the File's current bytes (its **Byte edits** included) whenever it is shown, and never saved in the **Project**. Decompile shows it beside the Listing, linked line by line by address, in the way the **Workbench** already pairs a C File with its **Generated assembly**. Ghidra, IDA, Binary Ninja and Cutter all work this way: every view reads one analysis of the binary and follows the others by address, and C leaves the tool only through a one-off export.

## Considered options

- **Saved Files tracked like Generated assembly**, with a record and a map, as C → assembly works. That pairing saves its output because a Build assembles it, and nothing builds from decompiled code. A saved copy would also go stale at the next Byte edit, and the editor would offer to compile it although decompiler output does not compile (`undefined8`, `CONCAT44`). [The binary import design](../design/binary-import.md)'s decision 5 rejected a saved Listing for the same reasons.

## Consequences

- An export of the decompiled code as a File, labelled as a snapshot, can be added later without affecting this.
