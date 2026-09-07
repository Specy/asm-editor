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
the same loop steps by 2, because the size of the read decides the step. That is the M68K's version
of C hiding the size of `*p++`, and it is the one place assembly does the arithmetic for you.

`count equ 5` gives the length a name. The loop counts with `count-1` because `dbra` runs one more
time than its counter, and the assembler does the subtraction, so adding a sixth number means
changing the `equ` and nothing else.

## Indexing with (a0, d1)

The other way keeps the base address still and works out the offset every time, which is what
`numbers[i]` compiles to.

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

`d0` is 150 again, out of four more instructions per pass. The scaling is the extra work: `numbers[i]`
in C means the base plus `i` times 4, the M68K adds a register and nothing else, and `lsl.l #2` is
how you multiply by 4 without a `mulu`.

So which one. Use `(a0)+` when you touch every element in order, which is most loops. Use `(a0, d1)`
when you need the index itself, to report where you found something; when the loop jumps around the
array instead of walking it, the way a binary search does; or when you read two elements per pass and
the second one is `4(a0, d1)`.

## Strings are bytes with a zero at the end

`dc.b 'Hello', 0` writes six bytes: the five character codes and the terminator you wrote yourself.
Nothing in memory says how long the string is, so a loop finds out by reading until it reads a zero.

The instruction that does the reading also sets `Z`, so no `cmp` is needed:

```m68k|playground|memory|no-flags
    lea message, a0     ; p = message
    clr.l d0            ; n = 0
count_loop:
    tst.b (a0)+         ; is the byte the terminator?
    beq counted
    addq.l #1, d0       ; n++
    bra count_loop
counted:

    lea message, a0     ; p = message
    lea copy, a1        ; q = copy
copy_loop:
    move.b (a0)+, (a1)+ ; *q++ = *p++
    bne copy_loop       ; the move set Z on the terminator, which it copied

    org $2000
message: dc.b 'Hello', 0
copy:    ds.b 8
```

`d0` comes out at 5, the five characters without the terminator, and `a0` at `00002006`, one past it.
Then the second loop copies the string to `copy` at `$2006`, and the memory panel shows the same six
bytes twice: `48 65 6C 6C 6F 00` and then `48 65 6C 6C 6F 00`.

`move.b (a0)+, (a1)+` is the whole of C's `strcpy` in one instruction plus a branch. It works because
`move` sets `Z` from the byte it moved, so the terminator both ends the loop and gets copied, which
is what you want: a copy without a terminator is not a string.

Comparing two strings has an instruction of its own. `cmpm.b (a0)+, (a1)+` compares the bytes at
`a0` and `a1` and steps both, which is `strcmp` without loading either byte into a register.

## Two dimensions

A 2D array is a 1D array read in rows. `grid[row][col]` is the base plus `(row * COLS + col)` times
the size of an element, and the M68K makes you write both multiplications.

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
multiplication by 2, since adding a number to itself is cheaper than a `mulu` and every size on this
machine is a power of two.

The three `dc.w` lines are one array: the rows are a convenience for whoever reads the source, and
the twelve words sit end to end at `$2000`, which is what `COLS` in the index arithmetic assumes.

Try changing `move.l #2, d0` to `move.l #0, d0` and `move.l #3, d1` to `move.l #1, d1`. `d3` comes
out at 1, the second element of the first row.

## The address error, again

Words and longs in an array have to land on even addresses. The elements themselves are fine, since
an array of words starting even stays even, and it is the **byte** data next to them that moves
everything: a `dc.b` of an odd number of bytes above an array of words puts the whole array on odd
addresses, and the first `move.w` into it ends the run. Put byte data last, or give it an even
length.

## Your turn

`text` at `$2000` is a string with a zero at the end. Leave its length, not counting the terminator,
in `d0`. For `'Assembly'` that is 8.

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
    lea text, a0        ; p = text
    clr.l d0            ; n = 0
loop:
    tst.b (a0)+         ; is the byte the terminator?
    beq done
    addq.l #1, d0       ; n++
    bra loop
done:

    org $2000
text: dc.b 'Assembly', 0
```

</details>

The second one copies `source` to `dest`, terminator included. `source` is at `$2000` and holds nine
bytes, so `dest` begins at `$2009`.

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
    lea source, a0      ; p = source
    lea dest, a1        ; q = dest
copy:
    move.b (a0)+, (a1)+ ; *q++ = *p++
    bne copy            ; until the byte moved was the terminator

    org $2000
source: dc.b 'Hi there', 0
dest:   ds.b 16
```

</details>
