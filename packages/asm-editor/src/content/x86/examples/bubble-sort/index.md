This program sorts six **signed qwords** into ascending order in the same array. Each pass compares
neighbouring values and swaps them if the left value is greater. After the program runs, `values`
contains **4, 8, 15, 16, 23, 42**.

```x86|playground|memory|allow-open
default rel
global _start

section .data
values: dq 42, 4, 23, 8, 16, 15
COUNT   equ ($ - values) / 8

section .text
_start:
    mov rcx, COUNT
    dec rcx                 ; six elements need at most five passes
.outer:
    xor rbx, rbx            ; start this pass at index 0
.inner:
    mov rax, [values + rbx*8]       ; left qword
    mov rdx, [values + rbx*8 + 8]   ; right qword
    cmp rax, rdx
    jle .ordered                    ; signed: left <= right
    mov [values + rbx*8], rdx       ; put the smaller value on the left
    mov [values + rbx*8 + 8], rax
.ordered:
    inc rbx
    cmp rbx, rcx
    jb .inner
    dec rcx                 ; next pass has one fewer pair to check
    jnz .outer

    mov rax, 60
    xor rdi, rdi
    syscall
```

Open the memory panel at `0x402000` and step through the first pass. `rbx` is the index of the
left qword. Each qword takes eight bytes, so `[values + rbx*8]` reads that qword and
`[values + rbx*8 + 8]` reads its neighbour. The first pass makes five comparisons:

| Pair compared | Array after the comparison |
| ------------- | -------------------------- |
| 42 and 4      | 4, 42, 23, 8, 16, 15       |
| 42 and 23     | 4, 23, 42, 8, 16, 15       |
| 42 and 8      | 4, 23, 8, 42, 16, 15       |
| 42 and 16     | 4, 23, 8, 16, 42, 15       |
| 42 and 15     | 4, 23, 8, 16, 15, 42       |

The largest value has moved to the last slot. That happens after any full pass: the larger value
in each pair ends up on the right, while equal neighbours stay in place. The last slot is settled
after pass one, and the last two slots after pass two. `rcx` starts at 5, so the first pass checks
five pairs (`rbx` from 0 through 4). `dec rcx` reduces the next pass to four pairs, then three,
two, and one: five passes and fifteen comparisons at most. The `.outer` and `.inner` loops both
test at the bottom, so this program assumes **at least two qwords**.

`jle` uses a **signed** comparison for the array values. For example, `-1` belongs before `4`,
although its high bit would make it look large in an unsigned comparison. The `jb` after
`cmp rbx, rcx` instead compares nonnegative indices, so it asks whether another pair remains
in this pass.

## Your turn

Make the sort stop after a pass that made no swaps. Start with the nearly sorted array below.
Use `r8` to count completed passes and `r9` as an ordinary register holding a swap marker; `r9`
is separate from the CPU flags register. At `.outer`, add one to `r8` and clear `r9` to zero.
In the swap path, set `r9` to 1. After the inner loop has checked its last pair, test `r9`:
if it is zero, jump to `.done` **before** `dec rcx`; otherwise keep the existing shrinking-pass
loop. Leave the sorted qwords in `values`.

Use **Test** to check both results: memory contains **1, 2, 3, 4, 5, 6**, and `r8` is
**2**. The first pass swaps 2 and 1; the second makes no swaps and stops the sort. Step
through and watch `r9` change from 1 in the first pass to 0 in the second. Then change the
data to `dq 1, 2, 3, 4, 5, 6` and run again: the already sorted array should finish after
one pass, with `r8` equal to **1**.

```x86|playground|memory|exercise
default rel
global _start

section .data
values: dq 2, 1, 3, 4, 5, 6
COUNT   equ ($ - values) / 8

section .text
_start:
    xor r8, r8             ; completed passes
    mov rcx, COUNT
    dec rcx
.outer:
    ; Count this pass in r8 and clear the swap marker in r9.
    xor rbx, rbx
.inner:
    mov rax, [values + rbx*8]
    mov rdx, [values + rbx*8 + 8]
    cmp rax, rdx
    jle .ordered
    mov [values + rbx*8], rdx
    mov [values + rbx*8 + 8], rax
    ; Mark that a swap happened.
.ordered:
    inc rbx
    cmp rbx, rcx
    jb .inner
    ; If r9 is zero, jump to .done before reducing rcx.
    dec rcx
    jnz .outer
.done:
    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": {
        "r8": 2
    },
    "expectedMemory": [
        {
            "type": "number-chunk",
            "address": "0x402000",
            "bytes": 8,
            "expected": [1, 2, 3, 4, 5, 6]
        }
    ]
}
```

<details>
<summary>Show solution</summary>

```x86|playground|memory|solution
default rel
global _start

section .data
values: dq 2, 1, 3, 4, 5, 6
COUNT   equ ($ - values) / 8

section .text
_start:
    xor r8, r8
    mov rcx, COUNT
    dec rcx
.outer:
    inc r8
    xor r9, r9
    xor rbx, rbx
.inner:
    mov rax, [values + rbx*8]
    mov rdx, [values + rbx*8 + 8]
    cmp rax, rdx
    jle .ordered
    mov [values + rbx*8], rdx
    mov [values + rbx*8 + 8], rax
    mov r9, 1
.ordered:
    inc rbx
    cmp rbx, rcx
    jb .inner
    cmp r9, 0
    je .done
    dec rcx
    jnz .outer
.done:
    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
