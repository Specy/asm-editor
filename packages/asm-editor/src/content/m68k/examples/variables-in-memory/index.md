This program adds a price of 250, shipping of 35, and tax of 20. The total is 305. It reads the
price and shipping from memory, holds the running total in `d0`, then writes the answer back to
memory.

```m68k|playground|memory|no-flags|allow-open
TAX equ 20

    move.l price, d0        ; start with the price
    add.l shipping, d0      ; add shipping
    add.l #TAX, d0          ; add the tax value
    move.l d0, total        ; store the answer

    org $2000
price:    dc.l 250
shipping: dc.l 35
total:    ds.l 1
```

`price`, `shipping`, and `total` name memory addresses. Although the instructions use those names
before their declarations appear, Build reads the whole program and finds each address. The first
instruction reads the long at `price` into `d0`; the last writes `d0` to the long at `total`.

`TAX equ 20` gives the number 20 a name. In `add.l #TAX, d0`, the `#` means the instruction uses that
number directly. `d0` holds 250, then 285, then 305 as the three instructions calculate the total.

The `org $2000` line places the data that follows it at address `$2000`. The instructions above it
stay at their earlier addresses. Each `dc.l` places one four-byte long in memory during Build, so
`shipping` starts four bytes after `price`. `ds.l 1` reserves one long, or four bytes, for `total`.
It gives that space no initial value; the final `move.l` supplies the value when the program runs.

## Run it and inspect memory

Select **Build**, then **Run**. In the memory panel, enter `2000` in the address box. Read four
bytes at each address as one long:

| label      | address | value after Run  |
| ---------- | ------- | ---------------- |
| `price`    | `$2000` | `000000FA` (250) |
| `shipping` | `$2004` | `00000023` (35)  |
| `total`    | `$2008` | `00000131` (305) |

The result is hexadecimal `$131`, which is decimal 305. `price` and `shipping` keep the values
placed there during Build; `total` receives the result during Run.

## Try it

Change `shipping` from 35 to 40. Before selecting **Build** and **Run** again, predict the new
value at `total`. Check it in the memory panel at `$2008`.

<details>
<summary>Show answer</summary>

The new total is 250 + 40 + 20 = 310, displayed as `00000136` in hexadecimal.

</details>
