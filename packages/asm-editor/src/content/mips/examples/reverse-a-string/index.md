This program reverses a zero-terminated string in place. `$t0` stays at the first byte while
`$t1` scans forward to find the zero terminator. Then `$t1` moves back to the last letter, and
the two pointers swap bytes as they move toward each other.

```mips|playground|memory|tests|allow-open
.data
text: .asciiz "Assembly"

.text
main:
    la $t0, text             # left pointer: first byte
    addu $t1, $t0, $zero    # scan pointer: start at the same byte

find_end:
    lbu $t2, 0($t1)
    beq $t2, $zero, found_end
    addiu $t1, $t1, 1
    j find_end

found_end:
    beq $t1, $t0, done      # empty string: no last letter to move back to
    addiu $t1, $t1, -1      # right pointer: last letter, before the zero

swap_loop:
    sltu $t4, $t0, $t1      # 1 while the left address is below the right
    beq $t4, $zero, done
    lbu $t2, 0($t0)         # save both bytes before either store
    lbu $t3, 0($t1)
    sb $t3, 0($t0)
    sb $t2, 0($t1)
    addiu $t0, $t0, 1
    addiu $t1, $t1, -1
    j swap_loop

done:
    addiu $v0, $zero, 10
    syscall
```

```testcase
{
    "expectedRegisters": {
        "v0": 10,
        "t0": "0x10010004",
        "t1": "0x10010003"
    },
    "expectedMemory": [
        {
            "type": "number-chunk",
            "address": "0x10010000",
            "bytes": 1,
            "expected": [121, 108, 98, 109, 101, 115, 115, 65, 0]
        }
    ]
}
```

`la` puts the address of `text` in `$t0`. `addu` copies that address into `$t1` by adding zero, so
the scan starts at the same byte. At `find_end`, `lbu` reads one byte and `beq` checks whether it is
zero. For each nonzero byte, `$t1` advances by one and scans again. The scan stops with `$t1`
pointing **at** the terminator.

For an empty string, that zero is the first byte, so `$t1` still equals `$t0`. The `beq` at
`found_end` goes straight to `done`. Subtracting one in this case would put `$t1` **before** the
string. For a nonempty string, subtracting one puts `$t1` on its last letter. It now serves as the
right pointer; `$t0` is still on the first letter.

At `swap_loop`, `sltu` checks whether the left address is below the right address. If so, the two
`lbu` instructions save the original bytes in `$t2` and `$t3`. The two `sb` instructions write
them at the opposite ends. Both loads come first so a store cannot erase a byte the program still
needs to read. Then `$t0` moves right by one byte, `$t1` moves left by one, and the loop checks
their addresses again.

When the pointers meet or pass each other, the comparison gives zero and the loop stops. If the
string has an odd number of letters, its middle letter stays where it is. The zero terminator also
stays in place because the right pointer starts on the byte before it.

Select **Build** and **Run**, then look at `text` in the memory panel. The original `Assembly`
becomes `ylbmessA`, followed by the same `00` terminator.

Now change only the `.asciiz` text and try `""`, `"A"`, `"race"`, and `"Level"` in turn. Before each
run, predict the resulting text and which pairs of letters will swap. Select **Build**, then **Run**,
and check the bytes in the memory panel, including the final `00`. For the empty string, check that
the program stops without swapping; for `"Level"`, watch what happens to the middle `v`.
