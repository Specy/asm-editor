The flags lecture set `ZF` and read it with `setcc`. This one uses the same flags to change where the
program goes next, which is how an `if` in C becomes assembly.

## A jump writes rip

`jmp label` sets `rip` to the address of `label`, so the next instruction is the one there. That is
the whole of an unconditional jump.

A **conditional** jump does the same thing only when the flags say so. There are sixteen of them, one
per condition, and they read the flags some earlier instruction left behind. Nothing connects them
except order: `cmp` writes the flags, `jl` reads them, and any instruction between the two that
writes flags breaks the pair.

```
    cmp rax, rbx        ; sets the flags from rax - rbx
    jl smaller          ; goes to smaller when rax < rbx, signed
```

## An if in three pieces

In C:

```c
if (x > y) {
    result = 100;
} else {
    result = 200;
}
```

Flattened into gotos, which is what assembly can express:

```c
    if (x <= y) goto else_part;
    result = 100;
    goto done;
else_part:
    result = 200;
done:
```

The condition is **inverted**. The C source says what to do when the test passes; the assembly jumps
away when it fails, because the code that follows the branch is the "it passed" path.

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
    cmp rax, [y]            ; x - y, and only the flags are kept
    jle .else               ; if (x <= y) goto else

    mov qword [result], 100
    jmp .done
.else:
    mov qword [result], 200
.done:

    mov rax, 60
    xor rdi, rdi
    syscall
```

`result` comes out at 200, because 7 is not greater than 12. Type `402010` into the memory panel to
see it, or change `x` to 20 and watch it become 100.

`cmp rax, [y]` reads memory as its second operand, which x86 allows and a load/store architecture
would not. The other operand has to be a register, so `mov rax, [x]` on the line before is not
avoidable.

## Which jump to write

Sixteen conditions, in the pairs you will use:

| jump          | jumps when                    | reads                        |
| ------------- | ----------------------------- | ---------------------------- |
| `je` / `jz`   | equal, or the result was zero | `ZF = 1`                     |
| `jne` / `jnz` | not equal                     | `ZF = 0`                     |
| `jl` / `jnge` | less, **signed**              | `SF` is not `OF`             |
| `jle`         | less or equal, signed         | `ZF = 1` or `SF` is not `OF` |
| `jg` / `jnle` | greater, signed               | `ZF = 0` and `SF = OF`       |
| `jge`         | greater or equal, signed      | `SF = OF`                    |
| `jb` / `jc`   | below, **unsigned**           | `CF = 1`                     |
| `jbe`         | below or equal, unsigned      | `CF = 1` or `ZF = 1`         |
| `ja`          | above, unsigned               | `CF = 0` and `ZF = 0`        |
| `jae` / `jnc` | above or equal, unsigned      | `CF = 0`                     |
| `js` / `jns`  | negative, not negative        | `SF`                         |
| `jo` / `jno`  | overflowed, did not           | `OF`                         |

The four words are the ones to remember: **less** and **greater** are the signed pair, **below** and
**above** the unsigned one. A length, an index and an address are unsigned, so a loop over an array
wants `jb`; a temperature or a difference is signed and wants `jl`.

`jrcxz` is the one that reads a register instead of the flags, jumping when `rcx` is zero. Its 16
and 32 bit spellings, `jcxz` and `jecxz`, are build errors in 64 bit mode.

## Two conditions

C's `&&` and `||` become two jumps. `if (x > 0 && x < 100)` is "jump away if either test fails":

```x86|playground
default rel
global _start

section .text
_start:
    mov rax, 42             ; the value being tested
    xor rbx, rbx            ; the answer, 0 until proved otherwise

    cmp rax, 0
    jle .no                 ; fails the first test
    cmp rax, 100
    jge .no                 ; fails the second
    mov rbx, 1              ; both passed
.no:

    mov rax, 60
    xor rdi, rdi
    syscall
```

`rbx` comes out at 1. Try `mov rax, 500` and it stays 0, and try `mov rax, -3` and it stays 0 as
well, having failed at the first `cmp` instead of the second. This is what a C compiler means by
short circuit evaluation: the second test is not even reached when the first one decides the answer.

`||` is the same shape with the jumps going the other way, to a label that sets the answer to 1.

## A branch you can avoid

A conditional jump the processor guesses wrong costs it the work it had already started on the wrong
path. For a branch that just picks one of two values there are two ways to write the same thing
without a jump at all:

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov rax, 7
    mov rbx, 12

    ; the branching way: rcx = max(rax, rbx)
    mov rcx, rax
    cmp rbx, rcx
    jle .keep
    mov rcx, rbx
.keep:

    ; the branchless way, same answer
    mov rdx, rax
    cmp rbx, rdx
    cmovg rdx, rbx          ; move only if rbx was greater

    mov rax, 60
    xor rdi, rdi
    syscall
```

`rcx` and `rdx` both come out at 12. `cmovg` always runs, and only sometimes writes.

The catch is that `cmov` reads both operands whatever the condition says, so it cannot replace a
branch that is guarding something, such as a load through a pointer that might be null. A `jcc`
protects the instructions after it; a `cmov` does not protect anything.

## Your turn

`rax` and `rbx` hold two numbers. Leave the larger of the two, read as **signed**, in `rcx`. The test
gives -5 and 3, so the answer is 3.

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
    "startingRegisters": { "rax": "-5", "rbx": 3 },
    "expectedRegisters": { "rcx": 3 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    mov rcx, rax        ; assume rax is the larger
    cmp rbx, rcx
    jle .done           ; and it is, unless rbx is bigger
    mov rcx, rbx
.done:

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>

The second one is a three way comparison. Leave -1 in `rdx` if `rax` is less than `rbx`, 0 if they
are equal and 1 if `rax` is greater, all signed. The test gives 9 and 9, so the answer is 0, and
`rdx` starts at `0xFF` so that leaving it alone is not an answer.

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
    "startingRegisters": { "rax": 9, "rbx": 9, "rdx": "0xFF" },
    "expectedRegisters": { "rdx": 0 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    cmp rax, rbx
    jl .less
    jg .greater
    xor rdx, rdx            ; equal
    jmp .done
.less:
    mov rdx, -1
    jmp .done
.greater:
    mov rdx, 1
.done:

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
