`jal label` writes the address of the next instruction into `ra` and jumps to the label. `ret` jumps
back to it. That pair is the whole of calling and returning on RISC-V, and it touches no memory at
all: on the M68K a `bsr` pushes the return address and an `rts` pops it, and here it goes in a
register.

Both of them are shorthand. `jal label` is `jal ra, label`, and the register it writes is an operand
you are allowed to name; `ret` is `jalr zero, ra, 0`, which jumps to the address in `ra` and throws
away the return address it would have written, because a return has nowhere to come back from.

## A subroutine that calls nothing

The agreement in this course is the standard one: arguments arrive in `a0` to `a7`, the answer leaves
in `a0`.

```riscv|playground
.text
.globl main
main:
    li a0, 10               # x = 10
    jal triple              # x = triple(x)
    mv s0, a0
    li a7, 10
    ecall

# triple(n): n arrives in a0, the answer leaves in a0
triple:
    add t0, a0, a0
    add a0, t0, a0
    ret
```

`s0` comes out at 30. Step through it and watch `ra`: it is 0 until the `jal`, then `00400008`, the
address of the `mv` that follows the call, and the `ret` puts the `pc` back there.

The `li a7, 10` and `ecall` before `triple:` are what stop the program. Take them out and it walks
into the subroutine, runs it, and the `ret` jumps back to the `mv` it has already done, round and
round until the Playground gives up.

`triple` is a **leaf**: it calls nothing, so `ra` is safe for as long as it runs and the subroutine
needs no stack, no saving and no prologue. Most small subroutines are leaves, and that is what makes
a register return address worth having.

## There is only one ra

A subroutine that calls something else has a problem: the `jal` inside it overwrites `ra` with a new
return address, and the one it needed is gone. So a subroutine that is not a leaf saves `ra` on the
stack on the way in and loads it back on the way out.

```riscv|playground|memory
.text
.globl main
main:
    li a0, 5
    jal quadruple
    mv s0, a0
    li a7, 10
    ecall

# quadruple(n): calls doubled twice, so it has to keep ra
quadruple:
    addi sp, sp, -16
    sw ra, 0(sp)            # the return address into main
    jal doubled
    jal doubled             # the answer of the first call is already in a0
    lw ra, 0(sp)            # and back it comes
    addi sp, sp, 16
    ret

# doubled(n): a leaf, so it needs no stack at all
doubled:
    add a0, a0, a0
    ret
```

`s0` comes out at 20. Take the two `ra` lines out and run it again: the second `jal doubled`
overwrites `ra` with an address inside `quadruple`, so the `ret` at the end returns into the middle
of `quadruple` instead of into `main`, and the program loops.

Those four lines around the body are the **prologue** and the **epilogue**, and they are what a C
compiler writes for every function that calls another one. The frame is 16 bytes for one word,
because the ABI asks for `sp` to stay a multiple of 16.

Nothing had to be moved between the two calls, since the answer of `doubled` comes back in `a0` and
`a0` is where the next call wants its argument.

## Who preserves what

The convention names two groups of registers, and the whole point of the split is that a caller and a
subroutine written by two different people still work together.

| registers                        | who keeps them                         |
| -------------------------------- | -------------------------------------- |
| `t0` to `t6`, `a0` to `a7`, `ra` | the **caller**, if it still wants them |
| `s0` to `s11`, `sp`              | the **subroutine**, before it returns  |

So a subroutine may write any `t` register it likes without telling anyone, and must put back any `s`
register it touches. A caller holding something in `t3` across a call has to save it itself.

```riscv|playground|memory
.text
.globl main
main:
    li t0, 111              # a temporary
    li s0, 222              # a saved register
    li a0, 3
    jal scribble
    mv t1, t0               # what is left of the temporary
    mv s1, s0               # and of the saved one
    li a7, 10
    ecall

# scribble(n): destroys t0 freely and borrows s0 properly
scribble:
    addi sp, sp, -16
    sw s0, 0(sp)            # the caller's s0, kept
    li t0, 999              # a temporary, nobody's to keep
    li s0, 999              # borrowed, and given back below
    add a0, a0, a0
    lw s0, 0(sp)
    addi sp, sp, 16
    ret
```

`t1` comes out at 999 and `s1` at 222. The subroutine destroyed the caller's `t0` and was entitled
to; it destroyed the caller's `s0` too, and put it back, which is why `main` still has its 222.

`ra` is in the caller's column, which reads oddly until you notice what it means: a subroutine may
destroy `ra`, and a caller that still wants its own return address has to have saved it. That is
exactly what the prologue of `quadruple` did, and it is why the rule and the prologue are the same
rule.

Nothing in the machine enforces any of this. It is what the comment above the label says, and the
reason to follow the standard one instead of inventing your own is that every other RISC-V program
does.

## Arguments past the eighth

Eight registers hold eight arguments, twice what MIPS gives you. A ninth goes on the stack, and the
**caller** puts it there and takes it back off.

```riscv|playground|memory
.text
.globl main
main:
    li a0, 1
    li a1, 2
    li a2, 3
    li a3, 4
    li a4, 5
    li a5, 6
    li a6, 7
    li a7, 8
    addi sp, sp, -16
    li t0, 9
    sw t0, 0(sp)            # the ninth argument
    li t0, 10
    sw t0, 4(sp)            # and the tenth
    jal sum10
    addi sp, sp, 16         # the caller takes the room back
    mv s0, a0
    li a7, 10
    ecall

# sum10(a..j): eight in registers, i at 0(sp) and j at 4(sp)
sum10:
    add a0, a0, a1
    add a0, a0, a2
    add a0, a0, a3
    add a0, a0, a4
    add a0, a0, a5
    add a0, a0, a6
    add a0, a0, a7
    lw t1, 0(sp)
    add a0, a0, t1
    lw t2, 4(sp)
    add a0, a0, t2
    ret
```

`s0` comes out at 55, which is 1 to 10 added up. While `sum10` runs, `sp` is at `0x7FFFEFEC` and the
stack holds:

|      address |    value    | reached as | what it is |
| -----------: | :---------: | ---------- | ---------- |
| `0x7FFFEFEC` | 🟢 00000009 | `0(sp)`    | `i`        |
| `0x7FFFEFF0` |  0000000A   | `4(sp)`    | `j`        |

`jal` pushes nothing, which is why `0(sp)` inside the subroutine is the argument and not a return
address. The catch is that `sp` moves: push anything inside `sum10` and every offset above changes,
and that is what `fp` exists for. `mv fp, sp` at the top of a subroutine gives you a pointer that
stays still while `sp` moves, and then the arguments are at `0(fp)` and `4(fp)` whatever else the
subroutine does. `fp` is `s0`, a saved register, so a subroutine that uses it saves the caller's copy
first.

`a7` is the eighth argument here and the `ecall` service number two lines later, which is the same
register doing two jobs at two moments. Loading the service number after the call is what keeps them
apart.

## Recursion needs nothing new

A subroutine that calls itself gets a fresh frame at a fresh address every time, because every
prologue subtracts from wherever `sp` happens to be. The same `0(sp)` in the source is a different
address in every call.

```riscv|playground|memory
.text
.globl main
main:
    li a0, 5
    jal factorial
    mv s0, a0
    li a7, 10
    ecall

# factorial(n): n in a0, the answer in a0
factorial:
    addi sp, sp, -16
    sw ra, 4(sp)            # this call's return address
    sw a0, 0(sp)            # and its own n
    li t0, 2
    blt a0, t0, base        # if(n < 2) return 1
    addi a0, a0, -1
    jal factorial           # a0 = factorial(n - 1)
    lw t1, 0(sp)            # our n back, since the call destroyed a0
    mul a0, a0, t1          # n * factorial(n - 1)
    j fret
base:
    li a0, 1
fret:
    lw ra, 4(sp)
    addi sp, sp, 16
    ret
```

`s0` comes out at `00000078`, which is 120. At the deepest point, with `a0` down to 1, the stack
holds five frames of sixteen bytes each, of which each uses the first two words:

|      address |    value    | what it is                             |
| -----------: | :---------: | -------------------------------------- |
| `0x7FFFEFAC` | 🟢 00000001 | `n` of the innermost call              |
| `0x7FFFEFB0` |  00400030   | its return address, inside `factorial` |
| `0x7FFFEFBC` |  00000002   | `n` of the call before it              |
| `0x7FFFEFC0` |  00400030   |                                        |
| `0x7FFFEFCC` |  00000003   |                                        |
| `0x7FFFEFD0` |  00400030   |                                        |
| `0x7FFFEFDC` |  00000004   |                                        |
| `0x7FFFEFE0` |  00400030   |                                        |
| `0x7FFFEFEC` |  00000005   | `n` of the first call                  |
| `0x7FFFEFF0` |  00400008   | its return address, inside `main`      |

The eight bytes between one pair and the next are the padding that keeps `sp` a multiple of 16.
Four of the five return addresses are the same `00400030`, the `lw t1, 0(sp)` after the recursive
`jal`, and the outermost one points into `main`. Nothing had to be reserved and nothing had to be
named: the stack pointer chose all ten addresses.

The `lw t1, 0(sp)` after the call is there because `a0` is a caller-saved register and the recursive
call destroyed it. Saving it in the prologue and reloading it afterwards is this subroutine being its
own caller.

The editor's **Call stack** tab lists the calls that are open, which for a run stopped part way
through this program is `factorial` five times over.

## Calling an address

`jalr t0` jumps to the address **in** `t0` and writes the return address into `ra`, which is how a
program calls a function pointer or a routine out of a table. `la t0, triple` and `jalr t0` do what
`jal triple` does, with the address worked out while the program runs.

The full form is `jalr rd, rs, offset`, so `jalr ra, t0, 0` is the same instruction written out, and
`ret` is that form with `zero` as the destination and `ra` as the source. One instruction covers the
call through a pointer, the return and the tail call, which is what happens when you give a machine
`zero` and let it stand in for the operands you did not need.

`call label` is the pseudo-instruction for a subroutine too far away for `jal` to reach, which is
more than a megabyte. It costs two instructions and destroys `t1`, so inside a program you write here
`jal` is the one to use.

## Your turn

Write a subroutine called with `jal` that squares the number in `a0` and leaves the answer in `a0`,
then ends the program. The test starts `a0` at 7, so it comes out at 49.

The answer stays in `a0` through the exit, which is the one place RISC-V is kinder than MIPS: there
the answer and the service number share `$v0`, so an answer left in it is destroyed by the line that
ends the program. Here the service number is in `a7` and `a0` is untouched.

```riscv|playground|exercise
.text
.globl main
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "a0": 7 },
    "expectedRegisters": { "a0": 49 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
.globl main
main:
    jal square
    li a7, 10
    ecall

# square(n): n in a0, the answer in a0
square:
    mul a0, a0, a0
    ret
```

</details>

The second one hands you `doubled`, a leaf, and asks for `quad`, which must call it twice and come
back to `main`. `quad` is not a leaf, so write its prologue and its epilogue too. The test starts
`a0` at 5, so `s0` comes out at 20.

```riscv|playground|memory|exercise
.text
.globl main
main:
    jal quad
    mv s0, a0
    li a7, 10
    ecall

# quad(n): calls doubled twice and returns to main
quad:
    # your code here

# doubled(n): a leaf
doubled:
    add a0, a0, a0
    ret
```

```testcase
{
    "startingRegisters": { "a0": 5 },
    "expectedRegisters": { "s0": 20 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|memory|solution
.text
.globl main
main:
    jal quad
    mv s0, a0
    li a7, 10
    ecall

# quad(n): calls doubled twice and returns to main
quad:
    addi sp, sp, -16
    sw ra, 0(sp)        # the return address into main
    jal doubled
    jal doubled
    lw ra, 0(sp)
    addi sp, sp, 16
    ret

# doubled(n): a leaf
doubled:
    add a0, a0, a0
    ret
```

</details>
