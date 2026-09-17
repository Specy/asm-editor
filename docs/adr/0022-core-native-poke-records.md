---
status: accepted
date: 2026-09-15
---

# Record Pokes in each Core's own history

A **Poke**, a register or memory value changed by hand or by the coding agent between two instructions of a Debug session, is one step of the Undo history, and each Core records and undoes it itself: a `beginPoke()`/`endPoke()` transaction around the Core's existing setters journals everything written inside it as one history entry, while a setter called outside a transaction stays direct, which Testcase presets rely on. We chose this over an editor-side journal because no Core keeps a host write out of its history cleanly today, so the Cores had to change either way, and one history with one owner keeps `canUndo`, `undo` and `getUndoHistory` the single source of what the next Undo reverts.

## Considered options

- An editor-side Poke journal, positioned against the Core history the way the Screen and FileSystem journals are ([ADR 0005](./0005-restore-screen-state-on-undo.md), [ADR 0015](./0015-restore-file-operations-on-undo.md)): one implementation for five languages and no release to wait for. Rejected: it still needed two Core fixes, because s68k appends a host register write to the last instruction's mutation list and MARS and RARS record a host memory write as one backstep per byte under the last instruction's address, and it would have made the editor a second owner of the history, deciding whether a Poke or an instruction is on top.
- Folding a Poke into the record of the instruction that runs after it: fewer entries, but a Poke made and undone before stepping needs a path of its own anyway, and the instruction's History row would list writes the program never made.

## Consequences

- Five packages change and release before the editor feature ships, all at once: `@specy/s68k`, `@specy/mips`, `@specy/risc-v`, `@specy/x86` and `@specy/z80`. The editor never depends on an unpublished build.
- A Poke takes one slot of the Core's history like an instruction. With the history Setting at 0 a Poke applies but cannot be undone, as an instruction cannot.
- A Poke entry carries an identity of its own, never an instruction's address or step id. The Screen and FileSystem journals hang their effects on instruction identities and are not consulted when a Poke is undone; MIPS and RISC-V key their FileSystem frames by the syscall's address, so a Poke group inheriting the previous instruction's address would pop that syscall's file changes with it.
- MARS and RARS report their undo stack grouped per instruction or Poke rather than per backstep, so a `jal` is one History row and "Undo to here" on row N undoes N steps.
- The preset setters keep their direct semantics: a Testcase's starting values never become history, and s68k's `setRegisterValue` stops appending to the last instruction's mutations.
