`cmp` has appeared several times now, always followed by a sentence about `ZF`. This lecture is the
whole row above the registers: what each flag records, which instructions write it, and why there are
two ways to ask whether one number is bigger than another.

## The row

`rflags` is a 64 bit register whose bits each mean one thing. Seven of them matter to a program here,
and the panel shows them as their own row.

| flag | bit | set when                                                                             |
| ---- | --- | ------------------------------------------------------------------------------------ |
| `CF` | 0   | the **unsigned** answer did not fit: an addition carried out, a subtraction borrowed |
| `PF` | 2   | the low byte of the answer has an even number of set bits                            |
| `AF` | 4   | there was a carry out of bit 3, which only the decimal instructions read             |
| `ZF` | 6   | the answer was zero                                                                  |
| `SF` | 7   | the top bit of the answer is set, so it is negative read as signed                   |
| `DF` | 10  | the string instructions count downwards instead of up                                |
| `OF` | 11  | the **signed** answer did not fit                                                    |

Six of the seven are written by arithmetic and read by the conditional jumps. `DF` is different: no
arithmetic touches it, `cld` clears it and `std` sets it, and only the string instructions care.

The panel shows an eighth, `TF` at bit 8, the trap flag. Setting it makes the processor raise an
exception after every single instruction, which is how a debugger single steps a program it does not
control. Nothing in this course writes it, and the Step button is the emulator stopping rather than
that.

## Who writes them

- **`add`, `sub`, `neg`, `and`, `or`, `xor`, the shifts** write the flags as a side effect of doing
  their work.
- **`cmp` and `test`** exist only to write them. `cmp a, b` subtracts and throws the answer away;
  `test a, b` ands and throws the answer away.
- **`inc` and `dec`** write every flag except `CF`, which they deliberately leave alone so that a
  loop can count with `inc` without disturbing a carry it is keeping.
- **`mov`, `lea`, `push`, `pop` and the jumps** write no flags at all. That is why `mov` can sit
  between a `cmp` and the `jcc` that reads it.

```x86|playground
default rel
global _start

section .text
_start:
    mov rax, 5
    sub rax, 5              ; zero: ZF goes to 1
    mov rbx, 3
    sub rbx, 5              ; -2: SF and CF go to 1, ZF back to 0
    mov rcx, 1
    mov rdx, 2              ; mov writes no flags, so the row does not move
    add rcx, rdx            ; 3: everything back to 0

    mov rax, 60
    xor rdi, rdi
    syscall
```

Press **Step** through it with the flags row in view. `ZF` lights after the first `sub` and goes out
after the second, where `SF` and `CF` light instead: `CF` because 3 minus 5 borrowed, `SF` because the
answer `FFFFFFFFFFFFFFFE` has its top bit set. The two `mov` lines change nothing in the row at all.

## cmp and test

`cmp rax, rbx` computes `rax - rbx`, sets the flags from the answer, and writes nothing. The
comparison you want is read out of the flags afterwards:

| written              | true when                |
| -------------------- | ------------------------ |
| `cmp a, b` then `je` | a equals b               |
| `cmp a, b` then `jb` | a is below b, unsigned   |
| `cmp a, b` then `jl` | a is less than b, signed |

Read it left to right: `cmp rax, rbx` followed by `jl` jumps when `rax < rbx`. The operands are in
the order the question is asked in.

`test rax, rbx` computes `rax AND rbx` the same way. Its usual two forms are

```
    test rax, rax           ; is rax zero? ZF says so
    test rcx, 1             ; is the lowest bit set? ZF is 0 if it is
```

`test rax, rax` is how x86 asks "is this zero", and it is one byte shorter than `cmp rax, 0`.

```x86|playground
default rel
global _start

section .text
_start:
    mov rcx, 0x80
    test rcx, 0x80          ; bit 7 is set, so the and is not zero: ZF = 0
    test rcx, 0x01          ; bit 0 is clear, so the and is zero: ZF = 1
    xor rax, rax
    test rax, rax           ; zero: ZF = 1 and nothing was written

    mov rax, 60
    xor rdi, rdi
    syscall
```

Step through and watch `ZF` alone. `rcx` never changes, because `test` writes no register.

## Signed and unsigned ask different questions

The same `cmp` sets `CF` for the unsigned reading and `SF` with `OF` for the signed one, and you pick
which pair to read by picking the jump.

| unsigned | signed | means                                        |
| -------- | ------ | -------------------------------------------- |
| `jb`     | `jl`   | below, less                                  |
| `jbe`    | `jle`  | below or equal, less or equal                |
| `ja`     | `jg`   | above, greater                               |
| `jae`    | `jge`  | above or equal, greater or equal             |
| `je`     | `je`   | equal, which is the same question either way |

Getting this wrong is the classic bug. `0xFFFFFFFFFFFFFFFF` is -1 signed and the largest number there
is unsigned, so "is it bigger than 1" has two correct answers, and the instruction you write chooses
which one you get.

```x86|playground
default rel
global _start

section .text
_start:
    mov rax, -1             ; FFFFFFFFFFFFFFFF
    mov rbx, 1
    cmp rax, rbx            ; one comparison

    setg r8b                ; signed: -1 > 1 is false, so 0
    seta r9b                ; unsigned: a huge number > 1 is true, so 1

    mov rax, 60
    xor rdi, rdi
    syscall
```

One `cmp`, two answers, and neither instruction had to be told what kind of number was in `rax`.

## The whole register at once

`pushfq` pushes `rflags` onto the stack and `popfq` pops it back, which is how a subroutine saves the
flags across something that would disturb them, and how you can look at the whole word.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov rax, 5
    sub rax, 5              ; ZF and PF set
    pushfq
    pop r8                  ; the flags as a number

    mov rax, 60
    xor rdi, rdi
    syscall
```

`r8` comes out at `124E`. `ZF` is bit 6 and `PF` is bit 2, both set by the subtraction, and bit 1 is
always 1. The bits above them are the state Linux started the program in, such as bit 9, the
interrupt enable, which a program running in user mode cannot change. `lahf` and `sahf` are the older
pair that move the low byte of the flags into and out of `ah`.

## Your turn

`rax` holds a number. Leave 1 in `bl` if it is zero and 0 if it is not, using `test` and a `setcc`.
The test starts `rax` at 0 and `rbx` at `0xFF`, so a correct answer leaves `rbx` at 1.

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
    "startingRegisters": { "rax": 0, "rbx": "0xFF" },
    "expectedRegisters": { "rbx": 1 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    test rax, rax       ; ZF = 1 when rax is zero
    sete bl             ; and sete reads exactly that

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>

The second one is the signed and unsigned trap. `rax` and `rbx` hold `0xFFFFFFFFFFFFFFFF` and `1`.
Leave the **unsigned** answer to "is `rax` below `rbx`" in `cl` and the **signed** answer to "is `rax`
less than `rbx`" in `dl`. The unsigned answer is 0 and the signed answer is 1.

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
    "startingRegisters": { "rax": "0xFFFFFFFFFFFFFFFF", "rbx": 1, "rcx": "0xFF", "rdx": "0xFF" },
    "expectedRegisters": { "rcx": 0, "rdx": 1 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    cmp rax, rbx        ; one comparison answers both
    setb cl             ; unsigned below: 0
    setl dl             ; signed less: 1

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
