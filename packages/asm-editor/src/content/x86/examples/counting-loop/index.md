This loop fills ten neighboring memory slots with the numbers 1 through 10. Each slot is a qword,
or eight bytes. Watch how the index chooses both the value to store and the slot to receive it.

```x86|playground|memory|allow-open
default rel
global _start

section .bss
numbers: resq 10            ; ten eight-byte slots

section .text
_start:
    xor rcx, rcx            ; index = 0
.fill:
    mov rax, rcx
    inc rax                 ; value = index + 1
    mov [numbers + rcx*8], rax
    inc rcx                 ; next index
    cmp rcx, 10
    jb .fill                ; repeat while unsigned rcx < 10

    mov rax, 60             ; syscall 60: exit
    xor rdi, rdi
    syscall
```

On the first pass, `rcx = 0`, so the program writes 1 at `numbers`. On the second, `rcx = 1`, so
it writes 2 eight bytes later. After the tenth store, `rcx` becomes 10; `cmp` and `jb` then let
execution leave the loop. The index never names a slot past 9.

Run the program, then enter `402000` in the memory panel's **address box**. In this playground,
with only this `.bss` array, `numbers` begins at `0x402000`. The first two qwords should appear as:

```
address       eight bytes, from low address to high address
0x402000      01 00 00 00 00 00 00 00
0x402008      02 00 00 00 00 00 00 00
```

Continue through ten qwords, ending with `0A 00 00 00 00 00 00 00` at `0x402048`. You may need
to move through more than one panel page to see all eighty bytes. The `rax` store writes **all
eight bytes** of each qword. For these small numbers, little-endian order puts the value in the
first byte and seven zero bytes after it. The fixed address helps inspect this particular
playground; the assembly uses the `numbers` label to locate the array.

Three sizes must agree: `resq 10` reserves ten eight-byte slots (80 bytes), `rax` makes each
store eight bytes wide, and `rcx*8` moves the address by one slot for each increase in the index.
For ten dwords instead, use `resd 10`, store from `eax`, and scale the index by 4. That array
would occupy 40 bytes.

If you changed only `resq 10` to `resb 10`, the second eight-byte store would already extend
beyond the ten reserved bytes. The memory panel does not know the array's intended length, so do
not expect a warning or any particular result from writing beyond it.

## Your turn

Fill the same ten qword slots with **10 down to 1**. Keep `rcx` as the index from 0 to 9; make
`rax` equal to `10 - rcx` before each store. After running, check that the first qword begins
`0A 00 00 00 00 00 00 00`, the second begins `09`, and the tenth begins `01`. The array still
occupies 80 bytes. Use **Test** to check all ten values.

```x86|playground|memory|exercise
default rel
global _start

section .bss
numbers: resq 10

section .text
_start:
    xor rcx, rcx
.fill:
    ; Set rax to 10 - rcx, then store it in slot rcx.

    inc rcx
    cmp rcx, 10
    jb .fill

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedMemory": [
        {
            "type": "number-chunk",
            "address": "0x402000",
            "bytes": 8,
            "expected": [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
        }
    ]
}
```

<details>
<summary>Show solution</summary>

```x86|playground|memory|solution
default rel
global _start

section .bss
numbers: resq 10

section .text
_start:
    xor rcx, rcx
.fill:
    mov rax, 10
    sub rax, rcx
    mov [numbers + rcx*8], rax

    inc rcx
    cmp rcx, 10
    jb .fill

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
