Square brackets have been holding a label, a register, or a register and a number. All three are cases
of one formula, and the formula is more capable than anything you have needed so far.

## One formula

Every memory operand you will ever write on x86 looks like this:

```
[ base + index * scale + displacement ]
```

- **base** is any of the sixteen registers.
- **index** is any of them except `rsp`.
- **scale** is 1, 2, 4 or 8, and nothing else.
- **displacement** is a constant added on at the end, written as a label, a number, or a sum of both.

Every part is optional. The processor adds up whatever is there, and the number it arrives at is the
**effective address**, the byte it actually reads or writes.

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
    mov rdi, 0
    syscall
```

Six lines, six forms, and the last two are the ones that earn the formula its keep. `arr` is an array
of qwords, eight bytes each, so element number `rcx` starts at `rbx + rcx * 8`, and the processor does
that multiplication while it works out the address. No shift, no add, no extra register.

The scale is limited to 1, 2, 4 and 8 because those are the sizes of a byte, a word, a dword and a
qword, and indexing an array is what the scale is for. An array of anything else, a twenty byte record
say, needs a real multiplication into a register first.

Getting the scale wrong is quiet rather than loud. Change `mov r12, [rbx + rcx*8]` to `[rbx + rcx*4]`
and the line still assembles and still reads eight bytes, but it reads them from eight bytes into the
array rather than sixteen, so `r12` comes back holding element 1 when you asked for element 2. The
scale has to match the element size, and nothing checks it for you.

## lea does the arithmetic without the memory

`lea` computes an effective address and puts it in a register instead of going to memory. That is how
you get hold of a pointer:

```
    lea rbx, [arr]              ; rbx = the address of arr
    lea rsi, [rbx + rcx*8]      ; rsi = the address of element rcx
```

Since the address unit can multiply by 1, 2, 4 or 8 and then add, `lea` is also a small arithmetic
instruction that happens to write a third register and leave the flags alone:

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
    mov rdi, 0
    syscall
```

None of those four registers holds the address of anything. `rdx` is 35 because `rcx` was used twice
in the same operand, once as the base and once as an index scaled by 4, which adds up to five times
`rcx`. Compilers reach for `lea` constantly for exactly this reason: `add` would have to overwrite
one of its inputs and would disturb the flags, and `lea` does neither.

`[rcx*8]` with no base is a legal form, and so is `[rcx + rcx*4]` with the same register in both
slots. The one thing you cannot write is `rsp` as the index, because the encoding uses that slot to
mean "there is no index here".

## rip relative, and default rel

Here is the payoff for the `default rel` you have typed at the top of every program.

There are two ways to write down where `arr` is. The **absolute** way puts the number `0x402000` into
the instruction. The **rip relative** way puts the _distance_ from the end of this instruction to
`arr` into the instruction, and the processor adds that distance to `rip` when it runs.

Two separate things make the second one the form 64 bit code uses.

**Programs do not always land where the linker put them.** Modern operating systems deliberately load
a program, and each of the libraries it uses, at an address picked at random every single run. The
technique is called **ASLR**, address space layout randomisation, and the point of it is that an
attacker who finds a way to make your program jump to an address of their choosing still has to guess
which address, and guesses wrong. Code written the absolute way stops working the moment it is loaded
somewhere other than the address written into it. Code written the rip relative way does not care: the
distance from an instruction to the data next to it is the same wherever the pair of them ends up.

**An address does not fit in the instruction anyway.** The displacement field in an x86-64 instruction
is 32 bits, and a 64 bit address is not a 32 bit number. The absolute form only works at all because
the linker happens to put everything in this program down in the low part of the address space, where
the top 32 bits are zero. Move the data above the 4GB mark and the absolute form has nowhere to put
the address. A distance, on the other hand, stays small: your code and your data sit next to each
other, so the gap between them fits into 32 bits with room to spare, whatever the addresses themselves
turn out to be.

`default rel` says "square brackets holding a label mean rip relative". Without it NASM assembles the
absolute form, and warns you the first time it does.

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
    mov rdi, 0
    syscall
```

That program has no `default rel`, so the first line takes the absolute form and carries a warning you
can read under the editor. All four lines work: `r8` and `r9` both read 10, `r10` and `r11` both hold
`0x402000`. They work because this program was loaded exactly where the linker said it would be, which
is a promise this simulator makes and a real Linux does not.

The difference between the first two lines is in the bytes of the instructions themselves, and you can
go and look at them. Type `401000` into the memory panel, which is where your code begins. The first
instruction carries the four bytes `00 20 40 00` inside it, which is `0x402000` written little endian.
The second carries a much smaller number in the same place, a few bytes' worth of distance, because
that is all it needs.

One form cannot be rip relative at all. An address with an index register in it, such as
`[arr + rcx*8]`, uses the one slot the encoding has for that purpose, so it is always absolute and
never warns. That is why the arrays earlier in this lecture produced no warning.

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
    mov rdi, 0
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
    mov rdi, 0
    syscall
```

</details>

The second one uses `lea` as arithmetic. Leave `rcx * 9 + 2` in `rdx` using a single `lea` and no
`mul`, `add` or `shl`. The test sets `rcx` to 4, so `rdx` should end at 38. Nine is eight plus one,
and the formula has a slot for each.

```x86|playground|exercise
default rel
global _start

section .text
_start:
    ; your code here

    mov rax, 60
    mov rdi, 0
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
    mov rdi, 0
    syscall
```

</details>
