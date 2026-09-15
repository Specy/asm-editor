Every program so far has opened with `default rel`, `global _start` and a `section` line, and put its
numbers in memory with `dq`. None of those are instructions. They are **directives**: lines addressed
to NASM rather than to the processor, telling it how to lay the program out before the processor ever
sees it.

## The sections

A program is divided into sections, and `section` opens one. Everything after the line belongs to it
until the next `section` line.

| section           | holds                                | in the file | writable |
| ----------------- | ------------------------------------ | ----------- | -------- |
| `section .text`   | the instructions                     | yes         | no       |
| `section .data`   | data with a starting value           | yes         | yes      |
| `section .rodata` | constants that must never be written | yes         | no       |
| `section .bss`    | space that starts as zeroes          | no          | yes      |

The last row is the interesting one, because of what it costs. Asking for a megabyte of zeroes in
`.data` puts a megabyte of zeroes in the program file, on disk, every one of which has to be read
before the program starts. Asking for the same megabyte in `.bss` puts a single number in a header
saying how much is wanted, and the operating system supplies the zeroes when it loads the program.
For anything you were going to fill in anyway, `.bss` is free.

The two read only sections mean it. A store into `.text` or `.rodata` ends the program rather than
changing anything, which "Interrupts, exceptions and signals" comes back to. `segment` is the same
directive spelled the other way, and NASM accepts both.

## Putting data in

Four directives write bytes straight into the program, 1, 2, 4 and 8 at a time, and each of them takes
a list.

```
values: dq 10, 20, 30, 40           ; four qwords
text:   db "hello", 10, 0           ; five characters, a newline and a terminator
zeroes: times 8 db 0                ; the same line eight times
```

A string in quotes is just a list of bytes, so `db "hi", 0` and `db 'h', 'i', 0` assemble to the same
three bytes. Nothing adds a terminating zero for you: if the code that reads the string expects one,
the `0` at the end is yours to write.

`times n` repeats whatever follows it `n` times, so `times 8 db 0` is eight zero bytes written into
the program file one after another.

## Reserving space

The other four directives reserve room without putting anything in it, and belong in `.bss`. Their
count is in **units** rather than bytes, which is the trap: `resq 4` is four qwords, so 32 bytes, and
somebody who read it as four bytes has an array a quarter the size they think.

```
section .bss
buffer: resb 64                     ; 64 bytes
slots:  resq 4                      ; 4 qwords, so 32 bytes
```

## Naming numbers

A name for a number is not a variable. `equ` makes one, and what it makes exists only while the
program is being assembled: every appearance of the name is replaced by the number, and nothing about
it survives into the running program.

```
MAX     equ 10
STEP    equ MAX * 2                 ; 20; the assembler does arithmetic
```

Two more names the assembler keeps for itself make this useful. `$` is the address of the line it
appears on, and `$$` the address the current section started at, so subtracting one from the other
counts bytes:

```
name:   db "asm-editor", 0
NLEN    equ $ - name                ; 11, because $ is the address after the 0
```

Counting it that way stays right when you edit the string. Counting it by hand and forgetting to
update the number afterwards is how a print ends up cut off halfway or trailing a few bytes of
whatever came next.

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
    mov rdi, 0
    syscall
```

`COUNT` is `($ - nums) / 8`, the number of bytes the `dq` line produced divided by the size of one of
them. Add a fourth number to the `dq` line and `rdx` comes out at 4 with nothing else in the program
touched.

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

Labels are private to the file they are written in unless you say otherwise, which is why every
program here carries a `global _start`. The linker has to be able to find `_start`, because that is
where a Linux program begins, and a program without the line does not link at all.

`extern` is the other direction, naming a label that a different file defines. Neither matters until a
program is more than one file, which the editor supports through its file list.

## The preprocessor

There is a second layer above all of this. NASM has a preprocessor of its own, which runs over the
text of your file before the assembler proper sees any of it, and every one of its lines starts with
a `%`.

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
    mov rdi, 0
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
    mov rdi, 0
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
    mov rdi, 0
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
    mov rdi, 0
    syscall
```

</details>
