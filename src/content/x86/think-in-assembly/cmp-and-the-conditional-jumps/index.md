A program that always runs its instructions in order can compute one thing. To compute anything that
depends on its input, it has to be able to skip some instructions and run others, and on x86 that
means one idea: an instruction that changes `rip` only when the flags say so.

## A jump writes rip

`jmp label` sets `rip` to the address of `label`, so the next instruction to run is the one there.

A **conditional** jump does the same thing, but only when the flags are in a particular state. There
are sixteen of them, one per condition, and they read flags that some earlier instruction left
behind. Nothing links the two instructions except order:

```
    cmp rax, rbx        ; sets the flags from rax - rbx
    jl smaller          ; goes to smaller when rax < rbx, signed
```

That looseness is worth being careful about. Any instruction between the `cmp` and the `jl` that
writes flags breaks the pair, and the program will still assemble and still run. It will just jump on
the wrong question.

## An if in three pieces

Say you want one of two values in `rax`: 100 when `x` is greater than `y`, and 200 otherwise.

Assembly has no `if`, so you build one out of a comparison, a jump and two labels. The shape is
always the same three pieces: jump away when the test **fails**, do the "it passed" work, jump over
the alternative, and put the alternative under a label.

The inversion in that first piece is the part that catches people. You want to do something when
`x > y`, and the instruction you write is `jle`, less or equal, the opposite. The reason is that the
"it passed" work is going to sit directly after the jump, where it runs when the jump is not taken.
So the jump has to be the one that leaves.

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
    jle .else               ; x is not greater, so go to the other branch

    mov qword [result], 100
    jmp .done
.else:
    mov qword [result], 200
.done:

    mov rax, 60
    xor rdi, rdi
    syscall
```

Type `402010` into the memory panel to see `result`, or set `x` to 20 and watch which branch runs.

The `jmp .done` is easy to forget and the program that forgets it falls straight from the end of one
branch into the beginning of the other, running both. There is no `}` to stop it; the label `.else:`
is a name for an address and nothing more.

`cmp rax, [y]` takes its second operand straight out of memory, which saves a line. The other operand
still has to be a register, which is why `mov rax, [x]` on the line before is not avoidable.

## Which jump to write

| jump          | jumps when                    |
| ------------- | ----------------------------- |
| `je` / `jz`   | equal, or the result was zero |
| `jne` / `jnz` | not equal                     |
| `jl` / `jnge` | less, **signed**              |
| `jle`         | less or equal, signed         |
| `jg` / `jnle` | greater, signed               |
| `jge`         | greater or equal, signed      |
| `jb` / `jc`   | below, **unsigned**           |
| `jbe`         | below or equal, unsigned      |
| `ja`          | above, unsigned               |
| `jae` / `jnc` | above or equal, unsigned      |
| `js` / `jns`  | negative, not negative        |
| `jo` / `jno`  | overflowed, did not           |

Which flags each of those reads, and why the signed ones read two flags instead of one, is worked out
in "The flags register".

The four words are what to remember: **less** and **greater** are the signed pair, **below** and
**above** the unsigned one. A length, an index and an address are unsigned, so a loop over an array
wants `jb`. A temperature or a difference between two measurements is signed and wants `jl`.

`jrcxz` is the odd one out, reading a register rather than the flags and jumping when `rcx` is zero.
Its 16 and 32 bit spellings, `jcxz` and `jecxz`, are build errors in 64 bit mode.

## Two conditions at once

"Is `x` above 0 and below 100" is two comparisons, and the way to write it is to jump away as soon as
either one fails.

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

Set `rax` to 500 and `rbx` stays 0, having failed the second test. Set it to -3 and `rbx` stays 0
again, but this time the second `cmp` never ran at all: the first jump had already decided the
answer. That is **short circuit** evaluation, and in assembly you do not have to ask for it. It falls
out of the fact that a jump means the following instructions do not happen.

"Or" is the same shape with the jumps going the other way, to a label that sets the answer to 1.

## A branch you can avoid

A modern processor does not wait to find out where a conditional jump is going. It guesses, starts
running the instructions down the path it guessed, and keeps the work if the guess was right. That is
**branch prediction**, and it is why branches are nearly free most of the time. When the guess is
wrong the processor has to throw away everything it started and begin again at the right address,
which costs it the equivalent of a dozen or more instructions.

Guesses are right when a branch is predictable, a loop that runs a thousand times and exits once. They
are wrong about half the time when a branch depends on unpredictable data. So for a branch that just
picks one of two values there is a way to write the same thing with no branch at all:

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov rax, 7
    mov rbx, 12

    ; the branching way: rcx = the larger of rax and rbx
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

`cmovg` always runs and only sometimes writes, so there is no path for the processor to guess about.

It cannot replace every branch. `cmov` reads both of its operands whatever the condition turns out to
be, so it cannot guard anything: a `cmov` that loads through a pointer loads through that pointer even
when the condition says the pointer is not valid. A conditional jump protects the instructions after
it, and a `cmov` protects nothing.

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
