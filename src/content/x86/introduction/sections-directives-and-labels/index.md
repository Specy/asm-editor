Every program so far has opened with `default rel`, `global _start` and a `section` line, and put its
numbers in memory with `dq`. None of those are instructions. They are **directives**, lines addressed
to NASM instead of to the processor, and this lecture is the set of them a program here uses.

## The sections

A program is divided into sections, and `section` opens one. Everything after the line belongs to it
until the next `section` line.

| section           | holds                                | in the file | writable |
| ----------------- | ------------------------------------ | ----------- | -------- |
| `section .text`   | the instructions                     | yes         | no       |
| `section .data`   | data with a starting value           | yes         | yes      |
| `section .rodata` | constants that must never be written | yes         | no       |
| `section .bss`    | space that starts as zeroes          | no          | yes      |

`.bss` is the interesting one: it takes up no room in the program file. A `resb 1000000` costs a
number in a header on disk and a megabyte of zeroed memory once the program is loaded, where
`times 1000000 db 0` in `.data` would be a megabyte of zeroes in the file itself.

Writing to `.text` or `.rodata` ends the program, which the "Interrupts, exceptions and signals"
lecture comes back to. `segment` is the same directive spelled the other way; NASM accepts both.

## Putting data in

`db`, `dw`, `dd` and `dq` write 1, 2, 4 and 8 bytes each, and take a list.

```
values: dq 10, 20, 30, 40           ; four qwords
text:   db "hello", 10, 0           ; five characters, a newline and a terminator
zeroes: times 8 db 0                ; the same line eight times
```

A string in quotes is just a list of bytes, so `db "hi", 0` and `db 'h', 'i', 0` assemble to the same
three bytes. There is no directive that adds a terminator for you, unlike the MIPS and RISC-V
`.asciiz`, so the `0` at the end is yours to write.

`times n` repeats whatever follows it `n` times, which is how you reserve initialised space.

## Reserving space

`resb`, `resw`, `resd` and `resq` reserve room without writing anything, and belong in `.bss`. The
count is in **units**, not bytes, so `resq 4` is four qwords, which is 32 bytes.

```
section .bss
buffer: resb 64                     ; 64 bytes
slots:  resq 4                      ; 4 qwords, so 32 bytes
```

## Naming numbers

`equ` gives a name to a constant. The name is not a variable and takes no memory, the assembler
replaces it with the number wherever it appears.

```
MAX     equ 10
STEP    equ MAX * 2                 ; 20; the assembler does arithmetic
```

`$` is the address of the line it appears on, and `$$` the address the current section started at.
Together with `equ` they let the assembler count things for you:

```
name:   db "asm-editor", 0
NLEN    equ $ - name                ; 11, because $ is the address after the 0
```

That is the standard way to measure a string, and it stays right when you edit the string. Doing it
by hand and forgetting to update the number is how a `write` prints the wrong length.

```x86|playground|no-flags
default rel
global _start

MAX     equ 10
STEP    equ MAX * 2

section .rodata
name:   db "asm-editor", 0
NLEN    equ $ - name

section .data
nums:   dq 1, 2, 3
COUNT   equ ($ - nums) / 8

section .bss
buffer: resb 16

section .text
_start:
    mov rax, MAX                ; 10
    mov rbx, STEP               ; 20
    mov rcx, NLEN               ; 11
    mov rdx, COUNT              ; 3
    lea rsi, [buffer]           ; an address in .bss

    mov rax, 60
    xor rdi, rdi
    syscall
```

`COUNT` is `($ - nums) / 8`, the number of bytes the `dq` line produced divided by the size of one,
so adding a fourth number to the list makes `rdx` 4 without another edit. Try it.

## Labels

A label names the address of whatever comes next. The colon is optional in NASM and this course
always writes it, because a line that is nothing but a mistyped instruction becomes a label without
one.

A label that begins with a **dot** is local to the label above it:

```
compare:
    cmp rax, rbx
    jl .smaller
    mov rcx, 1
    ret
.smaller:                       ; really compare.smaller
    mov rcx, 0
    ret
```

Local labels can repeat: another subroutine can have its own `.smaller` with no clash. That is what
saves you inventing `loop1`, `loop2` and `loop_end_2` names across a long file.

## global and extern

`global _start` says the label `_start` is visible outside this file, which the linker needs because
`_start` is where a Linux program begins. Every program in this course has that line, and a program
without it does not link.

`extern` is the other direction, naming a label that some other file defines. Neither matters until a
program is more than one file, which the editor supports through its file list.

## The preprocessor

NASM has a preprocessor of its own, and every line of it starts with `%`.

```
%define BUFSIZE 64              ; like equ, but expanded as text and reusable
%include "other.asm"            ; paste another file in here
```

`%define` differs from `equ` in when it is expanded, and for a plain number either works. The
[directive page](/documentation/x86/directive) lists the rest, macros included.

## Your turn

Write a string and let the assembler count it. Put `Hello` followed by a newline in `.rodata` at
`greeting`, and an `equ` called `GLEN` holding its length. Leave the address of the string in `r8`
and the length in `r9`. The string is six bytes, five letters and the newline, with no terminator.

```x86|playground|exercise
default rel
global _start

section .rodata
; your data here

section .text
_start:
    ; your code here

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": { "r8": "0x402000", "r9": 6 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .rodata
greeting:   db "Hello", 10
GLEN        equ $ - greeting

section .text
_start:
    lea r8, [greeting]
    mov r9, GLEN

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>

The second one reserves and fills. Reserve four qwords at `slots` in `.bss`, write 7 into the third
of them, and leave the other three as the zeroes `.bss` starts with.

```x86|playground|memory|exercise
default rel
global _start

section .bss
; your data here

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
        { "type": "number-chunk", "address": "0x402000", "bytes": 8, "expected": [0, 0, 7, 0] }
    ]
}
```

<details>
<summary>Show solution</summary>

```x86|playground|memory|solution
default rel
global _start

section .bss
slots:  resq 4

section .text
_start:
    mov qword [slots + 16], 7   ; the third qword, sixteen bytes in

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
