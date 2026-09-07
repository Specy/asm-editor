# Preserve simulator graphics conventions

Screen support targets existing EASy68K and MARS/RARS graphics examples running without changes to their drawing code once the display is configured. Preserve each environment's graphics interface and translate it into a shared **Screen** peripheral for the GUI, rather than introduce a new guest drawing API across all languages, so existing programs and teaching material remain usable. This establishes the compatibility target; exact operation coverage and conventions for other environments remain to be agreed.

## One output window

EASy68K has a single output window where text tasks and graphics tasks draw into the same image, and the M68K environment preserves that. In a graphical run, text output is drawn on the **Screen** at a text cursor in a fixed-cell font, in addition to being appended to the **Terminal** transcript that Testcases assert on; typed input is echoed there too; task 11 sets and gets the cursor and, with $FF00, clears text and graphics together; text draws on the same image graphics draw on, so double buffering applies to it. Cell size, wrapping and scrolling follow EASy68K's default font and are settled in implementation against the reference. MARS and RARS keep their separate console, which is their own convention. The Z80 follows the single-window model through its port map ([ADR 0011](./0011-z80-peripherals-through-the-port-map.md)).

## Deviations

- Text output also reaches the Terminal transcript, which EASy68K does not have; this keeps Testcases and the non-graphical view working.
- MARS's transmitter text lands in the Terminal transcript next to syscall output, where the simulator shows it in the tool's own window, and the transmitter is never busy, so a program that waits for Ready proceeds immediately.
- The bitwise drawing modes of task 92 (modes 0, 1, 3 and 5 to 15) are deferred: canvas compositing is alpha based, so they need per-pixel work on every primitive, and double buffering covers the sprite-erasing use of the XOR mode, which is the likely first follow-up.
