## Calling trap #15

The 68000 instruction set includes `trap #n`, which transfers control to an exception handler. The processor does not define what a handler should do with a request to print text, read input, or draw a shape. This editor provides a small set of services through `trap #15`: put the task number in `D0.B`, put its arguments in the registers listed below, then read any answer from the documented output registers. Other trap numbers are not implemented here.

The simulator connects your program to the editor's console, screen, keyboard, mouse, clock, and project files. Printed text appears both in the console transcript and at the screen's text cursor. Testcases compare the transcript. A screen operation (such as task 33 or tasks 80–99), keyboard poll/state task (7 or 19), or mouse read (61) switches interactive input for tasks 2, 4, 5, and 18 from the console to the focused screen panel for the rest of that run; there is no task to switch back. Click the panel before typing. Its focus ring indicates that editor keyboard shortcuts are paused while the program receives keys.

These services are part of the simulator, not instructions built into the 68000. The editor supplies only the services listed on this page. Unsupported device requests stop the program with an explanation. Undo reverses a service's changes along with the instruction's register and memory changes. Testcases run with scripted input and their own copy of the project's files.

## Simulator behavior {#differences}

- A run starts with a 640 by 480 pixel screen. Graphics use pixel coordinates with `(0, 0)` at the top left; drawing beyond an edge is clipped. The fixed text font uses 8 by 16 pixel cells and draws ASCII glyphs only. Other Windows-1252 characters appear in the console transcript, but their screen cells are blank.
- Text uses Windows-1252 bytes: each character occupies one byte. For example, `€` is `$80`. The screen font may not draw every character that the console can display.
- Line and number input accept at most 79 typed characters. Extra characters are dropped. A number read accepts an optional sign and digits at the start of the line; `12abc` reads as `12`, and a line without a number reads as zero.
- Keyboard and mouse input are polled by the program. The simulator does not deliver device interrupts. For keyboard input, use task 7 to check whether a key is waiting, or task 5 to wait for one key.
- Task 8 reads hundredths of a second since local midnight. Testcases use UTC and start at 2000-01-01 midnight. Task 23 waits during a normal run; in a testcase it advances the virtual clock without making the test wait in real time.
- File tasks use paths relative to the project root. Up to eight files can be open at once, numbered 0 through 7. File contents and positions are part of Undo history, and each testcase receives its own file copy.
- An unsupported task or an invalid argument stops execution with an error that names the task or register. This makes unsupported hardware and invalid values visible instead of silently ignoring them.

## Colors

A color is a long written `$00BBGGRR`: blue in bits 23-16, green in bits 15-8 and red in bits 7-0. The color names shown here are also available as equates to use in assembly programs.

## Key codes

{keyCodeRules}

{keyCodes}

## Unsupported tasks {#unsupported}

Each task listed here stops the program with an error naming the task and the unsupported operation.

{unsupportedTasks}
