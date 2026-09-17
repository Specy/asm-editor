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

When `b` is larger, the first path copies `b` to `$t2` and calculates `b - a`. Its `j done` skips
the other path. When `a` is at least `b`, the branch selects the second path and calculates `a - b`.
This Playground transfers control immediately after a branch or jump; it has no branch delay slots.
Classic MIPS material may show a delay-slot instruction instead.

Both paths use `subu`, so the subtraction does not raise a signed-overflow exception. The result in
`$t4` is the correct unsigned magnitude for every pair of signed 32-bit inputs. A magnitude greater
than `2147483647` has its top bit set, so the signed register view displays the same bits as a
negative number; use the unsigned or hexadecimal view to inspect that magnitude.

Run the program as written. At `syscall`, `$t2` should be `64` and `$t4` should be `27`
(`0x0000001b`). To practise both routes, replace the two `li` values with each row below. Predict the
route and results before running, then check `$t2` and `$t4` in the register panel.

| `a` | `b` | Expected route    | `$t2` maximum | `$t4` unsigned distance |
| --- | --- | ----------------- | ------------- | ----------------------- |
| 37  | 64  | first path        | 64            | 27                      |
| 99  | 64  | `a_is_at_least_b` | 99            | 35                      |
| 64  | 64  | `a_is_at_least_b` | 64            | 0                       |
| -9  | -2  | first path        | -2            | 7                       |
