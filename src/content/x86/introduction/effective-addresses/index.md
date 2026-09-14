Square brackets have appeared in every program so far, holding a label, a register, or a register and
a number. This lecture is what is actually allowed between them, which is one formula, and what
`default rel` at the top of every program has been doing.

## One formula

x86 has one addressing mode, and every memory operand you will ever write is a case of it:

```
[ base + index * scale + displacement ]
```

- **base** is any of the sixteen registers.
- **index** is any of them except `rsp`.
- **scale** is 1, 2, 4 or 8, and nothing else.
- **displacement** is a constant, which may be a label, a number, or a sum of both.

Every part is optional, and the processor adds up whatever is there before it touches memory. The
answer is called the **effective address**.

```x86|playground|no-flags
default rel
global _start

section .data
arr:    dq 10, 20, 30, 40

section .text
_start:
    lea rbx, [arr]              ; rbx = the address of arr
    mov rcx, 2                  ; an index

    mov r8, [arr]               ; displacement only
    mov r9, [arr + 8]           ; displacement plus a constant
    mov r10, [rbx]              ; base only
    mov r11, [rbx + 8]          ; base plus displacement
    mov r12, [rbx + rcx*8]      ; base plus index times scale
    mov r13, [rbx + rcx*8 + 8]  ; all four at once

    mov rax, 60
    xor rdi, rdi
    syscall
```

`r8` and `r10` both come out at 10, `r9` and `r11` at 20, `r12` at 30 and `r13` at 40.

The scale is what makes the third one read the element you meant. `arr` is an array of qwords, eight
bytes each, so element number `rcx` is at `rbx + rcx * 8`, and the processor does that multiplication
as part of forming the address. On MIPS or RISC-V the same line is a shift, an add and then a load.
That is why the scale is limited to 1, 2, 4 and 8: they are the sizes of a byte, a word, a dword and a
qword, and an array of anything else needs a real multiplication first.

Try changing `mov r12, [rbx + rcx*8]` to `[rbx + rcx*4]` and watch it read the middle of two elements:
`rcx*4` is 8 bytes in, which for qwords is element 1, so `r12` becomes 20.

## lea does the arithmetic without the memory

`lea` computes an effective address and puts it in a register instead of touching memory. It is
usually how you get a pointer:

```
    lea rbx, [arr]              ; rbx = the address of arr
    lea rsi, [rbx + rcx*8]      ; rsi = the address of element rcx
```

Since the address unit can multiply by 1, 2, 4 or 8 and add, `lea` is also a three operand arithmetic
instruction that leaves the flags alone:

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov rcx, 7

    lea rax, [rcx + 1]          ; rax = rcx + 1
    lea rbx, [rcx*8]            ; rbx = rcx * 8
    lea rdx, [rcx + rcx*4]      ; rdx = rcx * 5
    lea rsi, [rcx*8 + 3]        ; rsi = rcx * 8 + 3

    mov rax, 60
    xor rdi, rdi
    syscall
```

`rbx` is 56, `rdx` is 35 and `rsi` is 59, and none of them is an address of anything. Compilers emit
`lea` for exactly this reason: `add` would overwrite one of its operands and would write the flags,
where `lea` writes a third register and leaves the flags as they were.

`[rcx*8]` with no base is a form, and so is `[rcx + rcx*4]`, where the same register is both base and
index. What is not a form is `rsp` as the index: `[rax + rsp*1]` does not assemble, because the
encoding uses that slot to mean "no index".

## rip relative, and default rel

There are two ways to write down where `arr` is.

The **absolute** way puts the address `0x402000` into the instruction as a 32 bit constant. That
works as long as the program is loaded where the linker said it would be.

The **rip relative** way puts the _distance_ from the next instruction to `arr` into the instruction.
The processor adds it to `rip`, so the same bytes reach the right place wherever the program was
loaded. Everything built today is loaded at an address chosen at run time, which is why this is the
form 64 bit code uses.

`default rel` at the top of a file says "square brackets holding a label mean rip relative". Without
it NASM assembles the absolute form and warns on the first one it sees.

```x86|playground|no-flags
global _start

section .data
arr:    dq 10, 20

section .text
_start:
    mov r8, [arr]               ; absolute, and NASM warns about it
    mov r9, [rel arr]           ; rip relative, asked for on this one line
    mov r10, arr                ; the address itself, as an immediate
    lea r11, [rel arr]          ; the address, worked out from rip

    mov rax, 60
    xor rdi, rdi
    syscall
```

That program has no `default rel`, so the first line is the absolute form and carries a warning you
can see under the editor. `r8` and `r9` both read 10 and `r10` and `r11` both hold `0x402000`: the
four lines produce the same two answers out of different bytes.

An address that has an index register in it cannot be rip relative, because the encoding has one slot
and the index is in it. So `[arr + rcx*8]` is absolute whatever `default rel` says, and gets no
warning, which is why the arrays in the last playground did not produce one.

## Your turn

`grid` is four qwords. Using one instruction and one memory operand, read the element at index `rcx`
into `r8`. The test sets `rcx` to 3, so the answer is 40.

```x86|playground|exercise
default rel
global _start

section .data
grid:   dq 10, 20, 30, 40

section .text
_start:
    lea rbx, [grid]
    ; your code here

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "startingRegisters": { "rcx": 3 },
    "expectedRegisters": { "r8": 40 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .data
grid:   dq 10, 20, 30, 40

section .text
_start:
    lea rbx, [grid]
    mov r8, [rbx + rcx*8]       ; base, index, scale 8 for a qword

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>

The second one uses `lea` as arithmetic. Leave `rcx * 9 + 2` in `rdx` using a single `lea` and no
`mul`, `add` or `shl`. The test sets `rcx` to 4, so `rdx` should end at 38.

```x86|playground|exercise
default rel
global _start

section .text
_start:
    ; your code here

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "startingRegisters": { "rcx": 4 },
    "expectedRegisters": { "rdx": 38 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    lea rdx, [rcx + rcx*8 + 2]  ; rcx once as the base, eight times as the index

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
