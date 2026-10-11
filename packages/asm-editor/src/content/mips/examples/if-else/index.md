This program compares two signed numbers. It leaves their maximum in `$t2` and the unsigned
distance between them in `$t4`. Step through it once and watch the `pc`: only one of the two paths
runs.

```mips|playground|allow-open
.text
main:
    li $t0, 37          # a = 37
    li $t1, 64          # b = 64

    slt $t3, $t0, $t1   # $t3 = 1 when signed a < signed b
    beqz $t3, a_is_at_least_b

    move $t2, $t1       # maximum = b
    subu $t4, $t1, $t0  # distance = b - a
    j done

a_is_at_least_b:
    move $t2, $t0       # maximum = a
    subu $t4, $t0, $t1  # distance = a - b

done:
    li $v0, 10
    syscall
```

`slt` performs a **signed** comparison. It writes 1 to `$t3` when `a < b`, and 0 otherwise.
`beqz` then tests only whether `$t3` is zero; a zero test has no signed or unsigned interpretation.
When `$t3` is 0, execution jumps to `a_is_at_least_b`, which also handles equality.

When `a < b`, execution continues into the first path: it copies `b` to `$t2` and calculates
`b - a`. Its `j done` skips the other path. When `a >= b`, the branch goes to
`a_is_at_least_b`, where the program copies `a` and calculates `a - b`. In either case, execution
reaches `done` after just one path.

The signed comparison tells us which number is larger. Subtracting the smaller number from the
larger one gives their distance. Both paths use `subu`, which keeps the 32-bit subtraction result
without a signed-overflow exception. Read `$t4` as an **unsigned** number: that gives the distance
even when it is too large to fit in a signed 32-bit number.

Run the program as written. At `syscall`, `$t2` should be 64 and `$t4` should be 27. The register
panel shows hexadecimal by default, so these appear as `00000040` and `0000001B`. To practise both
routes, replace the two `li` values with each row below. Predict the route and results before
running, then check `$t2` and `$t4` in the register panel. The table gives the results in decimal.

| `a` | `b` | Route                       | `$t2` maximum | `$t4` unsigned distance |
| --- | --- | --------------------------- | ------------- | ----------------------- |
| 37  | 64  | `a < b`: first path         | 64            | 27                      |
| 99  | 64  | `a >= b`: `a_is_at_least_b` | 99            | 35                      |
| 64  | 64  | `a >= b`: `a_is_at_least_b` | 64            | 0                       |
| -9  | -2  | `a < b`: first path         | -2            | 7                       |

<details>
<summary>What if the distance is too large for a signed number?</summary>

Try `a = -2147483648` and `b = 2147483647`. Their distance is 4294967295, which fits in an
unsigned 32-bit number. `subu` leaves `FFFFFFFF` in `$t4`. Those same bits mean -1 if you read
them as a signed number, so use the unsigned reading for the distance.

</details>

Now write the selection yourself. The test supplies signed `a` in `$t0` and `b` in `$t1`. Leave
their signed maximum in `$t2`, and keep both inputs unchanged. Use `slt` to compare them, `beqz`
to choose the `a >= b` path, and `j done` after the `a < b` path so only one value is copied. For
`a = 7` and `b = 4`, what should `$t2` contain? Write your instructions in the exercise editor,
then select **Test**. Once it passes, select **Open in editor** and use **Testcases** to try
`a = 4`, `b = 7` and `a = -9`, `b = -2`. Update both the starting `$t0`/`$t1` values and the
expected `$t0`/`$t1`/`$t2` values. The two expected maxima are 7 and -2, respectively.

```mips|playground|exercise|allow-open
.text
main:
    # $t0 and $t1 are supplied by the test.
    # Leave their signed maximum in $t2.

    li $v0, 10
    syscall
```

```testcase
{
    "startingRegisters": { "$t0": 7, "$t1": 4 },
    "expectedRegisters": { "$t0": 7, "$t1": 4, "$t2": 7, "$v0": 10 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    slt $t3, $t0, $t1
    beqz $t3, a_is_at_least_b

    move $t2, $t1
    j done

a_is_at_least_b:
    move $t2, $t0

done:
    li $v0, 10
    syscall
```

</details>
