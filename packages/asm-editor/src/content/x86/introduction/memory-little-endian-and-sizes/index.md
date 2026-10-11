# Memory, little endian and sizes

Registers are the processor's small working storage, but a program usually has more values than fit
in its sixteen general-purpose register families. **Memory** holds instructions, variables, and
larger collections of data.

Memory is byte-addressed: each byte has a numerical **address**. An x86-64 general-purpose register
can hold an address, and neighboring addresses select neighboring bytes. For example, the byte after
the one at address `0x402000` is at `0x402001`.

## Names for places in memory

Assembly source uses **labels** so that you do not have to program with numeric addresses. A label
ends with a colon and names the address at that point in the program. In this declaration, `value`
names the address of the first byte of an eight-byte value:

```x86
value:  dq 0x1122334455667788
```

The assembler directives used in this lesson describe the program's layout:

| source                 | meaning                                                   |
| ---------------------- | --------------------------------------------------------- |
| `section .text`        | the instructions                                          |
| `section .data`        | bytes with initial values                                 |
| `section .bss`         | space reserved for data, initially filled with zero bytes |
| `db`, `dw`, `dd`, `dq` | put 1, 2, 4, or 8 bytes in `.data`                        |
| `resq 1`               | reserve one 8-byte quantity in `.bss`                     |

These directives tell the assembler how to build the program; the processor does not execute them
as instructions. The names `word`, `dword`, and `qword` mean 2, 4, and 8 bytes. They come from x86's
history: a dword is a double word, and a qword is a quadruple word.

The other setup lines in the examples have small jobs too. `global _start` exposes the `_start`
symbol to the linker as part of the standard runnable-program setup. `default rel` tells NASM to use
relative addressing for label-based memory references such as `[value]`, which is the usual choice
for these programs.

## Reading bytes through an address

Square brackets mean “access memory at this address.” If `total` is a label, `[total]` means the
bytes beginning at the address named `total`:

```x86
    mov rax, [total]        ; read 8 bytes into rax
    add rax, [total]        ; read 8 bytes and add their value to rax
```

The register's width says how many bytes to read. `rax` is eight bytes wide, so both lines access
eight consecutive bytes beginning at `total`. The ordinary two-operand `mov` and arithmetic forms
used here allow one memory operand. For example, `mov rax, [total]` is valid, while
`mov [destination], [source]` is not.

## Little-endian byte order

x86 is **little endian**. For a multi-byte integer, the least-significant byte goes at the lowest
address, the next byte goes at the next address, and so on. The least-significant byte is the
rightmost pair of hexadecimal digits when a number is written normally.

Build this example, then enter `402000` in the memory panel's address box:

```x86|playground|memory|no-flags
default rel
global _start

section .data
q:  dq 0x1122334455667788      ; 8 bytes
d:  dd 0x11223344              ; 4 bytes
w:  dw 0x1122                  ; 2 bytes
b:  db 0x11                    ; 1 byte

section .text
_start:
    mov r12, [q]
    mov ebx, [d]
    mov r9w, [w]
    mov r10b, [b]

    mov rax, 60
    mov rdi, 0
    syscall
```

At successive increasing addresses, the fifteen bytes are:

| address range         | label | bytes from low to high address |
| --------------------- | ----- | ------------------------------ |
| `0x402000`–`0x402007` | `q`   | `88 77 66 55 44 33 22 11`      |
| `0x402008`–`0x40200B` | `d`   | `44 33 22 11`                  |
| `0x40200C`–`0x40200D` | `w`   | `22 11`                        |
| `0x40200E`            | `b`   | `11`                           |

The low byte `0x88` of `q` is at the lowest address, followed by `0x77`, through to the high byte
`0x11`. An eight-byte load from `q` interprets the same sequence using little-endian order, so `r12`
receives `0x1122334455667788`. A one-byte value has only one byte, so there is no ordering choice for
`b`.

The exact addresses in that table belong to this playground. It deliberately gives the small
examples a predictable layout, with their data beginning at `0x402000`, so the bytes are easy to
inspect. A real process can have many mapped regions, and its code, data, and stack may be placed at
different addresses by its tools and operating system. Programs use labels such as `[q]`; they do
not build in an address such as `0x402000`.

## The operand width selects the bytes

A label names a starting address; it does not force every later access to use the size from its
declaration. These three instructions all begin at `value`, while their destination registers select
three different widths:

```x86
    mov r8b, [value]        ; 1 byte:  0x88
    mov ebx, [value]        ; 4 bytes: 0x55667788
    mov r12, [value]        ; 8 bytes: 0x1122334455667788
```

The four-byte load starts with bytes `88 77 66 55` at increasing addresses. Little-endian
interpretation makes their integer value `0x55667788`. As in the previous lesson, writing `ebx`
also clears the upper half of `rbx`.

## Give immediate-to-memory stores a width

A register operand gives NASM a width in a line such as `mov [total], rax`. A numeric immediate does
not. NASM therefore rejects this line because the memory operand's size is unspecified:

```x86
    mov [total], 5          ; assembly error: byte, word, dword, or qword?
```

Write `byte`, `word`, `dword`, or `qword` before the brackets to select 1, 2, 4, or 8 bytes. This
example first fills two reserved qwords with `0xFF` bytes, then performs stores of different widths:

```x86|playground|memory|no-flags
default rel
global _start

section .bss
a:  resq 1
b:  resq 1

section .text
_start:
    mov qword [a], -1
    mov qword [b], -1

    mov byte [a], 5             ; change 1 byte
    mov dword [b], 7            ; change 4 bytes

    mov rax, 60
    mov rdi, 0
    syscall
```

With no `.data` section in this example, the playground places `a` at `0x402000`. The sixteen bytes
beginning there become:

```
05 FF FF FF FF FF FF FF   07 00 00 00 FF FF FF FF
```

The byte store changes only the first byte of `a`. The dword store changes the first four bytes of
`b`; little-endian order places `07` first, followed by three zero bytes.

The chosen width also limits the value that can be stored. For example, `5000 = 0x1388`. In
`mov byte [a], 5000`, the explicit width is one byte, so only the low byte `0x88` can be encoded.
NASM warns that the number overflows the byte field. Use a value that fits the selected width unless
discarding the upper bits is deliberate.

## Your turn

`value` holds the qword `0x1122334455667788`. From the same starting address, load its lowest byte
into `r8b`, its lowest four bytes into `ebx`, and all eight bytes into `r12`. The starting value in
`r8` makes the preserved upper bytes visible after the `r8b` write.

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
    "startingRegisters": { "r8": "0xAABBCCDDEEFFAA00" },
    "expectedRegisters": {
        "r8": "0xAABBCCDDEEFFAA88",
        "rbx": "0x0000000055667788",
        "r12": "0x1122334455667788"
    }
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
    mov r8b, [value]        ; one byte
    mov ebx, [value]        ; four bytes
    mov r12, [value]        ; eight bytes

    mov rax, 60
    mov rdi, 0
    syscall
```

</details>

Now make a partial store. `slot` begins as eight bytes of `0xFF`. Put the word `0x1234` into its
first two bytes and leave the other six unchanged. The resulting bytes should be
`34 12 FF FF FF FF FF FF`.

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
    mov word [slot], 0x1234

    mov rax, 60
    mov rdi, 0
    syscall
```

</details>
