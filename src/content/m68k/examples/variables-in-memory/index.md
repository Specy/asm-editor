Two numbers are written into memory by the assembler and a third one is written into an instruction.
The program reads the two out of memory, adds the third, and writes the total back into memory, which
is where you read the answer.

There are sixteen registers, and a program with more than sixteen things to remember keeps the rest
in memory. `dc` is what puts a value there before the first instruction of the program runs.

```m68k|playground|memory|no-flags|allow-open
TAX equ 20

    move.l price, d0        ; total = price
    add.l shipping, d0      ; total = total + shipping
    add.l #TAX, d0          ; total = total + TAX
    move.l d0, total        ; write the answer back into memory

    org $2000
price:    dc.l 250
shipping: dc.l 35
total:    ds.l 1
```

The `org $2000` puts the data at a fixed address, so the memory panel shows the same three longs
wherever the code above them ends. Type `2000` in its address box:

| label      | address | before     | after      |
| ---------- | ------- | ---------- | ---------- |
| `price`    | `$2000` | `000000FA` | unchanged  |
| `shipping` | `$2004` | `00000023` | unchanged  |
| `total`    | `$2008` | `FFFFFFFF` | `00000131` |

`dc.l` writes a value; `ds.l 1` reserves four bytes and writes nothing, which is why `total` reads
`FFFFFFFF` before the program runs. That is what unwritten memory reads here, and it is worth seeing
once: the room existed all along and nobody had put anything in it.
