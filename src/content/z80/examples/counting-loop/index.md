This program reserves ten consecutive bytes in memory, then fills them with the numbers 1 through 10. A consecutive run of bytes used to hold related values is called an **array**. Each individual
byte in it is an **element**. Here every element is one byte, so the finished array is easy to see:
open the program in the editor, choose **Build**, then **Run**. In the memory panel, enter `9000`.
The ten bytes beginning there are `01 02 03 04 05 06 07 08 09 0A`.

```z80|playground|memory|no-flags|allow-open
count equ 10

    .org 0x8000
    ld hl, numbers  ; hl = address of the first element
    ld b, count     ; b is the loop counter
    ld a, 1         ; a is the number to write
fill:
    ld (hl), a      ; write a at the address in hl
    inc hl          ; move to the next byte
    inc a           ; prepare the next number
    djnz fill       ; decrease b; jump to fill if b is not zero
    halt

    .org 0x9000
numbers: .ds count
```

`numbers: .ds count` reserves `count` bytes beginning at `0x9000`. The label `numbers` names that
starting address, but it does not put values into the reserved bytes. The editor shows unused bytes
as `00`, so that is what the ten bytes show before you run the program.

`ld hl, numbers` places the address `9000` in the register pair `hl`. Parentheses mean “the byte
at this address”: `(hl)` is the byte in memory at the address currently held by `hl`. On the first
pass, `ld (hl), a` writes `01` at `9000`. Each element occupies one byte, so `inc hl` moves the
address from `9000` to `9001`, ready for the next element. `inc a` changes the number from 1 to 2.

`djnz fill` decreases `b`, then jumps back to `fill` while `b` is not zero. Since `b` begins at
10, the instructions at `fill` run ten times. The last pass writes `0A` at `9009`; `djnz` then
leaves `b` at `00` and continues to `halt`. If you use **Step**, you can watch `hl` move from
`9000` to `900A`, one address after the reserved bytes.

Try a smaller, safe array: change only `count equ 10` to `count equ 5`. The same name is used by
both the loop and `.ds count`, so the program still reserves exactly as many bytes as it writes.
Before you build and run, predict the five bytes at `9000`.

<details>
<summary>Check your answer</summary>

They are `01 02 03 04 05`. The five reserved bytes are filled once each, and `hl` ends at `9005`.

</details>
