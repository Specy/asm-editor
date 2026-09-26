Four addresses sit in a table at `9000`. The number in `a` picks one of them: `0` means add,
`1` subtract, `2` multiply, and `3` divide. The program reads that address into `hl` and jumps
there. With `a = 2`, it takes the third entry and multiplies 6 by 3.

Choose **Build**, set the memory panel to `9000`, and look at the eight table bytes. Then use
**Step** to follow `hl` through the lookup. What address should `hl` contain just before
`jp (hl)`?

```z80|playground|memory|no-flags|allow-open
    .org 0x8000
    ld d, 6             ; x = 6
    ld e, 3             ; y = 3
    ld a, 2             ; op = 2, the third entry of the table

    ld l, a
    ld h, 0             ; hl = op, widened to 16 bits
    add hl, hl          ; op * 2, the size of an address
    ld bc, table
    add hl, bc          ; hl = table + op * 2
    ld a, (hl)          ; low byte of the chosen address
    inc hl
    ld h, (hl)          ; high byte
    ld l, a             ; hl = the chosen address
    jp (hl)             ; jump to the code at that address

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
    ld b, e             ; add x a total of y times
mul_loop:
    add a, d
    djnz mul_loop
    jr done
div_op:
    ld a, d
    ld b, 0
div_loop:
    cp e                ; while the remainder is at least y
    jr c, quotient
    sub e
    inc b
    jr div_loop
quotient:
    ld a, b
done:
    ld c, a             ; keep the result in c for inspection
    halt

    .org 0x9000
table:  .dw add_op, sub_op, mul_op, div_op
```

The table uses `.dw` to store four 16-bit addresses. Each address occupies two bytes, low byte
first. At `9000`, the bytes are `13 80 17 80 1B 80 22 80`: the assembled addresses `8013`
for `add_op`, `8017` for `sub_op`, `801B` for `mul_op`, and `8022` for `div_op`. The labels
name places in the program; `.dw` stores those places as numbers. The four entries begin at
offsets 0, 2, 4, and 6 from `table`.

To check the first address by hand, count bytes from `.org 0x8000`, not lines of code. Each
opening `ld` with a byte value (`ld d, 6`, `ld e, 3`, `ld a, 2`) takes two bytes, and
`ld bc, table` takes three. By the time execution reaches `jp (hl)`, 18 bytes have been
placed: it occupies `8012`. That jump is one byte, so the next label, `add_op`, is at `8013`.

Here is the lookup for `op = 2`. `ld l, a` followed by `ld h, 0` turns the byte `02` into
`hl = 0002`. `add hl, hl` doubles it to `0004`, because each entry is two bytes wide.
Adding the table address `9000` gives `hl = 9004`. The bytes at `9004` and `9005` are `1B`
and `80`, so the chosen address is `801B`, the start of `mul_op`.

The low byte waits in `a` while `inc hl` moves to the high byte. The code reads the high byte
into `h` before putting the saved low byte into `l`. If it changed `l` first, `hl` would no
longer point at the high byte. At `jp (hl)`, the jump goes to the address *in* `hl`; this
instruction does not read another address from memory or push a return address.

Choose **Run**. Multiplication leaves `a = 12` and `c = 12` in the hexadecimal registers
panel: `12` hex is 18 decimal. `hl` remains `801B`. Every arm reaches `done`, where
`ld c, a` keeps the result easy to inspect. The `jr done` instructions also stop one arm
from falling through into the next.

This example expects `op` to be **0 through 3**. There is no range check. If `op` is 4 or
more, the lookup reads beyond the table and `jp (hl)` can jump to an unintended address.
For multiplication and division, keep `e` positive. With `e = 0`, `djnz` takes 256 passes
through the multiplication loop, while the division loop never ends. Results are 8-bit
values in `a` and `c`, so arithmetic beyond 255 wraps around.

Try each valid `op` value with `d = 6` and `e = 3`. Before choosing **Run**, predict the
address in `hl` at `jp (hl)` and the result in `c`. Change only `ld a, 2`, then compare your
prediction with the registers panel. Open the answers after trying all four values.

<details>
<summary>Check your answers</summary>

| `op` | Arm | `hl` at `jp (hl)` | Result in `c` (hex) |
| --- | --- | --- | --- |
| 0 | add | `8013` | `09` |
| 1 | subtract | `8017` | `03` |
| 2 | multiply | `801B` | `12` |
| 3 | divide | `8022` | `02` |

</details>

The dispatcher takes the same sequence of instructions for each valid `op`: it calculates one
table position and reads one address. In a chain of comparisons, a choice near the end must
pass the earlier comparisons first. Here the operation itself may still use comparisons or a
loop; only the choice of arm has no comparison chain.
