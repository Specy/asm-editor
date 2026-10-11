A jump table chooses a piece of code using an index. Here `d2` holds the operation number:
0 means addition, 1 subtraction, 2 multiplication, and 3 division. Those are the only valid
indices for this four-entry table. The program starts with 2, so it should calculate `6 × 3`.

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

`org $2000` places the table at address `$2000`, separate from the instructions. `dc.l` puts
four long values there. Each label in that line is assembled into the address of its handler's
first instruction. Since a long occupies four bytes, the entries start at `$2000`, `$2004`,
`$2008`, and `$200C`.

With `d2 = 2`, the lookup goes like this:

```text
d2 = 2  →  d3 = 2 × 4 = 8
table + 8 = $2008  →  address of mul_op  →  a1  →  jmp (a1)
```

`lea table, a0` puts `$2000` in `a0`. `move.l (a0, d3), a1` reads the long at `$2008` and
puts that stored address in `a1`. `jmp (a1)` transfers execution to `mul_op`. The assembler
chooses the handler's numeric address, so you do not have to type that number into the source.
The `bra done` after multiplication skips the handlers that follow it; otherwise execution
would continue into `div_op`. The division handler falls directly through to `done`.

Select **Build**, then **Run**. `d4` finishes at `00000012` in the registers panel: hexadecimal
`12` is decimal 18. Select **Build** again to reset the program, then use **Step**. Watch `d3`
become 8 after `lsl.l`, and set the memory panel to `2000`. Its third long, at `$2008`, is the
address that `move.l (a0, d3), a1` loads into `a1`. After `jmp (a1)`, the next instruction is
the one labelled `mul_op`.

## Try the other operations

Change only the `#2` in `move.l #2, d2` to `#0`, `#1`, or `#3`. For each choice, predict the
value of `d4`, then select **Build** and **Run** to check. Keep the index within 0–3: any
other value indexes outside the four entries and cannot select a valid handler from this table.

<details>
<summary>Show answer</summary>

With index 0, `add_op` gives 9 (`00000009`). Index 1 selects `sub_op` and gives 3
(`00000003`). Index 3 selects `div_op` and gives 2 (`00000002`).

</details>
