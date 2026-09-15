Sixteen registers is everything the processor can hold at once. Everything else a program works with
is in memory, several hundred times further away, so which value is in a register at which moment is
most of what writing assembly consists of.

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

Read the third column as habits rather than rules. Two of them the hardware really does enforce:
`rsp` is moved by `push`, `pop`, `call` and `ret` whether you like it or not, and a handful of
instructions read and write `rax`, `rdx` and `rcx` without those registers appearing anywhere in the
line. The rest is an agreement between programs, written down as the calling convention.

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

Picture one row of the table as eight bytes side by side. `rax` is all eight, `eax` is the right hand
four, `ax` the right hand two, `al` the rightmost one, and `ah` the one next to it:

```
 rax  [ b7 ][ b6 ][ b5 ][ b4 ][ b3 ][ b2 ][ b1 ][ b0 ]
 eax                    [ b3 ][ b2 ][ b1 ][ b0 ]
 ax                                  [ b1 ][ b0 ]
 ah                                  [ b1 ]
 al                                        [ b0 ]
```

Naming one of them reads or writes that many bytes of the one register.

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
    mov rdi, 0
    syscall
```

Nothing copied a register there. Every line read a different width of the same one, and the five
destinations show you `rax` cut five ways.

`ah` is the odd one. It cannot be named in an instruction that also names `r8` to `r15` or their
halves, because the byte that makes those registers reachable is the same byte that would say `ah`.
`mov r9b, ah` is a build error, `mov cl, ah` is fine, and that is a rule of how instructions are
encoded rather than a rule of the assembler.

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
    mov rdi, 0
    syscall
```

`r8` ends at `FFFFFFFFFFFFFF00`, `r9` at `FFFFFFFFFFFF0000`, and `r10` at zero, which is the odd one
out of the three.

The reason is worth a paragraph, because it is the first place the shape of the hardware leaks into
the language. Inside a modern processor the sixteen registers you write are names, not places. The
hardware keeps a much larger pool of storage and hands out a fresh slot each time an instruction
writes a register, so that two instructions using the same name do not have to wait for each other
unless one really needs the other's answer. That trick only works if the processor can tell that an
instruction's result depends on nothing that came before it.

A write to `al` does not qualify: the new `rax` is one new byte and seven old ones, so it has to wait
for whatever produced those seven. A write to `eax` that zeroed the top half depends on nothing, and
the processor can start it immediately. Most 64 bit programs do most of their arithmetic 32 bits wide,
so the designers made the common case the independent one. `mov eax, eax` is the shortest way to
throw away the top half of `rax` on purpose, and a `mov ecx, 5` you wrote out of habit has also wiped
whatever `rcx` held above it.

## The registers an instruction takes without asking

Some instructions name fewer operands than they use, and the first time one does it, it looks like a
misprint.

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
    mov rdi, 0
    syscall
```

`mul rbx` names one operand and touches three registers. It multiplies whatever is in `rax` by the
operand and writes the answer across `rdx` and `rax` together, the high 64 bits in `rdx` and the low
64 in `rax`. It has to: a million million squared is `10^24`, and `10^24` does not fit in 64 bits.

| after                | `rdx`  | `rax`              |
| -------------------- | ------ | ------------------ |
| `mov rax, 10^12`     | junk   | `E8D4A51000`       |
| `mul rbx`, high half | `D3C2` |                    |
| `mul rbx`, low half  |        | `1BCECCEDA1000000` |

Stick the two halves together and you have `D3C21BCECCEDA1000000`, which is `10^24` written in hex.
Neither register holds the answer on its own. `div` reads the same pair the other way round, taking a
dividend out of `rdx` and `rax` together, which is why the lecture on arithmetic spends most of its
time on the line before a division.

`shl rbx, cl` shifts by an amount held in a register, and the amount has to be in `cl`. Not in `bl`,
not in `dl`. A shift by a constant, `shl rbx, 4`, needs no register at all.

The string instructions and `loop` do the same kind of thing, reading `rsi`, `rdi` and `rcx` without
naming them, and both get a lecture later.

## rip and the flags

Two more registers exist that the table above does not list.

**`rip`** is the instruction pointer, the address of the instruction that runs next. `mov rax, rip`
is not an instruction: the jumps, the calls and `ret` write it, and nothing else does. It can be
_addressed_, though, and `[rel label]` means "the address of `label`, written as a distance from
`rip`", which is what `default rel` turns every `[label]` into. The registers panel shows it at the
bottom, starting at `0x401000`.

**`rflags`** is the flags, one bit each, and the panel shows them as their own row above the
registers.

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
    mov rdi, 0
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
    mov rdi, 0
    syscall
```

</details>

The second one multiplies. Put `0x100000000` in **`rbx`**, get it into `rax` as well, and multiply
the two with `mul`. The answer is `2^64`, which is one more than a register can hold, so it arrives
as a 1 in `rdx` and a 0 in `rax`.

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
    mov rdi, 0
    syscall
```

</details>
