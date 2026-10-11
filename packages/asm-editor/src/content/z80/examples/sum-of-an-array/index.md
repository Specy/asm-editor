Six numbers are placed in memory by the assembler. The program reads them one at a time, adds them,
and leaves the total in `a`. The loop runs a fixed six times; on each pass, `hl` says which element
comes next.

Open the program in the editor, choose **Build**, then **Run**. The registers panel shows `a` as
`6C`, which is 108 in decimal, and `hl` as `9006`. In the memory panel, enter `9000` to see the six
bytes the program read.

```z80|playground|memory|no-flags|allow-open
count equ 6

    .org 0x8000
    ld hl, numbers  ; address of the first byte
    ld b, count     ; six passes through the loop
    xor a           ; total = 0
loop:
    add a, (hl)     ; total = total + byte at hl
    inc hl          ; address of the next byte
    djnz loop
    halt

    .org 0x9000
numbers: .db 4, 8, 15, 16, 23, 42
```

The `.org 0x8000` line puts the instructions at address `0x8000`. The `halt` stops execution after
the loop, so the CPU never falls into the lines below it. The later `.org 0x9000` puts the data at a
different address, and `numbers` names its first byte, `04`. `.db` is an assembler directive: it
writes those six bytes while the program is built; it is not an instruction the CPU runs.

`ld hl, numbers` puts `9000` in `hl`. Parentheses mean “the byte at this address,” so `(hl)` is
first `04`, then `08`, then each later byte as the loop moves the address along. `add a, (hl)` is a
Z80 instruction that adds that memory byte directly to `a`. `inc hl` moves from `9000` to `9001`:
each array element is one byte wide. After six passes, `hl` is `9006`, one address past the array.

`xor a` makes the total zero before the first addition. `djnz loop` decreases `b` and goes back while
it is not zero, so the three instructions in the loop run exactly six times. If you use **Step**,
watch `a` grow and `hl` advance once for every pass.

`a` is an 8-bit accumulator, so it retains totals from 0 through 255. These values add to 108, so
the final `a` is `6C`: the hexadecimal form of 108. A total above 255 wraps around to its low byte.

Try two runs. First append `, 100` to the `.db` line and change nothing else. `100` is decimal; after
you build and run, `a` is still `6C`, because `b` still starts at 6 and the loop reads only the first
six bytes. Then change `count equ 6` to `count equ 7`, build, and run again. Now the extra byte is
included and `a` is `D0`, hexadecimal for 208.
