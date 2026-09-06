Every program in these courses sits in a small editor you can build and run on the page itself, and
its buttons are the ones the full editor has. This one adds 1, 2, 3 and 4 to a register. Press
**Build**, then press **Step** five times and watch `d0` on the right.

```m68k|playground|pc|no-flags|allow-open
    move.l #1, d0       ; x = 1
    add.l #2, d0        ; x = x + 2
    add.l #3, d0        ; x = x + 3
    add.l #4, d0        ; x = x + 4
    move.l d0, d1       ; y = x
```

## The buttons

Before you build there is one button, **Build**, next to **Open in editor** on this particular
playground.

**Build** hands what you wrote to the assembler and points the simulator at the first instruction. A
line the assembler does not understand is underlined in the code and Build stays disabled until you
fix it. Nothing has run yet: `d0` is still `00000000` and PC, the program counter above the
registers, holds `00001000`, the address of the first instruction.

Once it has built, four buttons take Build's place:

- **Step** runs exactly one instruction and stops. One press and `d0` goes from `00000000` to `00000001`, and PC from `00001000` to `00001004`, four bytes further on.
- **Run** runs the program to the end, or to the next breakpoint. While a program is running that same button says **Pause**, and once a run is parked it says **Resume**.
- **Undo** takes the last instruction back, one press per instruction. The editor keeps the last 100 steps, which is a setting you can raise.
- **Stop** throws the run away: the registers go back to zero and the only button left is **Build** again.

The code is read only from **Build** until the program ends, so **Stop** is also how you get back to
typing.

Nothing in the program says "stop". The simulator ends a program when there is no next instruction to
run, and it also ends one that never gets there: a run stops after two million instructions, which is
another setting.

## Watching a register

Step through the five instructions with an eye on the registers panel. A register that just changed
is highlighted and shows what it held before, so `d0` climbs `00000001`, `00000003`, `00000006`,
`0000000A`, and the last instruction copies that into `d1`.

The values are written in hexadecimal, in two groups of four digits, because the size selector in the
panel's header is on **W**, for word, which is two bytes. Press **L**, for long, and each register
becomes one group of eight digits, the whole 32 bits of it. Hovering a value shows it in decimal, and
its signed value as well when the two differ. Clicking a register's name sends the memory panel to
the address that register holds.

## A breakpoint

Press **Stop**, then click in the narrow margin to the left of the code, on the line
`add.l #4, d0`. A dot appears there, which is a **breakpoint**. Press **Build** and then **Run**.

The program stops _before_ running that line, with `d0` at `00000006` and PC at `0000100C`, and
**Run** carries on from there. Click the dot again to take it away. A breakpoint is what you use
instead of pressing Step fifty times to reach the one instruction you want to look at.

## Undo

With the program stopped at the breakpoint, press **Undo**. It goes backwards one instruction, `d0`
returns to `00000003` and PC to `00001008`. The simulator recorded what every instruction changed, so
it can put each one back, and that is the quickest way to look again at something that went past
while you were reading the other panel.

This lecture is written in M68K because that is where Undo works. On MIPS and RISC-V the button is
there but stepping backwards is not usable yet.

## The full editor

**Open in editor** opens this same program in a project of its own, in a new tab. The four buttons
are the same and there is more around them:

- **Memory**, on the right, one page of bytes at a time. Type an address in its box or use the arrows to page through, drag across a few bytes to see the number they make (signed as well as unsigned), and press the text button to read them as characters instead of hexadecimal. The byte the stack pointer is on is marked.
- **Call stack**, a panel you open along the top of the page: the subroutines the program is inside right now and the address each one returns to. It stays empty until the Subroutines lecture.
- **History**, next to it: what each of the last instructions changed, register by register and byte by byte, and a click sends the program back to that point.
- **Stack pointer**, a second memory panel that follows `sp` instead of a fixed address.
- **Testcases**: starting registers, starting memory and input, and the registers, memory and output you expect at the end. The **Test** button runs the program against all of them and says which passed.

Try putting the breakpoint on `move.l d0, d1` instead and running from the top. `d0` reaches
`0000000A` and `d1` is still `00000000`, because the line that copies it has not run yet.
