48879 printed three times, as `BEEF`, as `48879` and as `1011111011101111`, by a subroutine that
turns a number into characters itself. Task 15 does the same job in one request; this is what it does
inside, and it is the program every language writes once and then hides in a library.

Read two numbers and print their sum handed a number to a task and got text back. Here the only task
used is the one that prints a string, and everything between the number and the string is yours.

**You need to know:** the "Multiply and divide, with the remainder" Example and the "trap #15 and
its tasks" lecture. What is new here is that the digits come out backwards, the last one first, so
the buffer is filled from its end towards its front with `-(a1)`.

```m68k|playground|console|no-flags
    move.l #48879, d0       ; n = 48879
    move.l #16, d1          ; in hexadecimal
    bsr print_in_base
    move.l #48879, d0
    move.l #10, d1          ; in decimal
    bsr print_in_base
    move.l #48879, d0
    move.l #2, d1           ; in binary
    bsr print_in_base
    move.b #9, d0
    trap #15

* print_in_base(n, base): n in d0, base in d1
print_in_base:
    lea buffer_end, a1      ; build the text backwards from the end
    clr.b -(a1)             ; the terminator goes down first
digit:
    move.l d0, d2
    divu d1, d2             ; d2 = n / base, with n % base above it
    move.l d2, d3
    swap d3
    andi.l #$FFFF, d3       ; the digit
    andi.l #$FFFF, d2       ; n = n / base
    cmp.b #9, d3
    bhi letter
    add.b #'0', d3          ; 0 to 9 become '0' to '9'
    bra store
letter:
    add.b #'A'-10, d3       ; 10 and up become 'A' and up
store:
    move.b d3, -(a1)        ; in front of the digits we have already
    move.l d2, d0           ; n = n / base, and the move sets Z
    bne digit               ; until nothing is left of it
    move.b #13, d0          ; task 13: print the string at a1 and a new line
    trap #15
    rts

    org $2000
buffer:     ds.b 34         ; 32 binary digits, the terminator and a spare byte
buffer_end:
```

Dividing by the base and keeping the remainder gives you one digit, and it is the **lowest** one:
48879 divided by 16 is 3054 with 15 left over, and 15 is the `F` at the right hand end of `BEEF`. So
the digits arrive in the opposite order to the one they are printed in, and the two ways round that
are to reverse the buffer afterwards or to write it backwards in the first place. `-(a1)` does the
second one for nothing: it subtracts 1 from `a1` and then writes, so every digit lands in front of
the ones already there and `a1` is left pointing at the first character.

A digit is a number from 0 to `base - 1` and it has to become a character. `'0'` is `$30`, so adding
it turns 0 to 9 into `'0'` to `'9'`; `'A'` is `$41` and a 10 has to become that, so the amount added
is `'A'-10`, worked out by the assembler while it assembles. `cmp.b #9, d3` and `bhi` pick between
the two, which is what makes a base up to 36 work.

`move.l d2, d0` is the loop's condition as well as its assignment: `move` sets `Z` from what it
moved, so `bne` under it means "if there is anything left of `n`, go round again". The buffer has 34
bytes because the longest answer is a 32 bit number in base 2, and after the binary run `a1` comes
out at `00002011`, seventeen bytes down from `buffer_end`.

Try changing `move.l #2, d1` to `move.l #36, d1`, the largest base the digits reach. The third line
of the console becomes `11PR`.
