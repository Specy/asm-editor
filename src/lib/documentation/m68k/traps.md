## Calling trap #15

The M68K has one system call: `trap #15`. The task number goes in `D0.B`, its arguments in the other registers, and the answer comes back in the registers the task names. The interface is EASy68K's, so a program written for that simulator runs here unchanged as far as its I/O goes.

Text and graphics share one image, as they do in EASy68K's output window: what a program prints is drawn on the screen at the text cursor _and_ appended to the terminal transcript, which is what testcases assert on. A read waits for what is typed in the console, at the caret after the output, until the program first uses the screen, the keyboard or the mouse; from then on it waits for what is typed on the screen. Click the screen panel to give the program the keyboard; the ring around it says the editor's own shortcuts are off while it has focus.

The file tasks read and write the Project's Files, and Undo puts back what they changed, as it does registers and memory.

## Colors

A color is a long written `$00BBGGRR`: blue in bits 23-16, green in bits 15-8 and red in bits 7-0. These are EASy68K's own equates, and a program that defines them by name needs no change.

## Key codes

{keyCodeRules}

{keyCodes}

## Tasks that are not supported {#unsupported}

These stop the program with an error naming the task and saying why, rather than doing something the program did not ask for. Each drives something a page in a browser cannot have, something the editor does not have yet, or something the editor decides for itself.

{unsupportedTasks}

## Differences from EASy68K {#differences}

Each task does what it does in EASy68K 5.16, with the same results in the same registers. Where this editor departs from it, it does so on purpose, and it is listed here.

- Everything printed also reaches the terminal transcript, which EASy68K does not have. It is what keeps testcases and the non-graphical view working.
- Text is Windows-1252, EASy68K's code page, in the tasks and in the source alike: one byte per character, `€` at `$80` and the curly quotes beside it. A typed character that has no byte is stored as `?`, and one in the source is an assembly error. The five bytes the code page leaves unassigned (`$81`, `$8D`, `$8F`, `$90`, `$9D`) are shown as the control characters of the same number.
- Tasks 2, 4 and 18 keep the first 79 characters of a line and drop the rest. EASy68K ends the line by itself at the 80th key and keeps that key for the next read.
- Tasks 4 and 18 read a number with C's `atoi`, as EASy68K does, and a number too long for 32 bits keeps its low 32 bits; what EASy68K's own `atoi` does there was not available to check.
- A D1.W of `$8000` or more for tasks 0 and 1 displays up to 255 characters, as any D1.W above 255 does. EASy68K reads it as a negative index into its buffer.
- A value a task cannot take stops the program with an error that names the register: a base outside 2 to 36 for task 15, a D1.B other than 0 to 3 for task 16, a D1.L other than 0 or 1 for task 58, and task 92's bitwise drawing modes (0, 1, 3 and 5 to 15). EASy68K does nothing for the first three. Double buffering, modes 17 and 94, covers the sprite erasing the XOR mode is usually used for.
- A number in `D0.B` that is no task, and every task listed as not supported above, stops the program with an error saying why. EASy68K takes the trap exception for the first and carries out the others. The sound tasks, 70 to 77, wait for the Audio Peripheral, the editor's sound device.
- The screen draws text in one fixed 8 by 16 cell font, so task 21 (font properties) is not supported and the text screen cannot be read back (task 22) or scrolled (task 25). That font has only ASCII glyphs: other Windows-1252 characters advance the text cursor but draw blank cells. The terminal transcript displays them, and the bytes stored and read by the program are unchanged.
- Task 16's input prompt is the console's caret and the question beside it; the screen draws no flashing cursor of its own. With the line feed off, a key read of Enter takes the screen's text cursor back to the start of its line, and the transcript records the carriage return. Line and number reads always start a new line after Enter, independently of echo and line-feed settings, as EASy68K 5.16.1's input handler does. With the echo off, the text cursor stays where it is while a line is typed, where EASy68K moves it on a column per key without drawing.
- A path is from the Project root, with `/` or `\` between its parts, where EASy68K's is from the folder it runs in. Every File of a Project can be written, so task 51 never opens one for reading only and task 59 never answers 3.
- A read of no bytes, task 53 with D2.L = 0, reports 2. EASy68K reports 1 instead once an earlier read has reached the end of the file, which is C's end-of-file indicator.
- A buffer that runs past the end of memory is an error (2) for tasks 53 and 54 also when its end passes 4 GB, where EASy68K's check wraps round, and task 58 checks all 256 bytes it writes where EASy68K checks only the name.
- A File that is open can be deleted with task 57, and stays readable through its number until it is closed. EASy68K, on Windows, cannot delete it and reports 2.
- Task 58 asks for a path in a text prompt naming its title and filter, rather than in the Windows file dialog. Its suggested path is a placeholder; type a path to select it. Cancel, or an empty answer, is a cancel.
- Task 8 counts from the start of the run rather than from midnight, and task 23 completes immediately during a testcase, which runs on a virtual clock.
- Rectangles and ellipses exclude their right and bottom edges. That is what EASy68K does too, because it draws through the Windows GDI, but it surprises people often enough to be worth saying twice.
