Two numbers are written into memory by the assembler and a third one is written into an instruction.
The program reads the two out of memory, adds the third, and writes the total back into memory, which
is where you read the answer.

Moving values around kept everything in registers, and there are only sixteen of those. Anything a
program has more of than that goes in memory, and `dc` is what puts it there before the first
instruction runs.

**You need to know:** the "org, equ, dc and ds" lecture and the "Memory, big endian and sizes"
lecture. What is new here is the difference between a name that is a number and a name that is an
address, `TAX` is replaced by 20 inside the instruction while `price` becomes `$2000` and the
instruction goes to memory for what is there.

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

`dc.l` writes a value, `ds.l 1` only reserves four bytes and writes nothing, which is why `total`
reads `FFFFFFFF` before the program runs: that is what unwritten memory reads in this editor. After
the run it holds `00000131`, which is 305, and `d0` holds the same number.

Try changing `price: dc.l 250` to `price: dc.l 500`. `total` comes out at `0000022B`, which is 555,
and the only thing that changed is the four bytes the assembler writes at `$2000` before your
program starts.
