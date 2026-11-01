---
status: accepted
date: 2026-10-31
---

# x86 journals the input its reads take

Brings x86 under [ADR 0057](./0057-restore-the-terminal-on-undo.md), which left it waiting "until the Core journals input", and replaces decision 7 of [environment-library-plan.md](../design/environment-library-plan.md) for standard input.

Blink keeps the queues an x86 program reads input from, standard input and every reader of an evdev device ([x86 devices](../design/x86-devices.md)), and records in its native history what each read took, so a read is no longer an Undo barrier. What Undo does with it is ADR 0057's rule:

- **A read that waited for typed input asks again.** What it took is not put back, so a person can try another answer from the same point, and the Terminal's journal takes back the echo.
- **What a read took without waiting for it goes back** at the front of its queue: type-ahead the program found already typed, and every evdev event. No read asked for them, as no read asks for the keystroke a polled device takes on the other Targets, and the program would otherwise find nothing where it found a key.
- **`EVIOCGKEY` throws away a reader's queued key events**, as on Linux, and Undo puts those back too.

The Core owns the queues because it owns the semantics of the services they serve ([ADR 0035](./0035-environments-match-their-reference.md)); the editor only delivers keys, lines and events into them.

Without this, every read of input was a barrier. A game reads events every frame, and a raw-mode Terminal game reads standard input every frame, so Undo could not step back further than the last frame in exactly the programs that draw and take input.

What stays as it was:

- The key state and the pointer's position that `EVIOCGKEY` and `EVIOCGABS` answer are live: after Undo they answer the state as it is now, as on every Target ([ADR 0008](./0008-poll-keyboard-and-mouse-input.md), [ADR 0066](./0066-key-state-changes-at-the-event.md)).
- Opening or closing a descriptor and changing a mapping, `mmap` of `/dev/fb0` included, are still barriers. Programs do them once while starting, so Undo reaches everything after; journaling descriptors and mappings in general is a larger Core change nothing here needs.
- File changes stay barriers until the Core journals them ([ADR 0015](./0015-restore-file-operations-on-undo.md)).

The first version of this record put every byte a read took back, and called that ADR 0057's rule; ADR 0057 had rejected it as "replay the answer". Corrected on 2026-10-31, after the design's review.

## Considered options

- Evdev reads as barriers, as standard input was: nothing to build, but Undo stops working in every interactive program.
- Journal evdev reads and leave standard input a barrier: a smaller step, but two kinds of read would behave differently under Undo for no reason a learner could see.
- Put back everything a read took, a waited-for line included: deterministic when stepping forward again, but the person could not try another answer, which is why ADR 0057 rejected it.
