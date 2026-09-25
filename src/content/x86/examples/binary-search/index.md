Binary search works on a **sorted** array. Each comparison with the middle element rules out
roughly half the remaining positions. Finding one value among a million takes about twenty
halvings. The program assumes the array is sorted; it does not check.

The positions still worth searching form a **half-open range**, `[low, high)`: `low` is included,
but `high` is the first position outside it. `rsi` holds `low`, `rdi` holds `high`, and
`rcx` holds the middle position. Initially the range is `[0, COUNT)`. When `low == high`,
no positions remain.

Run this program with target 23. Its index goes in `r8`, or **-1** if the target is absent.

```x86|playground|memory|allow-open
default rel
global _start

section .data
sorted: dq 4, 8, 15, 16, 23, 42
COUNT   equ ($ - sorted) / 8

section .text
_start:
    mov rdx, 23             ; target
    xor rsi, rsi            ; low = 0
    mov rdi, COUNT          ; high = first position outside the array
    mov r8, -1              ; answer if absent
.search:
    cmp rsi, rdi
    jae .done               ; low >= high: empty range
    mov rcx, rdi
    sub rcx, rsi
    shr rcx, 1
    add rcx, rsi            ; mid = low + (high - low) / 2
    mov rax, [sorted + rcx*8]
    cmp rax, rdx
    je .found
    jl .higher              ; middle value is too small
    mov rdi, rcx            ; keep [low, mid)
    jmp .search
.higher:
    lea rsi, [rcx + 1]      ; keep [mid + 1, high)
    jmp .search
.found:
    mov r8, rcx
.done:
    mov rax, 60
    xor rdi, rdi
    syscall
```

Step through and compare the register panel with this first run. `high = 6` is valid:
6 is just beyond the last array index, 5.

| pass | range    | `rcx` | value | result     |
| ---- | -------- | ----- | ----- | ---------- |
| 1    | `[0, 6)` | 3     | 16    | `low = 4`  |
| 2    | `[4, 6)` | 5     | 42    | `high = 5` |
| 3    | `[4, 5)` | 4     | 23    | `r8 = 4`   |

`[sorted + rcx*8]` reads the middle qword. The array values are **signed**, so
`jl .higher` means the middle value is less than the target. Positions are **unsigned**,
so `jae .done` checks whether `low` has reached `high`. The empty-range check occurs
before the array read.

The middle is `low + (high - low) / 2`. `shr rcx, 1` halves the nonnegative distance
between the bounds. Calculating the distance first avoids adding the bounds together,
which could overflow for a very large array.

Both updates discard a middle position already found to be wrong. If its value is too
large, `high = mid` keeps positions below it. If too small, `low = mid + 1` keeps
positions above it. Either way, the range shrinks.

Try target **3**, below the first value. The ranges go `[0, 6)`, `[0, 3)`,
`[0, 1)`, then `[0, 0)`. At the last comparison, `rcx = 0` and `high`
becomes 0. The next `jae` ends the search with `r8 = -1`. No bound becomes negative.

## Your turn

Replace the two placeholder range updates in `search`. Set `high` to `mid` when the middle
value is too large, or set `low` to `mid + 1` when it is too small. Before
pressing **Test**, predict the answers for 23, 9, and 3. The program saves them in
`r9`, `r10`, and `r12`. The last search checks the index-0 boundary case.

```x86|playground|exercise
default rel
global _start

section .data
sorted: dq 4, 8, 15, 16, 23, 42
COUNT   equ ($ - sorted) / 8

section .text
_start:
    mov rdx, 23
    call search
    mov r9, r8
    mov rdx, 9
    call search
    mov r10, r8
    mov rdx, 3
    call search
    mov r12, r8
    mov rax, 60
    xor rdi, rdi
    syscall

search:
    xor rsi, rsi
    mov rdi, COUNT
    mov r8, -1
.again:
    cmp rsi, rdi
    jae .done
    mov rcx, rdi
    sub rcx, rsi
    shr rcx, 1
    add rcx, rsi
    mov rax, [sorted + rcx*8]
    cmp rax, rdx
    je .found
    jl .higher
    ; Too large: set high to mid.
    mov rdi, rsi            ; replace this placeholder
    jmp .again
.higher:
    ; Too small: set low to mid + 1.
    mov rsi, rdi            ; replace this placeholder
    jmp .again
.found:
    mov r8, rcx
.done:
    ret
```

```testcase
{
    "expectedRegisters": {
        "r9": 4,
        "r10": "0xffffffffffffffff",
        "r12": "0xffffffffffffffff"
    }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .data
sorted: dq 4, 8, 15, 16, 23, 42
COUNT   equ ($ - sorted) / 8

section .text
_start:
    mov rdx, 23
    call search
    mov r9, r8
    mov rdx, 9
    call search
    mov r10, r8
    mov rdx, 3
    call search
    mov r12, r8
    mov rax, 60
    xor rdi, rdi
    syscall

search:
    xor rsi, rsi
    mov rdi, COUNT
    mov r8, -1
.again:
    cmp rsi, rdi
    jae .done
    mov rcx, rdi
    sub rcx, rsi
    shr rcx, 1
    add rcx, rsi
    mov rax, [sorted + rcx*8]
    cmp rax, rdx
    je .found
    jl .higher
    mov rdi, rcx
    jmp .again
.higher:
    lea rsi, [rcx + 1]
    jmp .again
.found:
    mov r8, rcx
.done:
    ret
```

</details>
