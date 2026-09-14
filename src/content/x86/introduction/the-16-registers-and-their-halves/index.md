"Getting started with x86" named the sixteen registers and said each of them answers to four names.
This lecture is what those names are, which instructions reach for a register without being told to,
and the one rule about widths that catches everybody.

## The sixteen

| register      | name it came from | what it is used for by convention                                           |
| ------------- | ----------------- | --------------------------------------------------------------------------- |
| `rax`         | accumulator       | results, the number of a syscall, the answer it returns                     |
| `rbx`         | base              | anything; a subroutine has to put it back before it returns                 |
| `rcx`         | counter           | the count of `loop` and of the repeated string operations, the shift amount |
| `rdx`         | data              | the high half of a multiplication and the top of a division                 |
| `rsi`         | source index      | the source of a string operation, the second argument of a call             |
| `rdi`         | destination index | the destination of a string operation, the first argument of a call         |
| `rbp`         | base pointer      | the bottom of the current stack frame                                       |
| `rsp`         | stack pointer     | the top of the stack, and nothing else                                      |
| `r8` to `r15` | nothing           | anything                                                                    |

The first eight names are the ones the 8086 had in 1978, and the jobs in the third column are mostly
that old too. `r8` to `r15` arrived with the 64 bit extension in 2003 and were given no personality
at all.

The conventions are conventions, with two exceptions the hardware really does enforce: `rsp` is moved
by `push`, `pop`, `call` and `ret` whether you like it or not, and a handful of instructions read and
write `rax`, `rdx` and `rcx` by name without those registers appearing in the line. Everything else
is a habit that the calling convention writes down, which is the "call, ret and the System V
convention" lecture.

## Four names, one register

Each register has a 64 bit name, a 32 bit name, a 16 bit name and an 8 bit name for its lowest byte.
The first four also have a name for their _second_ byte, left over from the 8086, where `ax` was a
pair of byte registers.

| 64    | 32    | 16    | low 8 | second byte |
| ----- | ----- | ----- | ----- | ----------- |
| `rax` | `eax` | `ax`  | `al`  | `ah`        |
| `rbx` | `ebx` | `bx`  | `bl`  | `bh`        |
| `rcx` | `ecx` | `cx`  | `cl`  | `ch`        |
| `rdx` | `edx` | `dx`  | `dl`  | `dh`        |
| `rsi` | `esi` | `si`  | `sil` |             |
| `rdi` | `edi` | `di`  | `dil` |             |
| `rbp` | `ebp` | `bp`  | `bpl` |             |
| `rsp` | `esp` | `sp`  | `spl` |             |
| `r8`  | `r8d` | `r8w` | `r8b` |             |

Reading one of these reads that many bits out of the one register.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov rax, 0x1122334455667788
    mov bl, al                  ; the lowest byte
    mov cl, ah                  ; the one above it
    mov r10w, ax                ; the lowest two bytes
    mov r11d, eax               ; the lowest four
    mov r12, rax                ; all eight

    mov rax, 60
    xor rdi, rdi
    syscall
```

`rbx` comes out at `88`, `rcx` at `77`, `r10` at `7788`, `r11` at `55667788` and `r12` at the whole
thing. Nothing copied a register here, every line read a different width of the same one.

`ah` is the odd one. It cannot be named in an instruction that also names `r8` to `r15` or their
halves, because the byte that makes those registers reachable is the same byte that would say `ah`.
`mov r9b, ah` is a build error, `mov cl, ah` is fine, and that is a rule of the encoding rather than
of the assembler.

## Writing 32 bits clears the top

Writing to `al`, `ah` or `ax` leaves the rest of the register alone. Writing to `eax` sets the top 32
bits to zero.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov r8, 0xFFFFFFFFFFFFFFFF
    mov r9, 0xFFFFFFFFFFFFFFFF
    mov r10, 0xFFFFFFFFFFFFFFFF

    mov r8b, 0                  ; 8 bits written, 56 left alone
    mov r9w, 0                  ; 16 written, 48 left alone
    mov r10d, 0                 ; 32 written, and the other 32 cleared

    mov rax, 60
    xor rdi, rdi
    syscall
```

`r8` ends at `FFFFFFFFFFFFFF00`, `r9` at `FFFFFFFFFFFF0000`, and `r10` at zero.

The rule exists because most 64 bit programs are doing 32 bit arithmetic, and a 32 bit instruction is
one byte shorter than the 64 bit one that does the same thing. Zeroing rather than preserving lets
the processor treat the result as a fresh value that does not depend on what was in the register
before, which is worth more than the compatibility would have been. The practical form of it is that
`mov eax, eax` clears the top half of `rax`, and that a `mov ecx, 5` you wrote out of habit has also
wiped whatever was in `rcx` above it.

## The registers an instruction takes without asking

Some instructions name fewer operands than they use.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov rax, 1000000000000      ; a million million
    mov rbx, 1000000000000
    mul rbx                     ; rdx:rax = rax * rbx, 128 bits of answer

    mov rcx, 4
    mov rbx, 1
    shl rbx, cl                 ; shift left by cl, which is 4

    mov rax, 60
    xor rdi, rdi
    syscall
```

`mul rbx` names one operand and uses three registers: it multiplies `rax` by `rbx` and puts the
answer in `rdx:rax`, the high 64 bits in `rdx` and the low 64 in `rax`. A million million squared is
`10^24`, which does not fit in 64 bits, so `rax` comes out at `1BCECCEDA1000000` and `rdx` at
`D3C2`. `div` reads the same pair the other way round.

`shl rbx, cl` shifts by a variable amount, and the amount has to be in `cl`. Not in `bl`, not in
`dl`. A shift by a constant, `shl rbx, 4`, needs no register at all.

The other instructions that do this are the string operations, which read `rsi`, write `rdi` and
count in `rcx`, and `loop`, which counts down `rcx`. Both get their own lecture later.

## rip and the flags

Two more registers exist that the table above does not list.

**`rip`** is the instruction pointer, the address of the instruction that runs next. `mov rax, rip`
is not an instruction: the jumps, the calls and `ret` write it, and nothing else does. It can be
_addressed_, though, and `[rel label]` means "the address of `label`, written as a distance from
`rip`", which is what `default rel` turns every `[label]` into. The registers panel shows it at the
bottom, starting at `0x401000`.

**`rflags`** is the flags, one bit each, and the panel shows them as their own row above the
registers. "The flags register" is the lecture on what each one means.

## Your turn

`r8` starts at `0x00000000DEADBEEF`. Copy its lowest byte into `bl`, its lowest two bytes into `cx`,
and its lowest four into `edx`, leaving everything above each one as it was. `rbx`, `rcx` and `rdx`
all start at zero, so the answers are `0xEF`, `0xBEEF` and `0xDEADBEEF`.

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
    "startingRegisters": { "r8": "0xDEADBEEF" },
    "expectedRegisters": { "rbx": "0xEF", "rcx": "0xBEEF", "rdx": "0xDEADBEEF" }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    mov bl, r8b         ; the lowest byte of r8
    mov cx, r8w         ; the lowest two
    mov edx, r8d        ; the lowest four, and this one clears the top of rdx

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>

The second one multiplies. Leave `0x10000000000000000` divided between `rdx` and `rax` the way `mul`
leaves it: put `0x100000000` in `rax`, multiply it by itself, and the answer, `2^64`, lands as 1 in
`rdx` and 0 in `rax`.

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
    "expectedRegisters": { "rdx": 1, "rbx": "0x100000000" }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    mov rax, 0x100000000
    mov rbx, rax
    mul rbx             ; rdx:rax = rax * rbx

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
