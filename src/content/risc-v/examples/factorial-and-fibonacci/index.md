Two subroutines that call themselves. `factorial(8)` comes back as 40320 in `s0`, and `fib(10)`
comes back as 55 in `s1`, and neither of them has a loop anywhere: the repetition is the calls.

A subroutine that calls itself needs no new instruction. A prologue subtracts from wherever `sp`
happens to be at that moment, so the eighth call down gets its room at a different address from the
first, and `0(sp)` inside any of them means that call's own copy.

```riscv|playground|memory|allow-open
.text
.globl main

# factorial(n): n in a0, the answer in a0
factorial:
    addi sp, sp, -16
    sw ra, 4(sp)            # this call's return address
    sw a0, 0(sp)            # and its own n
    li t0, 2
    blt a0, t0, fact_one    # if(n < 2) return 1
    addi a0, a0, -1
    jal factorial           # factorial(n - 1)
    lw t1, 0(sp)            # our n back, since the call destroyed a0
    mul a0, a0, t1          # n * factorial(n - 1)
    j fact_done
fact_one:
    li a0, 1
fact_done:
    lw ra, 4(sp)
    addi sp, sp, 16
    ret

# fib(n): n in a0, one word of local room at 8(sp), the answer in a0
fib:
    addi sp, sp, -16
    sw ra, 4(sp)
    sw a0, 0(sp)
    li t0, 2
    blt a0, t0, fib_done    # fib(0) is 0 and fib(1) is 1, already in a0
    addi a0, a0, -1
    jal fib                 # fib(n - 1)
    sw a0, 8(sp)            # kept across the second call
    lw a0, 0(sp)
    addi a0, a0, -2
    jal fib                 # fib(n - 2)
    lw t1, 8(sp)
    add a0, a0, t1          # fib(n - 1) + fib(n - 2)
fib_done:
    lw ra, 4(sp)
    addi sp, sp, 16
    ret

main:
    li a0, 8
    jal factorial
    mv s0, a0               # 8!
    li a0, 10
    jal fib
    mv s1, a0               # fib(10)
```

`sw ra, 4(sp)` is the line that makes recursion work at all. There is one `ra` on this machine, and
`jal factorial` inside `factorial` writes the address of the instruction after it there, on top of
the address the call needed to go back to. So a subroutine that calls anything, itself included,
saves `ra` on the way in and loads it back on the way out.

`lw t1, 0(sp)` after the inner call is the same idea for the argument. `a0` is a caller-saved
register and the recursive call destroyed it, so this call reads its own `n` back out of its own
frame, at an address seven other calls are not using. A variable at a fixed address would be shared
by every call and overwritten by the second one.

`fib` has a base case that moves nothing at all. `fib(0)` is 0 and `fib(1)` is 1, and in both cases
that number is already sitting in `a0`, which is where the answer goes, so the branch jumps straight
to the epilogue and returns what it was given.

`li t0, 2` above that branch is the constant being put somewhere the branch can reach it, and it
runs once per call.

`factorial` claims sixteen bytes per call and uses eight of them, four for `ra` and four for `n`.
Step into the calls and watch `sp` drop by sixteen each time, down to `7FFFEF7C` at the deepest
point, where `n` has reached 1 and the recursion turns round and starts multiplying its way back
up.

`fib` is the expensive one: `fib(n)` calls itself twice, so the number of calls roughly doubles for
every 1 you add to `n`. `factorial(8)` is 104 instructions and `fib(10)` is about 2120, for a number
you could get with a loop and two registers. Recursion is written to be read, not to be quick.

Ask for a bigger factorial and at some point the answer stops being true. `mul` writes 32 bits, and
13! is 6227020800, which needs 33. The program does not stop or complain: `s0` just comes out at
`7328CC00`, the bottom 32 bits of the right answer, looking exactly as trustworthy as 40320 did.
