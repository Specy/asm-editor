## What the Input controller is

The Input controller lets a program read the keyboard and the mouse the way a game or a desktop needs them. The [keyboard registers](/documentation/{route}/screen#keyboard-and-display) give a program the characters someone types. The Input controller also gives it the keys that type nothing, such as the arrows, Shift and the function keys, the moment each key goes down and comes up, where the mouse pointer is, which buttons are held, and the wheel.

It is a device this editor adds to {simulator}, as it adds the [Synth](/documentation/{route}/synth). Its registers are memory from `{base}`, right after the Synth's. {simulator} itself does not have it: there the same addresses read 0, so a program written for it still runs there, but it sees no keys and no mouse. The ID register tells the two apart.

The Input controller hears the keyboard and the mouse only while the **Screen** panel has the focus. Click the Screen to give it the focus. Every key then goes to the program, Escape included. Press **Shift+Tab**, or click outside the Screen, to give the keyboard back to the editor.

## A first program {#first-program}

This program prints a letter for each arrow key you press, R, L, D or U, and ends when you press Escape. Build it and press Run, then click the Screen and press the arrows.

{firstExample}

It does what every program using the Input controller does:

1. It reads the ID register once, to make sure the Input controller is there.
2. It reads **Status**, which says how many events are waiting. If there are none, it sleeps for 16 milliseconds and looks again.
3. Each read of **Event** takes the oldest waiting event, one word. The program takes it apart: the kind in bits 10–8, and the code in bits 7–0.

## The registers {#registers}

Each register is a word at an offset from `{base}`. Read them with `lw`.

{registerTable}

Any read of Event takes the event it returns, even a read of a single byte of it with `lbu`, so read it once with `lw` and keep the word in a register. Reading the other registers takes nothing.

Writing to these registers changes nothing: the Input controller writes its values back at once. Only one write matters. Storing a value with bit 1 of Control set, which would ask for interrupts, stops the program with an error, because the Input controller does not interrupt the program. Poll Status instead.

## Events {#events}

Every key press, key release, button press and turn of the wheel becomes one **event**, a single word. Events wait in a queue, oldest first, until the program reads them. Two key presses between two reads are both kept, in the order they happened.

{fieldTable}

Bit 31 is always 0, so an event is never a negative number. That keeps `srl` and `sra` giving the same fields.

{kindTable}

- **A key's code** is its USB HID number, the code a USB keyboard sends for that key. It names the key's place on the keyboard rather than the character printed on it, so the key left of D is `KeyS` (`0x16`) on every layout. The table [at the end](#key-codes) lists every key.
- **Holding a key** sends one key-down event, then key-repeat events at the speed the key repeats while typing, then one key-up event when it is released. A program that moves something for as long as a key is held reads the [keys held now](#key-state) instead of counting repeats.
- **A button's code** is 1 for the left button, 2 for the right and 3 for the middle one.
- **The wheel's code** is a signed number of notches: positive when the wheel turns away from you, negative towards you. Turns that come quickly one after another are added into one event.
- **Every event carries the pointer's position** at the moment it happened, so a click event says where the click was.

Taking an event apart:

{decodeExample}

## Keys held now {#key-state}

From offset `0x20`, 32 bytes hold one bit for every key code: the bit is 1 while that key is held down. For key code `k`, look at byte `0x20 + k / 8`, bit `k % 8`. Reading these bytes takes nothing, so a program can read them as often as it likes, with `lbu` or `lw`.

This checks whether the left arrow, code `0x50`, is held. `0x50 / 8` is 10 and `0x50 % 8` is 0, so the bit is bit 0 of the byte at offset `0x20 + 10`:

{keyStateExample}

A game usually reads the keys it cares about once a frame like this, and reads events only for single presses such as Escape. The keys held and the events can disagree for a moment: a key that went down and up between two frames is not held at either frame, but its two events are in the queue.

## The pointer {#pointer}

The Pointer register says where the mouse pointer is and which buttons are held, in one word: y in bits 30–21, x in bits 20–11, and in bits 2–0 the buttons held, bit 0 left, bit 1 right and bit 2 middle.

x and y count words of the [bitmap display](/documentation/{route}/screen#bitmap-display), from 0 at the top left, so the word under the pointer is word `y × columns + x` of the display, where `columns` is the number of words across. They never leave the display: dragging past an edge stops at the last word. The pointer moves only the Pointer register; it puts no events in the queue.

## Waiting for input {#waiting}

There is no register that waits for a key. A program with nothing to do sleeps with service 32 for a few milliseconds, then reads Status again, as the first program does. Sleeping costs no instructions. A loop that only reads Status without sleeping would run millions of instructions a second, reach the instruction limit, and fill the Undo history with them.

## When the queue is full {#full-queue}

The queue holds {depth} events. A program that does not read events for a long while can miss some: once the queue is full, new events are thrown away. The next event that fits is preceded by a **dropped** event, kind 7, which says that events were lost there. After a dropped event, read the keys held and the Pointer register again rather than trusting what the lost events would have said.

## Typed characters and keys {#typed-characters}

Every key pressed on the Screen goes to both places at once: to the [keyboard registers](/documentation/{route}/screen#keyboard-and-display) at `{receiver}` as a typed character, and to the Input controller as a key. Use each for what it is good at:

- **The keyboard registers** for text. They give the character the key typed on the person's own keyboard layout, Shift and AltGr included, and also what is pasted and a Testcase's input.
- **The Input controller** for keys. It reports which key it was, not which character: a program that wants text from it has to turn key codes into characters itself.

A program that reads only the Input controller leaves its typed characters waiting in the keyboard registers. If it later asks "press any key" through the keyboard registers, or reads a character with a service, it finds the old keys first. Read the receiver data register until its Ready bit is clear before such a read.

Escape types character 27 at the keyboard registers.

## When the Input controller hears nothing {#hears-nothing}

- **Before the program starts and after it ends.** The Input controller hears input only from the program's first instruction until it ends, so the click that gives the Screen the focus before Run does not wait in the queue. A key already held when the program starts shows up at its next repeat, as a key-down event.
- **In a Testcase.** A Testcase has no keyboard and no mouse: no events, no keys held, and the pointer at 0, 0. A Testcase's input still reaches the keyboard registers as typed lines.
- **Under the bitmap display.** A display whose base address is `0xffff0000`, MARS's "memory map" base, can cover the Input controller's addresses. Its words are then pixels, and the Input controller writes none of them. Move the display, or make it smaller, to use both.

## Undo {#undo}

Stepping back with **Undo** past an instruction that read Event puts that event back at the front of the queue, so running forward again reads it again. The keys held and the Pointer register always show what is held and where the pointer is now. After an Undo, the queue can therefore hold the key-down event of a key that is up now.

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
