Addition and subtraction have been quietly doing their job since the first page. Multiplication and
division are where x86 stops being obvious, because both of them use registers you did not name.

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

`adc` and `sbb` are add and subtract **with carry**: they add `CF` in as well. That is how you add two
numbers wider than a register, a qword at a time from the bottom up, with each `adc` picking up the
carry the one below it produced.

## Two multiplications

`mul` is unsigned and `imul` is signed, and they have to be two instructions rather than one because
the high half of the answer comes out differently.

`mul rbx` takes one operand, multiplies `rax` by it and puts a **128 bit** answer across `rdx` and
`rax`. `imul` has that form too, and two more that are much easier to live with:

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

The last one is the interesting case. `0xFFFFFFFFFFFFFFFF` doubled is `0x1FFFFFFFFFFFFFFFE`, which is
65 bits wide. `r10` gets the low 64 of it and `r11` gets the bit that fell off the top, so neither
register holds the answer and the two together do. `CF` and `OF` are both set, which is the processor
telling you that the low half alone would be a lie.

## One division, and it reads two registers

`div` and `idiv` take one operand, the divisor, and they do **not** take a dividend. They read it out
of `rdx` and `rax` together, as one number twice as wide as the divisor, and they write the quotient
to `rax` and the remainder to `rdx`.

This is the single most common way a working x86 program breaks, so it is worth drawing. To compute
`17 / 5` you have to arrange this:

```
       rdx                  rax
  [ 0000000000000000 ][ 0000000000000011 ]   the dividend, 0x11 = 17, across both
                            rbx
                     [ 0000000000000005 ]   the divisor
```

The high half is not optional and it is not ignored. Whatever happens to be in `rdx` when the `div`
runs becomes the top 64 bits of the number being divided. Leave yesterday's remainder there and you
have not divided 17 by 5, you have divided some enormous number by 5, and the quotient will not fit in
`rax`.

So the line before a division is part of the division:

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

`r10` reads `FFFFFFFFFFFFFFFD`, which is -3, and `r11` reads -2. `idiv` rounds towards zero rather
than downwards, and gives the remainder the same sign as the dividend, so -17 divided by 5 is -3
remainder -2 and not -4 remainder 3. Most programming languages inherited that rule from this
instruction.

Now break it. Delete the `cqo` line and press Run. `rdx` still holds 2 from the division above, the
dividend becomes 2 times `2^64` plus -17, and the quotient of that has no chance of fitting in `rax`.
The processor raises a **divide error** and, unlike an overflow, this one really does stop the
program: the run ends on the `idiv` with no message at all. Dividing by zero ends it the same way.

## Logic

`and`, `or`, `xor` and `not` work one bit at a time, each bit of the answer depending only on the bits
in the same position in the operands.

| written         | keeps                                    |
| --------------- | ---------------------------------------- |
| `and rax, mask` | only the bits set in `mask`              |
| `or rax, mask`  | the bits it had, plus the ones in `mask` |
| `xor rax, mask` | flips the bits set in `mask`             |
| `not rax`       | flips all of them, and writes no flags   |

A **mask** is a number written for the shape of its bits rather than for its value. `and rax, 0xFF`
keeps the low byte and clears the rest, `or rax, 0x80` sets bit 7 without disturbing anything, and
`xor rax, 0xFF` flips the low eight bits.

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

`r11` is `FFFFFFFFFFFFFF33` rather than `33`, because `not` flipped all sixty four bits and the
fifty six zeroes above the byte you were looking at all became ones. Masks are how you avoid that:
`and` and `or` touch only the bits you name.

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

The two middle lines are the same number shifted the same distance and they disagree completely. `r9`
is `FFFFFFFFFFFFFFFC`, which is -4, because `sar` fed copies of the sign bit in at the top. `r10` is
`3FFFFFFFFFFFFFFC`, because `shr` fed zeroes in instead, and a zero in the top bit means the number
is no longer negative. Both answers are right for the reading of `-16` they assumed, and picking the
wrong one of the two is the shift version of picking `jb` where you wanted `jl`.

A shift costs a fraction of what a division costs, so a compiler turns a divide by 8 into `sar` and a
multiply by 8 into `shl` on sight.

## Testing one bit

Three ways, and all three write `ZF`:

```
    test rax, 8             ; ZF = 0 when bit 3 is set
    bt rax, 3               ; CF = the value of bit 3
    and rax, 8              ; the same as test, but it writes rax too
```

`bt` puts the bit into `CF` instead, and `bts`, `btr` and `btc` read it and then set, clear or flip
it, which is how a program works through an array of single bits. `test` is what you write when the
value is a set of flags and you only want to know.

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

`r8` and `r9` both come out at 1, and they were read out of two different flags.

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
