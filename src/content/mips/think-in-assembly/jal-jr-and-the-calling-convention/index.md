Calling a subroutine has two parts: jump to its first instruction, then return to the instruction
after the call. MIPS uses `$ra`, register `$31`, to remember where to return.

`jal label` writes the return address into `$ra` and jumps to `label`. `jr $ra` jumps back to that
saved address. In this Playground there are no delay slots, so the address written by `jal` is the
address of the instruction immediately after it.

## A leaf subroutine

Here is a complete call to a subroutine that triples a number:

```mips|playground
.text
.globl main
main:
    li $a0, 10
    jal triple
    move $s0, $v0
    li $v0, 10
    syscall

# triple(n): n arrives in $a0; the result leaves in $v0
triple:
    add $v0, $a0, $a0
    add $v0, $v0, $a0
    jr $ra
```

Before the first call, the editor shows `$ra` as 0. That is the Playground's initial register state;
it does not mean that `main` was called from address 0. When `jal triple` runs, `$ra` changes to the
address of `move $s0, $v0`. The final `jr $ra` returns there.

`triple` is a **leaf subroutine** because it does not call another subroutine. It can leave `$ra`
where `jal` put it.

Leaf does not mean “never needs a stack frame.” A leaf may still need stack space for local data, or
it may need to save a register that it promises to preserve. This particular leaf needs neither, so
it has no frame.

## The course calling convention

The hardware does not know which values are arguments or results. The caller and subroutine need an
agreement about where those values go. For this course and this Playground, use this simplified
calling convention:

| purpose              | location                                        |
| -------------------- | ----------------------------------------------- |
| first four arguments | `$a0` to `$a3`                                  |
| result               | `$v0`, and `$v1` when a second result is needed |
| fifth argument       | `0($sp)`, in space made by the caller           |
| sixth argument       | `4($sp)`, in space made by the caller           |

Every stack frame in this course uses a whole number of 4-byte words, so `$sp` stays word-aligned.
Real MIPS ABIs specify stricter stack alignment and may reserve an argument home area. Code written
for a real operating system must follow that system's ABI rather than this course convention.

## A call inside a subroutine

There is only one `$ra`. If a subroutine executes another `jal`, that instruction replaces the
return address belonging to its caller. The subroutine must save its incoming `$ra` before the inner
call and restore it before returning.

```mips|playground|memory
.text
.globl main
main:
    li $a0, 5
    jal four_times
    move $s0, $v0
    li $v0, 10
    syscall

# four_times(n): calls twice, so it preserves its incoming $ra
four_times:
    addi $sp, $sp, -4
    sw $ra, 0($sp)

    jal doubled
    move $a0, $v0
    jal doubled

    lw $ra, 0($sp)
    addi $sp, $sp, 4
    jr $ra

# doubled(n): a leaf
doubled:
    add $v0, $a0, $a0
    jr $ra
```

The instructions that allocate the frame and save what the routine needs are its **prologue**. The
instructions that restore saved values and return `$sp` to its entry value are its **epilogue**.
Here the frame is one word:

1. `addi $sp, $sp, -4` makes room.
2. `sw $ra, 0($sp)` saves the return address into `main`.
3. The two inner calls may overwrite `$ra`.
4. `lw $ra, 0($sp)` restores the saved address.
5. `addi $sp, $sp, 4` gives back exactly the space that was allocated.

Any routine that executes an inner `jal` must preserve its incoming `$ra`. A routine that changes
`$sp` must restore it exactly before returning. A larger frame can also hold saved registers and
local values, but every path through the routine must use the matching epilogue.

While you step this example, the editor's **Call stack** view can help you see that `main` called
`four_times`, which then called `doubled`. It is a view of active calls made with the Playground's
call instructions; the actual return information is still the value in `$ra` and any copy the
program saved in memory.

## Who preserves each register

Some values are short-lived scratch work. Others need to survive a call. The convention divides
responsibility between the caller and the callee:

| registers                                    | responsibility                                           |
| -------------------------------------------- | -------------------------------------------------------- |
| `$t0` to `$t9`, `$a0` to `$a3`, `$v0`, `$v1` | caller saves a value if it needs that value after a call |
| `$s0` to `$s7`                               | callee restores any of these that it changes             |

The first row is **caller-saved**. A called routine may overwrite those registers. If the caller
still needs a value held there, the caller moves or saves it before `jal`.

The second row is **callee-saved**. A caller can keep a long-lived value in an `$s` register because
every callee must return that register unchanged. The cost is paid by a callee that wants to borrow
an `$s` register: it saves the old value and restores it before returning.

`$ra` has its own rule rather than belonging in either row: a routine preserves its incoming `$ra`
when it will execute an inner `jal`. The stack pointer also has a direct rule: return it to exactly
the value it had when the routine was entered.

This leaf borrows `$s0`, so it needs a frame even though it makes no calls:

```mips|playground|memory
.text
.globl main
main:
    li $s0, 222
    li $a0, 6
    jal twice_plus_one
    move $s1, $s0
    move $s2, $v0
    li $v0, 10
    syscall

# twice_plus_one(n): borrows $s0 and restores the caller's value
twice_plus_one:
    addi $sp, $sp, -4
    sw $s0, 0($sp)
    add $s0, $a0, $a0
    addi $v0, $s0, 1
    lw $s0, 0($sp)
    addi $sp, $sp, 4
    jr $ra
```

After the call, `$s1` is still 222 and `$s2` is 13. The machine does not enforce these promises;
the program works because both sides follow the same convention.

## Arguments after the fourth

The caller places extra arguments in its own stack space. This example passes four register
arguments that the routine ignores, then places a fifth and sixth argument at `0($sp)` and
`4($sp)`. The routine returns `10 * fifth + sixth`, so reversing the two stack arguments changes the
answer.

```mips|playground|memory
.text
.globl main
main:
    li $a0, 0
    li $a1, 0
    li $a2, 0
    li $a3, 0
    li $t0, 4
    li $t1, 7

    addi $sp, $sp, -8
    sw $t0, 0($sp)
    sw $t1, 4($sp)
    jal decimal_pair
    addi $sp, $sp, 8

    move $s0, $v0
    li $v0, 10
    syscall

# decimal_pair(a, b, c, d, e, f): returns 10 * e + f
decimal_pair:
    lw $t0, 0($sp)
    lw $t1, 4($sp)
    sll $v0, $t0, 3
    add $v0, $v0, $t0
    add $v0, $v0, $t0
    add $v0, $v0, $t1
    jr $ra
```

`decimal_pair` is a leaf and makes no frame, so the caller's argument addresses remain `0($sp)` and
`4($sp)` while it runs. If a callee first allocates its own frame, it must account for that change
when loading caller-provided stack arguments. This example stays frameless, so its offsets do not
change.

## Exercise: square two inputs

Write `square`. The caller runs it twice, moving each result out of `$v0`; the first result goes to
`$s0`. The test supplies both inputs, so the solution must compute from the registers rather than
from constants.

```mips|playground|exercise
.text
.globl main
main:
    jal square
    move $s0, $v0

    move $a0, $s2
    jal square
    move $s1, $v0

    li $v0, 10
    syscall

# square(n): n in $a0; result in $v0
square:
    # your code here
```

```testcase
{
    "startingRegisters": { "$a0": -7, "$s2": 12 },
    "expectedRegisters": { "$s0": 49, "$s1": 144 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
.globl main
main:
    jal square
    move $s0, $v0

    move $a0, $s2
    jal square
    move $s1, $v0

    li $v0, 10
    syscall

square:
    mul $v0, $a0, $a0
    jr $ra
```

</details>

## Exercise: repair a non-leaf subroutine

`four_times` calls `doubled` twice, but its frame is missing. Add a prologue and epilogue that
preserve the incoming `$ra` and restore `$sp` exactly. The caller runs the routine with two supplied
inputs; do not replace the calculations with constants.

```mips|playground|memory|exercise
.text
.globl main
main:
    jal four_times
    move $s0, $v0

    move $a0, $s3
    jal four_times
    move $s1, $v0

    li $v0, 10
    syscall

four_times:
    # add the prologue here
    jal doubled
    move $a0, $v0
    jal doubled
    # add the epilogue here

doubled:
    add $v0, $a0, $a0
    jr $ra
```

```testcase
{
    "startingRegisters": {
        "$a0": 7,
        "$s3": -3,
        "$sp": "0x7FFFEFFC"
    },
    "expectedRegisters": {
        "$s0": 28,
        "$s1": -12,
        "$sp": "0x7FFFEFFC"
    }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|memory|solution
.text
.globl main
main:
    jal four_times
    move $s0, $v0

    move $a0, $s3
    jal four_times
    move $s1, $v0

    li $v0, 10
    syscall

four_times:
    addi $sp, $sp, -4
    sw $ra, 0($sp)
    jal doubled
    move $a0, $v0
    jal doubled
    lw $ra, 0($sp)
    addi $sp, $sp, 4
    jr $ra

doubled:
    add $v0, $a0, $a0
    jr $ra
```

</details>

## Exercise: read two stack arguments

Complete `decimal_pair`, which receives its fifth and sixth arguments on the stack and returns
`10 * fifth + sixth`. The caller already allocates and releases the argument space. The test varies
the input registers and also checks that `$sp` returns to its starting value.

```mips|playground|memory|exercise
.text
.globl main
main:
    addi $sp, $sp, -8
    sw $t8, 0($sp)
    sw $t9, 4($sp)
    jal decimal_pair
    addi $sp, $sp, 8

    move $s0, $v0
    li $v0, 10
    syscall

# decimal_pair(a, b, c, d, e, f): returns 10 * e + f
decimal_pair:
    # your code here
```

```testcase
{
    "startingRegisters": {
        "$t8": 6,
        "$t9": 3,
        "$sp": "0x7FFFEFFC"
    },
    "expectedRegisters": {
        "$s0": 63,
        "$sp": "0x7FFFEFFC"
    }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|memory|solution
.text
.globl main
main:
    addi $sp, $sp, -8
    sw $t8, 0($sp)
    sw $t9, 4($sp)
    jal decimal_pair
    addi $sp, $sp, 8

    move $s0, $v0
    li $v0, 10
    syscall

decimal_pair:
    lw $t0, 0($sp)
    lw $t1, 4($sp)
    sll $v0, $t0, 3
    add $v0, $v0, $t0
    add $v0, $v0, $t0
    add $v0, $v0, $t1
    jr $ra
```

</details>
