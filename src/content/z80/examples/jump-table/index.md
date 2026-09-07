A number picks which of four pieces of code runs. `a` holds 2, the program reads the third address
out of a table in memory and jumps to it, and the multiplication is what happens. Changing that one
number changes the answer without changing a comparison anywhere.

The bigger of two numbers chose between two paths with a `cp` and a jump. A chain of those works for
three or four cases and gets slower with every one you add, since a value at the bottom of the chain
is compared against everything above it first. A table is looked up once whatever the value is.

**You need to know:** the "jp, jr and the conditions" lecture and the "Addressing on the Z80"
lecture. What is new here is a jump to an address the program worked out, `jp (hl)` goes to whatever
`hl` holds, which nothing in the source names.

```z80|playground|memory|no-flags|allow-open
    .org 0x8000
    ld d, 6             ; x = 6
    ld e, 3             ; y = 3
    ld a, 2             ; op = 2, the third entry of the table

    ld l, a
    ld h, 0             ; hl = op, widened
    add hl, hl          ; op * 2, the size of an address
    ld bc, table
    add hl, bc          ; hl = table + op * 2
    ld a, (hl)
    inc hl
    ld h, (hl)
    ld l, a             ; hl = the address stored there
    jp (hl)             ; and go to it

add_op:
    ld a, d
    add a, e            ; x + y
    jr done
sub_op:
    ld a, d
    sub e               ; x - y
    jr done
mul_op:
    xor a
    ld b, e             ; y times round, since there is no multiply
mul_loop:
    add a, d
    djnz mul_loop
    jr done
div_op:
    ld a, d
    ld b, 0
div_loop:
    cp e                ; while(x >= y)
    jr c, quotient
    sub e
    inc b
    jr div_loop
quotient:
    ld a, b
done:
    ld c, a
    halt

    .org 0x9000
table:  .dw add_op, sub_op, mul_op, div_op
```

`.dw add_op, sub_op, mul_op, div_op` writes four words, and each one is the address the assembler
gave that label. Put the memory panel on `9000` and the eight bytes read `13 80 17 80 1B 80 22 80`,
which little endian is `0x8013`, `0x8017`, `0x801B` and `0x8022`, four addresses inside your own
code. A label is nothing but an address, and this is what that sentence is for.

The five instructions from `ld l, a` down to `add hl, bc` are C's `table[op]`. The index is widened
into a pair, doubled with `add hl, hl` because an address is two bytes, and added to the base, which
is the shape every indexed read takes here: the Z80 has no base plus index mode, so `(hl)` is the
only thing that reads what came out.

Reading the address out of the table takes four more instructions and a spare register. `ld a, (hl)`
takes the low byte first, `inc hl` and `ld h, (hl)` take the high byte, and the low byte cannot go
into `l` until `h` has been read, because writing `l` first would move the pointer the second read
is using. That is the whole reason `a` is borrowed in the middle.

`jp (hl)` then jumps without pushing anything, which is what makes this a `switch` and not four
calls. The parentheses are Zilog's spelling and nothing is read from memory: the jump goes to the
address _in_ `hl`.

`a` and `c` both come out at `12`, which is 18, and `hl` at `801B`, the address of `mul_op`. Each
arm ends with `jr done` for the same reason the two halves of an `if` do: the arms are laid out one
after another and nothing stops the program running into the next one.

Try changing `ld a, 2` to `ld a, 3` and `a` comes out at `02`, which is 6 divided by 3. With
`ld a, 0` it comes out at `09`. Nothing else in the program moves, and there is no comparison
anywhere in it to change.
