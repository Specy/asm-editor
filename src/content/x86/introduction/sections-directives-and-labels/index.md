# Sections, directives and labels

The programs in this course already use lines such as `section .text`, `dq`, `default rel`, and
`global _start`. These lines are **directives**: they tell NASM how to assemble the source. They are
not instructions that the processor executes.

This lesson brings those pieces together and adds three useful parts of the standard source layout:
read-only data in `.rodata`, zero-initialized reserved storage in `.bss`, and assembly-time
calculations with `equ`, `$`, and `$$`.

## The four sections used in this course

In the NASM/Linux ELF setup used here, `section` selects an object-file section. Everything that
follows belongs to that section until another `section` directive selects a different one.

| source section    | what it contains                         | initialized payload in the executable | usual memory access |
| ----------------- | ---------------------------------------- | -------------------------------------- | ------------------- |
| `section .text`   | machine instructions                     | yes                                    | read and execute    |
| `section .rodata` | initialized data that code should not change | yes                                | read only           |
| `section .data`   | initialized data that code may change    | yes                                    | read and write      |
| `section .bss`    | reserved storage that starts filled with zero bytes | no                           | read and write      |

These names and protections are conventions implemented by the ELF object metadata and this
course's linker setup; they are not properties that NASM imposes on every possible program format.
Here, `.text` and `.rodata` are normally mapped without write permission. Trying to store into such
a mapping normally causes a protection fault, so the operating system stops the program.

The `.bss` row separates file size from memory use. For example, reserving one megabyte in `.bss`
does not put one megabyte of zero bytes into the executable file. The executable records how much
zero-filled storage is required. That range still reserves virtual address space, and it consumes
memory pages when the program uses it. `.bss` saves initialized payload in the program file; the
storage is not free while the program runs.

The layout can be summarized as:

| part of the program | source of its initial contents |
| ------------------- | ------------------------------ |
| `.text`             | instruction bytes in the file  |
| `.rodata`           | initialized bytes in the file  |
| `.data`             | initialized bytes in the file  |
| `.bss`              | a reserved range supplied as zero-filled memory |

## Emitting initialized data

The directives `db`, `dw`, `dd`, and `dq` emit initialized values. Their names mean **define byte**,
**define word**, **define doubleword**, and **define quadword**.

| directive | unit emitted for each numeric value |
| --------- | -----------------------------------: |
| `db`      | 1 byte                              |
| `dw`      | 2 bytes                             |
| `dd`      | 4 bytes                             |
| `dq`      | 8 bytes                             |

Place them in `.rodata` when the program should only read the values, or in `.data` when it should
also modify them:

```x86
section .rodata
letters: db "hello", 10, 0       ; bytes for hello, newline, and a zero
sizes:   dw 10, 20                ; two words: 4 bytes in total

section .data
counts:  dd 3, 4, 5               ; three dwords: 12 bytes in total
values:  dq 100, 200              ; two qwords: 16 bytes in total
```

A quoted string given to `db` emits one byte per character. NASM does not append a zero terminator:
the final `0` in `letters` is present only because the declaration explicitly includes it.

## Reserving zero-initialized storage

The `.bss` directives `resb`, `resw`, `resd`, and `resq` reserve a count of units. Their names mean
**reserve byte**, **reserve word**, **reserve doubleword**, and **reserve quadword**.

| directive | size of each reserved unit |
| --------- | -------------------------: |
| `resb`    | 1 byte                     |
| `resw`    | 2 bytes                    |
| `resd`    | 4 bytes                    |
| `resq`    | 8 bytes                    |

The operand is a unit count, not a byte count:

```x86
section .bss
buffer: resb 64                    ; 64 bytes
words:  resw 8                     ; 8 words, so 16 bytes
items:  resd 6                     ; 6 dwords, so 24 bytes
slots:  resq 4                     ; 4 qwords, so 32 bytes
```

All four ranges begin filled with zero bytes in this course's Linux environment.

## Labels name addresses

A label names the address of the next byte placed at that point. This is the same idea used in the
earlier memory examples. A **data label** names the address of emitted or reserved bytes:

```x86
section .rodata
message: db "OK", 10

section .bss
result:  resq 1
```

`message` is the address of the `O` byte, and `result` is the address of the first reserved byte. A
label is still only an address: it does not force later memory accesses to use the declaration's
size.

A **code label** names the address of an instruction:

```x86
section .text
_start:
    lea r8, [rel message]
```

Here `_start` names the address of the `lea` instruction, while `message` names the address that
`lea` calculates. This course writes the optional colon after labels so their role is clear.

In the runnable template, this course's linker setup uses `_start` as the program's entry symbol.
`global _start` makes the `_start` definition visible to that linker.

## Assembly-time constants with `equ`

`equ` gives a name to a number that NASM calculates while assembling the program:

```x86
MAX     equ 10
STEP    equ MAX * 2               ; 20
```

An `equ` name is an assembly-time constant. It allocates no bytes and has no addressable storage at
run time. `mov r8, MAX` puts the number 10 in `r8`; `[MAX]` would instead mean a memory access at
numeric address 10, not a variable named `MAX`.

NASM provides two special position values for calculations:

- `$` is the current assembly position, after any bytes already emitted at that point.
- `$$` is the start position of the current section.

Subtracting an earlier label from `$` gives the number of bytes emitted since that label:

```x86
section .rodata
name:       db "asm-editor", 0
NAME_BYTES  equ $ - name          ; 11 bytes, including the terminating zero
USED_BYTES  equ $ - $$            ; bytes used from the start of this section
```

`NAME_BYTES` is 11 because the ten characters and the terminating zero all come before the current
position. If the terminator were omitted, the value would be 10.

The difference `$ - label` is always a byte count. Divide by the element size to count fixed-size
elements:

```x86
section .data
QWORD_SIZE equ 8
nums:      dq 1, 2, 3
COUNT      equ ($ - nums) / QWORD_SIZE
```

The `dq` declaration emits 24 bytes, and each element is 8 bytes, so `COUNT` is 3.

## Putting the layout together

This program uses all four sections. Build it and inspect the registers and memory:

```x86|playground|memory|no-flags
default rel
global _start

MAX         equ 10
STEP        equ MAX * 2
QWORD_SIZE  equ 8

section .rodata
name:       db "asm-editor", 0
NAME_BYTES  equ $ - name

section .data
nums:       dq 1, 2, 3
COUNT       equ ($ - nums) / QWORD_SIZE

section .bss
buffer:     resb 16

section .text
_start:
    mov rax, MAX
    mov rbx, STEP
    mov rcx, NAME_BYTES
    mov rdx, COUNT
    lea rsi, [rel buffer]

    mov rax, 60
    mov rdi, 0
    syscall
```

Before the exit template, `rax` is 10, `rbx` is 20, `rcx` is 11, and `rdx` is 3. `rsi` holds the
address of the 16 zero-filled bytes reserved at `buffer`.

## Your turn

Practice declaring read-only bytes and deriving their length. In `.rodata`, declare `greeting` as
the six bytes for `Hello` followed by a newline, with no zero terminator. Define `GLEN` as
`$ - greeting`. Leave the address of `greeting` in `r8` and `GLEN` in `r9`. The final six bytes must
be `48 65 6C 6C 6F 0A` in hexadecimal.

```x86|playground|memory|exercise
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
    "expectedRegisters": { "r8": "0x402000", "r9": 6 },
    "expectedMemory": [
        {
            "type": "number-chunk",
            "address": "0x402000",
            "bytes": 1,
            "expected": ["0x48", "0x65", "0x6C", "0x6C", "0x6F", "0x0A"]
        }
    ]
}
```

<details>
<summary>Show solution</summary>

```x86|playground|memory|solution
default rel
global _start

section .rodata
greeting:   db "Hello", 10
GLEN        equ $ - greeting

section .text
_start:
    lea r8, [rel greeting]
    mov r9, GLEN

    mov rax, 60
    mov rdi, 0
    syscall
```

</details>

Practice reserving and addressing qwords. Reserve four qwords at `slots` in `.bss`, place 7 in the
third qword, and leave the other three at their initial zero values. Leave the address of `slots` in
`r8`. The four final qwords must be `0, 0, 7, 0`.

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
    "expectedRegisters": { "r8": "0x402000" },
    "expectedMemory": [
        {
            "type": "number-chunk",
            "address": "0x402000",
            "bytes": 8,
            "expected": [0, 0, 7, 0]
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
slots:  resq 4

section .text
_start:
    lea r8, [rel slots]
    mov qword [r8 + 16], 7       ; third qword: two 8-byte elements from slots

    mov rax, 60
    mov rdi, 0
    syscall
```

</details>
