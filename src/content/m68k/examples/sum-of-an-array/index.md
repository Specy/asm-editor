Six numbers are written into memory by the assembler, and the program adds them up and leaves the
total in `d0`. There is one loop, it runs a fixed number of times and there is no condition inside
it, so the thing to look at is how the program gets from one number to the next.

An array does not fit in the registers, and its elements have no names of their own. What the program
keeps instead is the address of the next one, in an address register, and moves that along as it
goes.

```m68k|playground|memory|no-flags|allow-open
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
time round. They sit at `$1014`, right after the code, on the first page the memory panel shows.
Step through the loop and you can watch `a0` grow by two at every `add.w`, and when the program stops
`d0` holds 108.

Add a seventh number to the `dc.w` line and run it. `d0` still comes out at 108. The loop counts with
`count`, not with the array, and nothing anywhere checks that the two agree, so the seventh number is
simply never read. Change `count equ 6` to `count equ 7` and it is.
