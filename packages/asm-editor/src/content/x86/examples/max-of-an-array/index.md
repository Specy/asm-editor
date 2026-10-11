To find the largest element, keep the best value seen so far in `r8`. Start with the first
element, then compare each remaining element with it. This program assumes the array contains
at least one qword.

```x86|playground|memory|allow-open
default rel
global _start

section .data
numbers:    dq 4, 42, 15, 16, 23, 8
COUNT       equ ($ - numbers) / 8

section .text
_start:
    mov r8, [numbers]       ; first element is the best so far
    mov rcx, 1              ; start at the second element
.next:
    cmp rcx, COUNT
    jae .done               ; no element at this index: leave the loop
    mov rax, [numbers + rcx*8]
    cmp rax, r8
    jle .skip               ; signed: keep r8 if this element is not greater
    mov r8, rax             ; replace the best so far
.skip:
    inc rcx
    jmp .next
.done:

    mov rax, 60
    xor rdi, rdi
    syscall
```

On the first pass, `r8 = 4` and `rcx = 1`. The address `numbers + rcx*8` points to the
second qword, 42. Since signed 42 is greater than 4, `jle` does not jump, and `mov r8, rax`
replaces the best so far with 42. The later elements do not exceed it, so `r8` still holds
**42** when the loop ends. Run the program and check `r8` in the register panel.

`COUNT` is 6: `$ - numbers` is the array's size in bytes at assembly time, and dividing by
8 converts that size to a number of qwords. Because the first element is already in `r8`,
the loop begins at index 1. At `.next`, `jae .done` skips the load whenever `rcx` has
reached `COUNT`. After index 5, `rcx` becomes 6 and the loop ends. With just one qword,
`COUNT` is 1, so the first check leaves that qword in `r8` without reading a second one.

The two conditional jumps interpret their comparisons differently. `jle` compares the
**signed values** stored in the array, including possible negative values. `jae` compares
the **unsigned index** with the count; in this loop, `rcx` starts at 1 and only increases.
Change 42 to -42 in the program: the largest signed value becomes 23. If you also change
`jle` to the unsigned `jbe`, the bit pattern for -42 is treated as a very large unsigned
value, and the program keeps -42 instead. Restore `jle` before continuing.

Starting `r8` at zero would fail for an all-negative array: zero is not one of its elements,
yet none of them would replace it. Loading the first element gives the loop a real candidate.

## Your turn

Write the maximum loop for the five qwords below. Leave the largest **signed** value in `r8`
before the exit code runs. Initialize `r8` from the first element and start `rcx` at 1. At
the top of the loop, leave it if `rcx` has reached `COUNT`. Otherwise, load the qword at
index `rcx`, replace `r8` only if that value is greater, then advance the index and repeat.
The first value is negative, so this list also checks whether you chose the signed jump for
the values.

Before running, predict the result. Use **Test** to check that `r8` is **14**; then inspect
`r8` in the register panel.

```x86|playground|memory|exercise
default rel
global _start

section .data
numbers:    dq -9, 6, -2, 14, -30
COUNT       equ ($ - numbers) / 8

section .text
_start:
    ; Find the largest signed element and leave it in r8.

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": {
        "r8": 14
    }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|memory|solution
default rel
global _start

section .data
numbers:    dq -9, 6, -2, 14, -30
COUNT       equ ($ - numbers) / 8

section .text
_start:
    mov r8, [numbers]
    mov rcx, 1
.next:
    cmp rcx, COUNT
    jae .done
    mov rax, [numbers + rcx*8]
    cmp rax, r8
    jle .skip
    mov r8, rax
.skip:
    inc rcx
    jmp .next
.done:

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
