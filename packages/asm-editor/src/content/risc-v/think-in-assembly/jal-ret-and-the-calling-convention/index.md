`jal label` makes a call in two steps: it writes the address of the next instruction into `ra`, then
jumps to `label`. `ret` jumps to the address in `ra`, so execution continues immediately after the
call.

The longer spelling of `jal label` is `jal ra, label`. `ret` is a pseudo-instruction for
`jalr zero, ra, 0`: jump to the address in `ra` and discard the new link address. Neither instruction
moves `sp` or accesses memory.

## Align the playground stack before a call

The standard RISC-V calling convention requires `sp` to be a multiple of 16 when a procedure begins
and throughout its execution. The playground starts it at `0x7FFFEFFC`, as the previous lesson
showed. That address is word-aligned, but it is not a multiple of 16.

Each `main` on this page therefore begins with:

```riscv
    addi sp, sp, -12       # 0x7FFFEFFC -> 0x7FFFEFF0
```

Now `sp` is 16-byte aligned before `main` makes a call. After the call, `main` adds 12 to restore the
playground's original stack boundary. In an environment that already supplies an ABI-aligned stack,
this playground setup would be unnecessary. The playground enters `main` directly with its own
unaligned value, so treat the first adjustment as startup setup; the convention-following examples
begin with the calls made after it.

## Pass an argument and return a result

The calling convention lets separately written callers and subroutines agree on where values go.
The first eight arguments use `a0` through `a7`. A one-word result comes back in `a0`.

```riscv|playground
.text
.globl main
main:
    addi sp, sp, -12       # align the playground stack
    li a0, 10              # argument n = 10
    jal triple             # a0 = triple(n)
    mv s0, a0              # keep the result where it is easy to inspect
    addi sp, sp, 12        # restore the playground's initial sp
    j end

# triple(n): n arrives in a0; the result leaves in a0
triple:
    add t0, a0, a0
    add a0, t0, a0
    ret
end:
```

`s0` finishes at 30. Step through the `jal`: `ra` becomes `0040000C`, the address of the `mv` after
the call. The `ret` copies that address into the program counter, and `main` continues there.

`triple` is a **leaf subroutine** because it does not call another subroutine. Its `ra` remains
unchanged between entry and `ret`, so `triple` needs no stack frame.

The `j end` keeps execution from falling through into `triple` after `main` has finished its work.
In this playground, `end` names the address just after the last assembled instruction, and reaching
the end of the program completes the run. The jump is ordinary control flow, not a hardware exit
operation.

## One ra, and two calls that need it

A subroutine that makes a call is a **non-leaf subroutine**. Its own caller's return address arrives
in `ra`, but its inner `jal` replaces `ra` with a new address. The non-leaf subroutine must preserve
the return address it will need later.

```riscv|playground|memory
.text
.globl main
main:
    addi sp, sp, -12       # align the playground stack
    li a0, 5
    jal quadruple
    mv s0, a0
    addi sp, sp, 12
    j end

# quadruple(n): calls doubled twice, so it preserves its own ra
quadruple:
    addi sp, sp, -16       # one aligned stack frame
    sw ra, 0(sp)
    jal doubled
    jal doubled            # the first result is already the next argument
    lw ra, 0(sp)
    addi sp, sp, 16
    ret

# doubled(n): a leaf
doubled:
    add a0, a0, a0
    ret
end:
```

On entry to `quadruple`, `sp` is `0x7FFFEFF0`. Its 16-byte frame lowers `sp` to `0x7FFFEFE0` and
keeps it 16-byte aligned:

|      address |    value    | reached as | use                        |
| -----------: | :---------: | ---------- | -------------------------- |
| `0x7FFFEFE0` | 🟢 0040000C | `0(sp)`    | return address into `main` |
| `0x7FFFEFE4` |  00000000   | `4(sp)`    | unused frame space         |
| `0x7FFFEFE8` |  00000000   | `8(sp)`    | unused frame space         |
| `0x7FFFEFEC` |  00000000   | `12(sp)`   | unused frame space         |

The first two frame instructions are the **prologue**; the final load, stack adjustment and `ret` are
the **epilogue**. After the epilogue, `sp` is back at `0x7FFFEFF0` and `ra` once again points into
`main`. `s0` finishes at 20.

If the save and restore of `ra` are removed, the second `jal doubled` leaves `ra` pointing inside
`quadruple`. Its final `ret` then returns to the epilogue again instead of returning to `main`.

## Who preserves which registers

Calls also need an agreement about ordinary register values. The standard convention divides them
into two groups:

| registers                        | preservation rule                                      |
| -------------------------------- | ------------------------------------------------------ |
| `t0` to `t6`, `a0` to `a7`, `ra` | caller saves a value if it needs that value after call |
| `s0` to `s11`, `sp`              | callee restores any of these registers that it changes |

The first group is **caller-saved**. A caller does not save every register in the group; it saves
only values that must survive the call. Argument registers belong here because a call commonly uses
them for its arguments and result.

The second group is **callee-saved**. A subroutine may use an `s` register, provided it restores the
value that was there when it entered. A returning subroutine must also restore `sp` to its entry
value.

```riscv|playground|memory
.text
.globl main
main:
    addi sp, sp, -12
    li t0, 111             # a caller-saved value
    li s0, 222             # a callee-saved value
    li a0, 3
    jal scribble
    mv t1, t0              # value left by the subroutine
    mv s1, s0              # caller's original value
    addi sp, sp, 12
    j end

# scribble(n): uses t0 freely and borrows s0
scribble:
    addi sp, sp, -16
    sw s0, 0(sp)
    li t0, 999
    li s0, 999
    add a0, a0, a0
    lw s0, 0(sp)
    addi sp, sp, 16
    ret
end:
```

`t1` finishes at 999 because `scribble` may replace `t0`. `s1` finishes at 222 because `scribble`
saves and restores `s0`. This leaf uses a frame to preserve `s0`; it has no reason to save `ra`.

The same caller-saved rule explains the earlier `quadruple` prologue. As the caller of `doubled`,
`quadruple` needs its incoming `ra` after both inner calls, so it stores that value in its frame.

These rules are an agreement followed by software, not behavior enforced by the processor. They let
code that follows the same RISC-V ABI call each other safely.

## Arguments after the eighth

If a call has more than eight arguments, the caller places the remaining arguments on the stack.
Here the caller reserves one aligned 16-byte block for arguments nine and ten:

```riscv|playground|memory
.text
.globl main
main:
    addi sp, sp, -12       # align the playground stack
    li a0, 1
    li a1, 2
    li a2, 3
    li a3, 4
    li a4, 5
    li a5, 6
    li a6, 7
    li a7, 8
    addi sp, sp, -16       # stack arguments, still 16-byte aligned
    li t0, 9
    sw t0, 0(sp)
    li t0, 10
    sw t0, 4(sp)
    jal sum10
    addi sp, sp, 16        # caller releases the argument block
    mv s0, a0
    addi sp, sp, 12
    j end

# sum10(a..j): eight arguments in a0..a7; i at 0(sp), j at 4(sp)
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
end:
```

While `sum10` runs, `sp` is `0x7FFFEFE0`:

|      address |    value    | reached as | argument |
| -----------: | :---------: | ---------- | -------- |
| `0x7FFFEFE0` | 🟢 00000009 | `0(sp)`    | ninth    |
| `0x7FFFEFE4` |  0000000A   | `4(sp)`    | tenth    |

`jal` itself pushes nothing, so the ninth argument really is at `0(sp)` when this leaf begins.
`sum10` returns 55 in `a0`, and `main` copies it to `s0`.

Stack offsets are always measured from the current value of `sp`. If `sum10` reserved a 16-byte
frame, the incoming ninth and tenth arguments would then be at `16(sp)` and `20(sp)` until that
frame was released.

## Recursion uses one frame per call

A recursive subroutine is a non-leaf subroutine that calls itself. Every active call needs its own
return address and its own saved values. Repeating the prologue creates a fresh frame at a lower
address each time.

```riscv|playground|memory
.text
.globl main
main:
    addi sp, sp, -12
    li a0, 5
    jal factorial
    mv s0, a0
    addi sp, sp, 12
    j end

# factorial(n): n arrives in a0; the result leaves in a0
factorial:
    addi sp, sp, -16
    sw ra, 4(sp)           # this call's return address
    sw a0, 0(sp)           # this call's n
    li t0, 2
    blt a0, t0, base       # if n < 2, return 1
    addi a0, a0, -1
    jal factorial          # a0 = factorial(n - 1)
    lw t1, 0(sp)           # recover this call's n
    mul a0, a0, t1
    j finish
base:
    li a0, 1
finish:
    lw ra, 4(sp)
    addi sp, sp, 16
    ret
end:
```

`s0` finishes at `00000078`, or 120. At the deepest point, `a0` is 1 and five calls are active.
Each has a separate 16-byte frame:

|      address |    value    | what it is                            |
| -----------: | :---------: | ------------------------------------- |
| `0x7FFFEFA0` | 🟢 00000001 | `n` of the innermost call             |
| `0x7FFFEFA4` |  00400034   | its return address inside `factorial` |
| `0x7FFFEFB0` |  00000002   | `n` of the preceding call             |
| `0x7FFFEFB4` |  00400034   | its return address                    |
| `0x7FFFEFC0` |  00000003   | `n` of the preceding call             |
| `0x7FFFEFC4` |  00400034   | its return address                    |
| `0x7FFFEFD0` |  00000004   | `n` of the preceding call             |
| `0x7FFFEFD4` |  00400034   | its return address                    |
| `0x7FFFEFE0` |  00000005   | `n` of the first call                 |
| `0x7FFFEFE4` |  0040000C   | return address into `main`            |

The unused eight bytes at the top of each frame make its total size 16 bytes, so every active `sp`
is aligned. Four return addresses are `00400034`, the `lw t1, 0(sp)` after the recursive call. The
outermost return address is different because that call came from `main`.

After a recursive call, `a0` holds its result. The current call reloads its old `n` from the frame
because the inner call was allowed to replace `a0`. On the way back out, every epilogue restores one
`ra` and raises `sp` by 16. The Call stack panel shows the five active `factorial` calls while the
run is stopped at its deepest point.

## Write a leaf subroutine

Keep `main` unchanged and complete `square`. It receives 7 in `a0`, returns 49 in `a0`, and uses
`ret` to continue at the stack-restoring instruction in `main`.

```riscv|playground|exercise
.text
.globl main
main:
    addi sp, sp, -12
    jal square
    addi sp, sp, 12
    j end

# square(n): n arrives in a0; the result leaves in a0
square:
    # your code here
end:
```

```testcase
{
    "startingRegisters": {
        "a0": 7,
        "sp": "0x7FFFEFFC"
    },
    "expectedRegisters": {
        "a0": 49,
        "sp": "0x7FFFEFFC"
    }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
.globl main
main:
    addi sp, sp, -12
    jal square
    addi sp, sp, 12
    j end

# square(n): n arrives in a0; the result leaves in a0
square:
    mul a0, a0, a0
    ret
end:
```

</details>

A final register value cannot reveal which path produced it. Step through your program as well:
`jal` should enter `square`, `ra` should name the following `addi`, and `ret` should take execution
back there.

## Write a non-leaf subroutine

Keep `main` and `doubled` unchanged. Complete `quad` so it calls `doubled` twice, returns to `main`,
and restores both `ra` and `sp`. The starting argument is 5, so `s0` finishes at 20.

```riscv|playground|memory|exercise
.text
.globl main
main:
    addi sp, sp, -12
    jal quad
    mv s0, a0
    addi sp, sp, 12
    j end

# quad(n): call doubled twice and return to main
quad:
    # your code here

# doubled(n): a leaf
doubled:
    add a0, a0, a0
    ret
end:
```

```testcase
{
    "startingRegisters": {
        "a0": 5,
        "sp": "0x7FFFEFFC"
    },
    "expectedRegisters": {
        "s0": 20,
        "sp": "0x7FFFEFFC"
    }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|memory|solution
.text
.globl main
main:
    addi sp, sp, -12
    jal quad
    mv s0, a0
    addi sp, sp, 12
    j end

# quad(n): call doubled twice and return to main
quad:
    addi sp, sp, -16
    sw ra, 0(sp)
    jal doubled
    jal doubled
    lw ra, 0(sp)
    addi sp, sp, 16
    ret

# doubled(n): a leaf
doubled:
    add a0, a0, a0
    ret
end:
```

</details>

The value testcase alone cannot prove that `quad` made both calls or preserved `ra`. Step through it
to verify that structure: each call to `doubled` replaces `ra`, the `lw` recovers the address in
`main`, and the final `ret` uses that recovered address. At the end, `sp` is back at the playground's
starting value.
