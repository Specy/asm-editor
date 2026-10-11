These two subroutines call themselves. `factorial(8)` returns 40320 in `s0`, and `fib(10)` returns
55 in `s1`. Both examples expect a nonnegative `n` in `a0` and return their answer in `a0`.

A recursive call uses the same `ra` and argument registers as any other call. Before making that
call, the current call therefore saves the return address and every value it will still need. Its
stack frame keeps those saved values separate from the frames belonging to the other active calls.

```riscv|playground|memory|allow-open
.text
.globl main

# factorial(n), for nonnegative n: n in a0, answer in a0
factorial:
    addi sp, sp, -16
    sw ra, 4(sp)            # this call's return address
    sw a0, 0(sp)            # this call's n
    li t0, 2
    blt a0, t0, fact_one    # factorial(0) and factorial(1) are 1
    addi a0, a0, -1
    jal factorial           # a0 = factorial(n - 1)
    lw t1, 0(sp)            # recover this call's n
    mul a0, a0, t1          # n * factorial(n - 1)
    j fact_done
fact_one:
    li a0, 1
fact_done:
    lw ra, 4(sp)
    addi sp, sp, 16
    ret

# fib(n), for nonnegative n: n in a0, answer in a0
fib:
    addi sp, sp, -16
    sw ra, 4(sp)
    sw a0, 0(sp)
    li t0, 2
    blt a0, t0, fib_done    # fib(0) is 0 and fib(1) is 1
    addi a0, a0, -1
    jal fib                 # a0 = fib(n - 1)
    sw a0, 8(sp)            # keep the first result across the second call
    lw a0, 0(sp)
    addi a0, a0, -2
    jal fib                 # a0 = fib(n - 2)
    lw t1, 8(sp)            # recover fib(n - 1)
    add a0, a0, t1          # fib(n - 2) + fib(n - 1)
fib_done:
    lw ra, 4(sp)
    addi sp, sp, 16
    ret

main:
    addi sp, sp, -12        # 0x7fffeffc -> 0x7fffeff0, aligned for calls
    li a0, 8
    jal factorial
    mv s0, a0               # 40320
    li a0, 10
    jal fib
    mv s1, a0               # 55
    addi sp, sp, 12         # restore the Playground's initial sp
```

## One frame for each active call

The Playground starts with `sp = 0x7fffeffc`. `main` first subtracts 12, so both calls from `main`
begin with the 16-byte-aligned value `0x7fffeff0`. Each recursive call then claims a 16-byte frame,
which preserves that alignment. The matching additions restore `sp` to `0x7fffeff0` after each
top-level call and finally to `0x7fffeffc` when `main` finishes.

For `factorial(8)`, the active calls have their own saved `n` values from 8 down to 1. The first
frame begins at `0x7fffefe0`. Eight frames occupy 128 bytes, so the deepest `sp` is
`0x7fffef70`. At that point `0(sp)` contains 1 and `4(sp)` contains the innermost return address.
As the calls return, each one reloads its own `n`, multiplies it by the answer in `a0`, restores its
own `ra`, and releases its frame.

Saving `ra` is essential because the inner `jal factorial` replaces the only `ra` register. Saving
`n` is essential because the inner call also replaces `a0`. A fixed memory location would be shared
by all calls; moving `sp` gives every active call a different `0(sp)` and `4(sp)`.

The longest descent in `fib(10)` follows 10, 9, 8, and so on down to 1. Ten active 16-byte frames
put `sp` at `0x7fffef50`. Each non-base frame uses one more stored word than a factorial frame
because it must keep the result of `fib(n - 1)` while it computes `fib(n - 2)`.

## Two results inside one Fibonacci call

Consider the frame for `fib(4)`. Its saved `n` remains at `0(sp)` throughout these steps:

| Stage                  | `a0` | `8(sp)` | What the current call does |
| ---------------------- | ---: | ------: | -------------------------- |
| after `fib(3)` returns |    2 |  unused | save 2 at `8(sp)`          |
| before the second call |    2 |       2 | call `fib(2)`              |
| after `fib(2)` returns |    1 |       2 | load the saved 2 into `t1` |
| after `add a0, a0, t1` |    3 |       2 | return `fib(4)`            |

The second recursive call may replace `a0`, `t0`, and `t1`, because they are caller-saved
registers. The first result is therefore kept in the frame, then loaded only after the second call
has returned. The base cases skip both recursive calls: for 0 and 1, the correct result is already
in `a0`.

This direct Fibonacci definition repeats work. For example, computing `fib(10)` computes smaller
values such as `fib(3)` many times. The number of calls grows exponentially as `n` grows; for
successive larger inputs, the growth settles near a factor of 1.6 rather than doubling each time.

## Results that fit in one word

These routines use 32-bit arithmetic, so a result outside one word wraps to its low 32 bits. When
the result is interpreted as a signed 32-bit integer, factorial is safe for inputs 0 through 12:
`12!` is 479001600, while `13!` is 6227020800 and does not fit. Fibonacci is safe through
`fib(46)`, which is 1836311903. `fib(47)` is 2971215073, already above the largest signed 32-bit
integer, and `fib(48)` is larger than even an unsigned 32-bit word.

## Your turn: build a recursive frame

Complete `factorial`. Each call must claim a 16-byte frame, save its incoming `ra` and `n`, and
restore `ra` and `sp` before returning. After the recursive call, reload that call's saved `n` and
multiply it by the returned answer.

The unchanged `main` checks two inputs: `factorial(5)` must leave 120 in `s1`, and `factorial(7)`
must leave 5040 in `s2`. The function must also preserve the `s0` sentinel and finish with `sp` at
the Playground's initial `0x7fffeffc`.

```riscv|playground|exercise
.text
.globl main

factorial:
    # Claim a 16-byte frame and save this call's ra and n.
    li t0, 2
    blt a0, t0, fact_one
    addi a0, a0, -1
    jal factorial
    # Reload this call's n and multiply it by the returned answer.
    j fact_done
fact_one:
    li a0, 1
fact_done:
    # Restore ra, release the frame, and return.
    ret

main:
    li s0, 0x13579bdf       # callee-saved sentinel
    addi sp, sp, -12
    li a0, 5
    jal factorial
    mv s1, a0
    li a0, 7
    jal factorial
    mv s2, a0
    addi sp, sp, 12
```

```testcase
{
    "expectedRegisters": {
        "s0": "0x13579bdf",
        "s1": 120,
        "s2": 5040,
        "sp": "0x7fffeffc"
    }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
.globl main

factorial:
    addi sp, sp, -16
    sw ra, 4(sp)
    sw a0, 0(sp)
    li t0, 2
    blt a0, t0, fact_one
    addi a0, a0, -1
    jal factorial
    lw t1, 0(sp)
    mul a0, a0, t1
    j fact_done
fact_one:
    li a0, 1
fact_done:
    lw ra, 4(sp)
    addi sp, sp, 16
    ret

main:
    li s0, 0x13579bdf
    addi sp, sp, -12
    li a0, 5
    jal factorial
    mv s1, a0
    li a0, 7
    jal factorial
    mv s2, a0
    addi sp, sp, 12
```

</details>
