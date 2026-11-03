---
status: accepted
date: 2026-11-03
---

# MIPS and RISC-V read the Keyboard and Mouse through an Input controller

MARS's and RARS's only keyboard is the typed-character receiver: no arrows, no key-up, no modifiers and no mouse. asmOS's port to MIPS and RISC-V ([asmOS portability](../design/asmos-portability.md)) needs all of these, and so does any game. The Screen already tracks the Keyboard's key state and the Mouse on these Targets; nothing maps them into memory.

MIPS and RISC-V programs now reach them through the **Input controller**, a memory-mapped device at 0xFFFF0300, right after the **Synth**. Like the Synth ([ADR 0061](./0061-the-synth-is-a-chip-that-could-have-been-built.md)), it is our own design held to what a real chip could have done. It reports:

- **Key state** as a 256-bit bitmap.
- **The pointer's position and buttons** in one word.
- **Key, button and wheel events** in one 64-entry queue of one-word records. Each record holds the position, a kind and a code, and a "dropped" record marks an overflow.

**Key codes are USB HID usage IDs**, taken from the physical key. Characters come from the program's own keymap, as on a real machine. An ID word tells the editor apart from real MARS and RARS, where the whole block is plain memory that reads 0, so a program written for it still runs there, with no input. The design and its fourteen decisions are in [input-controller.md](../design/input-controller.md).

## Considered options

- **EASy68K's task 19 and 61 semantics in registers, as the Z80's Port map has them**: less new code and one model across the non-x86 Targets, but a trap service dressed as memory, with a double-click flag and modifier snapshots no hardware reports.
- **EASy68K's Windows virtual-key codes, or Linux's `KEY_*`**: both already implemented here, but they are operating-system numberings. PS/2 scan codes are real but come as multi-byte sequences no state bitmap can be indexed by. HID usage IDs are the only real-device convention that fits a byte.
- **State only, or a queue only**: state loses the order of keys and taps between polls, which an event-driven program such as asmOS's window manager cannot do without. A queue alone makes every program, even one that only asks whether Left is down, rebuild state itself, and leaves nothing to resynchronise from after an overflow. The controller has both, as the PC's 8042 keyboard controller carried keyboard and mouse in one buffer.
- **Placing it at 0xFFFF0028 to 0xFFFF00FF**, the free words nearest the receiver: that is where the Pitt keypad tool and Saturn put their own input registers.
- **Leaving MARS and RARS keyboard-only**: asmOS would become a different OS on these Targets, and every app would need a keyboard path.

## Consequences

- **Programs that use it run in no reference simulator.** The Documentation and `<sim.h>` say so, as for the Synth ([ADR 0062](./0062-the-synth-sits-beside-each-reference-s-own-devices.md)).
- **The receiver is unchanged.** Every key press feeds both, so pastes and Testcase input behave as before, and so do existing MARS and RARS programs, except that Escape now reaches them as character 27.
- **Shift+Tab releases the Screen on every Target**, so that Escape reaches programs. This is an update to [ADR 0008](./0008-poll-keyboard-and-mouse-input.md).
- **Undo splits the two views.** Popped events go back on Undo, under [ADR 0057](./0057-restore-the-terminal-on-undo.md)'s rule, while state stays live. x86 already accepts the same split ([ADR 0069](./0069-x86-journals-the-input-its-reads-take.md)).
- **Input reaches it only while a program runs**, from its first instruction to its end, and never in a Testcase, as on x86.
- **It lives in the adapter**, as the receiver and the Synth do, although [ADR 0035](./0035-environments-match-their-reference.md) has the Core own each service's semantics. MARS's and RARS's Cores have no device model, only memory observers, and the record packing is the device.
- **Interrupts are reserved, not offered.** Setting the interrupt-enable bit stops the program, as the receiver's does.
- **The register layout is now a contract**: programs will depend on it. A later change takes a new ID version.
