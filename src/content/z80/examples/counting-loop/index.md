Ten bytes of room are reserved in memory and a loop writes the numbers 1 to 10 into them, one byte
per pass. The answer is in the memory panel: type `9000` in its address box and the ten bytes are
there, `01` to `0A`.

The bigger of two numbers ran a fixed handful of instructions. This is the first program that runs
the same three instructions over and over, and the first one that writes into memory the assembler
put nothing in.

**You need to know:** the "Loops and djnz" lecture and the "org, db, dw and ds" lecture. What is new
here is that the destination of an `ld` can be an address held in a pair, `(hl)` writes the byte
where `hl` points and the `inc hl` under it moves `hl` on to the next element.

```z80|playground|memory|no-flags|allow-open
count equ 10

    .org 0x8000
    ld hl, numbers  ; p = numbers
    ld b, count     ; djnz counts down from ten to one
    ld a, 1         ; n = 1
fill:
    ld (hl), a      ; *p = n
    inc hl          ; step p on to the next byte
    inc a           ; n++
    djnz fill
    halt

    .org 0x9000
numbers: .ds count
```

`.ds count` reserves ten bytes and writes nothing into them, so before the run the ten bytes at
`0x9000` read `00`, which is what untouched memory reads in this editor. `ld hl, numbers` puts their
address in `hl`, and from there the loop only ever talks about `(hl)`, which is C's `*p`.

The `1` that `inc hl` adds is the size of one element, and it is yours to get right: nothing in
`(hl)` knows how big the thing it wrote was. Write a second `inc hl` under the first one and the
numbers land two bytes apart, with an untouched `00` between each pair and the last five written
past the end of the room that was reserved for them.

`djnz` runs the loop **exactly** `count` times, so `b` starts at 10 and no adjustment is needed.
That is the one place the Z80 is easier than the M68K, whose `dbra` stops at -1 and has to be given
`count-1`. The other side of it is that the counter is always `b`, and always counts down, so the
number being written lives in a second register.

Step through the loop and `hl` climbs by 1 at every `inc`, from `9000` to `900A`, while `b` walks
down to `00`, which is the zero that ended it. `a` comes out at `0B`, one past the last number it
wrote.

Try changing `inc a` to two `inc a` lines. The array fills with 1, 3, 5 and the rest of the odd
numbers up to `13`, which is 19, because the counter that ends the loop and the number being written
are two different registers doing two different jobs.
