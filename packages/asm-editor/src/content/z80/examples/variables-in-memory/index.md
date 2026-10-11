This program keeps a price and a shipping cost in memory, adds a tax, and stores the total back in
memory. The answer is 305, which needs two bytes rather than one.

`TAX equ 20` is an assembler constant. Before it builds the program, the assembler replaces each
use of `TAX` with the number 20. It reserves no memory and has no address; its name simply makes
the number's purpose clear.

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

A **word** is a two-byte value. Here `price`, `shipping`, and `total` are words, so `.dw` puts the
first two into memory and the register pairs `hl` and `de` hold them while `add hl, de` adds them.
`ld de, (shipping)` reads the word stored at the address named `shipping`. Later, `ld de, TAX`
loads the number 20 directly into `de`.

Open the program in the editor, choose **Build**, then **Run**. In the memory panel, enter `9000`
as the address. The registers panel uses hexadecimal, so the final `hl` value is `0131` (305).

| label      | address  | bytes before Run | bytes after Run |
| ---------- | -------- | ---------------- | --------------- |
| `price`    | `0x9000` | `FA 00`          | `FA 00`         |
| `shipping` | `0x9002` | `23 00`          | `23 00`         |
| `total`    | `0x9004` | `00 00`          | `31 01`         |

The editor starts unused memory cleared, so `total` appears as `00 00` before the run. `.ds 2`
reserves those two bytes; it does not write the zeroes. After the run, `total` contains `0x0131`.
Words are little endian: the low byte comes first in memory, so 250 (`0x00FA`) appears as `FA 00`,
and 305 appears as `31 01`.

Try changing `shipping: .dw 35` to `shipping: .dw 40`. Before you build and run, predict the six
bytes beginning at `9000`.

<details>
<summary>Check your answer</summary>

The total is then 310 (`0x0136`), so expect `FA 00 28 00 36 01`.

</details>
