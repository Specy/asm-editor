A string sits at `0x10010000` with a zero byte after it, and the program works out how long it is by
walking to that zero and subtracting the address it started from. The answer, 15, ends up in `$t3`.

A string ends where a zero byte says it ends, and that byte is the only record of its length
anywhere in memory. So finding it is the program's job, every time.

```mips|playground|memory|allow-open
.data
text:  .asciiz "Assembly is fun"
after: .asciiz " and so is C"

.text
main:
    la $t0, text        # where we are in the string
    move $t1, $t0       # keep where the string starts
scan:
    lb $t2, 0($t0)      # the byte we are standing on
    beqz $t2, at_end    # if(c == 0) we are on the terminator
    addi $t0, $t0, 1    # on to the next one
    j scan
at_end:
    sub $t3, $t0, $t1   # n = p - text
```

`lb` loads one byte and sign extends it into the whole register, and `beqz` under it branches when
that byte was zero. Every ASCII character is 127 or under, so a letter comes back as itself; a byte
holding a number above 127 would come back negative and want `lbu` instead.

`.asciiz "Assembly is fun"` is sixteen bytes, the fifteen character codes and the terminator the
directive adds. The memory panel at `10010000` reads
`41 73 73 65 6D 62 6C 79 20 69 73 20 66 75 6E 00`, and its text button draws those same bytes as the
string.

When the loop falls out, `$t0` is `1001000F`, the address **of** the terminator, and `$t1` still
holds the `10010000` it was handed before the loop started. Subtract one address from the other and
what comes out is a count of bytes, which here is the length of the string.

That the difference of two addresses is a plain number is worth pausing on. Addresses are 32 bit
numbers like any other, so arithmetic on them works, and "how far apart are these two things" is a
question a `sub` can answer.

Counting with a register works just as well: an `addi $t3, $t3, 1` inside the loop and no
subtraction at the end. It costs one extra instruction for every character instead of one at each
end of the loop, which is the trade.

There is a second string sitting immediately behind the first one in memory. Change
`text: .asciiz` to `text: .ascii`, which writes the characters with **no** terminator, and run it
again: the answer becomes 27. The loop walked straight out of the first string, through the second
one, and stopped at that string's zero byte. A string without a terminator has no length of its
own, only the length of whatever happens to follow it.
