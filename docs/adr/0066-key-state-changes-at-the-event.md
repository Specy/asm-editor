---
status: accepted
date: 2026-10-29
---

# Key state changes at the event

Amends the "Key hold time" section of [ADR 0008](./0008-poll-keyboard-and-mouse-input.md), and the sentence of [ADR 0065](./0065-m68k-devices-deliver-irqs.md) that kept it for IRQ handlers.

The **Keyboard**'s key state is EASy68K's. A key going down is down at once, and its code becomes the last key down; a key coming up is up at once, and its code becomes the last key up. A read answers the state as it is when the program reads it: there is no queue of key transitions, no hold interval and no pacing. EASy68K 5.16.1 works this way: in `simIOu.cpp`, `FormKeyDown` and `FormKeyUp` set `keys[]` and `keyDownCode` or `keyUpCode` in the key event itself, and `getKeyState`, which answers task 19, only reads them. A tap that begins and ends between two reads is gone from the held keys by the second read, and the last-key codes keep it. That is how an EASy68K program catches a tap, and how a program here does.

The pacing came from the TRS-80 emulator that `@specy/z80` descends from ([Keyboard.ts](https://github.com/lkesteloot/trs80/blob/master/packages/trs80-emulator/src/Keyboard.ts)), which queues key events and holds each one for tens of thousands of t-states, counted from a read of the keyboard. It belongs to that machine. The TRS-80's ROM and DOS scan the keyboard matrix and debounce it, confirming a new key with further reads, so a press has to outlast them, and the emulator types pasted text as presses and releases spaced far enough apart for the ROM to read each one. This editor runs no TRS-80 ROM, and pasted text goes to the typed-character queue, which needs no presses. Here the pacing only made the key state depend on how often a program read it. An M68K key-down handler (ADR 0065) was the plain case: its IRQ came at the event, and the state it then read was a transition behind, so after A and then B, B's handler read A.

Every **Target** that reads key state reads this one, with no special case: M68K's task 19 in both its forms, in an IRQ handler as anywhere else; the Z80 **Port map**'s key-state, last-key-down and last-key-up ports; and the TRS-80 mode's keyboard matrix at `0x3800`, which is wired to the keys and shows those held now. MIPS and RISC-V read only the typed-character queue.

What stays as it was:

- The typed-character queue is unchanged. It keeps every character in press order and never drops one, a deliberate departure from EASy68K's single pending character, and Undo still puts back a keystroke a polled device took ([ADR 0057](./0057-restore-the-terminal-on-undo.md)).
- The key state is live input, which Undo does not replay (ADR 0008).
- Losing focus releases every held key, now at once.
- On M68K, a key going down or up raises the IRQ the program asked for at the event (ADR 0065). The key state has changed before the IRQ is raised, so the handler reads the key that raised it.
- **Auto-repeat is a key going down again**, as in EASy68K, whose `FormKeyDown` runs on every repeat Windows sends. Each repeat:
    - types its character again;
    - sets the key down and makes it the last key down again;
    - raises a key-down IRQ again.

    A program that moves while a key is held, by counting key-down IRQs, behaves as it does in EASy68K. The owner chose this on 2026-10-29; until then a repeat pressed nothing.

## Considered options

- **Keep the queue, with a hold interval of zero.** A read would still apply one transition, so a program that read once after two presses would see one of them, and the answer would still depend on how often the program reads.
- **Keep the queue, and apply every pending transition when a key IRQ is raised.** It would fix the handler and keep the stale reads everywhere else, leaving two rules for one key state.
- **Latch a press until the next read**, so a tap always shows as down once. EASy68K's last-key codes already give a program the tap, and a read that says a key is down after it came up is not an answer EASy68K gives.

## Consequences

- A program that polls task 19's key form, or the Z80 key-state port, less often than a person taps can miss the tap in the held keys, as it would in EASy68K. The last-key codes, or a key IRQ on M68K, catch it.
- The Keyboard no longer reads a clock. Its hold interval, `DEFAULT_KEY_HOLD_INTERVAL_MS`, and its count of pending transitions are gone, and [ADR 0010](./0010-program-time-without-clock-pacing.md)'s note that the interval is measured in milliseconds no longer describes anything.
- The lectures and the coding agent's prompt stop describing the queue, and a key-down handler reads its key with task 19.
