A loop is a comparison, a branch out of it and a jump backwards, which we can now write. The M68K
also has one instruction that does the counting and the jumping together, and it is the one you will
actually use.

## The loop written out

Adding up the numbers from 1 to 10, in C, then flattened, then assembled:

```c
int sum = 0;
for (int i = 1; i <= 10; i++) sum += i;
```

```m68k|playground|no-flags
    clr.l d0            ; sum = 0
    move.l #1, d1       ; i = 1
while_start:
    cmp.l #10, d1       ; while(i <= 10)
    bgt while_end
    add.l d1, d0        ; sum += i
    addq.l #1, d1       ; i++
    bra while_start
while_end:
```

`d0` comes out at `00000037`, which is 55, and `d1` at 11, one past the last value it used. Four of
those seven instructions are the loop machinery and one is the work.

`clr.l d0` is `move.l #0, d0` written shorter, and `addq.l #1, d1` is `add.l #1, d1` in a shorter
encoding, which is what `addq` is for: adding a number from 1 to 8, which is what a loop counter
does.

## dbra does the counting

`dbra dn, label` subtracts 1 from the low word of `dn` and branches to the label unless the result is
-1. One instruction replaces the `subq` and the `bne`, and the loop becomes:

```m68k|playground|no-flags
    clr.l d0            ; sum = 0
    move.w #9, d1       ; ten times round
    move.l #10, d2      ; the number to add this time
loop:
    add.l d2, d0        ; sum += n
    subq.l #1, d2       ; n--
    dbra d1, loop
```

`d0` is 55 again. Two things about that counter:

**It runs one more time than the number you put in it.** `dbra` stops at -1, not at 0, so a counter
of 9 gives ten passes: 9, 8, 7, down to 0, and then the pass that takes it to -1 and falls through.
Write `move.w #count-1, d1` when you know how many times you want, and let the assembler do the
subtraction.

**It is a word.** `dbra` reads and writes only the low 16 bits of the register, so the most a single
`dbra` loop can run is 65536 times, and whatever is in the high word is left there and ignored.

```m68k|playground|no-flags
    move.l #$FFFF0003, d1   ; only the low word is the count
    clr.l d0
loop:
    addq.l #1, d0
    dbra d1, loop
```

The loop runs four times, so `d0` comes out at 4, and `d1` ends at `FFFFFFFF`: the low word walked
down to `FFFF`, which is the word -1, and the `FFFF` above it was never touched. This is why the
counter of a `dbra` loop is set with `move.w` and read as a word.

After the loop, the counter is `$FFFF` and not zero, which catches people who then want to reuse the
register.

## db\<cc\> leaves the loop early

`dbra` is the plain member of a family. `db<cc> dn, label` takes a condition, and it goes round again
only when the condition is **false** and the counter has not run out. So `dbeq` means "keep going
until something is equal or we run out of elements", which is a search.

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

The 30 is the third element, so the loop goes round three times and stops. `d1` comes out at 3,
`a0` at `0000200C`, four bytes past the element that matched, and `d3` at `000000FF`.

`d3` is `$FF` because `db<cc>` writes no flags at all: the `Z` that `seq` reads is still the one the
last `cmp` left. That is how you tell the two ways out of the loop apart, since `dbeq` falls through
both when it found something and when it ran out. The other way to tell is the counter, which is
`$FFFF` only when the loop ran out.

`dbne` is the same idea for "keep going while they are equal", and every condition of the branch
family has a `db` version.

## Nested loops

Nothing new: an inner loop is a loop between two lines of the outer one, with its own counter in its
own register, reset at the top of every outer pass.

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

`d0` comes out at 12, which is 3 times 4. The `move.w #3, d2` has to be **inside** the outer loop:
put it above `outer:` and the inner counter is `$FFFF` on the second pass, which makes the inner loop
run 65536 times. Try moving that line up one and pressing Run to watch it happen.

The Playground stops a program after two million instructions and says so, with "Execution limit of
2000000 instructions reached (maybe an infinite loop?)". That message is what a loop with a broken
counter looks like, and it is the reason `dbra` reads its counter as a word rather than a long: a
long counter that starts wrong runs for four billion passes.

## Your turn

Add up the numbers from 1 to 10 with a `dbra` loop and leave 55 in `d0`. The counter belongs in a
data register of your choice, and `d0` starts at 0 in the test.

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
    add.l d2, d0        ; sum += n
    subq.l #1, d2       ; n--
    dbra d1, loop
```

</details>

The second one starts `d0` at 64 and wants to know how many times it can be halved before it reaches

1. Leave that count in `d1`, which for 64 is 6.

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
    clr.l d1            ; count = 0
loop:
    cmp.l #1, d0        ; while(d0 > 1)
    bls done
    lsr.l #1, d0        ; d0 /= 2
    addq.l #1, d1       ; count++
    bra loop
done:
```

</details>
