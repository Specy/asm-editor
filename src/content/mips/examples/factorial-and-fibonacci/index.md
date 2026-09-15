Two subroutines that call themselves. `factorial(8)` comes back as 40320 in `$s0`, and `fib(10)`
comes back as 55 in `$s1`, and neither of them has a loop anywhere: the repetition is the calls.

Recursion needs no mechanism that is not already here. A prologue subtracts from wherever `$sp`
happens to be, so every call gets a frame of its own at a fresh address, and `0($sp)` always means
this call's own room.

```mips|playground|memory|allow-open
.text
.globl main

# factorial(n): n in $a0, the answer in $v0
factorial:
    addi $sp, $sp, -8
    sw $ra, 4($sp)          # this call's return address
    sw $a0, 0($sp)          # and its own n
    blt $a0, 2, fact_one    # if(n < 2) return 1
    addi $a0, $a0, -1
    jal factorial           # factorial(n - 1)
    lw $a0, 0($sp)          # our n back, since the call destroyed $a0
    mul $v0, $v0, $a0       # n * factorial(n - 1)
    j fact_done
fact_one:
    li $v0, 1
fact_done:
    lw $ra, 4($sp)
    addi $sp, $sp, 8
    jr $ra

# fib(n): n in $a0, one word of local room at 0($sp), the answer in $v0
fib:
    addi $sp, $sp, -12
    sw $ra, 8($sp)
    sw $a0, 4($sp)
    blt $a0, 2, fib_small   # fib(0) is 0 and fib(1) is 1
    addi $a0, $a0, -1
    jal fib                 # fib(n - 1)
    sw $v0, 0($sp)          # kept across the second call
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
```

`sw $ra, 4($sp)` is the line that makes recursion work at all. There is one `$ra` on this machine,
and `jal factorial` inside `factorial` writes the address of the instruction after it there, on top
of the address the call needed to go back to. So a subroutine that calls anything, itself included,
saves `$ra` on the way in and loads it back on the way out.

`lw $a0, 0($sp)` after the inner call is the second half of the same idea for the argument. `$a0` is
a caller-saved register and the recursive call destroyed it, so this call reads its own `n` back out
of its own frame, at an address seven other calls are not using. A variable at a fixed address would
be shared by every call and overwritten by the second one.

`factorial` takes eight bytes of stack per call, four for `$ra` and four for `n`, and not a byte
more. That is as small as a recursive frame gets here, because `jal` pushes nothing and the argument
arrives in a register: the only things on the stack are the two this subroutine decided to put
there. Step into the calls and watch `$sp` drop by eight each time, down to `7FFFEFBC` at the
deepest point, where `n` is 1 and the recursion turns round. `fib` takes twelve, because of the
word of local room it asked for.

`fib` is the expensive one: `fib(n)` calls itself twice, so the number of calls roughly doubles for
every 1 you add to `n`, and it takes 2300 instructions for a number you could get with a loop and
two registers. Recursion is written to be read, not to be quick.

Change `li $a0, 8` to `li $a0, 10` and the answer is 3628800, which is right. Push it to 13 and it
is not: `$s0` reads `7328CC00`, while 13 factorial is 6227020800. Nothing went wrong in the
recursion. `mul` writes the low 32 bits of the product, 6227020800 needs 33 of them, so the top bit
fell off the end and the program reported the rest with complete confidence. That is what an
overflow looks like when nobody is checking for one.
