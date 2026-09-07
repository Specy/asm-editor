A string sits at `0x10010000` with a zero byte after it, and the program works out how long it is by
walking to that zero and subtracting the address it started from. The answer, 15, ends up in `t3`.

Nothing in memory records the length of a string. The largest element knew it had eight numbers
because `COUNT` said so; here the only thing that says where the string ends is a byte of its own,
and finding it is the program's job.

**You need to know:** the "Arrays and strings" lecture. What is new here is that the difference of
two addresses is a number of bytes, so a length can be measured instead of counted.

```riscv|playground|memory|allow-open
.data
text:  .asciz "Assembly is fun"
after: .asciz " and so is C"

.text
main:
    la t0, text         # p = text
    mv t1, t0           # keep where the string starts
scan:
    lb t2, 0(t0)        # c = *p
    beqz t2, at_end     # if(c == 0) we are on the terminator
    addi t0, t0, 1      # p++
    j scan
at_end:
    sub t3, t0, t1      # n = p - text
```

`lb` loads one byte and sign extends it into the whole register, and `beqz` under it branches when
that byte was zero. Every ASCII character is 127 or under, so a letter comes back as itself; a byte
holding a number above 127 would come back negative and want `lbu` instead.

`.asciz "Assembly is fun"` is sixteen bytes, the fifteen character codes and the terminator the
directive adds. The directive is spelled with one `i` here, where MIPS writes `.asciiz`, and
`.string` is another name for the same thing. The memory panel at `10010000` reads
`41 73 73 65 6D 62 6C 79 20 69 73 20 66 75 6E 00`, and its text button draws those same bytes as the
string.

When the loop falls out, `t0` is `1001000F`, the address **of** the terminator, and `t1` still holds
the `10010000` it was given before the loop. Their difference is 15, which is the length, and that
is what C's `strlen` compiles to. The M68K version of the same loop subtracts one more at the end,
because its `tst.b (a0)+` has already stepped past the byte it tested; here the load and the step are
two instructions and the branch happens between them.

Counting with a register works too, an `addi t3, t3, 1` inside the loop and no subtraction at the
end, and it costs one instruction per character instead of one at each end of the loop.

A second string sits right behind the first one in memory. Try changing `text: .asciz` to
`text: .ascii`, which writes the characters and no terminator: `t3` comes out at 27, because the
loop walks straight on through ` and so is C` and stops at **that** string's zero byte. A string
with no terminator has no length of its own.
