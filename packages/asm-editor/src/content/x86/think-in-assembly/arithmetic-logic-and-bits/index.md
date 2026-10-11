# Arithmetic, logic and bits

Integer instructions work at a fixed width. An operation on qwords keeps 64 result bits; an
operation on bytes keeps 8. The same bit pattern can be read as signed or unsigned, and some
instructions use that choice to decide how to produce a wider result.

Unless a narrower register name is shown, the examples on this page use **qword forms**. This is
especially important for multiplication and division, whose implicit register pairs change with
the operand width.

## Adding and subtracting

The ordinary two-operand forms write their result over the first operand:

```x86
    add rax, rbx            ; rax = rax + rbx
    add rax, 10             ; rax = rax + 10
    add rax, [total]        ; add the qword at total
    add [total], rax        ; add rax to the qword at total
    sub rax, rbx            ; rax = rax - rbx
```

As with `cmp`, these forms allow at most one memory operand. Their fixed-width result can wrap.
`add` and `sub` update `ZF`, `SF`, `CF`, and `OF`: `CF` reports unsigned carry or borrow, while
`OF` reports signed overflow.

`inc` adds 1 and `dec` subtracts 1:

```x86
    inc rax                 ; rax = rax + 1
    dec rbx                 ; rbx = rbx - 1
```

They update `ZF`, `SF`, and `OF`, but preserve the old value of `CF`. Use `add` or `sub` when the
carry or borrow from that operation matters.

## Truncated and full multiplication

The two- and three-operand forms of `imul` keep one qword of a signed product:

```x86
    imul rax, rbx           ; rax = low 64 bits of rax * rbx
    imul rcx, rax, 3        ; rcx = low 64 bits of rax * 3
```

The two-operand form overwrites its first operand. The three-operand form reads its second operand
and an immediate, then writes the first operand. Other general-purpose registers are unchanged.
Both forms set `CF` and `OF` when the signed mathematical product does not fit in the destination;
they clear both when it fits. Do not rely on the other arithmetic flags after `imul`.

The one-operand forms keep the full product. For qword operands, they use this 128-bit destination:

```
       high 64 bits          low 64 bits
    [      rdx      ]     [      rax      ]
```

`rdx:rax` names the pair as one 128-bit value: `rdx` is the high half and `rax` is the low half.

- `mul source` treats `rax` and `source` as unsigned, then writes the full product to `rdx:rax`.
  It clears `CF` and `OF` when the high half is zero and sets them otherwise.
- One-operand `imul source` treats both operands as signed, then writes the full signed product to
  `rdx:rax`. It clears `CF` and `OF` when the high half is the sign extension of the low half, which
  means the product fits in a signed qword; otherwise it sets them.

Both instructions overwrite `rax` and `rdx`. Their other arithmetic flags are undefined.

The signed and unsigned forms produce the same low 64 product bits from the same input bit
patterns, but their high halves can differ. Here the all-ones qword is unsigned `2^64 - 1` and
signed -1:

```x86|playground
default rel
global _start

section .text
_start:
    mov rax, 6
    imul rax, 7             ; low product 42; CF=OF=0
    mov r14, rax
    imul r15, rax, 3        ; low product 126; CF=OF=0

    mov rax, -1
    mov rbx, 2
    mul rbx                 ; unsigned: (2^64 - 1) * 2
    mov r8, rdx             ; high half = 1
    mov r9, rax             ; low half = 0xFFFFFFFFFFFFFFFE

    mov rax, -1
    imul rbx                ; signed: -1 * 2 = -2
    mov r12, rdx            ; high half = 0xFFFFFFFFFFFFFFFF
    mov r13, rax            ; low half = 0xFFFFFFFFFFFFFFFE

    mov rax, 60
    xor rdi, rdi
    syscall
```

After the unsigned `mul`, `CF` and `OF` are set because the unsigned product needs the high half.
After the signed one-operand `imul`, they are clear because -2 fits in a signed qword. The
truncated products remain in `r14` and `r15`, and the high and low halves of the full products are
preserved in `r8`/`r9` and `r12`/`r13` for inspection after the exit setup.

The implicit registers follow the instruction width:

| operand width | full multiplication result | division dividend | quotient | remainder |
| ------------- | -------------------------- | ----------------- | -------- | --------- |
| byte          | `ax`                       | `ax`              | `al`     | `ah`      |
| word          | `dx:ax`                    | `dx:ax`           | `ax`     | `dx`      |
| dword         | `edx:eax`                  | `edx:eax`         | `eax`    | `edx`     |
| qword         | `rdx:rax`                  | `rdx:rax`         | `rax`    | `rdx`     |

The remaining multiplication and division examples use the qword row.

## Preparing a dividend

Qword `div` and `idiv` each name only the divisor. They read a 128-bit dividend from `rdx:rax`,
then replace `rax` with the qword quotient and `rdx` with the qword remainder.

To divide an unsigned qword already in `rax`, widen it to 128 bits by clearing the high half:

```x86
    mov rax, 17
    mov rbx, 5
    xor rdx, rdx            ; rdx:rax is the unsigned value 17
    div rbx                 ; rax = 3, rdx = 2
```

For signed division, the **sign bit** is the highest bit at the chosen width. It is 1 for a
negative two's-complement value and 0 for a non-negative value. **Sign extension** widens a signed
value by copying that bit into every new high position. This preserves its signed value.

`cqo` sign-extends the qword in `rax` into the 128-bit pair `rdx:rax`. It makes `rdx` all zeroes
when `rax` is non-negative and all ones when `rax` is negative:

```x86
    mov rax, -17
    mov rbx, 5
    cqo                     ; rdx:rax is the signed value -17
    idiv rbx                ; rax = -3, rdx = -2
```

`idiv` truncates the quotient toward zero. Its nonzero remainder has the same sign as the dividend,
so `-17 = (-3 * 5) + -2`. Do not rely on the arithmetic flags after `div` or `idiv`; their values
are undefined.

These setup instructions are for a qword dividend that begins in `rax`. The narrower division forms
use the smaller pairs in the table, together with their corresponding widening instructions or
other deliberate setup.

Division raises a divide error in either of these cases:

- the divisor is zero;
- the quotient does not fit in the destination width.

For qword `div`, the quotient must fit in an unsigned qword. For qword `idiv`, it must fit in a
signed qword. For example, the smallest signed qword, `-2^63`, divided by -1 has a mathematical
result one above the largest signed qword, so it faults.

An old value in `rdx` changes the dividend and can also make the quotient too wide. Suppose an
earlier unsigned division left 2 in `rdx`, and then `rax` received the bit pattern for -17 without
`cqo`. That low half is the unsigned value `2^64 - 17`, so the complete dividend is

```
2 * 2^64 + (2^64 - 17) = 3 * 2^64 - 17
```

Its high sign bit is clear, so `idiv` reads it as a large positive 128-bit dividend. Dividing it by
5 produces a quotient above the signed-qword maximum, and the instruction faults. `cqo` would have
made the high half all ones and formed the intended signed value -17.

## Logic one bit at a time

`and`, `or`, and `xor` calculate each result bit independently. For one bit position, their complete
behavior is:

| `a` | `b` | `a AND b` | `a OR b` | `a XOR b` |
| --: | --: | --------: | -------: | --------: |
|   0 |   0 |         0 |        0 |         0 |
|   0 |   1 |         0 |        1 |         1 |
|   1 |   0 |         0 |        1 |         1 |
|   1 |   1 |         1 |        1 |         0 |

A **mask** is a bit pattern chosen to control these operations. It specifies what happens at every
bit position, including the positions containing zero:

- `and` keeps a destination bit where the mask bit is 1 and clears it where the mask bit is 0;
- `or` sets a destination bit where the mask bit is 1 and preserves it where the mask bit is 0;
- `xor` flips a destination bit where the mask bit is 1 and preserves it where the mask bit is 0.

`not` takes one operand and flips every bit in it. It does not change the flags. The other three
write `ZF` and `SF` from their result and clear `CF` and `OF`.

```x86|playground
default rel
global _start

section .text
_start:
    mov rax, 0b11001100
    and rax, 0b00001111     ; 0b00001100: keep the low four bits
    mov r8, rax

    mov rax, 0b11001100
    or rax, 0b00000011      ; 0b11001111: set the low two bits
    mov r9, rax

    mov rax, 0b11001100
    xor rax, 0b11111111     ; 0b00110011: flip the low eight bits
    mov r10, rax

    mov rax, 0b11001100
    not rax                 ; flip all 64 bits
    mov r12, rax

    mov rax, 60
    xor rdi, rdi
    syscall
```

The last result is `0xFFFFFFFFFFFFFF33`. The qword `not` flips the 56 high zero bits as well as the
eight low bits shown in the literal.

## Testing bits

`test` performs an AND only to set flags; it leaves both operands unchanged. For example,
`test rax, 8` sets `ZF` when bit 3 of `rax` is clear and clears `ZF` when that bit is set. It also
clears `CF` and `OF`, like `and`.

`bt rax, 3` uses a different result: it copies bit 3 of `rax` into `CF`. Do not read `ZF` after
`bt`; its value is undefined.

A `setcc` instruction writes byte 1 when its flag condition is true and byte 0 otherwise. Here
`sete` reads the equal-or-zero condition from `ZF`, while `setc` reads the carry condition from
`CF`. Initializing the full destination registers first ensures that the later byte writes leave
known zeroes in all higher positions.

```x86|playground
default rel
global _start

section .text
_start:
    mov rax, 0b1010
    mov r8, 0
    mov r9, 0

    test rax, 1             ; bit 0 is clear, so ZF = 1
    sete r8b                ; r8 = 1

    bt rax, 3               ; bit 3 is set, so CF = 1
    setc r9b                ; r9 = 1

    mov rax, 60
    xor rdi, rdi
    syscall
```

## Shifts and rotates

A shift moves bits within a fixed-width destination. Bits that pass an end are discarded, and the
new positions are filled according to the instruction:

| qword instruction | new bits                                     | numerical meaning               |
| ----------------- | -------------------------------------------- | ------------------------------- |
| `shl rax, n`      | zeroes enter at the low end                  | multiply by `2^n` modulo `2^64` |
| `shr rax, n`      | zeroes enter at the high end                 | unsigned division by `2^n`      |
| `sar rax, n`      | copies of the sign bit enter at the high end | signed shift rounding downward  |

For `shl`, high bits that do not fit are lost, so the mathematical multiplication is exact only
when its result fits in the qword. `shr` gives the quotient from unsigned division by the power of
two. `sar` preserves the signed direction of a negative value, but it rounds negative nonmultiples
toward negative infinity. Signed `idiv` instead truncates toward zero:

```
    -17 sar 2     = -5
    -17 idiv 4    = -4, remainder -1
```

The shift count can be an immediate or the register `cl`. For a qword destination, the processor
uses only the low 6 bits of the count, so the effective count is the supplied count modulo 64. A
qword shift count of 64 therefore acts like a count of zero, not like 64 separate shifts.

```x86|playground
default rel
global _start

section .text
_start:
    mov rax, 1
    shl rax, 10             ; 1024
    mov r12, rax

    mov rax, -17
    sar rax, 2              ; -5
    mov r13, rax

    mov rax, -17
    shr rax, 2              ; 0x3FFFFFFFFFFFFFFB
    mov r14, rax

    mov rcx, 3
    mov rax, 5
    shl rax, cl             ; 40; cl is the variable count operand
    mov r15, rax

    mov rax, 60
    xor rdi, rdi
    syscall
```

`rol` and `ror` rotate left and right. A rotate wraps each bit that leaves one end back into the
other end, so no bit is discarded. Qword rotate counts are masked in the same way as qword shift
counts.

## Your turn

Perform two qword divisions:

- Treat `rax` and `rbx` as unsigned, divide `rax` by `rbx`, and put the quotient in `r12` and the
  remainder in `r13`.
- Treat `r8` and `r9` as signed, divide `r8` by `r9`, and put the quotient in `r14` and the remainder
  in `r15`.

The starting value of `rdx` is deliberately nonzero. Prepare the high half correctly for each
division.

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
    "startingRegisters": {
        "rax": 100,
        "rbx": 7,
        "rdx": 1,
        "r8": "-17",
        "r9": 5
    },
    "expectedRegisters": {
        "r12": 14,
        "r13": 2,
        "r14": "0xFFFFFFFFFFFFFFFD",
        "r15": "0xFFFFFFFFFFFFFFFE"
    }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    xor rdx, rdx            ; zero-extend the unsigned qword in rax
    div rbx
    mov r12, rax
    mov r13, rdx

    mov rax, r8
    cqo                     ; sign-extend the signed qword in rax
    idiv r9
    mov r14, rax
    mov r15, rdx

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>

Practice forming `10 * x` as `(x << 3) + (x << 1)`. Apply that construction to the inputs in `r8`,
`r9`, and `r10`, and put the respective qword results in `r12`, `r13`, and `r14`. Write each
calculation with shifts and addition, without `mul`, `imul`, or `div` in your source.

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
    "startingRegisters": {
        "r8": 3,
        "r9": 37,
        "r10": 1234
    },
    "expectedRegisters": {
        "r12": 30,
        "r13": 370,
        "r14": 12340
    }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    mov r12, r8
    shl r12, 3
    mov rax, r8
    shl rax, 1
    add r12, rax

    mov r13, r9
    shl r13, 3
    mov rax, r9
    shl rax, 1
    add r13, rax

    mov r14, r10
    shl r14, 3
    mov rax, r10
    shl rax, 1
    add r14, rax

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
