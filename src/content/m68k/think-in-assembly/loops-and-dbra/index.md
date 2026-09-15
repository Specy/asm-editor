A loop is three things you can already write: a comparison, a branch out when it is time to stop, and
a jump backwards. Here is one that adds up the numbers from 1 to 10.

```m68k|playground|no-flags
    clr.l d0            ; the running total, starting at 0
    move.l #1, d1       ; the number we are on
while_start:
    cmp.l #10, d1       ; have we gone past 10?
    bgt while_end
    add.l d1, d0        ; add it to the total
    addq.l #1, d1       ; and move on to the next number
    bra while_start
while_end:
```

`d0` comes out at `00000037`, which is 55. Count the lines, though. Four of those seven instructions
exist only to run the loop and one of them does the work.

`clr.l d0` is `move.l #0, d0` written shorter, and `addq.l #1, d1` is `add.l #1, d1` in a shorter
encoding, which is what `addq` is for: adding a number from 1 to 8, which is exactly what a loop
counter does.

## dbra does the counting

Most loops do not care what the counter holds, only that they go round a fixed number of times. The
M68K has one instruction for that whole case. `dbra dn, label` subtracts 1 from the low word of `dn`
and branches to the label unless the result is -1, which replaces the `subq` and the `bne` with a
single line:

```m68k|playground|no-flags
    clr.l d0            ; sum = 0
    move.w #9, d1       ; ten times round
    move.l #10, d2      ; the number to add this time
loop:
    add.l d2, d0        ; add it in
    subq.l #1, d2       ; and count the number down
    dbra d1, loop
```

`d0` is 55 again. Two things about that counter will bite you.

**It runs one more time than the number you put in it.** `dbra` stops at -1, not at 0, so a counter
of 9 gives ten passes: 9, 8, 7, down to 0, and then the pass that takes it to -1 and falls through.
Write `move.w #count-1, d1` when you know how many times you want, and let the assembler do the
subtraction.

**It is a word.** `dbra` reads and writes only the low 16 bits of the register. Whatever is in the
high word is left there and ignored, and the most a single `dbra` loop can run is 65536 times.

```m68k|playground|no-flags
    move.l #$FFFF0003, d1   ; only the low word is the count
    clr.l d0
loop:
    addq.l #1, d0
    dbra d1, loop
```

The loop runs four times, from a register that looks like it holds over four billion. `d1` ends at
`FFFFFFFF`: the low word walked down to `FFFF`, which is the word -1, and the `FFFF` above it was
never touched. This is why the counter of a `dbra` loop is set with `move.w` and read as a word.

After the loop the counter is `$FFFF` and not zero, which catches people who then want to reuse the
register for something else.

## db\<cc\> leaves the loop early

`dbra` is the plain member of a family. `db<cc> dn, label` takes a condition, and it goes round again
only when the condition is **false** and the counter has not run out. Two ways to stop, one
instruction. That is a search: keep looking until you find it or run out of things to look at.

```m68k|playground|memory
    lea numbers, a0
    move.w #5, d1       ; six elements, so five
    move.l #30, d2      ; the value we are looking for
loop:
    cmp.l (a0)+, d2     ; d2 minus the next element
    dbeq d1, loop       ; round again unless it matched or the counter ran out
    seq d3              ; d3 = $FF when the loop stopped on a match

    org $2000
numbers: dc.l 10, 20, 30, 40, 50, 60
```

The 30 is the third element, so the loop goes round three times and stops, leaving `a0` at
`0000200C`, four bytes past the element that matched.

Then there is the question of which of the two ways out it took, because `dbeq` falls through both
when it found something and when it gave up. The `seq d3` answers it, and the reason it can is that
`db<cc>` writes no flags at all: the `Z` it read is still sitting there untouched for `seq` to read
again. The other way to tell is the counter, which is `$FFFF` only when the loop ran out.

`dbne` is the same idea for "keep going while they are equal", and every condition of the branch
family has a `db` version.

## Nested loops

An inner loop is a loop between two lines of the outer one, with its own counter in its own register,
reset at the top of every outer pass.

```m68k|playground|no-flags
    clr.l d0            ; total = 0
    move.w #2, d1       ; the outer loop runs 3 times
outer:
    move.w #3, d2       ; the inner loop runs 4 times
inner:
    addq.l #1, d0       ; total++
    dbra d2, inner
    dbra d1, outer
```

`d0` comes out at 12, which is 3 times 4.

The `move.w #3, d2` has to be **inside** the outer loop. Move that one line up above `outer:` and
run it: on the second outer pass the inner counter is `$FFFF`, left there by the first pass, so the
inner loop runs 65536 times instead of 4. The program still finishes, and the answer is wrong by a
lot.

The Playground gives up after two million instructions and says so, with "Execution limit of 2000000
instructions reached (maybe an infinite loop?)". That message is what a loop whose counter never
reaches -1 looks like. The two usual causes are the one above, a counter set outside the loop it
belongs to, and a `dbra` on a register that something inside the loop also writes.

## Your turn

Add up the numbers from 1 to 10 with a `dbra` loop and leave 55 in `d0`. `d0` starts at 0, and the
counter goes in whichever data register you like.

```m68k|playground|exercise
* your code here
```

```testcase
{
    "expectedRegisters": { "d0": 55 }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    clr.l d0            ; sum = 0
    move.w #9, d1       ; ten passes
    move.l #10, d2      ; the number to add this time
loop:
    add.l d2, d0        ; add it in
    subq.l #1, d2       ; and count it down
    dbra d1, loop
```

</details>

For the second, `d0` starts at 64. Count how many times it can be halved before it gets down to 1,
and leave that count in `d1`. For 64 the answer is 6.

This one does not know in advance how many passes it needs, so `dbra` is the wrong tool and it wants
a comparison and a branch instead.

```m68k|playground|exercise
* your code here
```

```testcase
{
    "startingRegisters": { "d0": 64 },
    "expectedRegisters": { "d1": 6 }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    clr.l d1            ; nothing counted yet
loop:
    cmp.l #1, d0        ; down to 1 yet?
    bls done
    lsr.l #1, d0        ; halve it
    addq.l #1, d1       ; and count that
    bra loop
done:
```

</details>
