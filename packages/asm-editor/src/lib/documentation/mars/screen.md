## Screen, keyboard and console

The simulator includes a screen, keyboard and console for your program to use. These are virtual devices inside the editor: there is no separate hardware to connect or configure before running. The screen is a grid of words in memory, and the keyboard and console are controlled through four memory-mapped words starting at `{receiverControl}`. A program checks the keyboard's Ready bit, reads a character, and writes characters to the console. The screen panel is always available beside the memory view.

## Bitmap display

One word of memory is one pixel. Its low 24 bits are the color, red in bits 23-16, green in 15-8 and blue in 7-0; the top byte is ignored. Words run left to right and then top to bottom, so the pixel below a word is one row of words further on.

The screen panel's **Display** button configures it, and a program can set those same five parameters with the [@screen comment](#screen-directive) below. The parameters are saved with the project, and testcases run with them too. Width and height are physical display pixels; divide each by its matching unit size to get the number of memory words across and down. For example, 512 by 256 pixels with 2 by 4 pixel units gives 256 by 64 words, so the grid occupies 16,384 words (65,536 bytes). The default unit is 1 by 1, so the default 512 by 256 pixel display uses 512 by 256 words.

{parameters}

The bitmap example configures its own 256 by 256 word grid with `@screen`, so its 256-word row stride is 1024 bytes.

{bitmapExample}

Reserve the memory the grid covers, with `.space` or a label of your own. The example reserves 256 × 256 words, or 262,144 bytes; the screen shows whatever those words hold, and writing past the reserved range overwrites other memory. Undo walks the picture back with the code, because the picture _is_ the memory the emulator rolled back.

## Pictures in files {#pictures}

A program can draw a picture it reads from a file, such as a sprite sheet. Open a BMP File and choose **Pixels** under the editor to draw in it, or make one with **New picture** in the Explorer. A new picture is 32-bit and stored top-down, the layout of this screen: the pixel at column x and row y is the word at `pixels + 4 × (y × width + x)`, and that word is already the screen's color, so drawing the picture is a copy. Read the file into memory with the file services; its pixels start at the offset held in its bytes 10 to 13, which is 54 in the 32-bit picture **New picture** makes unless told otherwise.

Each stroke updates the picture in your project when you release the mouse button or lift your finger. With autosave on, the change is saved immediately. With autosave off, save the project manually to keep your changes. Use **Undo** in the Pixel editor to undo a stroke. The program reads the picture as you last drew it at its next run. Other BMP layouts open in **Pixels** too, and keep their layout: a 24-bit picture keeps its three bytes a pixel and its rows stored bottom-up, which the program then has to convert.

## Configuring the screen from the program {#screen-directive}

A comment line naming `@screen` sets those five parameters at every **Build**, before the first instruction runs, so opening a program and building it is all it takes. It is a comment, so it does not change how the assembly source is parsed.

{directiveExample}

{settings}

- Order and spacing do not matter, commas are allowed between settings, and `unitWidth`, `unit-width` and `unitwidth` are the same name.
- What the directive leaves out keeps the value it had, and a program with no `@screen` line changes nothing at all: the configuration stays yours.
- An unknown setting or a label that does not exist is a _warning_ on the directive's line, never an error: a comment cannot stop a program from assembling. A size outside the ranges is replaced by the nearest one inside them, and anything else is left as it was.
- Changing a parameter in the **Display** popover afterwards wins, until the next Build reads the comment again.

## Keyboard and display registers {#keyboard-and-display}

Four words carry one character each way. What the program transmits is appended to the console transcript, the same one `print` services write to, which is also what testcases assert on.

{registers}

{keyboardExample}

The receiver queues typed characters and scripted Testcase input without dropping characters. Reading receiver data removes one character. Ready ({readyBit}) stays set while more are waiting. Click the Screen panel to send keyboard input to the program. Its focus ring shows that the editor's shortcuts are paused. Escape reaches the receiver as character 27. Press Shift+Tab, or click outside the Screen, to return keyboard control to the editor.

Bit 1 of either control register ({interruptBit}) enables its **interrupt requests**. The receiver requests an interrupt while any character is waiting. The transmitter requests one after accepting each character. The processor must also have interrupts enabled for the request to enter a handler. See [Interrupts and the timer](/documentation/{route}/interrupts#keyboard) for an echo handler.

The receiver gives characters only. Non-character keys such as arrows and Shift, and key releases, go to the [Input controller](/documentation/{route}/input-controller), which also reports the mouse. Losing focus on the Screen or browser window releases held keys and buttons in that controller. Already queued characters remain in the receiver.

## Program time

Service `30` (`{service}` before a `{call}`) returns calendar milliseconds since 1970-01-01 UTC: low word in `{argument}`, high word in `{highArgument}`. Subtract two readings to measure elapsed time. In interactive use, this clock continues while paused.

Service `32` waits for the milliseconds in `{argument}`. Waiting uses no instructions, so a program can sleep between keyboard polls without reaching the execution limit. In a Testcase, the calendar clock starts at 2000-01-01 UTC and advances through virtual waits: a five-second wait finishes immediately and gives repeatable elapsed-time output.

For a separate timer that requests interrupts, see [Interrupts and the timer](/documentation/{route}/interrupts#timer). {simulator} has no mouse device. This editor's [Input controller](/documentation/{route}/input-controller) reads the mouse.
