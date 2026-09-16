A zero-terminated string stores its end as a zero byte. To find its **byte length**, walk a pointer
from the first byte to that zero, then subtract the starting address from the ending address.

```mips|playground|memory|allow-open
.data
text:  .asciiz "Assembly is fun"
after: .asciiz " and so is C"

.text
main:
    la $t0, text         # current byte: start at text
    move $t1, $t0        # remember the starting address
scan:
    lbu $t2, 0($t0)      # load the current byte as 0..255
    beqz $t2, at_end     # stop when that byte is zero
    addiu $t0, $t0, 1    # advance by one byte
    j scan

at_end:
    subu $t3, $t0, $t1   # byte length = end address - start address

    li $v0, 10           # exit
    syscall
```

```testcase
{
    "expectedRegisters": {
        "$t0": "0x1001000f",
        "$t1": "0x10010000",
        "$t3": 15,
        "$v0": 10
    }
}
```

The code uses familiar pseudoinstructions. `la $t0, text` loads the **address** of `text`, not its
first byte. `move` copies that address into `$t1`, and `beqz` branches when its register contains
zero.

`lbu` then reads one byte and extends it to a register value in the range 0 through 255. `lb` would
also detect the zero terminator correctly, but it sign-extends bytes from 128 through 255 into
negative register values. `lbu` preserves the unsigned byte value if the program later uses it.

In the default Playground layout, `text` begins at `0x10010000`. The directive
`.asciiz "Assembly is fun"` stores fifteen content bytes followed by one zero byte:

`41 73 73 65 6d 62 6c 79 20 69 73 20 66 75 6e 00`

When the loop reaches the zero, `$t0` holds its address, `0x1001000f`, while `$t1` still holds
`0x10010000`. The two pointers are positions inside the same known object, so
`subu $t3, $t0, $t1` gives their byte distance without signed-overflow trapping: 15. The terminator
is not included because `$t0` points to it rather than one byte beyond it.

This result is a byte length, not a count of Unicode characters a person sees. ASCII text uses one
byte per character, so both counts happen to be 15 here. UTF-8 can use several bytes for one
character. For a compact check, replace the `text` declaration with
`text: .byte 0xc3, 0xa9, 0x00`. Those are the two UTF-8 bytes for `é` followed by the terminator, so
the program reports 2 bytes.

Try the empty string too: replace the declaration with `text: .asciiz ""`. Predict the registers
before running. The first loaded byte is already zero, so the loop makes no advance and `$t3` is 0;
in the default Playground layout, `$t0` and `$t1` both remain `0x10010000`, and `$v0` is 10 after
the exit syscall.

One final experiment shows why the terminator is required. Restore the original text, then change
only `text: .asciiz` to `text: .ascii`. This is invalid as a zero-terminated string because `.ascii`
adds no zero byte. In this particular layout, the scan reports 27 only because the `after`
declaration is adjacent in memory, so it reads through both declarations and stops at `after`'s
terminator. With different neighboring data, the scan could read unrelated memory or fault before
it finds a zero.
