A number picks which of four pieces of code runs. `d2` holds 2, the program reads the third address
out of a table in memory and jumps to it, and the multiplication is what happens. Changing `d2`
changes the answer without changing a comparison anywhere.

A chain of comparisons works for three or four cases and gets slower with every one you add, because
a value that matches the last test has been compared against every test above it first. A table costs
one lookup no matter how many cases there are.

```m68k|playground|no-flags|allow-open
    move.l #6, d0           ; a = 6
    move.l #3, d1           ; b = 3
    move.l #2, d2           ; op = 2, the third entry of the table

    lea table, a0           ; the base of the table
    move.l d2, d3
    lsl.l #2, d3            ; op * 4, the size of a long
    move.l (a0, d3), a1     ; the address stored there
    jmp (a1)                ; and go to it

add_op:
    move.l d0, d4
    add.l d1, d4            ; a + b
    bra done
sub_op:
    move.l d0, d4
    sub.l d1, d4            ; a - b
    bra done
mul_op:
    move.l d0, d4
    mulu d1, d4             ; a * b
    bra done
div_op:
    move.l d0, d4
    divu d1, d4             ; a / b
    andi.l #$FFFF, d4       ; the quotient on its own
done:

    org $2000
table: dc.l add_op, sub_op, mul_op, div_op
```

`dc.l add_op, sub_op, mul_op, div_op` writes four longs, and each one is the address the assembler
gave that label. Put the memory panel on `2000` and they read `00001020`, `0000102C`, `00001038` and
`00001044`, which are the four addresses inside your own code. A label is nothing but an address, and
this is what that sentence is for.

The three instructions before the `jmp` are the table lookup: multiply the index by the size of an
element with a shift, add it to the base with the indexed mode, and read the long there. What comes
out is an address, so it goes into an address register. `jmp (a1)` then leaves without pushing
anything, so there is nothing to come back to; use `jsr (a1)` instead and each entry becomes a
subroutine call that returns.

`a1` ends at `00001038`, which is the address of `mul_op`, a value that appears nowhere in the
source. Each piece of code ends with `bra done` for the same reason the two halves of an `if` do:
they are laid out one after another and nothing stops the program running into the next one.

Change the index at the top and the answer changes with it, and there is not a single comparison
anywhere in the program to adjust.
