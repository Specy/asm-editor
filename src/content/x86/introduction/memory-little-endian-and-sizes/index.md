Sixteen registers run out fast. Anything a program keeps for longer than a few instructions, and
anything there is more than sixteen of, lives in memory instead.

## The address space

Memory is one large array of bytes, and an address is a 64 bit number picking one of them out. Your
program gets three regions of it:

| region    | starts at        | holds                                                        |
| --------- | ---------------- | ------------------------------------------------------------ |
| code      | `0x401000`       | the instructions the assembler produced from `section .text` |
| data      | `0x402000`       | `section .data` and then `section .bss`, in that order       |
| the stack | `0x4FFFFFFFFED0` | the stack, growing downwards                                 |

Those three addresses are chosen by the **linker**, the program that takes the assembler's output and
decides where each piece of it goes before the operating system loads it. They stay where they are as
long as the code stays small, which everything in this course does. The memory panel opens on the
stack, because it follows `rsp`. Type an address into its box to look anywhere else.

Reaching memory does not need a separate instruction. `add rax, [total]` reads eight bytes from
`total`, adds them to `rax` and writes `rax`, in one line. The only restriction is that at most one
operand may be in memory, so `add [a], [b]` does not assemble and neither does `mov [a], [b]`.

## Little endian

x86 is little endian: the lowest byte of a number goes at the lowest address. That is easy to state
and surprising to look at, so look at it. Build this one, type `402000` into the memory panel's
address box, and read the bytes.

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
    mov rdi, 0
    syscall
```

The fifteen bytes read

```
88 77 66 55 44 33 22 11   44 33 22 11   22 11   11
```

Every one of the four numbers is stored backwards from the way you wrote it, and every one of them
loads back correctly, because the load undoes exactly what the store did. The order only matters when
you look at the individual bytes, which is what the memory panel does and what a program does when it
reads one byte out of a bigger number.

`q` is at `0x402000`, `d` at `0x402008`, `w` at `0x40200C` and `b` at `0x40200E`. NASM puts each item
directly after the one before it with no gaps, so the addresses are just the sizes added up.

## Unaligned loads

A load from an address that is not a multiple of its own size works here, which is not true
everywhere and is worth knowing.

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
    mov rdi, 0
    syscall
```

`rcx` comes out at `9988776655443322`: eight bytes read starting one byte into the array, with no
complaint from anything. The cost is a little speed, and only when the eight bytes happen to straddle
a **cache line**, the 64 byte block the processor actually fetches memory in. A read inside one line
is one fetch, a read across two lines is two.

`lea rbx, [bytes]` is load effective address, and it is the instruction that says "the address, not
the contents". `mov rbx, [bytes]` would have read the eight bytes there. The square brackets look the
same in both, so it is the mnemonic that decides.

## Say how many bytes you mean

Look at these two lines:

```
    mov rax, [total]        ; eight bytes, because rax is eight bytes
    mov [total], 5          ; how many bytes?
```

In the first one the register settles it. In the second one nothing does. A label is an address and 5
is a number, and neither of them has a width, so the assembler is left guessing. NASM's guess is the
smallest size the number fits in, and 5 fits in one byte.

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
    mov rdi, 0
    syscall
```

The `.bss` section follows `.data`, and with no `.data` here `a` is at `0x402000`. The sixteen bytes
come out as

```
05 FF FF FF FF FF FF FF   07 00 00 00 FF FF FF FF
```

The first write changed one byte out of eight and left seven `FF`s standing, which is almost never
what somebody writing `mov [total], 5` meant. The second write says `dword` and changes four. So:
write the size whenever the other operand is a number. `byte`, `word`, `dword` and `qword` are the
four, for 1, 2, 4 and 8 bytes.

The assembler will tell you when the size it guessed cannot hold the number. Change `mov [rbx], 5` to
`mov [rbx], 5000` and it warns, keeps the low eight bits and writes `88`, which is 5000 with
everything above the first byte thrown away.

The names are historical. A **word** is two bytes because the 8086's registers were two bytes, and
every widening since has kept the name and added a prefix, so a **dword** is a double word and a
**qword** a quadruple one. The `db`, `dw`, `dd` and `dq` directives that put data in memory are named
after the same four.

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
    mov rdi, 0
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
    mov rdi, 0
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
    mov rdi, 0
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
    mov rdi, 0
    syscall
```

</details>
