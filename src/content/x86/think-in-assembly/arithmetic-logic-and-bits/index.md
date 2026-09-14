Loops have been counting with `inc` and `add` without much said about them. This lecture is the rest
of the arithmetic: the two multiplications, the division that needs a register filled first, and what
the logic and shift instructions are for.

## Adding and subtracting

```
    add rax, rbx            ; rax = rax + rbx
    add rax, 10             ; rax = rax + 10
    add rax, [total]        ; rax = rax + the qword at total
    add [total], rax        ; the qword at total += rax
    sub rax, rbx            ; rax = rax - rbx
    inc rax                 ; rax++
    dec rax                 ; rax--
    neg rax                 ; rax = -rax
```

Every one of them writes the flags, so an overflow is recorded and nothing stops. `inc` and `dec`
leave `CF` alone on purpose and write the others.

`adc` and `sbb` are add and subtract **with carry**: they add `CF` in as well, which is how you add
two numbers wider than a register, a qword at a time from the bottom up.

## Two multiplications

`mul` is unsigned and `imul` is signed, and they are different instructions because the high half of
the answer differs.

`mul rbx` takes one operand, multiplies `rax` by it and puts a **128 bit** answer in `rdx:rax`, the
high half in `rdx`. `imul` has that form too, and two more that are easier to use:

```
    imul rax, rbx           ; rax = rax * rbx, keeping the low 64 bits
    imul rcx, rax, 3        ; rcx = rax * 3, a third register and a constant
```

Those two write only the register they name, so nothing is lost as long as the answer fits, and `OF`
says when it did not.

```x86|playground
default rel
global _start

section .text
_start:
    mov rax, 6
    imul rax, 7             ; 42, and nothing else is touched
    mov r8, rax

    imul r9, rax, 3         ; 126, from a third register

    mov rax, 0xFFFFFFFFFFFFFFFF
    mov rbx, 2
    mul rbx                 ; unsigned, so rdx:rax holds the whole answer
    mov r10, rax
    mov r11, rdx

    mov rax, 60
    xor rdi, rdi
    syscall
```

`r10` comes out at `FFFFFFFFFFFFFFFE` and `r11` at 1: the answer is `0x1FFFFFFFFFFFFFFFE`, and the
bit that did not fit in `rax` is in `rdx`. `CF` and `OF` are set to say the low half alone is not the
answer.

## One division, and it reads two registers

`div` and `idiv` take one operand, the divisor, and read a dividend **twice as wide** out of
`rdx:rax`. They write the quotient to `rax` and the remainder to `rdx`.

So the line before a division is never optional:

- **`xor rdx, rdx`** before a `div`, because an unsigned number is widened with zeroes.
- **`cqo`** before an `idiv`, because a signed one is widened with copies of its sign bit.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov rax, 17
    mov rbx, 5
    xor rdx, rdx            ; the high half of the dividend
    div rbx                 ; rax = 3, rdx = 2
    mov r8, rax
    mov r9, rdx

    mov rax, -17
    mov rbx, 5
    cqo                     ; rdx becomes all ones, since rax is negative
    idiv rbx                ; rax = -3, rdx = -2
    mov r10, rax
    mov r11, rdx

    mov rax, 60
    xor rdi, rdi
    syscall
```

`r10` reads `FFFFFFFFFFFFFFFD`, which is -3, and `r11` reads -2: C's integer division rounds towards
zero and takes the sign of the dividend for the remainder, and `idiv` is where that rule comes from.

Leave out the `cqo` and `rdx` still holds 2 from the division above, so the dividend becomes an
enormous number and the quotient does not fit in `rax`. That is a **divide error**, and unlike an
overflow it does stop the program, with no message: the run simply ends on the `idiv`. Division by
zero does the same. Try deleting the `cqo` line and pressing Run.

## Logic

`and`, `or`, `xor` and `not` work bit by bit on the whole operand.

| written         | keeps                                    |
| --------------- | ---------------------------------------- |
| `and rax, mask` | only the bits set in `mask`              |
| `or rax, mask`  | the bits it had, plus the ones in `mask` |
| `xor rax, mask` | flips the bits set in `mask`             |
| `not rax`       | flips all of them, and writes no flags   |

A **mask** is a number written for its bits rather than its value. `and rax, 0xFF` keeps the low
byte, `or rax, 0x80` sets bit 7, `xor rax, 0xFF` flips the low eight bits.

```x86|playground
default rel
global _start

section .text
_start:
    mov rax, 0b11001100
    and rax, 0b00001111     ; keep the low four bits: 1100
    mov r8, rax

    mov rax, 0b11001100
    or rax, 0b00000011      ; set the low two: 11001111
    mov r9, rax

    mov rax, 0b11001100
    xor rax, 0b11111111     ; flip the low eight: 00110011
    mov r10, rax

    mov rax, 0b11001100
    not rax                 ; flip all sixty four
    mov r11, rax

    mov rax, 60
    xor rdi, rdi
    syscall
```

`r8` is `C`, `r9` is `CF`, `r10` is `33` and `r11` is `FFFFFFFFFFFFFF33`.

`xor rax, rax` is the special case: a register exclusive-ored with itself is zero, which is why it is
the standard way to clear one.

## Shifts

| written      | does                                                                       |
| ------------ | -------------------------------------------------------------------------- |
| `shl rax, n` | shift left, zeroes coming in at the bottom. A multiply by `2^n`            |
| `shr rax, n` | shift right, zeroes coming in at the top. An **unsigned** divide by `2^n`  |
| `sar rax, n` | shift right, copies of the top bit coming in. A **signed** divide by `2^n` |
| `rol`, `ror` | rotate: the bit that falls off one end comes back in at the other          |

The count is either a constant or `cl`, and nothing else.

```x86|playground
default rel
global _start

section .text
_start:
    mov rax, 1
    shl rax, 10             ; 1024, which is 1 * 2^10
    mov r8, rax

    mov rax, -16
    sar rax, 2              ; -4: the sign bit is copied in
    mov r9, rax

    mov rax, -16
    shr rax, 2              ; an enormous positive number instead
    mov r10, rax

    mov rcx, 3
    mov rax, 5
    shl rax, cl             ; a variable shift, and cl is the only register allowed
    mov r11, rax

    mov rax, 60
    xor rdi, rdi
    syscall
```

`r9` is `FFFFFFFFFFFFFFFC`, which is -4. `r10` is `3FFFFFFFFFFFFFFC`, the same bits shifted with
zeroes coming in, which is the right answer for an unsigned reading of the same register and a wrong
one for a signed division. Picking `shr` where `sar` was meant is the shift version of picking `jb`
where `jl` was meant.

A shift is much faster than `imul` and `div`, so a compiler turns `x * 8` into `shl` and `x / 8` into
`sar` on sight. `sar` is not exactly C's division for negative numbers, since it rounds towards
negative infinity where C rounds towards zero, so a compiler adds a correction.

## Testing one bit

Three ways, and all three write `ZF`:

```
    test rax, 8             ; ZF = 0 when bit 3 is set
    bt rax, 3               ; CF = the value of bit 3
    and rax, 8              ; the same as test, but it writes rax too
```

`bt` puts the bit in `CF`, and `bts`, `btr` and `btc` read it and then set, clear or flip it, which
is how you work with an array of bits. `test` is what you write when the value is a flag and you only
want to know.

```x86|playground
default rel
global _start

section .text
_start:
    mov rax, 0b1010
    test rax, 1             ; bit 0 is clear: ZF = 1, so the number is even
    sete r8b

    bt rax, 3               ; bit 3 is set: CF = 1
    setc r9b

    mov rax, 60
    xor rdi, rdi
    syscall
```

`r8` and `r9` both come out at 1, from two different flags.

## Your turn

Divide `rax` by `rbx` and leave the quotient in `r8` and the remainder in `r9`, treating both as
**unsigned**. The test gives 100 and 7, so the answers are 14 and 2.

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
    "startingRegisters": { "rax": 100, "rbx": 7 },
    "expectedRegisters": { "r8": 14, "r9": 2 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    xor rdx, rdx        ; the high half of the dividend, zero for unsigned
    div rbx             ; rax = quotient, rdx = remainder
    mov r8, rax
    mov r9, rdx

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>

The second one is bit work, with no `mul` or `div` allowed. Multiply `rax` by 10 using only shifts
and an add, and leave the answer in `rbx`. The test gives 37, so `rbx` should end at 370. Ten is
eight plus two, and both of those are shifts.

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
    "startingRegisters": { "rax": 37 },
    "expectedRegisters": { "rbx": 370 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    mov rbx, rax
    shl rbx, 3          ; rax * 8
    mov rcx, rax
    shl rcx, 1          ; rax * 2
    add rbx, rcx        ; rax * 10

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
