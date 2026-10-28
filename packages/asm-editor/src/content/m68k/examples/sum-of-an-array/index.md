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
    simhalt             ; stop here: the sum is done

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
falls through to `simhalt`, which stops the program.

The stop matters. The processor runs whatever bytes come after the last instruction, and nothing in
memory marks the six words as data rather than code: only where the program stops keeps them from
running. Here `org $2000` also leaves memory nobody wrote between the code and the numbers, which
the simulator would end the program on, but a program should not count on that.

## Run it and follow the pointer

Select **Build**, then **Run**. In the registers panel, `d0` shows `0000006C`: hexadecimal `$6C`
is decimal 108, the sum of the six numbers. `a0` shows `0000200C`, the address just past them,
and `d1` shows `0000FFFF`.

Select **Build** again to reset the program, then select **Step** once per instruction. After
`lea`, `a0` is `00002000`. After the first `add.w`, `d0` is `00000004` and `a0` is `00002002`.
The following `dbra` changes `d1` from `00000005` to `00000004` and returns to `loop`. Keep
stepping to watch `a0` advance by two at each read and `d0` grow to `0000006C`.

## Run into the data

Delete the `simhalt` line and the `org $2000` line, so the six words come straight after `dbra`.
Select **Build** and **Run**, and predict what happens to `d0` and what the program does after the
loop.

<details>
<summary>Show answer</summary>

The loop still adds the six words, so `d0` is `0000006C`, but then the processor carries on into
`numbers` and runs its words as instructions. The first two, 4 and 8, read as `ORI.B #$8,D4`,
which puts 8 in `d4`. The third word, 15, is no instruction at all, so the run ends with
`Error at $1016: Illegal instruction exception`. Opened in the editor, the History lists those two
steps with no source line, each with what ran: `ORI.B #$8,D4`, then `DC.W $000F`, a word that
decodes to no instruction. A real 68000 does the same.

</details>

## Try a seventh number

Add `7` to the end of the `dc.w` list. Before selecting **Build** and **Run**, predict the value
in `d0`. Then change `count equ 6` to `count equ 7`, predict `d0` again, and select **Build** and
**Run** once more. The list of values and `count` are separate: adding a value does not change
how many times the loop runs.
