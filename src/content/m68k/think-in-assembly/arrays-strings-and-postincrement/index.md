An array in memory has no length, no bounds and no element names. What it has is a first address and
a size per element, and every loop over it is built out of those two numbers. The M68K gives you two
ways to write that loop.

## Walking with (a0)+

`(a0)+` reads what `a0` points at and then adds the size of the instruction to `a0`, so a loop that
uses it needs no `add` of its own and no index at all.

```m68k|playground|memory|no-flags
count equ 5

    lea numbers, a0     ; a0 points at the first element
    clr.l d0            ; sum = 0
    move.w #count-1, d1 ; dbra runs one more time than the counter
loop:
    add.l (a0)+, d0     ; sum += *a0, then step a0 on by four
    dbra d1, loop

    org $2000
numbers: dc.l 10, 20, 30, 40, 50
```

`d0` comes out at `00000096`, which is 150. Step through the loop and watch `a0` climb by 4 at every
`add.l`, from `00002000` to `00002014`, twenty bytes on and one past the last element.

The 4 is in the `.l`, nowhere else. Change the array to `dc.w` and the instruction to `add.w` and
the same loop steps by 2 instead, because the size of the read is what decides the step. This is the
one place on the machine where the element size is handled for you, and the reason to prefer this
loop shape wherever it fits.

`count equ 5` gives the length a name. The loop counts with `count-1` because `dbra` runs one more
time than its counter, and the assembler does the subtraction, so adding a sixth number means
changing the `equ` and nothing else.

## Indexing with (a0, d1)

The other way leaves the base address where it is and works out the offset from an index on every
pass.

```m68k|playground|memory|no-flags
count equ 5

    lea numbers, a0
    clr.l d0            ; sum = 0
    clr.l d1            ; i = 0
loop:
    move.l d1, d2
    lsl.l #2, d2        ; i * 4, the size of a long
    add.l (a0, d2), d0  ; sum += numbers[i]
    addq.l #1, d1       ; i++
    cmp.l #count, d1    ; while(i < count)
    blt loop

    org $2000
numbers: dc.l 10, 20, 30, 40, 50
```

`d0` is 150 again, out of four more instructions per pass. The extra work is all scaling: `(a0, d2)`
adds a register and does nothing else, so `d2` has to hold a number of bytes rather than a number of
elements, and `lsl.l #2` is how you multiply by 4 without reaching for a `mulu`.

So which one. Use `(a0)+` when you touch every element in order, which is most loops. Use `(a0, d1)`
when you need the index itself, to report where you found something; when the loop jumps around the
array instead of walking it, the way a binary search does; or when you read two elements per pass and
the second one is `4(a0, d1)`.

## Strings are bytes with a zero at the end

`dc.b 'Hello', 0` writes six bytes: the five character codes and the terminator you wrote yourself.
Nothing in memory says how long the string is, so a loop finds out by reading until it reads a zero.

The instruction that does the reading also sets `Z`, so no `cmp` is needed:

```m68k|playground|memory|no-flags
    lea message, a0     ; a0 walks the string
    clr.l d0            ; and d0 counts what it passes
count_loop:
    tst.b (a0)+         ; is the byte the terminator?
    beq counted
    addq.l #1, d0       ; no, so count it
    bra count_loop
counted:

    lea message, a0     ; back to the start
    lea copy, a1        ; and a1 on the room to copy into
copy_loop:
    move.b (a0)+, (a1)+ ; one byte across, both pointers step
    bne copy_loop       ; the move set Z on the terminator, which it copied

    org $2000
message: dc.b 'Hello', 0
copy:    ds.b 8
```

`d0` comes out at 5, the five characters not counting the terminator. Look at `$2000` in the memory
panel afterwards and the same six bytes appear twice over, `48 65 6C 6C 6F 00` and then
`48 65 6C 6C 6F 00`, which is the string and its copy.

That copy loop is two instructions, and the reason it works is worth spelling out. `move` sets `Z`
from the byte it moved, so the pass that reaches the terminator copies it **and** sets `Z` in the
same instruction, and the `bne` then falls out of the loop. Both halves matter: a copy that stops
before the terminator has produced something that is not a string, because the next thing to read it
will not know where to stop.

Comparing two strings has an instruction of its own. `cmpm.b (a0)+, (a1)+` compares the bytes at `a0`
and `a1` and steps both pointers, without either byte passing through a register.

## Two dimensions

A two dimensional array is a one dimensional array that you have agreed to read in rows. The element
at row `r`, column `c` sits at `(r * COLS + c)` elements from the start, and you write out both of
those multiplications yourself.

```m68k|playground|memory|no-flags
COLS equ 4

    lea grid, a0
    move.l #2, d0       ; row
    move.l #3, d1       ; column
    move.l d0, d2
    mulu #COLS, d2      ; row * COLS
    add.l d1, d2        ; + column
    add.l d2, d2        ; times 2, the size of a word
    move.w (a0, d2), d3 ; grid[row][col]

    org $2000
grid: dc.w 0, 1, 2, 3
      dc.w 10, 11, 12, 13
      dc.w 20, 21, 22, 23
```

`d3` comes out at `00000017`, which is 23, the last element of the last row. `add.l d2, d2` is the
multiplication by 2: adding a number to itself doubles it, and every element size on this machine is
a power of two, so doubling and shifting cover all of them without a `mulu`.

The three `dc.w` lines are one array. The rows exist for whoever reads the source; in memory the
twelve words sit end to end from `$2000`, and `COLS` in the arithmetic above is the only thing that
knows where one row stops.

## The address error, again

Words and longs in an array have to land on even addresses. The elements themselves are fine, since
an array of words starting even stays even, and it is the **byte** data next to them that moves
everything: a `dc.b` of an odd number of bytes above an array of words puts the whole array on odd
addresses, and the first `move.w` into it ends the run. Put byte data last, or give it an even
length.

## Your turn

`text` at `$2000` is a string with a zero on the end. Leave its length in `d0`, not counting the
terminator, which for `'Assembly'` is 8.

```m68k|playground|memory|exercise
* your code here

    org $2000
text: dc.b 'Assembly', 0
```

```testcase
{
    "expectedRegisters": { "d0": 8 }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|memory|solution
    lea text, a0        ; a0 walks the string
    clr.l d0            ; and d0 counts
loop:
    tst.b (a0)+         ; is the byte the terminator?
    beq done
    addq.l #1, d0       ; no, so count it
    bra loop
done:

    org $2000
text: dc.b 'Assembly', 0
```

</details>

Now copy `source` to `dest`, terminator included, so that what lands in `dest` is a string in its own
right. `source` is at `$2000` and takes nine bytes, so `dest` begins at `$2009`.

```m68k|playground|memory|exercise
* your code here

    org $2000
source: dc.b 'Hi there', 0
dest:   ds.b 16
```

```testcase
{
    "expectedMemory": [{ "type": "string-chunk", "address": "0x2009", "expected": "Hi there" }]
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|memory|solution
    lea source, a0      ; read from here
    lea dest, a1        ; write to here
copy:
    move.b (a0)+, (a1)+ ; one byte across, both pointers step
    bne copy            ; until the byte moved was the terminator

    org $2000
source: dc.b 'Hi there', 0
dest:   ds.b 16
```

</details>
