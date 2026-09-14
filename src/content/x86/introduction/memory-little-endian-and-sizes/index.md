The registers hold sixteen numbers. Everything else a program works with is in memory, and this
lecture is how x86 reaches it: what an address is here, which way round a number is stored, and the
word you have to write when nothing else in the line says how many bytes you meant.

## The address space

Memory is one large array of bytes, and an address is a 64 bit number. Nothing today has anything
like `2^64` bytes of anything, so processors implement the low 48 bits and require the top 16 to be a
copy of bit 47, which is what a manual means by a **canonical** address. The practical reading is
that addresses are 48 bits and come in two clumps, one at the bottom of the space and one at the top.

A program in this editor uses three regions of it:

| region    | starts at        | holds                                                        |
| --------- | ---------------- | ------------------------------------------------------------ |
| code      | `0x401000`       | the instructions the assembler produced from `section .text` |
| data      | `0x402000`       | `section .data` and then `section .bss`, in that order       |
| the stack | `0x4FFFFFFFFED0` | the stack, growing downwards                                 |

Those addresses are the linker's doing, not the processor's, and they stay put as long as your code
is under one page, which everything in this course is. The memory panel opens on the stack,
because it follows `rsp`; type an address into its box to look anywhere else.

Unlike MIPS and RISC-V, x86 does **not** need a load before it can work on memory. `add rax, [total]`
reads eight bytes from `total`, adds them to `rax` and writes `rax`, all in one instruction. The rule
is that at most one operand may be in memory, so `add [a], [b]` does not assemble and `mov [a], [b]`
does not either.

## Little endian

x86 is little endian: the lowest byte of a number goes at the lowest address. Build this one, type
`402000` into the memory panel's address box, and read the bytes.

```x86|playground|memory|no-flags
default rel
global _start

section .data
q:  dq 0x1122334455667788      ; 8 bytes
d:  dd 0x11223344              ; 4
w:  dw 0x1122                  ; 2
b:  db 0x11                    ; 1

section .text
_start:
    mov rax, [q]
    mov ebx, [d]
    mov cx, [w]
    mov r10b, [b]

    mov rax, 60
    xor rdi, rdi
    syscall
```

The fifteen bytes read

```
88 77 66 55 44 33 22 11   44 33 22 11   22 11   11
```

Every one of the four numbers is stored backwards from the way you wrote it, and every one of them
loads back correctly, because the load reverses what the store did. The order only becomes visible
when you look at the bytes, which is exactly what the memory panel does.

`q` is at `0x402000`, `d` at `0x402008`, `w` at `0x40200C` and `b` at `0x40200E`. NASM puts each item
directly after the one before it and does not insert padding to make things line up, which the MIPS
and RISC-V assemblers do for you. Nothing here needs it, because x86 does not care about alignment.

## Unaligned loads

A load from an address that is not a multiple of the size works.

```x86|playground|no-flags
default rel
global _start

section .data
bytes:  db 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xAA, 0xBB, 0xCC

section .text
_start:
    lea rbx, [bytes]
    mov rax, [rbx]              ; the eight bytes from 0x402000
    mov rcx, [rbx + 1]          ; the eight from 0x402001
    mov rdx, [rbx + 3]          ; and from 0x402003

    mov rax, 60
    xor rdi, rdi
    syscall
```

`rcx` comes out at `9988776655443322` and `rdx` at `BBAA998877665544`, each one eight bytes read
starting wherever it was told to start. On MIPS the same load faults, and on ARM it used to. Here it
is an ordinary instruction that happens to be a little slower when it straddles a cache line.

`lea rbx, [bytes]` is load effective address: it puts the **address** of `bytes` into `rbx` without
reading anything. `mov rbx, [bytes]` would read the eight bytes there instead. The square brackets
mean memory in both, and `lea` is the instruction that says "the address, not the contents".

## Say how many bytes you mean

Look at these two lines:

```
    mov rax, [total]        ; eight bytes, because rax is eight bytes
    mov [total], 5          ; how many bytes?
```

In the first one, the register says the size. In the second one nothing does, and the assembler has
to guess. NASM's guess is the smallest size the number fits in, which for a small number is one byte.

```x86|playground|memory|no-flags
default rel
global _start

section .bss
a:  resq 1                      ; eight bytes of zero
b:  resq 1

section .text
_start:
    lea rbx, [a]
    mov qword [rbx], 0xFFFFFFFFFFFFFFFF     ; fill both so the writes show up
    mov qword [rbx + 8], 0xFFFFFFFFFFFFFFFF

    mov [rbx], 5                ; one byte, which is not what it looks like
    mov dword [rbx + 8], 7      ; four bytes, because the line says so

    mov rax, 60
    xor rdi, rdi
    syscall
```

The `.bss` section follows `.data`, and with no `.data` here `a` is at `0x402000`. The sixteen bytes
come out as

```
05 FF FF FF FF FF FF FF   07 00 00 00 FF FF FF FF
```

`mov [rbx], 5` changed one byte and left seven. `mov dword [rbx + 8], 7` changed four and left four.
Write the size whenever the other operand is a number: `byte`, `word`, `dword` and `qword` are the
four, for 1, 2, 4 and 8 bytes.

The names are historical. A **word** is two bytes because the 8086's registers were two bytes, and
every widening since has kept the name and added a prefix, so a **dword** is a double word and a
**qword** a quadruple one. The `db`, `dw`, `dd` and `dq` directives that put data in memory are named
after the same four.

Try changing `mov [rbx], 5` to `mov [rbx], 5000`. The assembler warns that a byte cannot hold 5000,
keeps the low eight bits and writes `88`.

## Your turn

`value` holds the qword `0x1122334455667788`. Load its lowest byte into `al`, its lowest four bytes
into `ebx`, and the whole thing into `rcx`.

```x86|playground|exercise
default rel
global _start

section .data
value:  dq 0x1122334455667788

section .text
_start:
    ; your code here

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": { "rbx": "0x55667788", "rcx": "0x1122334455667788" }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .data
value:  dq 0x1122334455667788

section .text
_start:
    mov al, [value]         ; one byte
    mov ebx, [value]        ; four
    mov rcx, [value]        ; eight

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>

The second one writes. `slot` is eight bytes of `0xFF`. Put the word `0x1234` into its first two
bytes and leave the other six alone, so the eight read `34 12 FF FF FF FF FF FF`.

```x86|playground|memory|exercise
default rel
global _start

section .data
slot:   dq 0xFFFFFFFFFFFFFFFF

section .text
_start:
    ; your code here

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedMemory": [
        { "type": "number-chunk", "address": "0x402000", "bytes": 8, "expected": ["0xFFFFFFFFFFFF1234"] }
    ]
}
```

<details>
<summary>Show solution</summary>

```x86|playground|memory|solution
default rel
global _start

section .data
slot:   dq 0xFFFFFFFFFFFFFFFF

section .text
_start:
    mov word [slot], 0x1234     ; two bytes, and the size says so

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
