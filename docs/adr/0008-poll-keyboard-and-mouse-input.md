# Poll keyboard and mouse input first

The first version of **Keyboard** and **Mouse** input will use polling: programs explicitly inspect device state or available input through their environment's guest interface, and these peripherals will not deliver CPU interrupts. This supports interactive graphics while deferring the additional interrupt routing, handler execution and history semantics that interrupt-driven input requires. Programs requiring device-generated CPU interrupts are outside first-version compatibility, including the interrupt-driven keyboard mode supported by [MARS](https://raw.githubusercontent.com/dpetersanderson/MARS/main/mars/tools/KeyboardAndDisplaySimulator.java); exact polling interfaces remain to be settled, and shared typed input with **Terminal** is covered by [ADR 0009](./0009-share-screen-keyboard-input-with-terminal.md).

## Live input after Undo

Recording and replaying Keyboard and Mouse observations is deferred. Re-executing an input read after Undo uses the device's then-current state or available input and may produce a different result from the original read. The complete Screen restoration required by [ADR 0005](./0005-restore-screen-state-on-undo.md) still applies; stepping backward does not promise deterministic input replay.

## Keyboard focus

The program receives keyboard input only while the Screen has focus, which users can give it by clicking or tabbing into it and which the GUI indicates visibly. Keys delivered to the focused Screen must not also invoke editor shortcuts; for example, Shift+C must not clear execution while it is being used as program input. Losing focus releases held keys so that a missed key release cannot leave a key stuck down.

## Key hold time

Queued key presses and releases are applied only when the program reads the keyboard, at most one transition per minimum hold interval, so every state is observed at least once and a brief tap cannot fall between two polls. This follows the queued keyboard of the TRS-80 emulator that `@specy/z80` descends from ([Keyboard.ts](https://github.com/lkesteloot/trs80/blob/master/packages/trs80-emulator/src/Keyboard.ts)), which releases one queued transition per 50,000 t-states. Program time coincides with host time ([ADR 0010](./0010-program-time-without-clock-pacing.md)), so the interval is measured in milliseconds; its value is an implementation choice to validate.

## Keyboard views

A program observes the Keyboard in two ways. A typed-character queue holds every character in press order and never drops one: an availability check reports that the queue is not empty, and a read dequeues one character. For MARS and RARS this means the receiver Ready bit stays set while characters remain, a superset of the [original register](https://raw.githubusercontent.com/dpetersanderson/MARS/main/mars/tools/KeyboardAndDisplaySimulator.java), where a new keystroke overwrites an unread one. A key-state view answers whether any key is down and keeps the codes of the last key down and last key up, matching both forms of EASy68K's task 19 ([text I/O help](https://acorn.huininga.nl/pub/projects/CiscOS/_emulators/EASy68Ksource/EASy68K_Help/textio.htm)); its transitions are applied at read time under the hold interval above, while characters enter the typed queue at the moment of the press, so the interval never delays typed input. Every environment uses EASy68K's [key codes](https://acorn.huininga.nl/pub/projects/CiscOS/_emulators/EASy68Ksource/EASy68K_Help/keyCodes.htm), so the M68K adapter needs no mapping and the Z80 key ports reuse a documented table; modifiers are ordinary keys with their own codes and never change another key's code. Because the focused Screen already receives every key, EASy68K's task 24, which disables simulator shortcuts, becomes a no-op.

## Mouse views

A program observes the Mouse through three views: the current state, a snapshot taken at the last button down, and a snapshot taken at the last button up. Each carries the position, the left, right and middle buttons, the Shift, Alt and Ctrl states sampled from the Keyboard's key-state view at that moment, and, on the down snapshot, a double-click flag. This is the polling interface of EASy68K's task 61 ([peripheral I/O help](https://acorn.huininga.nl/pub/projects/CiscOS/_emulators/EASy68Ksource/EASy68K_Help/peripheralio.htm)), and every environment exposes the same three views. Snapshots persist until the next event of their kind, so a click that happens between two polls remains visible and a program detects a new click by comparing with its previous read; the Z80 ports may add an event counter, while the M68K task stays as documented. Right and middle clicks inside the Screen are kept from the browser, so that the context menu and middle-click autoscroll do not steal those buttons from the program.

## Mouse coordinates

Mouse positions use the Screen's logical pixel coordinates, sharing the top-left origin of drawing operations and remaining independent of GUI zoom. For example, the center of a 320 by 200 Screen displayed at 640 by 400 reports (160, 100). Reported coordinates never leave the Screen: during a drag that started inside, the position is the nearest point inside, so dragging past the right edge pins X to the last column while Y keeps following the pointer, and a pointer that leaves with no button held keeps its last inside position. This matches the upstream web screen, which clamps every event to its pixel grid ([CanvasScreen.ts](https://github.com/lkesteloot/trs80/blob/master/packages/trs80-emulator-web/src/CanvasScreen.ts)), keeps every environment's coordinate encoding unsigned and in range, and applies to all three mouse views. A program therefore cannot tell that the pointer left the Screen; an inside flag can be added to the Z80 ports if a use appears.

## Mouse drags

A drag started inside the Screen continues to deliver movement and button-release events after the pointer leaves the Screen, until the button is released. Losing browser-window focus releases held mouse buttons so that the program cannot be left with stuck input.
