Calling a subroutine means going somewhere and then coming back, and coming back is the hard half:
the code you jump to has to be told where to return, and it can be called from twenty different
places.

MIPS answers with one instruction and one register. `jal label` jumps to the label and, on the way,
writes the address of the instruction **after** the call into `$ra`, register `$31`. `jr $ra` jumps
to whatever address is in `$ra`. Nothing is pushed, nothing is popped, and memory is not touched at
all, which makes a call about as cheap as a jump.

Everything else on this page is the agreement built on top of that: which registers carry arguments
in, which carry answers out, and who is responsible for what when the call returns.

## A subroutine that calls nothing

The agreement in this course is the standard one: arguments arrive in `$a0` to `$a3`, the answer
leaves in `$v0`.

```mips|playground
.text
.globl main
main:
    li $a0, 10              # the argument
    jal triple              # go and come back
    move $s0, $v0
    li $v0, 10
    syscall

# triple(n): n arrives in $a0, the answer leaves in $v0
triple:
    add $v0, $a0, $a0
    add $v0, $v0, $a0
    jr $ra
```

Step through it with your eye on `$ra`. It is 0 to begin with, because nothing has called `main`.
The `jal` sets it to `00400008`, which is the address of the `move` on the line after the call.
Then `jr $ra` puts that address into `pc`, and the next instruction to run is the `move`.

| where you are        | `pc` points at             | `$ra` holds |
| -------------------- | -------------------------- | ----------- |
| before the call      | the `jal` itself           | `00000000`  |
| just after the `jal` | the first line of `triple` | `00400008`  |
| just after the `jr`  | the `move`, at `00400008`  | `00400008`  |

The `li $v0, 10` and `syscall` before `triple:` are what stop the program. Take them out and
execution walks straight into the subroutine, runs it, and hits `jr $ra` with `$ra` still pointing
at the `move`, so it returns to a `move` it already did, and goes round until the Playground gives
up.

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

`$s0` is 20. Now take the two `$ra` lines out and run it again. The second `jal doubled` overwrites
`$ra` with an address inside `quadruple`, so the `jr $ra` at the end returns into the middle of
`quadruple` instead of into `main`, and the program goes round for ever.

The pair of lines at the top that makes room and saves is the **prologue**; the pair at the bottom
that restores and gives the room back is the **epilogue**. A leaf needs neither. Anything that calls
something else needs both.

## Who preserves what

Two people write two subroutines and never speak. One of them calls the other. Which registers is
the called one allowed to scribble on?

Guessing wrong in either direction is expensive: if nobody is allowed to touch anything, every
subroutine saves all 32 registers on entry, and if anybody may touch anything, every caller saves
all 32 before every call. So the convention splits them down the middle.

| registers                                    | who is responsible for keeping them    |
| -------------------------------------------- | -------------------------------------- |
| `$t0` to `$t9`, `$a0` to `$a3`, `$v0`, `$v1` | the **caller**, if it still wants them |
| `$s0` to `$s7`, `$sp`, `$fp`, `$ra`          | the **subroutine**, before it returns  |

The first row is called **caller-saved**, and it means a subroutine may write any `$t` register it
likes without telling anyone. If you are holding something in `$t3` and you make a call, saving it
is your problem.

The second row is **callee-saved**: a subroutine that wants `$s3` for its own working has to put the
caller's `$s3` on the stack on the way in and hand it back untouched on the way out.

That choice is what tells you which bank to use. Anything you need only between two calls goes in a
`$t`; anything that has to survive a call goes in an `$s`, and then you pay for it in your own
prologue.

The rest of the names divide the same way:

- **`$a0` to `$a3`** carry the first four arguments in, and they are caller-saved: once a subroutine
  has read its arguments it may use those four registers as scratch.
- **`$v0` and `$v1`** carry the answer out, `$v0` alone unless the answer needs 64 bits. `$v0` also
  carries the service number into a `syscall`, which is why the number you want back has to be moved
  out of `$v0` before you end a program.
- **`$k0` and `$k1`** are not yours in either direction. They belong to the exception handler, which
  can start running between any two of your instructions and uses them without saving anything, so a
  value left in `$k0` is a value somebody else may overwrite at a moment nobody chose.

```mips|playground|memory
.text
.globl main
main:
    li $t0, 111             # a temporary, ours to lose
    li $s0, 222             # a saved register, ours to keep
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

`$t1` is 999 and `$s1` is 222. `scribble` destroyed the caller's `$t0` and was entitled to. It
destroyed the caller's `$s0` as well, but saved it first and put it back, which is why `main` still
has its 222 afterwards.

The machine enforces none of this. There is no instruction that checks it and no error message when
you get it wrong; what you get instead is a value that was correct a moment ago and is now not. The
reason to follow the standard agreement rather than one of your own is that every other MIPS program
already follows it, including any code you copy in and the handler in the last module of this
course.

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

`$s0` is 21, which is 1 to 6 added up. While `sum6` runs, `$sp` is at `0x7FFFEFF4` and the stack
holds:

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
    blt $a0, $t0, base      # below 2, the answer is just 1
    addi $a0, $a0, -1
    jal factorial           # the answer for n - 1 comes back in $v0
    lw $a0, 0($sp)          # our n back, since the call destroyed $a0
    mul $v0, $v0, $a0       # times our own n
    j fret
base:
    li $v0, 1
fret:
    lw $ra, 4($sp)
    addi $sp, $sp, 8
    jr $ra
```

`$s0` is 120, which is 5 factorial. The interesting part is what the stack looked like on the way
there. At the deepest point, with `$a0` down to 1, five copies of the same two words are stacked up,
eight bytes per call:

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

## Write two subroutines

Write a subroutine called with `jal` that squares the number in `$a0` and leaves the answer in `$v0`,
and a caller that copies that answer into `$s0` before ending the program. The test starts `$a0` at 7.

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
