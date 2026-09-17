Nothing in memory records how long a string is. An array can be told its length in a constant, but a
string that arrives from outside the program has only one thing marking its end: a zero byte after
the last character. This program finds that byte and measures the distance back to where it started.

```riscv|playground|memory|allow-open
.data
text:  .asciz "Assembly is fun"
after: .asciz " and so is this"

.text
main:
    la t0, text         # walk from the start
    mv t1, t0           # and keep the start, to subtract later
scan:
    lb t2, 0(t0)        # one character
    beqz t2, at_end     # a zero byte is the end of the string
    addi t0, t0, 1
    j scan
at_end:
    sub t3, t0, t1      # how far we walked
```

`.asciz "Assembly is fun"` puts sixteen bytes in memory: fifteen character codes and the zero byte
the directive adds for you. The memory panel at `10010000` reads
`41 73 73 65 6D 62 6C 79 20 69 73 20 66 75 6E 00`, and its text button draws those same bytes back
as letters.

`lb` loads a single byte. `beqz t2, at_end` takes the branch when that byte is zero, which is the
only thing separating the terminator from any other character.

The subtraction at the end is the part worth slowing down for. Two addresses are just two numbers,
so subtracting one from the other gives a count of bytes:

```
10010000   'A'   <- t1 stayed here
10010001   's'
   ...
1001000E   'n'
1001000F    0    <- t0 stopped here, on the terminator
```

`t0` stops **on** the zero byte and not past it, because the branch happens before the `addi` that
would have stepped over it. So `t0 - t1` is 15, the number of real characters, with the terminator
not counted.

There is a second string immediately behind the first one in memory, and it is there so you can see
what a missing terminator does. Change `text: .asciz` to `text: .ascii`, which writes the characters
and no zero byte: the answer becomes 30, because the loop walks straight on into ` and so is this`
and stops at **that** string's terminator. A string with no terminator has no length of its own, and
nothing in the machine will warn you.
