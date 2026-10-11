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
    lbu $t2, 0($t0)      # load the current byte
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

`la $t0, text` puts the address of the first byte in `$t0`, and `move` saves that address in `$t1`.
At `scan`, `lbu` reads one byte from the address in `$t0`. If the byte is zero, `beqz` goes to
`at_end`. Otherwise, `addiu` moves `$t0` to the next byte and `j scan` checks again. String bytes
occupy adjacent addresses, so adding 1 moves exactly one byte forward.

Here is the loop's stopping rule:

| Byte at `$t0`     | What happens                                |
| ----------------- | ------------------------------------------- |
| A letter or space | Advance `$t0` by 1, then check again.       |
| Zero terminator   | Stop with `$t0` still pointing at the zero. |

`.asciiz "Assembly is fun"` stores fifteen content bytes followed by one zero byte:

`41 73 73 65 6d 62 6c 79 20 69 73 20 66 75 6e 00`

The pointer advances fifteen times before it finds the zero. `$t1` still holds the starting address,
so `subu $t3, $t0, $t1` gives the number of one-byte advances: **15**. The zero does not count,
because the branch stops the loop before another advance.

Now make the loop your own in the Playground. Change the declaration to
`text: .asciiz "Hi MIPS"`. Before running, predict the byte length. Then erase the four instructions
after `scan:` and the `subu` instruction after `at_end:`, leaving the labels and exit instructions
in place. Write those five instructions again. Keep `$t0` as the current address, `$t1` as the saved
start, and `$t3` as the answer. Load one byte, branch when it is zero, advance one byte otherwise,
and repeat. At `at_end`, subtract the addresses. Use
**Run** to check your edit: `$t3` should show `00000007` (7 bytes) in the default hexadecimal
register display.

Optional memory inspection: keep your working loop and change only the `text` declaration back to
`text: .asciiz "Assembly is fun"`. In the default
Playground layout, `text` begins at `0x10010000`. The terminator sits at `0x1001000f`, so `$t0`
ends there while `$t1` remains at `0x10010000`. The register display shows these addresses as
`1001000F` and `10010000`, without a `0x` prefix.

For an empty-string check, replace the declaration with `text: .asciiz ""` and use **Run**. The
first loaded byte is already zero, so `$t0` never advances and `$t3` is 0.

For a controlled demonstration of the terminator, restore the original string and change only
`text: .asciiz` to `text: .ascii`. Predict the result, then use **Run**. `.ascii` leaves out the
zero, so this loop continues into the adjacent `after` declaration. It counts the 15 bytes of
`text` and the 12 bytes of `after`, stopping at `after`'s zero: `$t3` is 27. Restore `.asciiz`
afterwards. A string meant for this loop needs its own zero terminator.

This program measures stored bytes. Other text encodings can use more than one byte for a visible
character.
