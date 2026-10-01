## Calling trap #15

The M68K has one system call: `trap #15`. The task number goes in `D0.B`, its arguments in the other registers, and the answer comes back in the registers the task names. The interface is EASy68K's, so a program written for that simulator runs here unchanged as far as its I/O goes.

Text and graphics share one image, as they do in EASy68K's output window: what a program prints is drawn on the screen at the text cursor _and_ appended to the terminal transcript, which is what testcases assert on. Click the screen panel to give the program the keyboard; the ring around it says the editor's own shortcuts are off while it has focus.

## Colors

A color is a long written `$00BBGGRR`: blue in bits 23-16, green in bits 15-8 and red in bits 7-0. These are EASy68K's own equates, and a program that defines them by name needs no change.

## Key codes

{keyCodeRules}

{keyCodes}

## Tasks that are not supported {#unsupported}

These stop the program with an error naming the task, rather than doing something the program did not ask for. Everything they configure is either hardware this editor does not have or a decision the editor makes for itself.

{unsupportedTasks}

## Differences from EASy68K {#differences}

- Everything printed also reaches the terminal transcript, which EASy68K does not have. It is what keeps testcases and the non-graphical view working.
- The screen draws text in one fixed 8 by 16 cell font, so task 21 (font properties) is not supported and the text screen cannot be read back (task 22) or scrolled (task 25).
- Task 92's bitwise drawing modes (0, 1, 3 and 5 to 15) stop the program with an error naming the mode. Double buffering, modes 17 and 94, covers the sprite erasing the XOR mode is usually used for.
- Task 8 counts from the start of the run rather than from midnight, and task 23 completes immediately during a testcase, which runs on a virtual clock.
- Rectangles and ellipses exclude their right and bottom edges. That is what EASy68K does too, because it draws through the Windows GDI, but it surprises people often enough to be worth saying twice.
