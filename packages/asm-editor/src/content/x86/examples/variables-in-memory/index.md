`height` and `area` name places in memory. `WIDTH` names a number for the assembler to use. This
program multiplies a height of 5 by a width of 12 and stores the area.

```x86|playground|memory|allow-open
default rel
global _start

WIDTH equ 12               ; a number named during assembly; no storage

section .data
height: dq 5                ; eight bytes, starting at 5
area:   dq 0                ; eight bytes, starting at 0

section .bss
scratch: resq 1             ; eight bytes, starting at 0 when the program loads

section .text
_start:
    mov rax, [height]       ; read 5 from memory
    imul rax, WIDTH         ; multiply by 12
    mov [area], rax         ; store 60 in memory

    mov qword [scratch], 99 ; store the eight-byte value 99 in scratch

    mov rax, 60
    xor rdi, rdi
    syscall
```

Run it, then enter `402000` in the memory panel's address box. In this playground, `height` begins
at `0x402000` and `area` follows eight bytes later. Their first bytes should be `05` and `3C`:
`3C` is hexadecimal for 60. Each is followed by seven `00` bytes because x86 stores the lowest
byte first. `scratch` has its own address in `.bss`; its zeroes are only its **starting** value.
The program replaces them with 99. `WIDTH` has no memory address to inspect. In
`imul rax, WIDTH`, the assembler uses 12 as the instruction's immediate operand.

Both `area: dq 0` and `scratch: resq 1` give the running program eight bytes. The difference is
in the executable file: `dq 0` puts eight initial zero bytes in `.data`, while `.bss` reserves
space that the loader starts at zero without storing those bytes in the file. That can save a lot
of file space for a large buffer.

The `qword` in `mov qword [scratch], 99` says to write an eight-byte value. The address
`[scratch]` and the immediate number `99` do not tell NASM the memory size; if you omit `qword`
here, NASM reports that the operation size is not specified. When storing an immediate into
memory, state the size you intend. In `mov [area], rax`, `rax` already tells NASM the size:
it is a 64-bit register, so that store writes eight bytes.

## Your turn

Complete the program below. Read `height`, multiply it by `WIDTH`, and store the answer in
`area`. Then put 42 in the eight-byte `stamp` variable using an immediate store with an explicit
size. Before running, predict the three qwords. After running, the memory panel at `402000`
should show `height = 7`, `area = 63` (`3F` in its first byte), and `stamp = 42` (`2A` in its
first byte). Use **Test** to check both writes.

```x86|playground|memory|exercise
default rel
global _start

WIDTH equ 9

section .data
height: dq 7
area:   dq 0
stamp:  dq 0

section .text
_start:
    ; Store height * WIDTH in area, then store 42 in the eight-byte stamp.

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
            "expected": [7, 63, 42]
        }
    ]
}
```

<details>
<summary>Show solution</summary>

```x86|playground|memory|solution
default rel
global _start

WIDTH equ 9

section .data
height: dq 7
area:   dq 0
stamp:  dq 0

section .text
_start:
    mov rax, [height]
    imul rax, WIDTH
    mov [area], rax
    mov qword [stamp], 42

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
