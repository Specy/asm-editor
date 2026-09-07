Two numbers are written into memory by the assembler and a third one is written into an instruction.
The program reads the two out of memory, adds the third, and writes the total back into memory,
which is where you read the answer.

Moving values around kept everything in registers, and there are only seven 8 bit ones. Anything a
program has more of than that goes in memory, and `.dw` is what puts it there before the first
instruction runs.

**You need to know:** the "org, db, dw and ds" lecture and the "The 64 KB address space" lecture.
What is new here is the difference between a name that is a number and a name that is an address,
`TAX` is replaced by 20 inside the instruction while `price` becomes `0x9000` and the instruction
goes to memory for what is there.

```z80|playground|memory|no-flags|allow-open
TAX equ 20

    .org 0x8000
    ld hl, (price)      ; total = price
    ld de, (shipping)
    add hl, de          ; total = total + shipping
    ld de, TAX
    add hl, de          ; total = total + TAX
    ld (total), hl      ; write the answer back into memory
    halt

    .org 0x9000
price:      .dw 250
shipping:   .dw 35
total:      .ds 2
```

The three numbers are **words** and not bytes, because 250 plus 35 plus 20 is 305 and no 8 bit
register holds a number over 255. So the values are laid down with `.dw`, they are read into pairs,
and the addition is `add hl, de`, which is the only way a Z80 adds sixteen bits at a time.

The `.org 0x9000` puts the data at a fixed address, so the memory panel shows the same three words
wherever the code above them ends. Type `9000` in its address box:

| label      | address  | bytes before | bytes after |
| ---------- | -------- | ------------ | ----------- |
| `price`    | `0x9000` | `FA 00`      | unchanged   |
| `shipping` | `0x9002` | `23 00`      | unchanged   |
| `total`    | `0x9004` | `00 00`      | `31 01`     |

Those bytes are the little endian order: `250` is `0x00FA` and its low byte `FA` sits at the lower
address, which is why the panel reads `FA 00` and `hl` reads `00FA`. `.dw` writes a value, `.ds 2`
only reserves two bytes and writes nothing, so `total` is `00 00` before the run and `31 01` after,
which is `0x0131`, or 305.

`ld hl, (price)` and `ld (total), hl` are the extended mode from the addressing lecture: the address
is written into the instruction, which is a global variable in C. Only `a`, the pairs and the index
registers can name a bare address like that, so `ld b, (price)` is not an instruction and the build
fails on it.

Try changing `price: .dw 250` to `price: .dw 500`. `total` comes out at `2B 02`, which is `0x022B`,
or 555, and the only thing that changed is the two bytes the assembler writes at `0x9000` before
your program starts.
