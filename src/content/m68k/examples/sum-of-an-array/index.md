Six numbers are written into memory by the assembler, and the program adds them up and leaves the
total in `d0`. There is one loop, it runs a fixed number of times and there is no condition inside
it, so the thing to look at is how the program gets from one number to the next.

Up to here the programs in this ladder kept what they were working on in registers. An array does not
fit in the registers and its elements have no names, so the program keeps the address of the next
element in an address register and increments it as it goes.

**You need to know:** the "Loops and dbra" lecture and the "Arrays, strings and `(a0)+`" lecture.
What is new here is walking memory with a pointer, `(a0)` reads the memory `a0` points at and `(a0)+`
reads it and then steps `a0` forward by the size of the read.

```m68k|playground|memory|no-flags
    lea numbers, a0     ; a0 points at the first number
    move.w #count-1, d1 ; dbra runs the loop one more time than the counter
    clr.l d0            ; sum = 0
loop:
    add.w (a0)+, d0     ; sum = sum + *a0, then step a0 to the next word
    dbra d1, loop       ; one number less to go

count equ 6
numbers: dc.w 4, 8, 15, 16, 23, 42
```

The numbers are words, two bytes each, so `add.w (a0)+, d0` leaves `a0` two bytes further along every
time round. They sit at `$1014`, right after the code, which is inside the first page the memory
panel shows. Step through the loop and you can watch `a0` walk across them, and when the program
stops `d0` holds 108.

Try adding a seventh number to the `dc.w` line. `d0` still comes out at 108, because `count` is what
the loop counts with and you did not touch it. Change `count equ 6` to `count equ 7` and it adds the
new one too.
