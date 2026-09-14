Two numbers in memory, and the larger of the two left in a register. This is an `if` with an `else`,
which in assembly is a comparison, a conditional jump and a label to jump to.

The condition is written the other way round from the C it comes from. C says what to do when the
test passes; the assembly jumps away when it fails, because the instructions straight after the jump
are the "it passed" path.

**You need to know:** the "cmp and the conditional jumps" lecture. What is new here is reading the
second operand of a `cmp` straight out of memory, which x86 allows and a load/store machine does not.

```x86|playground|allow-open
default rel
global _start

section .data
x:      dq 7
y:      dq 12

section .text
_start:
    mov rax, [x]
    cmp rax, [y]            ; x - y, keeping only the flags
    jge .done               ; if (x >= y) the answer is already in rax
    mov rax, [y]
.done:
    mov r8, rax             ; the larger of the two

    mov rax, 60
    xor rdi, rdi
    syscall
```

`r8` comes out at `C`, which is 12. Step through it and watch the flags: `cmp` writes `SF` because
7 minus 12 is negative, `jge` reads `SF` against `OF` and does not jump, so the `mov rax, [y]` runs.

`jge` and not `jae`. These are signed numbers, and the signed and unsigned conditions give different
answers the moment one of them is negative. Change `x` to `dq -1` and the program still answers 12;
change the `jge` to a `jae` as well and it answers -1, because as an unsigned number `-1` is the
largest there is.

`.else` and `.done` begin with a dot, so they belong to `_start`, the last ordinary label above them.
Another subroutine in the same file can have its own `.else` without a clash, which is what saves you
inventing `else_2` and `done_3` across a long program.

The whole thing fits in two instructions with no jump at all:

```
    mov rax, [x]
    cmp rax, [y]
    cmovl rax, [y]          ; take y only when x is less
```

`cmovcc` always runs and only sometimes writes, so the processor never has to guess which way a
branch will go. It cannot replace every branch, because it reads both operands whatever the condition
says, but for picking one of two values it is what a compiler emits.

Try swapping the two numbers so that `x` is 12 and `y` is 7. The jump is taken, the `mov` is skipped
and `r8` still holds the larger.
