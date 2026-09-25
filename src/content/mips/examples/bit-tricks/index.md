Put the 32-bit pattern `0x000000B6`—decimal 182—in a register and ask five questions about its
bits:

1. Is its low bit 0 or 1?
2. What 32-bit pattern results from shifting it left by three places?
3. What value is in its bottom four bits?
4. How many of its 32 bits are 1?
5. How many 0 bits come before its first 1 when you read from the top?

The answers go to `$t1`, `$t2`, `$t3`, `$t4`, and `$t8`.

The last question uses `clz destination, source` (**count leading zeroes**): it reads a 32-bit
pattern and puts a count from 0 to 32 in the destination register.

```mips|playground|allow-open
.text
main:
    li $t0, 182         # 0x000000B6

    andi $t1, $t0, 1    # low bit: 0 for even, 1 for odd

    sll $t2, $t0, 3     # shift left 3 places; keep the low 32 bits

    andi $t3, $t0, 0xF  # keep the low four bits

    li $t4, 0           # count of 1 bits
    move $t5, $t0       # working copy
    li $t6, 32          # examine exactly 32 bits
count:
    andi $t7, $t5, 1    # isolate the current low bit
    add $t4, $t4, $t7   # add either 0 or 1
    srl $t5, $t5, 1     # bring the next bit down
    addi $t6, $t6, -1
    bnez $t6, count

    clz $t8, $t0        # leading zero count

    li $v0, 10
    syscall
```

```testcase
{
    "expectedRegisters": {
        "$t1": 0,
        "$t2": 1456,
        "$t3": 6,
        "$t4": 5,
        "$t5": 0,
        "$t8": 24,
        "$v0": 10
    }
}
```

## Read one bit with a mask

`andi $t1, $t0, 1` extracts the low bit. The mask has only bit 0 set, so the instruction clears
bits 31 through 1 and keeps bit 0. That bit is 0 for an even value and 1 for an odd value. Here
`$t1` is 0 because 182 is even. The result is already the value a program can branch on, add, or
store.

The same idea keeps a wider field. The mask `0xF` is binary `1111`, so
`andi $t3, $t0, 0xF` keeps the bottom four bits and clears the rest. The bottom byte of the input is
`0xB6`, so those four bits are `0110` and `$t3` is 6.

`andi` accepts masks up to `0xFFFF`. For a larger mask such as `0xF0000000`, use
`li $t9, 0xF0000000` followed by `and $t9, $t0, $t9`: the first instruction puts the mask in a
register, and the second keeps only the bits selected by that mask.

## Shift within 32 bits

Every place moved left doubles a bit's value, so shifting left three places corresponds to
multiplication by 8. For this input, `$t2` becomes 1456.

The register still has only 32 bits. `sll` discards bits that leave the top and fills the bottom
with zeroes. For example, shifting `0x40000000` left by three produces `0x00000000`: its only 1 bit
moves past bit 31, so none of its bits remain in the register.

The shift amount written in `sll` can be from 0 through 31.

## Count all 32 bits

The loop makes exactly 32 passes, one for each bit in the original pattern. On each pass it masks
the working copy's low bit, adds that 0 or 1 to `$t4`, and shifts the next bit into place. The five
1 bits in `0x000000B6` leave `$t4` equal to 5. Because `srl` fills from the top with zeroes, the
working copy in `$t5` is also 0 after the loop.

An arithmetic right shift, `sra`, copies the old top bit into the new top bit. With exactly 32
passes, it would count the same original bits, but a pattern with bit 31 set would leave `$t5` full
of ones. Using `srl` also makes the final working copy zero for every input.

## Count the zeroes at the top

`clz $t8, $t0` counts consecutive 0 bits from bit 31 downward and stops at the first 1. The top 1
in `0x000000B6` is bit 7, so 24 zeroes come before it and `$t8` is 24.
`clz` of zero is defined as 32 because all 32 bits are zero.

For a nonzero pattern, you can also find the position of its highest 1 bit: subtract the `clz`
result from 31, the top bit's position. Zero has no 1 bit, so this calculation does not apply to it.

For an optional challenge, predict these four edge cases before changing the first `li`, then check
them in the Playground. Hex values in `$t2` show the complete 32-bit result.

| Input pattern       | `$t1` low bit | `$t2` left 3 | `$t3` low four | `$t4` ones | `$t8` leading zeroes | `$t5` after loop |
| ------------------- | ------------: | -----------: | -------------: | ---------: | -------------------: | ---------------: |
| `0x00000000`        |             0 | `0x00000000` |              0 |          0 |                   32 |     `0x00000000` |
| `0xFFFFFFFF` (`-1`) |             1 | `0xFFFFFFF8` |             15 |         32 |                    0 |     `0x00000000` |
| `0x80000000`        |             0 | `0x00000000` |              0 |          1 |                    0 |     `0x00000000` |
| `0x40000000`        |             0 | `0x00000000` |              0 |          1 |                    1 |     `0x00000000` |

Finally, select **Open in editor**. Change the first instruction from `li $t0, 182` to
`li $t0, 183`, then predict the five result registers before running. Select **Build**, then
**Run**, and compare: the new low bit makes `$t1` equal 1, the shifted result in `$t2` becomes
1464, the low four bits in `$t3` become 7, and the count in `$t4` becomes 6. The highest set bit
stays at bit 7, so `$t8` stays 24. The embedded **Test** checks the original input, 182; use
**Run** for this change.
