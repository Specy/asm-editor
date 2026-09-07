Two subroutines that call themselves. `factorial(8)` comes back as 40320 in `s0`, and `fib(10)`
comes back as 55 in `s1`, and neither of them has a loop anywhere: the repetition is the calls.

Stack arguments and a stack frame built one frame for one call. Recursion is the same instructions
with nothing added, because a prologue subtracts from wherever `sp` happens to be, so every call
gets a frame of its own at a fresh address and `0(sp)` means this call's own room.

**You need to know:** the "Stack arguments and a stack frame" Example and the "jal, ret and the
calling convention" lecture. What is new here is a subroutine calling itself, which needs no
mechanism the previous program did not already use.

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

`fib` has a base case that moves nothing: `fib(0)` is 0 and `fib(1)` is 1, and both of them are
already sitting in `a0` where the answer goes, so `blt a0, t0, fib_done` jumps straight to the
epilogue. MIPS writes a `move $v0, $a0` there, because on that machine the argument and the answer
are two different registers.

`li t0, 2` above the branch is there because `blt` compares two registers and 2 is not one. The M68K
writes `cmp.l #2, d0` and MIPS lets its assembler hide the same `li` inside a `blt $a0, 2, label`;
here it is a line you write, and it runs once per call.

`factorial` takes sixteen bytes of stack per call, of which it uses eight, four for `ra` and four for
`n`. The M68K's twelve are the argument its caller pushes, the return address `bsr` pushes and the
old frame pointer `link` pushes; `jal` pushes nothing at all and the argument arrives in `a0`. Step
into the calls and `sp` drops by sixteen at each one, down to `7FFFEF7C` at the deepest, where `n` is
1 and the recursion turns round.

`fib` is the expensive one: `fib(n)` calls itself twice, so the number of calls roughly doubles for
every 1 you add to `n`. `factorial(8)` is 104 instructions and `fib(10)` is about 2120, for a number
you could get with a loop and two registers. Recursion is written to be read, not to be quick.

Try changing `li a0, 8` to `li a0, 10` and `s0` comes out at `00375F00`, which is 3628800, the right
answer. `mul` here is a full 32 bit multiply, so the first factorial it gets wrong is 13, which comes
out at `7328CC00` instead of 6227020800. The M68K version gets that same change wrong, at 352000,
because its `mulu` multiplies two 16 bit words and 362880 does not fit in one.
