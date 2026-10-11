These two subroutines call themselves. `factorial(8)` returns 40320 in `$s0`, and `fib(10)`
returns 55 in `$s1`. Both take a nonnegative integer in `$a0` and return a result in `$v0`.
For factorial, `0!` and `1!` are both 1. For Fibonacci, `fib(0)` is 0 and `fib(1)` is 1.
Negative inputs are outside these routines' contract. For a correct result, it must fit in 32 bits;
we will try an input that exceeds that limit below.

Each call reserves its own stack frame. When `factorial` calls itself, `$sp` moves down again,
so `0($sp)` reaches a different saved `n` in each active call.

```mips|playground|memory|tests|allow-open
.text
.globl main

# factorial(n): n in $a0, the answer in $v0
factorial:
    addi $sp, $sp, -8
    sw $ra, 4($sp)          # this call's return address
    sw $a0, 0($sp)          # this call's n
    blt $a0, 2, fact_one    # 0! and 1! are 1
    addi $a0, $a0, -1
    jal factorial           # factorial(n - 1)
    lw $a0, 0($sp)          # recover this call's n
    mul $v0, $v0, $a0       # n * factorial(n - 1)
    j fact_done
fact_one:
    li $v0, 1
fact_done:
    lw $ra, 4($sp)
    addi $sp, $sp, 8
    jr $ra

# fib(n): n in $a0, the answer in $v0
fib:
    addi $sp, $sp, -12
    sw $ra, 8($sp)
    sw $a0, 4($sp)
    blt $a0, 2, fib_small   # fib(0) is 0 and fib(1) is 1
    addi $a0, $a0, -1
    jal fib                 # fib(n - 1)
    sw $v0, 0($sp)          # keep the first result through the next call
    lw $a0, 4($sp)
    addi $a0, $a0, -2
    jal fib                 # fib(n - 2)
    lw $t0, 0($sp)
    add $v0, $v0, $t0       # fib(n - 1) + fib(n - 2)
    j fib_done
fib_small:
    move $v0, $a0
fib_done:
    lw $ra, 8($sp)
    addi $sp, $sp, 12
    jr $ra

main:
    li $a0, 8
    jal factorial
    move $s0, $v0           # 8!
    li $a0, 10
    jal fib
    move $s1, $v0           # fib(10)
    li $v0, 10              # exit after saving both answers
    syscall
```

```testcase
{
    "expectedRegisters": {
        "$s0": 40320,
        "$s1": 55,
        "$sp": "0x7FFFEFFC",
        "$v0": 10
    }
}
```

Every `jal` overwrites the one `$ra` register. When `factorial` calls itself, it must keep the
address for returning to _its_ caller, so it stores `$ra` before the inner `jal` and restores it
before `jr $ra`. `fib` does the same for each of its two inner calls. The exit syscall in `main`
stops execution after both answers have been saved.

The frames contain these four-byte words. Offsets are measured from `$sp` _after_ each routine
reserves its space:

| Routine     | `0($sp)`     | `4($sp)`    | `8($sp)`          |
| ----------- | ------------ | ----------- | ----------------- |
| `factorial` | saved `n`    | saved `$ra` | outside its frame |
| `fib`       | first result | saved `n`   | saved `$ra`       |

The saved `n` matters because `$a0` is caller-saved. For example, a `factorial(3)` call stores 3
at `0($sp)`, changes `$a0` to 2, and calls `factorial(2)`. The inner calls may leave `$a0` changed;
they do not promise to return it as 3. After the call returns with `factorial(2) = 2` in `$v0`,
`lw $a0, 0($sp)` gets the outer call's 3 back, and `mul` produces 6. Each active call has its own
saved word because each made a new frame at a lower address.

`fib` needs one more word. After its first `jal fib`, `$v0` holds `fib(n - 1)`. A second `jal fib`
will replace `$v0` with `fib(n - 2)`. `$t0` is caller-saved too, so moving the first result there
before the second call would not preserve it. `sw $v0, 0($sp)` keeps that result in this call's
frame. Only _after_ the second call does `lw $t0, 0($sp)` load it for the final addition.

Step through `factorial(3)` by changing the first argument in `main` to 3. Let **S** be the value
of `$sp` just before `main` calls it. At the branch in each active call, predict the saved `n` at
`0($sp)` and the position of `$sp`: the calls for 3, 2, and 1 use **S − 8**, **S − 16**, and
**S − 24**. Their saved `n` values are 3, 2, and 1. As the calls return, each restores its own
`$ra` and releases eight bytes. `$s0` ends at 6 and `$sp` returns to **S**. Select **Build**, then
use **Step** and the Memory panel to check the three frames. After restoring the original inputs,
select **Build**, then **Run**. The embedded **Test** checks the original 8 and 10.

For another small change, turn `factorial` into a recursive sum from 1 through `n`. Keep its
frame and recursive call, but make the base case return 0 when `n` is 0, and add the saved `n` to
the returned value. The same nonnegative-input rule applies. With 3 in `$a0`, the calls should
return 0, then 1, then 3, then 6. Select **Build**, then **Run** to check the result. Restore the
original code when you finish.

Finally, try 10 and then 13 as the factorial input. `10!` is 3628800. `13!` is 6227020800,
which is too large for the 32-bit result of `mul`. `$s0` instead shows `0x7328CC00` in
hexadecimal, the low 32 bits of that product (1932053504 in decimal). The recursion still
follows the same calls; the multiplication loses the upper bits.
