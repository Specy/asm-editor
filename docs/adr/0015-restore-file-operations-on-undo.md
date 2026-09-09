---
status: accepted
date: 2026-09-08
---

# Restore file operations on Undo

Programs can change the Project's shared Files through the FileSystem, so instruction Undo must restore file contents and open-file state, including descriptors and positions, together with the Core at the same instruction boundary. We accept the additional history storage and bookkeeping because restoring only the CPU can duplicate an append or make a repeated read consume different bytes. This extends the rationale for [Screen Undo](./0005-restore-screen-state-on-undo.md); history limits, interactions with manual file edits, and persistence are separate decisions in the [design record](../design/multiple-file-compilation.md).

Throughout the Debug session, the editor is read-only and host file edits are prevented, including after program exit or a runtime error until Stop. Instruction Undo remains available after termination wherever the Core and retained Peripheral history support it; keeping exclusive access avoids old execution history overwriting subsequent user edits.

Stop ends execution and discards open-file state and instruction history while preserving Files exactly as the program and any Undo last left them. It does not restore the Build snapshot, so generated and modified Files remain available for the next Build.

FileSystem Undo retains byte-level inverse patches and metadata under a memory budget. Exhausting that budget does not fail the program's file operation: Undo stops before an instruction whose complete effects can no longer be restored, even if older CPU history remains. All affected Peripherals and the Core must pass the instruction-level preflight before anything is rolled back.
