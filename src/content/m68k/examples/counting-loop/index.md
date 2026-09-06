Twenty bytes of room are reserved in memory and a loop writes the numbers 1 to 10 into them, one word
per pass. The answer is in the memory panel: type `2000` in its address box and the ten words are
there, `0001` to `000A`.

The bigger of two numbers ran a fixed handful of instructions. This is the first program that runs
the same three instructions over and over, and the first one that writes into memory the assembler
put nothing in.

**You need to know:** the "Loops and dbra" lecture and the "org, equ, dc and ds" lecture. What is new
here is that the destination of a `move` can be an address held in a register, `(a0)` writes the word
where `a0` points and the `addq.l` under it moves `a0` on to the next element.

```m68k|playground|memory|no-flags|allow-open
count equ 10

    lea numbers, a0     ; a0 points at the first element
    move.w #count-1, d1 ; dbra runs the loop one more time than the counter
    move.w #1, d0       ; n = 1
fill:
    move.w d0, (a0)     ; *a0 = n
    addq.l #2, a0       ; step a0 on to the next word
    addq.w #1, d0       ; n++
    dbra d1, fill

    org $2000
numbers: ds.w count
```

`ds.w count` reserves ten words and writes nothing into them, so before the run the twenty bytes at
`$2000` read `FF`. `lea numbers, a0` puts their address in `a0`, and from there the loop only ever
talks about `(a0)`, which is C's `*p`.

The `2` in `addq.l #2, a0` is the size of one element, and it is yours to get right: nothing in
`(a0)` knows that the thing it wrote was a word. Write `#4` there instead and the numbers land four
bytes apart, with an untouched `FFFF` between each pair and the last five written past the end of the
room that was reserved for them.

`count-1` is the counter because `dbra` stops at -1 and not at 0, so it runs one more time than the
number you give it. Step through the loop and `a0` climbs by 2 at every `addq`, from `00002000`
to `00002014`, while `d1` walks down to `0000FFFF`, which is the word -1 that ended it.

Try changing `addq.w #1, d0` to `addq.w #2, d0`. The array fills with 1, 3, 5 and the rest of the odd
numbers up to 19, because the counter that ends the loop and the number being written are two
different registers doing two different jobs.
