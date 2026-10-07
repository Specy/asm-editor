## Screen, keyboard and console

The simulator includes a screen, keyboard and console for your program to use. These are virtual devices inside the editor: there is no separate hardware to connect or configure before running. The screen is a grid of words in memory, and the keyboard and console are controlled through four memory-mapped words starting at `{receiverControl}`. A program checks the keyboard's Ready bit, reads a character, and writes characters to the console. The screen panel is always available beside the memory view.

## Bitmap display

One word of memory is one pixel. Its low 24 bits are the color, red in bits 23-16, green in 15-8 and blue in 7-0; the top byte is ignored. Words run left to right and then top to bottom, so the pixel below a word is one row of words further on.

The screen panel's **Display** button configures it, and a program can set those same five parameters with the [@screen comment](#screen-directive) below. The parameters are saved with the project, and testcases run with them too.

{parameters}

{bitmapExample}

Reserve the memory the grid covers, with `.space` or a label of your own: the screen shows whatever those words hold, and a program that writes past what it reserved is writing over something else. Undo walks the picture back with the code, because the picture _is_ the memory the emulator rolled back.

## Configuring the screen from the program {#screen-directive}

A comment line naming `@screen` sets those five parameters at every **Build**, before the first instruction runs, so opening a program and building it is all it takes. It is a comment, so it does not change how the assembly source is parsed.

{directiveExample}

{settings}

- Order and spacing do not matter, commas are allowed between settings, and `unitWidth`, `unit-width` and `unitwidth` are the same name.
- What the directive leaves out keeps the value it had, and a program with no `@screen` line changes nothing at all: the configuration stays yours.
- An unknown setting or a label that does not exist is a _warning_ on the directive's line, never an error: a comment cannot stop a program from assembling. A size off the list is replaced by the nearest one on it, and anything else is left as it was.
- Changing a parameter in the **Display** popover afterwards wins, until the next Build reads the comment again.

## Keyboard and display registers {#keyboard-and-display}

Four words carry one character each way. What the program transmits is appended to the console transcript, the same one `print` services write to, which is also what testcases assert on.

{registers}

{keyboardExample}

The receiver never loses a keystroke: what does not fit in the data register waits in a queue behind it, and Ready ({readyBit}) stays set until that queue is empty. Click the screen panel to send keyboard input to the program; its focus ring shows that the editor's own shortcuts are paused. This simulator polls the devices and does not deliver device interrupts, so setting bit 1 of either control register ({interruptBit}) stops the program with an error. Poll Ready instead.

## Program time

Service `30` (`{service}` before a `{call}`) answers with the time in milliseconds, low word in `{argument}` and high word in `{highArgument}`, and service `32` waits for the milliseconds in `{argument}`. Time is counted from the start of the run, so subtracting two readings measures elapsed time. A wait costs no instructions, which lets a program idle for keyboard input without reaching the execution limit. In a testcase the virtual clock starts at zero and advances only through the program's waits: a five-second wait finishes immediately, and elapsed-time output is repeatable. There is no mouse device in this simulator.
