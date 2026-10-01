## Screen, keyboard and console

{variant} programs draw and read input through memory, not through system calls: the screen is a grid of words anywhere in memory, and the keyboard and the console are four words at `{receiverControl}`. Both are {simulator}'s own tools, the _bitmap display_ and the _keyboard and display simulator_, with the same parameters and the same register layout, so a program written for {simulator} runs here unchanged.

## Bitmap display

One word of memory is one pixel. Its low 24 bits are the color, red in bits 23-16, green in 15-8 and blue in 7-0; the top byte is ignored. Words run left to right and then top to bottom, so the pixel below a word is one row of words further on.

The screen panel's **Display** button configures it, with {simulator}'s own five parameters, and a program can ask for them itself with the [@screen comment](#screen-directive) below. The parameters are saved with the project, and testcases run with them too.

{parameters}

{bitmapExample}

Reserve the memory the grid covers, with `.space` or a label of your own: the screen shows whatever those words hold, and a program that writes past what it reserved is writing over something else. Undo walks the picture back with the code, because the picture _is_ the memory the emulator rolled back.

## Configuring the screen from the program {#screen-directive}

A comment line naming `@screen` sets those five parameters at every **Build**, before the first instruction runs, so opening a program and building it is all it takes. It is a comment, so the same file still assembles in {simulator}, where you set the parameters in the tool's window as usual.

{directiveExample}

{settings}

- Order and spacing do not matter, commas are allowed between settings, and `unitWidth`, `unit-width` and `unitwidth` are the same name.
- What the directive leaves out keeps the value it had, and a program with no `@screen` line changes nothing at all: the configuration stays yours.
- A value {simulator} has no entry for, an unknown setting or a label that does not exist is a _warning_ on the directive's line, never an error: a comment cannot stop a program from assembling. A size off the list is replaced by the nearest one on it, and anything else is left as it was.
- Changing a parameter in the **Display** popover afterwards wins, until the next Build reads the comment again.

## Keyboard and display registers {#keyboard-and-display}

Four words carry one character each way. Click the screen panel to give the program the keyboard; the ring around it says the editor's own shortcuts are off while it has focus. What the program transmits is appended to the console transcript, the same one `print` services write to, which is also what testcases assert on.

{registers}

{keyboardExample}

The receiver never loses a keystroke: what does not fit in the data register waits in a queue behind it, and Ready ({readyBit}) stays set until that queue is empty. Bit 1 of either control register, {simulator}'s interrupt-enable bit ({interruptBit}), stops the program with an error: this editor polls, it does not deliver device interrupts.

## Program time

Service `30` (`{service}` before a `{call}`) answers with the time in milliseconds, low word in `{argument}` and high word in `{highArgument}`, and service `32` waits for the milliseconds in `{argument}`. Time is counted from the start of the run rather than from 1970, so a program differences two reads exactly as it did before, and a wait costs no instructions: a program idling on the keyboard never reaches the execution limit. In a testcase both run on a virtual clock that starts at zero and only advances through the program's own waits, so a five second wait finishes at once and elapsed-time output is the same on every machine.

## Differences from {simulator} {#differences}

- The display is always there: it is a panel next to the memory view rather than a tool you connect to the program before running it.
- Interrupt-driven I/O is not supported. Setting the interrupt-enable bit of a control register stops the program with an error naming the feature; poll the Ready bit instead.
- Time comes from the start of the run, and a testcase runs on a virtual clock. {simulator} answers with the host's wall clock.
- There is no mouse: neither simulator's tools have one.
- Programs live in `{examples}` in the repository, one per feature, each naming the display it wants in an `@screen` comment; {simulator} has no such directive and ignores the line.
