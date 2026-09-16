# cmp and the conditional jumps

A conditional jump lets a program choose which instructions run. The dependable pattern is:

```x86
    cmp left, right       ; record flags for left - right
    jcc somewhere         ; jump when one condition is true
```

`jcc` is a placeholder for a real condition mnemonic such as `je` or `jl`, not an instruction
spelled literally. `cmp` subtracts only to set flags. It does not store the subtraction result, and
it does not change either operand. The following **conditional jump** reads those flags. If its
condition is true, it puts the target label's address in `rip`. Otherwise execution **falls
through** to the next instruction.

Keep the `cmp` immediately before its conditional jump. An intervening instruction may change one
of the flags that the jump needs. A gap is safe only when you know that every needed flag is
preserved.

## Building an if

Suppose `result` should become 100 when signed `x > y`, and 200 otherwise. Put the true path after
the conditional jump, then jump to the false path when the condition is not true:

```x86|playground|memory
default rel
global _start

section .data
x:      dq 7
y:      dq 12
result: dq 0

section .text
_start:
    mov rax, [x]
    cmp rax, [y]            ; flags for x - y
    jle false_path          ; signed x <= y: skip the true path

    mov qword [result], 100
    jmp if_done

false_path:
    mov qword [result], 200

if_done:
    mov rax, 60
    xor rdi, rdi
    syscall
```

With `x = 7` and `y = 12`, `jle` is taken and the false path stores 200. If you change `x` to 20,
`jle` is not taken. Execution falls through to the true path and stores 100.

The unconditional `jmp if_done` prevents the true path from continuing into the false path. There
is no `}` to stop it. A label only names the address of the instruction that follows it.

The comparison uses `jle` even though the source condition is `x > y`. This inverted jump works
because the true path occupies the fall-through position: jump away when signed `x <= y`, then let
signed `x > y` fall through.

## Choosing the condition

The same fixed-width bit pattern can represent a signed or unsigned integer. `cmp` records enough
flags for either reading; the conditional jump chooses the reading.

These are the comparison conditions used in this lesson:

| relation | jump | flag condition |
| -------- | ---- | -------------- |
| equal | `je` / `jz` | `ZF = 1` |
| not equal | `jne` / `jnz` | `ZF = 0` |
| less, signed | `jl` | `SF != OF` |
| less or equal, signed | `jle` | `ZF = 1` or `SF != OF` |
| greater, signed | `jg` | `ZF = 0` and `SF = OF` |
| greater or equal, signed | `jge` | `SF = OF` |
| below, unsigned | `jb` / `jc` | `CF = 1` |
| below or equal, unsigned | `jbe` | `CF = 1` or `ZF = 1` |
| above, unsigned | `ja` | `CF = 0` and `ZF = 0` |
| above or equal, unsigned | `jae` / `jnc` | `CF = 0` |

Equality has no signed or unsigned version. Equal bit patterns make the hypothetical subtraction
zero, so `cmp` sets `ZF`.

For unsigned order, `CF` records whether `left - right` needed a borrow. A borrow means `left` is
below `right`. `ZF` distinguishes equality for the conditions that include it.

For signed order, the top bit of the subtraction result is not enough by itself because signed
overflow can make that bit misleading. The signed conditions therefore compare `SF` with `OF`.
`left` is less than `right` when those flags differ; `ZF` again adds or excludes equality.

Use **less** and **greater** for signed comparisons, and **below** and **above** for unsigned
comparisons. Temperatures and signed differences use conditions such as `jl` and `jg`. Lengths,
indices, and addresses are normally unsigned, so they use conditions such as `jb` and `ja`.

This difference is visible with `-1` and `1`. As signed qwords, -1 is less than 1, so `jl` would be
taken. As unsigned qwords, the all-ones bit pattern is above 1, so `ja` would be taken after the
same `cmp`.

## Valid `cmp` operands

The operands must have the same width, and the forms used here permit at most one memory operand.
A register makes the width clear:

```x86
    cmp rax, rbx            ; register with register
    cmp rax, [y]            ; register with qword memory
    cmp rax, 0              ; register with an immediate
```

Memory can also be compared directly with an immediate when its width is explicit or otherwise
inferable:

```x86
    cmp qword [x], 0        ; legal: explicit qword width
```

Two memory variables cannot be the two operands of one `cmp`. Load either value into a register
first:

```x86
    mov rax, [x]
    cmp rax, [y]            ; compare x with y
```

## Short-circuiting two conditions

For a logical AND, jump to the false result as soon as either condition is false. This example asks
whether `rax` is strictly between 0 and 100, signed:

```x86|playground
default rel
global _start

section .text
_start:
    mov rax, 42
    xor rbx, rbx            ; answer starts as false

    cmp rax, 0
    jle and_done            ; signed rax <= 0
    cmp rax, 100
    jge and_done            ; signed rax >= 100
    mov rbx, 1              ; both conditions were true

and_done:
    mov rax, 60
    xor rdi, rdi
    syscall
```

If `rax` is -3, the first jump reaches `and_done`, so the second comparison does not run. If it is
500, the first condition passes and the second jump reaches `and_done`. Only values 1 through 99
set `rbx` to 1.

For a logical OR, jump to the true result as soon as either condition is true. This example asks
whether signed `rax < 0` or signed `rax > 100`:

```x86
    xor rbx, rbx            ; answer starts as false

    cmp rax, 0
    jl or_true
    cmp rax, 100
    jg or_true
    jmp or_done

or_true:
    mov rbx, 1

or_done:
```

When the first condition is true, the jump skips the second comparison. That is short-circuit
evaluation expressed directly with control flow.

## A three-way decision

A comparison can also select less, equal, or greater. Test less and greater; if neither jump is
taken, the operands must be equal:

```x86
    cmp rax, rbx
    jl less_path            ; signed rax < rbx
    jg greater_path         ; signed rax > rbx

    mov rdx, 0              ; equal path
    jmp compare_done

less_path:
    mov rdx, -1
    jmp compare_done

greater_path:
    mov rdx, 1

compare_done:
```

Both jumps read the flags from the same `cmp`; `jl` itself does not change them. Keeping each jump
next to the comparison makes the dependency easy to see.

## Your turn

Each pair below contains signed qwords. Leave the larger value from `r8` and `r9` in `rbx`, the
larger from `r10` and `r12` in `rbp`, and the larger from `r13` and `r14` in `r15`.

The three pairs cover left-less, left-greater, and equal inputs. The first pair is also a reminder
that signed -5 is less than 3 even though its qword bit pattern is above 3 when read as unsigned.

```x86|playground|exercise
default rel
global _start

section .text
_start:
    ; your code here

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "startingRegisters": {
        "r8": "-5",
        "r9": 3,
        "r10": 12,
        "r12": "-4",
        "r13": 9,
        "r14": 9
    },
    "expectedRegisters": {
        "rbx": 3,
        "rbp": 12,
        "r15": 9
    }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    mov rbx, r8
    cmp r9, rbx
    jle first_max_done
    mov rbx, r9
first_max_done:

    mov rbp, r10
    cmp r12, rbp
    jle second_max_done
    mov rbp, r12
second_max_done:

    mov r15, r13
    cmp r14, r15
    jle third_max_done
    mov r15, r14
third_max_done:

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>

Now perform three signed three-way comparisons. For each pair, produce -1 when the left value is
less, 0 when the values are equal, and 1 when the left value is greater:

- compare `r8` with `r9` and put the result in `rbx`;
- compare `r10` with `r12` and put the result in `rbp`;
- compare `r13` with `r14` and put the result in `r15`.

```x86|playground|exercise
default rel
global _start

section .text
_start:
    ; your code here

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "startingRegisters": {
        "r8": 4,
        "r9": 9,
        "r10": 14,
        "r12": "-2",
        "r13": 7,
        "r14": 7
    },
    "expectedRegisters": {
        "rbx": "0xFFFFFFFFFFFFFFFF",
        "rbp": 1,
        "r15": 0
    }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    cmp r8, r9
    jl first_less
    jg first_greater
    mov rbx, 0
    jmp first_compare_done
first_less:
    mov rbx, -1
    jmp first_compare_done
first_greater:
    mov rbx, 1
first_compare_done:

    cmp r10, r12
    jl second_less
    jg second_greater
    mov rbp, 0
    jmp second_compare_done
second_less:
    mov rbp, -1
    jmp second_compare_done
second_greater:
    mov rbp, 1
second_compare_done:

    cmp r13, r14
    jl third_less
    jg third_greater
    mov r15, 0
    jmp third_compare_done
third_less:
    mov r15, -1
    jmp third_compare_done
third_greater:
    mov r15, 1
third_compare_done:

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
