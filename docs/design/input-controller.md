# Input controller

Status: decided in a grill with the owner on 2026-11-03, then revised the same day after an independent review; implemented the same day, uncommitted, on branch `feat/asmos-stage1` (worktree `.cache/wt/stage1`) together with the [folder calls](./folder-calls.md) and the linking of several units, with the interpretations listed under [Implementation notes](#implementation-notes). The model is [ADR 0071](../adr/0071-mips-and-risc-v-read-the-keyboard-and-mouse-through-an-input-controller.md), with dated notes on [ADR 0003](../adr/0003-preserve-simulator-graphics-conventions.md), [ADR 0008](../adr/0008-poll-keyboard-and-mouse-input.md) and [ADR 0066](../adr/0066-key-state-changes-at-the-event.md). This is the extension that decision 2 of [asmOS portability](./asmos-portability.md) calls for. The facts it rests on are in [memory-mapped-input-conventions.md](../research/memory-mapped-input-conventions.md). The term is in [CONTEXT.md](../../CONTEXT.md) (**Input controller**).

## What it is

A memory-mapped device that lets MIPS and RISC-V programs read the **Keyboard** and **Mouse** beyond the typed characters that MARS's and RARS's receiver gives: arrows and other keys that type nothing, key-up, modifiers, and the pointer. The Screen already sends key and pointer events to the Keyboard and the Mouse on these Targets, but nothing maps them into memory (`MarsDevices` has no Mouse). The Keyboard's own key state cannot simply be mapped: it uses EASy68K's codes, merges left and right modifiers, and ignores keys EASy68K has no code for. So the controller keeps a key state of its own, fed by its own event stream, as `X86Input` does on x86 (decision 4).

## Decisions

1. **A chip that could have been built.** The Input controller reports only what a real input controller could: key codes from a real device convention, key and button state, ordered key events, the pointer's position. Work that belongs to software stays out of its registers: double-click detection, and mouse snapshots that bundle Shift, Alt and Ctrl. This is the standard the **Synth** set for MIPS and RISC-V extensions ([ADR 0061](../adr/0061-the-synth-is-a-chip-that-could-have-been-built.md)). It also fits asmOS's teaching goal: the MIPS/RISC-V platform file then does what a real driver does.

    Rejected: carrying EASy68K's task 19 and 61 semantics into registers, as the Z80 Port map does. That would mean less new code and one story across the non-x86 Targets, but it would be a trap service dressed as memory.

2. **Name.** **Input controller**, after the PC's keyboard controller, which served both the keyboard and the PS/2 mouse. Rejected: "input chip" (vague) and "HID controller" (jargon, and it would pre-empt the choice of codes).
3. **State and one event queue.**
    - **State registers** hold the keys that are down, the pointer's position and the buttons that are down. Reading them has no side effect, they cannot overflow, and they stay live across Undo with no work: the Cores do not journal the adapter's pushed writes.
    - **One queue** carries key, button and wheel events in order. Pointer moves are not queued, because position is state and the latest value wins.

    What each half is for:
    - **The queue is what an event-driven program needs.** asmOS's window manager needs ordered key events with repeats for Notepad and the Terminal, and each button press with its position. On MIPS/RISC-V a quick click can fall between two polls during a slow redraw. asmOS rebuilds its own key state from events, as its x86 driver does today.
    - **The state registers** let such a program resynchronise after a dropped record (decision 7). They also serve programs that only poll, such as a simple game asking whether Left is down, with no queue to drain.

    The PC's 8042 keyboard controller is the precedent: it put keyboard and mouse bytes in one output buffer and marked which device each came from. The queue's reads pop, so Undo puts back what a read took (decision 9).

    Rejected:
    - **State only, with change counters** (as the Z80 Port map has): it loses order and taps.
    - **A queue only:** every program, the simplest polling one included, would rebuild state itself, with nothing to resynchronise from after an overflow.

4. **USB HID usage IDs, in a key state of the controller's own.**
    - **Keys** use the Keyboard/Keypad page 0x07, one byte each, with left and right modifiers apart at 0xE0 to 0xE7. The key-state bitmap is 256 bits, indexed by usage ID.
    - **Mouse buttons** use the Button page's numbering: 1 left, 2 right, 3 middle.
    - **Codes come from the physical key** (`KeyboardEvent.code`, whose names follow HID's), so WASD stays positional on every layout and the keypad does not depend on Num Lock.
    - **Characters are the program's business**, through its own keymap, as on a real machine; asmOS's driver already has one.

    **The controller keeps its own key state from its own event stream**, beside the Keyboard's. It follows the edge rules x86's `X86Input` already has:
    - **A key-up for a key that is not down is ignored.** Windows sends PrintScreen as a key-up alone, and a key held across a Build arrives up without having gone down.
    - **A repeat for a key that is not down counts as a key down.** This happens after focus loss released the key, or after a Build. Without this rule a program would see kind 3 for a key it never saw go down.
    - **Keys with no page-0x07 usage send nothing**: media and consumer keys, Fn, `Unidentified`.
    - **The table settles the ambiguous names**:
        - `Backslash` is 0x31, and `IntlBackslash` is 0x64. Browsers give no separate name for the ISO key at 0x32, so it is never reported.
        - Firefox's older `OSLeft` and `OSRight` are 0xE3 and 0xE7, like `MetaLeft` and `MetaRight`.
        - Windows' AltGr arrives as the phantom `ControlLeft` plus `AltRight` the browser reports, and the Documentation says so.
    - **Focus loss and reset cover the whole HID set.** Focus loss releases every held key with an ordinary key-up.

    It is the only real-device convention that fits a byte. It needs a dated note on [ADR 0008](../adr/0008-poll-keyboard-and-mouse-input.md), whose 2026-10-31 rule gives each environment its Reference environment's codes: MARS and RARS have none beyond ASCII, so the Input controller, as an extension, brings its own. It also needs one on [ADR 0066](../adr/0066-key-state-changes-at-the-event.md), which said every Target that reads key state reads the Keyboard's.

    Rejected:
    - **PS/2 set 2:** multi-byte sequences no bitmap can be indexed by.
    - **EASy68K's Windows virtual keys:** an operating system API, against decision 1.
    - **Linux `KEY_*`:** an operating system's numbering, up to 0x2FF.
    - **ASCII:** no arrows or modifiers.

5. **The receiver stays as it is.** Every key press on the Screen feeds both MARS's typed-character receiver and the Input controller, as the Keyboard already feeds its typed queue and its key state from one event. A program picks its channel:
    - **The receiver** for layout-correct text, AltGr characters, pastes and Testcase input.
    - **The Input controller** for keys. A program that reads only the controller gets text through its own keymap, not the user's layout; asmOS already has that limit on x86.

    Keys pile up unread in the receiver's queue while such a program runs. The receiver drains that Screen queue before the Terminal's, so a later "press any key" read through the receiver would see the stale keys first. The Documentation tells a program that mixes the two to drain the receiver before such a read.

    Rejected:
    - **The controller replacing the receiver once touched:** invisible coupling, and it cuts off Testcase input and pastes.
    - **Characters inside the controller's key events:** a chip does not know the layout (decision 1).

6. **Shift+Tab releases the Screen on every Target**, as on x86 already, and Escape becomes an ordinary key everywhere:
    - the Input controller reports it as usage 0x29;
    - the receiver gets character 27. Character reads see it; line reads drop control characters, so Testcases are unaffected;
    - M68K and Z80 programs read EASy68K's Escape code;
    - in the Z80's TRS-80 mode Escape is BREAK, the key-matrix mapping it always had, which pressing Escape to release the Screen used to hide. Pressing it now stops a running BASIC program, as BREAK does.

    Clicking outside the Screen still releases it. Programs lose Shift+Tab as a readable combination, as x86 programs already do. Every release delivers a Shift down and up to the program (on M68K, two key IRQs), as on x86. This reaches beyond the Input controller, so it gets its own dated note on [ADR 0008](../adr/0008-poll-keyboard-and-mouse-input.md), and the Screen's Documentation and hints change with it.

    Rejected:
    - **Shift+Tab on MIPS and RISC-V only:** three release gestures across the Targets.
    - **Escape kept as the release key**, with the Input controller never reporting it: games and asmOS want Escape.

7. **The queue's record, depth and overflow.**

    **One 32-bit word per event**, read with one `lw`, so a program never sees half an event. Bit 31 is always 0, so the word is never negative: on RISC-V 64, `lw` sign-extends, and in C a shift of a negative `int` is arithmetic.

    | Bits  | Field | Meaning                                                                                                     |
    | ----- | ----- | ----------------------------------------------------------------------------------------------------------- |
    | 31    | —     | reserved, 0                                                                                                 |
    | 30–21 | y     | the pointer's position when the event happened, 0 to 1023                                                   |
    | 20–11 | x     | likewise; the Screen is at most 1024 pixels a side                                                          |
    | 10–8  | kind  | 0 none, 1 key down, 2 key up, 3 key repeat, 4 button down, 5 button up, 6 wheel, 7 dropped                  |
    | 7–0   | code  | a key's HID usage; 1, 2 or 3 for the left, right or middle button; for the wheel, a signed count of notches |
    - **Modifiers are keys in the queue**, so the order says what was held; no modifier byte.
    - **Every event carries the pointer's position.** Button events need it, and for key events it costs nothing.
    - **An empty queue reads 0.**

    **Reading:**
    - A status register holds the number of pending events and pops nothing.
    - Reading the Event register pops the head, as the receiver's data register does. The head is pushed into memory beforehand, and the after-read observer pops it and pushes the next.
    - A word observer hears every read that touches its word, so `lbu` and `lhu` pop too, and so does a RISC-V 64 `ld` that covers the Event word. The Documentation says to read it with `lw`, as it does for the receiver.

    **Depth: 64 events**, 256 bytes of FIFO, plausible for a chip of the time. asmOS's worst gap between polls, about 200 ms, holds 10 to 20 events of typing with repeats.

    **Overflow, after Linux's `SYN_DROPPED`.**
    - While the queue is full, new events are discarded and a loss flag is set.
    - The flag is host state, never journaled.
    - When the next event arrives while the flag is set, a dropped record (kind 7) is queued first if there is room, then the event if there is room. Queueing the dropped record clears the flag. What does not fit is discarded and keeps or sets the flag.
    - A dropped record means "events were lost; re-read the state registers".
    - A read never queues anything, so popping stays a plain pop for Undo.

    Rejected:
    - **Two-word records:** they need a rule for a half-read event.
    - **A sticky overflow bit cleared by a store:** a journaled program write the device must re-state on Undo.
    - **Queueing the dropped record at the pop that frees a slot:** the read itself would change device state, and Undo would have to remove the record and set the flag again.
    - **x86's depth of 4,096:** implausible for this chip, and not needed.

8. **Pointer state and the wheel.**
    - **The pointer register** is one word, so one `lw` gives a consistent sample: y in bits 30–21 and x in bits 20–11, where event records have them, bit 31 always 0, and the buttons held in bits 2–0 (bit 0 left, bit 1 right, bit 2 middle).
    - **Coordinates** are absolute logical Screen pixels, clamped, with no inside flag, as [ADR 0008](../adr/0008-poll-keyboard-and-mouse-input.md) rules for every Target. On MIPS and RISC-V a logical pixel is one word of the bitmap grid, so `y × columns + x` is the word under the pointer.
    - **The wheel** reaches the queue as kind 6, with the code a signed count of notches, positive away from the user (Linux's sign, which x86 already uses here). This needs a wheel handler for the Screen on non-x86 Targets and a wheel in the Mouse model; x86's conversion from browser deltas to notches (`wheelNotches`) is reused.
    - **Wheel merging**, so that a trackpad burst does not fill the queue. A wheel event merges into the record at the queue's tail when that record is an unread wheel record of the same sign and the sum stays within ±127. The merged record takes the latest position. Otherwise the event is appended. A merge into the head record, which is already pushed into the Event register, pushes it again.
    - **No horizontal wheel** for now.

    Rejected:
    - **The wheel as a wrapping counter register:** a second mechanism beside the queue, and it loses the order against clicks.
    - **No wheel:** asmOS's lists and Notepad scroll with it.
    - **x and y in separate words:** two reads can tear in the middle of a move.

9. **Undo and Testcases.**

    **Undo:**
    - **State stays live.** The key bitmap and the pointer register are pushed with writes the Cores do not journal, so after Undo they show the real present ([ADR 0008](../adr/0008-poll-keyboard-and-mouse-input.md), [0066](../adr/0066-key-state-changes-at-the-event.md), [0069](../adr/0069-x86-journals-the-input-its-reads-take.md)).
    - **Popped events go back** to the front of the queue when Undo rewinds past the read that took them, under [ADR 0057](../adr/0057-restore-the-terminal-on-undo.md)'s rule for the receiver and ADR 0069's for x86's events. The controller keeps its own journal on the instruction serial, a `TerminalHistory` instance of its own tracked and undone where the Audio's is (`MarsEmulator.svelte.ts`). It does not use the Terminal's journal, whose records hold characters.
    - **Put-backs may exceed 64.** The Status count reaches 127, and live events are never thrown away for replayed ones.
    - **The two views may disagree after Undo**, a key's down event back in the queue while the bitmap says the key is up, as x86 already accepts.
    - **The block is re-pushed after every Undo.** After every undo the device pushes its whole 64-byte block again: the ID, Status, the head, the pointer and the bitmap. A rewound program store into any of the words would otherwise leave stale bits. Unlike the Synth's observer, it does not skip work while the Core rewinds.
    - **Stores and Pokes to the controller's registers are ignored**, and the device re-states its values, as the receiver's control register does. The memory view never pops, since host reads notify no observer.
    - **Build, Clear execution and the start of each Testcase reset the controller**: an empty queue, the loss flag clear, nothing held, the pointer at 0,0. This is the Screen's reset path.

    **Testcases: the Input controller is idle in a Testcase.** No events, nothing held, the pointer at 0,0, enforced by the MIPS/RISC-V adapter. This is "a Testcase has no keyboard or mouse" as on every other Target; x86 gates its adapter the same way. Testcase input still reaches the receiver as typed lines.

    Deferred: scripted key and pointer events in Testcases. They would be wanted on every Target, and there is no precedent yet.

10. **Polling, with interrupt enable reserved.**
    - **Control reads 0.** A program write with bit 1 set, the receiver's interrupt-enable bit, stops the program with the receiver's "not supported" error, as `onControlWrite` does. Other bits are ignored, and the device re-states 0.
    - **No polled program sets the bit by accident**, and a later interrupt mode finds its bit in place.
    - **Input interrupts are not designed.** asmOS polls the controller and the stage-2 timer preempts it.

    Open notes for that later design: a MIPS Cause bit among 12 to 14, which MARS's and SPIM's devices leave unused, and a RARS `utval` device code other than 0x40, 0x80, 0x200, 0x10 and 0x100.

    Rejected:
    - **No control register yet:** a later one would land wherever space was left.
    - **Designing input interrupts now, with the timers:** nothing needs them.

11. **Placement, register map and detection.** Base 0xFFFF0300, directly after the Synth (0xFFFF0100 to 0xFFFF02FF), 64 bytes:

    | Offset      | Register                                                    | Access          |
    | ----------- | ----------------------------------------------------------- | --------------- |
    | +0x00       | ID, `0x494E5001` ("INP", version 1)                         | read            |
    | +0x04       | Control: reads 0; bit 1 set stops the program (10)          | write           |
    | +0x08       | Status: bits 6–0 the number of pending events, 0 to 127 (9) | read            |
    | +0x0C       | Event: pops the head, 0 when empty (7)                      | read, with `lw` |
    | +0x10       | Pointer: y, x and buttons (8)                               | read            |
    | +0x14–+0x1F | reserved (a horizontal wheel, say)                          | —               |
    | +0x20–+0x3F | Key state: 256 bits indexed by HID usage                    | read            |
    - **Reach.** MIPS and RISC-V programs reach it from the base register they use for the receiver and the Synth, since every offset is below 0x800. RISC-V 64 reaches it as it reaches the Synth: the Core's loads and stores compute addresses as 32-bit values (`RegisterFile.getValue`).
    - **Space left alone.** It keeps the editor's extensions together. It leaves 0xFFFF0028 to 0xFFFF00FF to the conventions the Pitt keypad tool and Saturn use there. It keeps RARS's Timer Tool range, 0xFFFF0018 to 0xFFFF0027, free for stage 2.
    - **Key state by byte or by word.** MARS and RARS are both little-endian, so key `u` is bit `u & 7` of byte `+0x20 + (u >> 3)`, and also bit `u & 31` of word `u >> 5`. Reading the bitmap has no side effect, so byte reads are safe there.
    - **Detection.** On real MARS and RARS the block is plain memory reading 0. The ID then says "no Input controller", the queue is empty and nothing is held, so a program written for the controller runs there harmlessly with no input, and can say so.
    - **Coverage.**
        - A bitmap display based at 0xFFFF0000 whose grid overlaps any part of 0xFFFF0300 to 0xFFFF033F switches the controller off, as it does the Synth (`synthCovered`).
        - While it is off, nothing is pushed and nothing pops, so key presses never write pixels.
        - Changing the display mid-run can switch it on or off. Switching on pushes the whole block; switching off leaves the words to the display.
        - The Documentation says so.

    Rejected:
    - **0xFFFF0028 to 0xFFFF00FF:** collides with the Pitt tool's and Saturn's registers in programs written for them.
    - **No ID:** a program could not tell the editor from real RARS.
    - **Status merged into Control:** a pushed count in the word programs store to, so every store would have to be re-stated over the count.

12. **Names for C and assembly.**
    - **One register module.** `inputControllerRegisters.ts` sits beside `synthRegisters.ts`, plain data. The adapter, the Documentation, the coding agent's prompt and `scripts/sim-header` all read it ([ADR 0034](../adr/0034-environment-library-is-header-only.md)).
    - **What `<sim.h>` gains:**
        - the registers: `SIM_INPUT_BASE` (`0xffff0300ul`), `SIM_INPUT_ID`, `SIM_INPUT_CONTROL`, `SIM_INPUT_STATUS`, `SIM_INPUT_EVENT`, `SIM_INPUT_POINTER`, `SIM_INPUT_KEYS`;
        - the field macros, which cast to `unsigned` and mask, so they are right for `int` values and on RISC-V 64: `SIM_INPUT_KIND(e)`, `SIM_INPUT_CODE(e)`, `SIM_INPUT_X(v)`, `SIM_INPUT_Y(v)`, `SIM_INPUT_BUTTONS(v)`, and `SIM_INPUT_WHEEL_NOTCHES(e)`, which returns the wheel's code as a signed number;
        - the kinds: `SIM_INPUT_KEY_DOWN`, `SIM_INPUT_KEY_UP`, `SIM_INPUT_KEY_REPEAT`, `SIM_INPUT_BUTTON_DOWN`, `SIM_INPUT_BUTTON_UP`, `SIM_INPUT_WHEEL`, `SIM_INPUT_DROPPED`;
        - two button families for the two encodings:
            - `SIM_INPUT_BUTTON_LEFT`, `SIM_INPUT_BUTTON_RIGHT` and `SIM_INPUT_BUTTON_MIDDLE` (1, 2, 3) are event codes;
            - `SIM_INPUT_HELD_LEFT`, `SIM_INPUT_HELD_RIGHT` and `SIM_INPUT_HELD_MIDDLE` (1, 2, 4) are the pointer register's bits;
        - a few helpers: `sim_input_present()`, `sim_input_event()`, `sim_input_key_down(usage)`, `sim_input_pointer()`.
    - **Key names** are the browser's `KeyboardEvent.code` names, which follow HID's, in screaming snake case: `KeyA` → `SIM_KEY_A`, `ArrowLeft` → `SIM_KEY_ARROW_LEFT`, `ShiftLeft` → `SIM_KEY_SHIFT_LEFT`, `Digit1` → `SIM_KEY_DIGIT_1`, `Numpad1` → `SIM_KEY_NUMPAD_1`. One list gives the editor's mapping table, the header's names and the Documentation's table.
    - **Assembly** programs get the same tables in the Documentation, ready to paste as `.eqv` lines; there is no assembly include, as for the Synth. Since bit 31 of every word is 0, `lw` is right on RISC-V 64 too.

    Rejected:
    - **Linux-style names** (`SIM_KEY_LEFTSHIFT`): a second scheme beside the browser's.
    - **HID's own names** ("Keyboard LeftArrow"): awkward as identifiers.
    - **No constants at all:** programs full of magic numbers.
    - **One button family for both encodings:** `SIM_INPUT_MIDDLE` cannot be both the code 3 and the bit 4.

13. **Input only while the program runs**, as on x86 (`takesInputReports` in `X86Emulator.svelte.ts`). Events and state reach the controller only in an interactive run, from the program's first instruction until it ends. This blocks two cases:
    - **Before Run:** the click that focuses the Screen after a Build would otherwise wait in the queue as a phantom click.
    - **After the program ends:** an Undo past the end would otherwise hand the program events typed after it was over.

    A key held when the program starts shows at its next repeat (decision 4).

    Rejected: type-ahead into the queue before the first instruction, as the receiver takes typed characters. A click is not typing; it was aimed at the Screen, not at the program.

14. **Waiting for input: sleep, then poll.** The controller has no wait register. A program that has nothing to do sleeps (syscall 32) between polls of Status. The Documentation and the examples show this idiom, so an idle program neither busy-loops at full emulation speed nor fills the Undo history with idle iterations. Input interrupts (10) are the long-term answer.

    Rejected: a register whose read blocks until an event, or a wait call. Either would be a new waiting mechanism beside sleep, ahead of the interrupt design that should own it.

## What it touches

- **The register module** (12) and `MarsDevices.ts`:
    - observers and pushes, preferably one range observer: every observer is checked on every memory access, so the hot-path cost is measured;
    - `regions()`, the coverage check (11), and the re-push after every undo (9);
    - a Mouse in its host; `MarsEmulator.svelte.ts` passes the Mouse and tracks the controller's journal beside the Audio's;
    - the run gate (13).
- **A second key state with its own event stream** (4): the HID table from `KeyboardEvent.code`, the edge rules, and focus loss and reset over the HID set. The Keyboard's EASy68K key state is unchanged.
- **The Mouse and the Screen:** a wheel in the Mouse and a wheel handler on non-x86 Targets (8), and Shift+Tab as the release key everywhere (6). This includes `ScreenRenderer.svelte`'s skipped Escape key-up on non-x86 Targets.
- **`<sim.h>`** and its generator (12).
- **The Documentation:**
    - a new Input controller page, with the sleep-then-poll idiom (14) and the receiver caveat (5);
    - MARS's screen.md and docs/design/screen-peripherals.md stop saying there is no mouse;
    - the coding agent's prompt;
    - the Screen's Escape hints on every Target;
    - docs/design/x86-devices.md ("On every other Target Escape still releases the Screen") and docs/manual-verification.md rows H5, H14 and W5.
- **Dated notes:**
    - [ADR 0003](../adr/0003-preserve-simulator-graphics-conventions.md): the extension, and Escape's character 27 at the receiver;
    - [ADR 0008](../adr/0008-poll-keyboard-and-mouse-input.md): the Input controller's codes (4), Undo's put-back (9) and Shift+Tab (6);
    - [ADR 0066](../adr/0066-key-state-changes-at-the-event.md): MIPS and RISC-V now read a key state too, the controller's own (4).
- **Where the semantics live.** [ADR 0035](../adr/0035-environments-match-their-reference.md) has the Core own each service's semantics. The Input controller lives in the adapter instead, as the receiver and the Synth do: MARS's and RARS's Cores have no device model, only memory observers, and the record packing is the device. [ADR 0071](../adr/0071-mips-and-risc-v-read-the-keyboard-and-mouse-through-an-input-controller.md) records this.

## Implementation notes

Recorded on 2026-11-03 with the implementation. None changes a decision; each settles something the decisions leave open.

- **The device** is `packages/asm-editor/src/lib/languages/mars/InputController.ts`, plain TypeScript driven by `MarsDevices.ts`; the register module is `inputControllerRegisters.ts`.
- **Observers.** The Cores have range observers for writes only, so the Event register's reads need a word observer of their own. Stores into the Synth's block and the Input controller's share one range observer, from 0xFFFF0100 to 0xFFFF033F, so the device adds one observer in all. Measured on raw Cores, interleaved: one more observer is within noise on MIPS and RISC-V instructions per millisecond; ten more cost 4 to 11%, about 0.4 to 1.1% each.
- **The run gate and a Build's start code** (13). A compiled program's Build runs the Runtime library's start code up to `main`, outside the Undo history. That run does not open the gate: it opens at the first Run or Step, so the click that focuses the Screen after a Build is no phantom click for a C program either.
- **Covered** (11) means the device writes no memory and no read takes an event, while it keeps receiving input and keeps its state, as a chip whose addresses a display decodes in its place would. Uncovering it writes the block as it is then; switching off leaves nothing stuck, since key-ups still reach it.
- **Stale Emulators.** Every Core of a package shares one memory, so an Emulator that was never disposed still hears another one's program. The Input controller answers only for the devices that attached to that memory last; the receiver, the transmitter and the Synth still answer for every instance, as before.
- **`ld` on RISC-V 64** reads its high word first, so an `ld` from Status (+0x08) returns the oldest event in its upper half and a Status already one lower in its lower half.
- **`<sim.h>`** also has `sim_input_pending()`, Status's count, so a program's loop needs no mask. The key names took each header past the drift test's 32 KB guard, which is now 40 KB; the request limit is 1 MiB.
- **A focusing click's position** is read before the canvas takes the focus, which can scroll a canvas that was partly out of view under the pointer (`ScreenRenderer.svelte`, every Target).

## Deferred

- **Scripted key and pointer events in Testcases**, for every Target (9).
- **Input interrupts** (10, 14).
- **A horizontal wheel** (8).
