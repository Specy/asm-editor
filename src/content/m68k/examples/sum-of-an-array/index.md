Six numbers are written into memory by the assembler, and the program adds them up and prints the
total. There is one loop and it runs a fixed number of times, nothing in it decides anything, so the
one thing worth watching is how the program gets from one number to the next.

Up to here the programs in this ladder kept what they were working on in registers. An array is too
big for that, and its elements have no names of their own, so the program holds the _address_ of the
next one instead and moves that address along as it goes.

**You need to know:** the "Loops and dbra" lecture, and the "org, equ, dc and ds" lecture for how
`dc` puts data in memory. What is new is walking memory with a pointer: `(a0)` reads the memory `a0`
points at, and `(a0)+` reads it and then steps `a0` forward by the size of the read, which is exactly
what a loop over an array wants.

```m68k|playground|memory|console|no-flags
    ORG $1000
start:
    lea numbers, a0     ; a0 points at the first number
    move.w #count-1, d1 ; dbra runs the loop one more time than the counter
    clr.l d0            ; sum = 0
loop:
    add.w (a0)+, d0     ; sum = sum + *a0, then step a0 to the next word
    dbra d1, loop       ; one number less to go

    move.l d0, d1       ; task 3 prints the number it finds in d1
    move.b #3, d0
    trap #15
    move.b #9, d0       ; stop
    trap #15

count equ 6
numbers: dc.w 4, 8, 15, 16, 23, 42
```

The numbers are words, two bytes each, so `add.w (a0)+, d0` leaves `a0` two bytes further along every
time round. They land at `$1028`, right after the code: type `1028` into the address box of the
memory panel and step through the loop, and you can watch `a0` walk across them.

Try adding a seventh number to the `dc.w` line. The program will still print 108, because `count` is
what the loop counts with and you did not touch it. Change `count equ 6` to `count equ 7` and it adds
the new one too.
