This program loads a width and height, computes the rectangle's perimeter in another register, and
keeps both inputs unchanged. Select **Build**, then use **Step** to watch each destination register
change.

```mips|playground|allow-open
.text
main:
    li   $t0, 30          # width
    li   $t1, 12          # height
    add  $t2, $t0, $t1   # width + height
    add  $t2, $t2, $t2   # perimeter = 2 * (width + height)

    move $t3, $t2         # copy the perimeter
    add  $t4, $t2, $zero  # copy it again with addition
    sub  $t5, $t0, $t1   # width - height

    li   $v0, 10          # exit
    syscall
```

Arithmetic instructions use the destination-first shape
`instruction destination, source, source`. The first `add` reads `$t0` and `$t1` but writes only
`$t2`, so the original width and height remain available. The second `add` doubles their sum.

`move $t3, $t2` and `add $t4, $t2, $zero` are equivalent copy idioms here: each reads `$t2` and
writes the same value to a different destination. `move` is a pseudo-instruction; treat it as a
clear request to copy, without assuming one exact assembler expansion.

Subtraction makes source order visible. `sub $t5, $t0, $t1` means `$t5 = $t0 - $t1`, so swapping
the last two operands would produce `12 - 30 = -18` instead.

Once the program stops after the exit syscall, the registers panel shows these useful values:

| Register | Meaning             | Decimal |          Hex |
| -------- | ------------------- | ------: | -----------: |
| `$t0`    | width, preserved    |      30 | `0x0000001E` |
| `$t1`    | height, preserved   |      12 | `0x0000000C` |
| `$t2`    | perimeter           |      84 | `0x00000054` |
| `$t3`    | copied perimeter    |      84 | `0x00000054` |
| `$t4`    | copied perimeter    |      84 | `0x00000054` |
| `$t5`    | width minus height  |      18 | `0x00000012` |
| `$v0`    | exit service number |      10 | `0x0000000A` |

Now compute the same two results for inputs supplied by the test: leave the perimeter in `$t2` and
`$t0 - $t1` in `$t3`, while preserving `$t0` and `$t1`. Predict the four data values before you
select **Test**. After it passes, choose another input pair by editing `startingRegisters` in the
testcase, update the four data values in `expectedRegisters`, and select **Test** again.

```mips|playground|exercise
.text
main:
    # $t0 and $t1 are supplied by the test.
    # Compute the perimeter in $t2 and $t0 - $t1 in $t3.

    li   $v0, 10
    syscall
```

```testcase
{
    "startingRegisters": { "$t0": 7, "$t1": 4 },
    "expectedRegisters": { "$t0": 7, "$t1": 4, "$t2": 22, "$t3": 3, "$v0": 10 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    add  $t2, $t0, $t1
    add  $t2, $t2, $t2
    sub  $t3, $t0, $t1

    li   $v0, 10
    syscall
```

</details>
