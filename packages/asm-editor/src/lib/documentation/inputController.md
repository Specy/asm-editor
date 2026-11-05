## What the Input controller is

The Input controller reports key presses and releases, held keys, mouse buttons, pointer position and wheel turns. Unlike the [keyboard registers](/documentation/{route}/screen#keyboard-and-display), which provide typed characters, it also reports keys such as the arrows, Shift and the function keys.

This editor adds the device to {simulator}, alongside the [Synth](/documentation/{route}/synth). Its memory registers start at `{base}`, after the Synth's. In {simulator} these addresses read 0 and provide no input. Check the ID register before using the controller, as the first program below does.

Click the **Screen** panel to send keyboard and mouse input to the program. While the Screen has focus, keys go to the program, including Escape. Press **Shift+Tab**, or click outside the Screen, to return keyboard control to the editor. Losing focus releases all held keys and mouse buttons: their state bits clear and release events enter the queue. This also happens when the browser window loses focus.

## A first program {#first-program}

This program prints a letter for each arrow key you press, R, L, D or U, and ends when you press Escape. Build it and press Run, then click the Screen and press the arrows.

{firstExample}

The program uses three registers:

1. It reads the ID register once, to make sure the Input controller is there.
2. It reads **Status**, which says how many events are waiting. If there are none, it sleeps for 16 milliseconds and looks again.
3. Each read of **Event** takes the oldest waiting event, one word. The program takes it apart: the kind in bits 10–8, and the code in bits 7–0.

## The registers {#registers}

Offsets below are from `{base}`. Each register is one 32-bit word, except **Keys**, which occupies 32 bytes. Read registers with `lw`. Read individual bytes of Keys with `lbu`.

{registerTable}

Status normally ranges from 0 to {depth}, the queue's capacity. Undo can restore additional events, so Status can exceed {depth}. It reports at most 127, even if more events are waiting.

**Reading Event removes an event.** Even a byte read with `lbu` removes it. Read it once with `lw` and keep the result. Reads of the other registers remove nothing.

Writes do not change the controller's state or the values later reads return. One write causes an error: setting bit 1 of Control stops the program, because this controller does not support interrupts. Leave that bit clear and poll Status.

## Events {#events}

Key presses, repeats and releases, mouse button presses and releases, and wheel turns produce **events**, one word each. Events wait in a queue, oldest first. Two key presses between reads are both kept in order, unless the queue is full.

{fieldTable}

Bit 31 of an Event word is always 0. Logical and arithmetic right shifts therefore give the same result when extracting its fields.

{kindTable}

- **A key's code** is its USB HID number. It identifies a physical key position rather than its printed character. For example, the position labelled S on a US keyboard is `KeyS` (`0x16`), regardless of the active layout. The table [at the end](#key-codes) lists the supported keys.
- **Holding a key** sends one key-down event, then repeats at the keyboard's typing repeat rate, then one key-up event on release. To move something while a key is held, read the [keys held now](#key-state) instead of counting repeats.
- **A button's code** is 1 for the left button, 2 for the right and 3 for the middle one.
- **The wheel's code** is a signed number of notches: positive away from you, negative towards you. Consecutive unread wheel turns in the same direction merge into one event while their sum fits from −127 to 127. The merged event uses the latest pointer position.
- **Every event carries the pointer's position** at the moment it happened, so a click event says where the click was.

Taking an event apart:

{decodeExample}

{decodeNote}

## Keys held now {#key-state}

From offset `0x20`, 32 bytes hold one bit per key code. A bit is 1 while its key is held. For code `k`, read byte `0x20 + k / 8`, bit `k % 8`, using integer division. Reads with `lbu` or `lw` leave the state unchanged.

This checks whether the left arrow, code `0x50`, is held. `0x50 / 8` is 10 and `0x50 % 8` is 0, so the bit is bit 0 of the byte at offset `0x20 + 10`:

{keyStateExample}

A game can read held keys once per frame and use events for single presses such as Escape. The two views answer different questions: a key pressed and released between frames is no longer held, but both events remain queued.

## The pointer {#pointer}

The Pointer word holds y in bits 30–21, x in bits 20–11, and held buttons in bits 2–0: bit 0 left, bit 1 right and bit 2 middle.

x and y count words of the [bitmap display](/documentation/{route}/screen#bitmap-display), from 0 at the top left. The word under the pointer is `y × columns + x`, where `columns` is the display's width in words. Dragging past an edge keeps the coordinates at the last word. Pointer movement updates this register without queuing an event.

## Waiting for input {#waiting}

To wait for input, sleep for a few milliseconds with service 32, then read Status again, as the first program does. Sleeping costs no instructions. Polling continuously uses instructions, fills the Undo history and can reach the instruction limit.

## When the queue is full {#full-queue}

The normal queue holds {depth} events, including any **dropped** markers. When it is full, new events are lost. Once space becomes available, a later arriving event first adds a dropped marker, kind 7. If only one slot is free, the marker fills it and that arriving event is lost too. Reading events alone does not add a marker.

On receiving a dropped marker, read Keys and Pointer to recover the current state. Held-key and button state still updates when events are lost. Undo can temporarily restore more than {depth} events, as explained [below](#undo).

## Typed characters and keys {#typed-characters}

A press that produces a character feeds both the [keyboard registers](/documentation/{route}/screen#keyboard-and-display) at `{receiver}` and the Input controller. Non-character keys, such as arrows and Shift, and key releases feed only the Input controller.

- Use **the keyboard registers** for text. They provide characters in the user's keyboard layout, including Shift and AltGr combinations, pasted text and Testcase input.
- Use **the Input controller** for keys. It provides physical key codes. A program using it for text must convert those codes into characters itself.

The two queues are separate. Reading the Input controller leaves typed characters waiting in the keyboard receiver. A later character read, including a read through a service, gets those old characters first. To discard them, read receiver data until the receiver's Ready bit is clear.

Escape types character 27 at the keyboard registers.

## When the Input controller hears nothing {#hears-nothing}

- **Before the program starts and after it ends.** Input is accepted from the program's first instruction until it ends. A click that focuses the Screen before Run is not queued. A key already held when the program starts appears at its next repeat as a key-down event.
- **In a Testcase.** A Testcase has no keyboard and no mouse: no events, no keys held, and the pointer at 0, 0. A Testcase's input still reaches the keyboard registers as typed lines.
- **Under the bitmap display.** A display whose base address is `0xffff0000`, {simulator}'s "memory map" base, can cover the Input controller's addresses. Its words are then pixels, and the Input controller writes none of them. Move the display, or make it smaller, to use both.

## Undo {#undo}

**Undo** restores events removed by the instruction being undone, at the front of the queue and in their original order. Running forward can read them again. Restored events are kept even if the queue grows past {depth}. Status reports at most 127.

Undo does not rewind held keys, held buttons or pointer position. Those registers show current input, so the restored queue may contain a key-down event for a key that is now released.

## From C {#from-c}

`<sim.h>` names the Input controller's registers, the parts of an event and every key:

- **Registers**: `SIM_INPUT_ID`, `SIM_INPUT_CONTROL`, `SIM_INPUT_STATUS`, `SIM_INPUT_EVENT` and `SIM_INPUT_POINTER` read a register, and `SIM_INPUT_KEYS` is the 32 bytes of keys held.
- **Helpers**: `sim_input_present()` says whether the Input controller is there, `sim_input_pending()` how many events wait, `sim_input_event()` takes the oldest event, `sim_input_key_down(key)` says whether a key is held, and `sim_input_pointer()` reads the Pointer register.
- **Parts of a word**: `SIM_INPUT_KIND(event)`, `SIM_INPUT_CODE(event)` and `SIM_INPUT_WHEEL_NOTCHES(event)`, which gives the wheel's notches as a signed number; `SIM_INPUT_X(word)` and `SIM_INPUT_Y(word)` for an event or the pointer, and `SIM_INPUT_BUTTONS(pointer)`.
- **Kinds**: `SIM_INPUT_KEY_DOWN`, `SIM_INPUT_KEY_UP`, `SIM_INPUT_KEY_REPEAT`, `SIM_INPUT_BUTTON_DOWN`, `SIM_INPUT_BUTTON_UP`, `SIM_INPUT_WHEEL` and `SIM_INPUT_DROPPED`.
- **Buttons**, in two forms: `SIM_INPUT_BUTTON_LEFT`, `SIM_INPUT_BUTTON_RIGHT` and `SIM_INPUT_BUTTON_MIDDLE` (1, 2 and 3) are a button event's code, while `SIM_INPUT_HELD_LEFT`, `SIM_INPUT_HELD_RIGHT` and `SIM_INPUT_HELD_MIDDLE` (1, 2 and 4) are the Pointer register's bits.
- **Keys**: `SIM_KEY_` and the key's name from the table below, such as `SIM_KEY_A`, `SIM_KEY_ARROW_LEFT` and `SIM_KEY_SPACE`.

See [Using C and C++](/documentation/{route}/using-c) for compiling. This program moves a dot with the arrow keys, draws where you click, and ends on Escape:

{cExample}

{riscv64}## Key codes {#key-codes}

Each key is named after the browser's name for it, written in capitals with underscores: `ArrowLeft` is `SIM_KEY_ARROW_LEFT` in C. Left and right Shift, Control, Alt and Meta (the Windows or Command key) are different keys. The keypad's keys are their own and do not depend on Num Lock. Keys that a USB keyboard has no code for, such as volume and media keys and Fn, send nothing.

{keyTable}

On Windows, AltGr arrives as two keys at once: Control Left and Alt Right.

For assembly, these lines give the common keys names, ready to paste at the top of a program:

{eqvLines}
