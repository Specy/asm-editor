The branching lecture built an `if` with two branches and three jumps. This program is the smaller
shape you will write far more often: one branch, one jump, and no `else` at all.

The trick is to do the work for one of the two answers **before** you ask the question. Load `x` into
`rax` and you have already answered "what if x is the larger". Now the only thing left to handle is
the other case, which takes one conditional jump and one instruction.

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

Step through it. The `cmp` sets `SF`, because 7 minus 12 is negative. `jge` asks whether `SF` and
`OF` agree, finds that they do not, and does not jump, so the `mov rax, [y]` underneath it runs and
`rax` becomes 12. Swap the two numbers in `.data` and the jump is taken instead, the `mov` never runs,
and the answer `rax` was already holding turns out to have been right all along.

`.done` begins with a dot, which makes it local to `_start`, the last ordinary label above it. Another
subroutine in the same file can have a `.done` of its own with no clash, and that is what saves you
inventing `done_2` and `done_3` down a long file.

`jge` and not `jae`, because these are signed numbers. Change `x` to `dq -1` and the program still
answers 12. Change the `jge` to `jae` as well and it answers -1, because read as an unsigned number
`-1` is the largest value a register can hold. Both instructions are correct; only one of them matches
the data.

One more thing this program shows off: `cmp rax, [y]` takes its second operand straight out of memory,
so the comparison costs one instruction instead of a load and then a compare. The other operand still
has to be a register, which is why `mov rax, [x]` on the line above is not optional.
