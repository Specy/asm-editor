`jal label` writes the address of the next instruction into `$ra` and jumps to the label. `jr $ra`
jumps back to it. That pair is the whole of calling and returning on MIPS, and it touches no memory
at all: on the M68K a `bsr` pushes the return address and an `rts` pops it, and here it goes in a
register.

## A subroutine that calls nothing

The agreement in this course is the standard one: arguments arrive in `$a0` to `$a3`, the answer
leaves in `$v0`.

```mips|playground
.text
.globl main
main:
    li $a0, 10              # x = 10
    jal triple              # x = triple(x)
    move $s0, $v0
    li $v0, 10
    syscall

# triple(n): n arrives in $a0, the answer leaves in $v0
triple:
    add $v0, $a0, $a0
    add $v0, $v0, $a0
    jr $ra
```

`$s0` comes out at 30. Step through it and watch `$ra`: it is 0 until the `jal`, then `00400008`,
the address of the `move` that follows the call, and the `jr $ra` puts the `pc` back there.

The `li $v0, 10` and `syscall` before `triple:` are what stop the program. Take them out and it walks
into the subroutine, runs it, and the `jr $ra` jumps back to the `move` it has already done, round
and round until the Playground gives up.

`triple` is a **leaf**: it calls nothing, so `$ra` is safe for as long as it runs and the subroutine
needs no stack, no saving and no prologue. Most small subroutines are leaves, and that is what makes
a register return address worth having.

## There is only one $ra

A subroutine that calls something else has a problem: the `jal` inside it overwrites `$ra` with a new
return address, and the one it needed is gone. So a subroutine that is not a leaf saves `$ra` on the
stack on the way in and loads it back on the way out.

```mips|playground|memory
.text
.globl main
main:
    li $a0, 5
    jal quadruple
    move $s0, $v0
    li $v0, 10
    syscall

# quadruple(n): calls doubled twice, so it has to keep $ra
quadruple:
    addi $sp, $sp, -4
    sw $ra, 0($sp)          # the return address into main
    jal doubled
    move $a0, $v0           # the answer becomes the next argument
    jal doubled
    lw $ra, 0($sp)          # and back it comes
    addi $sp, $sp, 4
    jr $ra

# doubled(n): a leaf, so it needs no stack at all
doubled:
    add $v0, $a0, $a0
    jr $ra
```

`$s0` comes out at 20. Take the two `$ra` lines out and run it again: the second `jal doubled`
overwrites `$ra` with an address inside `quadruple`, so the `jr $ra` at the end returns into the
middle of `quadruple` instead of into `main`, and the program loops.

Those four lines around the body are the **prologue** and the **epilogue**, and they are what a C
compiler writes for every function that calls another one.

## Who preserves what

The convention names two groups of registers, and the whole point of the split is that a caller and a
subroutine written by two different people still work together.

| registers                                    | who keeps them                         |
| -------------------------------------------- | -------------------------------------- |
| `$t0` to `$t9`, `$a0` to `$a3`, `$v0`, `$v1` | the **caller**, if it still wants them |
| `$s0` to `$s7`, `$sp`, `$fp`, `$ra`          | the **subroutine**, before it returns  |

So a subroutine may write any `$t` register it likes without telling anyone, and must put back any
`$s` register it touches. A caller holding something in `$t3` across a call has to save it itself.

```mips|playground|memory
.text
.globl main
main:
    li $t0, 111             # a temporary
    li $s0, 222             # a saved register
    li $a0, 3
    jal scribble
    move $t1, $t0           # what is left of the temporary
    move $s1, $s0           # and of the saved one
    li $v0, 10
    syscall

# scribble(n): destroys $t0 freely and borrows $s0 properly
scribble:
    addi $sp, $sp, -4
    sw $s0, 0($sp)          # the caller's $s0, kept
    li $t0, 999             # a temporary, nobody's to keep
    li $s0, 999             # borrowed, and given back below
    add $v0, $a0, $a0
    lw $s0, 0($sp)
    addi $sp, $sp, 4
    jr $ra
```

`$t1` comes out at 999 and `$s1` at 222. The subroutine destroyed the caller's `$t0` and was entitled
to; it destroyed the caller's `$s0` too, and put it back, which is why `main` still has its 222.

Nothing in the machine enforces any of this. It is what the comment above the label says, and the
reason to follow the standard one rather than invent your own is that every other MIPS program does.

## Arguments past the fourth

Four registers hold four arguments. A fifth goes on the stack, and the **caller** puts it there and
takes it back off.

```mips|playground|memory
.text
.globl main
main:
    li $a0, 1
    li $a1, 2
    li $a2, 3
    li $a3, 4
    li $t0, 5
    addi $sp, $sp, -8
    sw $t0, 0($sp)          # the fifth argument
    li $t0, 6
    sw $t0, 4($sp)          # and the sixth
    jal sum6
    addi $sp, $sp, 8        # the caller takes the room back
    move $s0, $v0
    li $v0, 10
    syscall

# sum6(a, b, c, d, e, f): four in registers, e at 0($sp) and f at 4($sp)
sum6:
    add $v0, $a0, $a1
    add $v0, $v0, $a2
    add $v0, $v0, $a3
    lw $t1, 0($sp)
    add $v0, $v0, $t1
    lw $t2, 4($sp)
    add $v0, $v0, $t2
    jr $ra
```

`$s0` comes out at 21, which is 1 to 6 added up. While `sum6` runs, `$sp` is at `0x7FFFEFF4` and the
stack holds:

|      address |    value    | reached as | what it is |
| -----------: | :---------: | ---------- | ---------- |
| `0x7FFFEFF4` | 🟢 00000005 | `0($sp)`   | `e`        |
| `0x7FFFEFF8` |  00000006   | `4($sp)`   | `f`        |

`jal` pushes nothing, which is why `0($sp)` inside the subroutine is the argument and not a return
address. The catch is that `$sp` moves: push anything inside `sum6` and every offset above changes,
and that is what `$fp` exists for. `move $fp, $sp` at the top of a subroutine gives you a pointer
that stays still while `$sp` moves, and then the arguments are at `0($fp)` and `4($fp)` whatever else
the subroutine does. `$fp` is a saved register, so a subroutine that uses it saves the caller's copy
first.

## Recursion needs nothing new

A subroutine that calls itself gets a fresh frame at a fresh address every time, because every
prologue subtracts from wherever `$sp` happens to be. The same `0($sp)` in the source is a different
address in every call.

```mips|playground|memory
.text
.globl main
main:
    li $a0, 5
    jal factorial
    move $s0, $v0
    li $v0, 10
    syscall

# factorial(n): n in $a0, the answer in $v0
factorial:
    addi $sp, $sp, -8
    sw $ra, 4($sp)          # this call's return address
    sw $a0, 0($sp)          # and its own n
    li $t0, 2
    blt $a0, $t0, base      # if(n < 2) return 1
    addi $a0, $a0, -1
    jal factorial           # $v0 = factorial(n - 1)
    lw $a0, 0($sp)          # our n back, since the call destroyed $a0
    mul $v0, $v0, $a0       # n * factorial(n - 1)
    j fret
base:
    li $v0, 1
fret:
    lw $ra, 4($sp)
    addi $sp, $sp, 8
    jr $ra
```

`$s0` comes out at `00000078`, which is 120. At the deepest point, with `$a0` down to 1, the stack
holds five frames of eight bytes each:

|      address |    value    | what it is                             |
| -----------: | :---------: | -------------------------------------- |
| `0x7FFFEFD4` | 🟢 00000001 | `n` of the innermost call              |
| `0x7FFFEFD8` |  00400034   | its return address, inside `factorial` |
| `0x7FFFEFDC` |  00000002   | `n` of the call before it              |
| `0x7FFFEFE0` |  00400034   |                                        |
| `0x7FFFEFE4` |  00000003   |                                        |
| `0x7FFFEFE8` |  00400034   |                                        |
| `0x7FFFEFEC` |  00000004   |                                        |
| `0x7FFFEFF0` |  00400034   |                                        |
| `0x7FFFEFF4` |  00000005   | `n` of the first call                  |
| `0x7FFFEFF8` |  00400008   | its return address, inside `main`      |

Four of the five return addresses are the same `00400034`, the `lw $a0, 0($sp)` after the recursive
`jal`, and the outermost one points into `main`. Nothing had to be reserved and nothing had to be
named: the stack pointer chose all ten addresses.

The `lw $a0, 0($sp)` after the call is there because `$a0` is a caller-saved register and the
recursive call destroyed it. Saving it in the prologue and reloading it afterwards is this
subroutine being its own caller.

The editor's **Call stack** tab lists the calls that are open, which for a run stopped part way
through this program is `factorial` five times over.

## Calling an address

`jalr $t0` jumps to the address **in** `$t0` and writes the return address into `$ra`, which is how a
program calls a function pointer or a routine out of a table. `la $t0, triple` and `jalr $t0` do what
`jal triple` does, with the address worked out while the program runs.

## Your turn

Write a subroutine called with `jal` that squares the number in `$a0` and leaves the answer in `$v0`,
and a caller that copies that answer into `$s0` before ending the program. The test starts `$a0` at
7, so `$s0` comes out at 49.

The copy is not busywork. `$v0` is both the register a subroutine answers in and the register the
`syscall` number goes in, so the `li $v0, 10` that ends a program destroys the answer, and anything
you still want has to be moved out of `$v0` first.

```mips|playground|exercise
.text
.globl main
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "$a0": 7 },
    "expectedRegisters": { "$s0": 49 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
.globl main
main:
    jal square
    move $s0, $v0       # out of $v0 before the syscall number goes in
    li $v0, 10
    syscall

# square(n): n in $a0, the answer in $v0
square:
    mul $v0, $a0, $a0
    jr $ra
```

</details>

The second one hands you a caller that calls `add_two` with 20 and 22 on the stack. Write the body,
which must leave 42 in `$v0` without moving `$sp`.

```mips|playground|memory|exercise
.text
.globl main
main:
    addi $sp, $sp, -8
    li $t0, 22
    sw $t0, 0($sp)      # the first argument
    li $t0, 20
    sw $t0, 4($sp)      # the second
    jal add_two
    addi $sp, $sp, 8    # the caller gives the room back
    move $s0, $v0
    li $v0, 10
    syscall

# add_two(a, b): a at 0($sp), b at 4($sp), the answer in $v0
add_two:
    jr $ra
```

```testcase
{
    "expectedRegisters": { "$s0": 42 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|memory|solution
.text
.globl main
main:
    addi $sp, $sp, -8
    li $t0, 22
    sw $t0, 0($sp)      # the first argument
    li $t0, 20
    sw $t0, 4($sp)      # the second
    jal add_two
    addi $sp, $sp, 8    # the caller gives the room back
    move $s0, $v0
    li $v0, 10
    syscall

# add_two(a, b): a at 0($sp), b at 4($sp), the answer in $v0
add_two:
    lw $t1, 0($sp)      # a
    lw $t2, 4($sp)      # b
    add $v0, $t1, $t2
    jr $ra
```

</details>
