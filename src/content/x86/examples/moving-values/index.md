Values in this program begin in three different places. The `10` is written directly in an
instruction; that is an **immediate**. `rax` holds a value in a **register**, and `value` names a
place in **memory**. `mov` can put a value into a register or into memory, depending on its first
operand. Watch where each line gets its value and where it leaves it.

```x86|playground|memory|allow-open
default rel
global _start

section .data
value:  dq 7                ; one eight-byte value in memory

section .text
_start:
    mov rax, 10             ; an immediate into a register
    mov rbx, rax            ; one register into another
    add rbx, 5              ; rbx is now 15

    mov rcx, [value]        ; memory into a register
    imul rcx, rbx           ; 7 * 15 = 105
    mov [value], rcx        ; the answer back into memory

    mov rax, 60             ; syscall 60: exit
    xor rdi, rdi            ; with status 0
    syscall
```

Here `dq 7` reserves eight bytes for `value` and starts them at 7. Square brackets mean “use the
contents at this address”: `mov rcx, [value]` reads 7, and `mov [value], rcx` writes 105. Without
the brackets, a label stands for its address.

Run the program. Then enter `402000` in the **address box** of the memory panel. In this
playground, the data section starts at `0x402000`, so those are the eight bytes belonging to
`value`. They should read `69 00 00 00 00 00 00 00`: `69` is hexadecimal for 105, and x86 keeps
the lowest byte first. In the register panel, `rbx` holds 15 and `rcx` holds 105. `rax` no longer
holds 10 because the exit code put 60 there. The panel shows `3C`, hexadecimal for 60. A register
shows the value most recently written to it.

The two lines that access `value` each have one memory operand. In the ordinary two-operand `mov`
form used here, both operands cannot be memory: `mov [copy], [value]` would fail to assemble.
Load into a register first, then store from that register. The next exercise puts that rule to
work.

## Your turn

Keep `source` at 9. Copy its value into `saved`, then put `source + 5` into `answer`. Use a register
between the memory read and each memory write; you can use another register to keep the original
9 while you add. Before running, predict the three final qwords. After running, check your
prediction in the memory panel starting at `402000`: `source`, `saved`, and `answer` occupy
successive eight-byte slots.

```x86|playground|memory|exercise
default rel
global _start

section .data
source: dq 9
saved:  dq 0
answer: dq 0

section .text
_start:
    ; Load source, save a copy, and store source + 5 in answer.

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
            "expected": [9, 9, 14]
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
source: dq 9
saved:  dq 0
answer: dq 0

section .text
_start:
    mov r8, [source]        ; read 9 from memory
    mov [saved], r8         ; keep a copy of 9
    mov r9, r8              ; make a register copy
    add r9, 5               ; change the copy to 14
    mov [answer], r9        ; store 14

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>

One more experiment with the first program: replace `mov rcx, [value]` with
`lea rcx, [value]`, then run it again. `lea` calculates the address instead of reading the 7
stored there. In this playground `rcx` receives `0x402000`; multiplying that address by 15
writes `0x03C1E000` to `value`. Check the memory panel at `402000`: its first eight bytes are now
`00 E0 C1 03 00 00 00 00`, instead of the earlier `69 00 00 00 00 00 00 00`. Restore `mov` to
make the program work with the value 7 again.
