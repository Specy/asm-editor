# asmOS

A small desktop operating system for the x86 Screen: a window manager with a taskbar, a Start menu and desktop icons, and eight applications. It is written in C, with its pixel loops in x86 assembly.

asmOS is not a kernel. It runs as one ordinary Linux program on the emulated machine and does what a desktop does on top of Linux: it draws on the framebuffer, reads the keyboard and the mouse from their input devices, plays sound on the MIDI port and keeps its files in the Project.

## Running it

1. Select the Program `os/main.c.asm` and press **Build**, then **Run**.
2. Click the Screen, so that it gets the keyboard and the mouse. **Shift+Tab** gives the keyboard back to the page.
3. Double-click an icon, or open the **Start** menu. **Shut Down** ends the program.

The Screen is 640 × 480, set by the `@screen` comment at the top of `os/main.c`.

## The applications

| Application | What it does |
| ----------- | ------------ |
| Notepad | Edits text files. **Save** (Ctrl+S) writes the File into the Project. |
| Calculator | The four operations, percent and sign, with the mouse or the keys. |
| Paint | Pencil, brush, eraser, fill, line, rectangle, ellipse and spray, in 28 colours. **Save** writes a `.bmp` File. |
| Minesweeper | Nine by nine squares and ten mines. Right-click flags a square. |
| Clock | An analog clock with the date, in UTC, the machine's time. |
| Terminal | A small shell: `ls`, `cat`, `echo … > file`, `edit`, `open`, `ps`, `kill`, `calc`, `date` and more. Type `help`. |
| Files | The Project's files and folders. Double-click a text file to edit it, a `.bmp` to paint on it. |
| About asmOS | The system, the screen size and the uptime. |

The program's working directory is the Project, so what Notepad, Paint and the Terminal save shows up in the editor's Explorer, and Files opens what you add there. Try `welcome.txt` and `pictures/sunset.bmp`.

## How it works

| File | Part |
| ---- | ---- |
| `os/main.c` | Opens `/dev/fb0`, shows the start-up screen and runs the main loop. Includes every other part, so the desktop compiles as one C file. |
| `os/os.h` | What the parts share: rectangles, colours, the drawing calls, the window and event types. |
| `os/gfx.c` | Drawing into a picture in memory, clipped: rectangles, lines, circles, bevels and text. |
| `os/blit.asm` | Filling and copying rectangles of pixels with `rep stosd` and `rep movsd`. |
| `os/font.c` | The 8 × 13 font, X11's public-domain "fixed" face. |
| `os/icons.c` | The icons, one character per pixel. |
| `os/input.c` | The keyboard and the pointer, read as Linux input events. |
| `os/sound.c` | Notes for the General MIDI synthesizer, on the raw MIDI port. |
| `os/wm.c` | The window manager: windows, the desktop, the taskbar, the Start menu and the pointer. |
| `os/apps/` | One File per application, and `widgets.c` with the pieces they share. |

**Drawing.** Everything is drawn into a back buffer in memory, never straight onto the framebuffer. When something changes, the program marks a rectangle of the screen as dirty. Once all waiting input has been handled, it repaints only the dirty rectangles, from the desktop up through the windows to the taskbar, and copies them onto the framebuffer. A window that covers a dirty rectangle completely is painted alone, without the windows under it. The pointer is drawn on the framebuffer only, so moving it costs two small copies and no repaint. A dragged window's pixels are moved as they are, and only the strip it uncovers is repainted.

**Assembly.** Every pixel ends up in a rectangle that `os/blit.asm` fills or copies. One `rep stosd` stores a whole row, and the emulator runs it as a single instruction: filling the 640 × 480 screen this way takes about 7,000 instructions, where a C loop storing one pixel at a time takes over 700,000. C calls these routines as ordinary functions, declared in `os/os.h`; the Build links `os/blit.asm` because the program uses its symbols.

**Input.** The keyboard is the input device that has a key A, and the pointer is the device that reports an absolute position, the USB tablet. The main loop waits for both with `poll`, with a timeout set by the next thing due: a blinking cursor, the clock, a note to stop. While nothing happens, the program sleeps and costs nothing.

**Sound.** The start-up chime, Minesweeper's explosion and the warning ding are MIDI messages written to `/dev/snd/midiC1D0`. Notes that end later wait in a queue the main loop empties.

## Compiling it again

`os/main.c` is compiled with **-O1**. Its Generated assembly, `os/main.c.asm`, comes with the Project and is up to date, so Build works without compiling. After changing a C File, select `os/main.c` and press **Compile** again.

-O1 runs about as fast here as -O2, since the pixel loops are in assembly anyway, and it makes a smaller Generated assembly; at -O2 the answer from Compiler Explorer is 5.2 MB.
