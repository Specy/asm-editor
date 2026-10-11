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
    lb t2, 0(t0)        # the next byte
    beqz t2, at_end     # a zero byte is the end of the string
    addi t0, t0, 1
    j scan
at_end:
    sub t3, t0, t1      # how far we walked
```

`.asciz "Assembly is fun"` puts sixteen bytes in memory: fifteen character codes and the zero byte
the directive adds for you. This program's text uses ASCII, where each character code takes one
byte, so the distance it calculates is both a byte count and a character count. The memory panel at
`10010000` reads
`41 73 73 65 6D 62 6C 79 20 69 73 20 66 75 6E 00`, and its text button draws those same bytes back
as letters.

`lb` loads a single byte. `beqz t2, at_end` takes the branch when that byte is zero, which is the
only thing separating the terminator from any other byte. `lbu` would make the same zero/not-zero
decision: signedness changes how nonzero bytes are extended into a register, not whether zero is
zero.

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

An empty string still has its terminator. With `text: .asciz ""`, the first byte at `text` is already
zero. `t0` and `t1` both hold that address when the branch is taken, so `t0 - t1` is 0.

Change `text: .asciz` to `text: .ascii` and the first string has no terminating zero. The loop then
continues into the bytes of `after` and stops at its terminator, so this particular layout produces 30. In general, reading past an unterminated string can continue into unrelated memory; it is not a
safe way to find a length.

## Your turn: write the scan

Complete the program so it leaves the length of `phrase` in `t3`. Use `t0` to walk through the bytes
and `t1` to remember the starting address. The `.asciz` guarantees a zero byte to stop at; do not
change it to `.ascii`.

```riscv|playground|exercise
.data
phrase: .asciz "byte by byte"

.text
main:
    # set up t0 and t1
    # load a byte, stop on zero, and otherwise advance t0
    # subtract the addresses into t3
```

```testcase
{
    "expectedRegisters": { "t0": "0x1001000c", "t3": 12 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.data
phrase: .asciz "byte by byte"

.text
main:
    la t0, phrase
    mv t1, t0
scan:
    lb t2, 0(t0)
    beqz t2, at_end
    addi t0, t0, 1
    j scan
at_end:
    sub t3, t0, t1
```

</details>
