This program adds six words stored next to each other in memory. `a0` holds the address of the
next word to read, `d0` holds the running sum, and `d1` counts the loop passes. The answer is left
in `d0`.

```m68k|playground|memory|no-flags|allow-open
count equ 6

    lea numbers, a0     ; address of the first word
    move.w #count-1, d1 ; 5 gives six passes with dbra
    clr.l d0            ; start the sum at zero
loop:
    add.w (a0)+, d0     ; add this word, then advance a0 by two bytes
    dbra d1, loop       ; repeat until all six words have been read

    org $2000
numbers: dc.w 4, 8, 15, 16, 23, 42
```

`org $2000` places `numbers` at `$2000`. The six `dc.w` values occupy twelve bytes, from `$2000`
through `$200B`. `lea numbers, a0` puts the address `$2000` in `a0` so the loop can find the first
word.

In the previous example, `(a0)` used the address in `a0`, and a separate `addq.l #2, a0` moved
to the next word. Here `(a0)+` does both jobs: `add.w` reads the word at the current address and
adds it to `d0`, **then** advances `a0` by two bytes. The `+` advances the pointer after the read;
it does not add anything extra to the sum. On the first pass, the instruction reads 4 at `$2000`,
leaves 4 in `d0`, and moves `a0` to `$2002`, where the 8 is stored.

`dbra` runs the body once more than the starting value in its low word. Starting `d1` at
`count-1`, or 5, gives six reads. After the sixth read, `a0` is `$200C`, just past the array; the
loop does not read from that address. The final `dbra` makes the low word of `d1` `$FFFF` and
falls through. In this playground, execution ends after that last assembled instruction. The
`dc.w` values are data, so Run does not execute them as instructions.

## Run it and follow the pointer

Select **Build**, then **Run**. In the registers panel, `d0` shows `0000006C`: hexadecimal `$6C`
is decimal 108, the sum of the six numbers. `a0` shows `0000200C`, the address just past them,
and `d1` shows `0000FFFF`.

Select **Build** again to reset the program, then select **Step** once per instruction. After
`lea`, `a0` is `00002000`. After the first `add.w`, `d0` is `00000004` and `a0` is `00002002`.
The following `dbra` changes `d1` from `00000005` to `00000004` and returns to `loop`. Keep
stepping to watch `a0` advance by two at each read and `d0` grow to `0000006C`.

## Try a seventh number

Add `7` to the end of the `dc.w` list. Before selecting **Build** and **Run**, predict the value
in `d0`. Then change `count equ 6` to `count equ 7`, predict `d0` again, and select **Build** and
**Run** once more. The list of values and `count` are separate: adding a value does not change
how many times the loop runs.
