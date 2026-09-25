This program places a rectangle's width and height in `$t0` and `$t1`, then calculates its
perimeter in another register. Select **Build**, then use **Step** to watch the registers change one
instruction at a time.

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

`move $t3, $t2` copies `$t2` into `$t3`. `add $t4, $t2, $zero` also copies the value, because
`$zero` always reads as 0. Both leave `$t2` alone. `move` is a pseudo-instruction: the assembler
translates it into an instruction the processor can execute. Here you can read it simply as a copy.

Subtraction makes source order visible. `sub $t5, $t0, $t1` means `$t5 = $t0 - $t1`, so swapping
the last two operands would produce `12 - 30 = -18` instead.

Once the program stops after the exit syscall, the registers panel shows hexadecimal values by
default. The decimal column gives the corresponding numbers used in the calculation:

| Register | Meaning             | Shown in panel | Decimal |
| -------- | ------------------- | -------------- | ------: |
| `$t0`    | width, preserved    | `0000001E`     |      30 |
| `$t1`    | height, preserved   | `0000000C`     |      12 |
| `$t2`    | perimeter           | `00000054`     |      84 |
| `$t3`    | copied perimeter    | `00000054`     |      84 |
| `$t4`    | copied perimeter    | `00000054`     |      84 |
| `$t5`    | width minus height  | `00000012`     |      18 |
| `$v0`    | exit service number | `0000000A`     |      10 |

Now compute the same two results for inputs supplied by the test: leave twice the sum of `$t0` and
`$t1` in `$t2`, and `$t0 - $t1` in `$t3`. Keep `$t0` and `$t1` unchanged. For `$t0 = 7` and
`$t1 = 4`, what values will the three arithmetic instructions leave in `$t2` and `$t3`? Write them
in the exercise editor, then select **Test** to check the final values of `$t0`, `$t1`, `$t2`, and
`$t3`.

After your program passes, you can try another pair. Select **Open in editor** on the exercise,
then **Testcases**. In **New Testcase**, add the new `$t0` and `$t1` values under **Starting
registers values**. Under **Expected registers values**, add the values you expect for `$t0`,
`$t1`, `$t2`, `$t3`, and `$v0` (10 for the exit service). Use **Add** for each register, select
**Add Testcase**, then select **Test** again.

```mips|playground|exercise|allow-open
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
