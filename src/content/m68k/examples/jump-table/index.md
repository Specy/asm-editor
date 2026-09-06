A number picks which of four pieces of code runs. `d2` holds 2, the program reads the third address
out of a table in memory and jumps to it, and the multiplication is what happens. Changing `d2`
changes the answer without changing a comparison anywhere.

The bigger of two numbers chose between two paths with a `cmp` and a branch. A chain of those works
for three or four cases and gets slower with every one you add, since a value at the bottom of the
chain is compared against everything above it first. A table is looked up once whatever the value is.

**You need to know:** the "Compare and branch" lecture and the "Addressing modes" lecture. What is
new here is a jump to an address the program worked out, `jmp (a1)` goes to whatever `a1` holds,
which nothing in the source names.

```m68k|playground|no-flags
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

The three instructions before the `jmp` are C's `table[op]`: multiply the index by the size of an
element with a shift, add it to the base with the indexed mode, and read the long there. What comes
out is an address, so it goes into an address register. `jmp (a1)` then leaves without
pushing anything, which is what makes this a `switch` and not four calls; `jsr (a1)` would make it
four calls.

`d4` comes out at `00000012`, which is 18, and `a1` at `00001038`, the address of `mul_op`. Each arm
ends with `bra done` for the same reason the two halves of an `if` do: the arms are laid out one
after another and nothing stops the program running into the next one.

Try changing `move.l #2, d2` to `move.l #3, d2` and `d4` comes out at 2, which is 6 divided by 3.
With `#0` it comes out at 9. Nothing else in the program moves, and there is no comparison anywhere
in it to change.
