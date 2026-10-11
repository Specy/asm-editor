# Floating point and the x87 stack

The bits in a register or memory have meaning only because an instruction or a program gives them
one. The bit pattern `0x05` can be the integer 5, for example, while another program could use an
integer as a fixed-point value with an implied fractional position. This lesson covers the IEEE 754
**binary floating-point** formats built into x86 and the x87 instructions that operate on them.

## Binary32 and binary64 in memory

The names **binary32** and **binary64** describe 32-bit and 64-bit IEEE 754 memory formats. They are
also commonly called single precision and double precision. NASM can emit them with a decimal point
in a `dd` or `dq` declaration:

```x86
single_value:   dd 1.5      ; four-byte binary32
double_value:   dq 1.5      ; eight-byte binary64
```

Each format divides its bits into three fields:

| format   | total bits |  sign | exponent | stored fraction |
| -------- | ---------: | ----: | -------: | --------------: |
| binary32 |         32 | 1 bit |   8 bits |         23 bits |
| binary64 |         64 | 1 bit |  11 bits |         52 bits |

For binary64, the sign bit selects positive or negative. The 11-bit exponent records a power of
two, using a bias of 1023 for normal values. The 52 stored fraction bits describe the significant
binary digits after the point. A normal, nonzero value has an implicit leading `1`, so that leading
bit does not need a place in the encoding.

The exponent field also identifies special cases:

| exponent field                  | fraction field | meaning                                   |
| ------------------------------- | -------------- | ----------------------------------------- |
| neither all zeroes nor all ones | any            | normal finite value; implicit leading `1` |
| all zeroes                      | all zeroes     | positive or negative zero                 |
| all zeroes                      | nonzero        | subnormal value; no implicit leading `1`  |
| all ones                        | all zeroes     | positive or negative infinity             |
| all ones                        | nonzero        | NaN, “not a number”                       |

Subnormal values let the format represent very small magnitudes close to zero. Infinities and NaNs
are results that floating-point instructions can carry through later calculations. Operations that
produce them can also raise x87 exception conditions; when an exception is masked, the condition is
recorded and execution continues with the corresponding floating-point result.

## Encoding 3.75 as binary64

Take 3.75 apart one step at a time.

**Write it in binary.** The integer 3 is `11`. The fraction 0.75 is one half plus one quarter, so it
is `.11`. Together they are `11.11`.

**Normalize it.** Move the point until one digit remains before it. One move changes `11.11` to
`1.111`, so the exponent is 1:

```
11.11 = 1.111 x 2^1
```

**Form the fraction field.** This is a normal nonzero number, so the leading `1` is implicit. Store
the digits after the point, `111`, then pad the 52-bit fraction field with zeroes.

**Bias the exponent.** Add the binary64 bias of 1023. The stored exponent is
`1 + 1023 = 1024`, or `10000000000` in 11 bits.

**Lay out the fields.** The number is positive, so its sign bit is zero:

```
 0   10000000000   1110000000000000000000000000000000000000000000000000
 ^        ^                                  ^
 sign   exponent                      stored fraction
 1 bit   11 bits                           52 bits
```

Grouping the same 64 bits into fours gives hexadecimal:

```
0100 0000 0000 1110 0000 0000 ... 0000
  4    0    0    E    0    0       0
```

The binary64 encoding of exactly 3.75 is therefore `0x400E000000000000`.

The reverse process decodes `0x3FF0000000000000`. Its exponent field is `0x3FF`, or 1023, so the
unbiased exponent is zero. Its fraction field is zero. Restoring the implicit leading bit gives
`1.0 x 2^0`, which is exactly 1.0.

Values such as decimal 0.1 behave differently. Its binary fraction repeats:

```
0.00011001100110011...
```

A binary64 value has only 52 stored fraction bits, so it cannot hold that infinite expansion. It
holds the nearest representable value under the current rounding rule. This is why calculations
with decimal fractions can differ slightly from their exact decimal answers. Values such as 3.75,
0.5, and 0.25 end after a finite number of binary places and can be represented exactly.

## Eight physical registers, one logical stack

x87 has eight physical floating-point registers. A rotating top pointer exposes them as a logical
stack. This lesson writes the logical names as `st(0)` through `st(7)`:

- `st(0)` is the current top;
- `st(1)` is the value immediately below it;
- `st(7)` is the last available logical entry.

A push moves the logical top, so every live value receives a new logical name. If `st(0)` held 1.5,
then pushing 2.25 makes 2.25 the new `st(0)` and renames 1.5 as `st(1)`. A pop removes the top and
renames the old `st(1)` as the new `st(0)`.

NASM spells these register names `st0`, `st1`, and so on in instruction operands. Thus the prose
name `st(1)` appears as `st1` in `faddp st1, st0`.

Each physical register has a tag that says whether its logical entry is empty. Popping marks an
entry empty; it need not erase the old bits. A ninth live value, or an instruction that reads an
empty entry, raises the x87 invalid-operation condition for a stack fault. This condition is
normally masked and recorded in x87 status, but unmasking it can make it trap. The practical rule is
simple: every load pushes, and a popping arithmetic or store instruction must eventually remove
that value.

## A small x87 instruction set

These forms are enough for the examples on this page:

| instruction       | value and stack effect                                        |
| ----------------- | ------------------------------------------------------------- |
| `fld dword [x]`   | push the binary32 value stored in four bytes at `x`           |
| `fld qword [x]`   | push the binary64 value stored in eight bytes at `x`          |
| `fld1`            | push the exactly representable value 1.0                      |
| `fild word [n]`   | read a signed 16-bit integer, convert it, and push it         |
| `fild dword [n]`  | read a signed 32-bit integer, convert it, and push it         |
| `fild qword [n]`  | read a signed 64-bit integer, convert it, and push it         |
| `faddp st1`       | put old `st(1) + st(0)` in old `st(1)`, then pop              |
| `fsubp st1`       | put old `st(1) - st(0)` in old `st(1)`, then pop              |
| `fmulp st1`       | put old `st(1) * st(0)` in old `st(1)`, then pop              |
| `fdivp st1`       | put old `st(1) / st(0)` in old `st(1)`, then pop              |
| `fstp dword [x]`  | round `st(0)` to binary32, store four bytes, then pop         |
| `fstp qword [x]`  | round `st(0)` to binary64, store eight bytes, then pop        |
| `fistp word [n]`  | round to a signed 16-bit integer, store two bytes, then pop   |
| `fistp dword [n]` | round to a signed 32-bit integer, store four bytes, then pop  |
| `fistp qword [n]` | round to a signed 64-bit integer, store eight bytes, then pop |

The default x87 rounding mode is nearest, with a value exactly halfway between two candidates going
to the candidate whose low bit is even. Other modes exist in the x87 control word. An integer result
must also fit the signed destination width; an out-of-range conversion raises the invalid-operation
condition.

### Load, add, and store

This program adds 1.5 and 2.25. The comment after every x87 instruction shows the complete live
logical stack, from the top downward:

```x86|playground|x87|no-flags
default rel
global _start

section .data
a:      dq 1.5
b:      dq 2.25
out:    dq 0.0

section .text
_start:
    fld qword [a]           ; stack: [1.5]
    fld qword [b]           ; stack: [2.25, 1.5]
    faddp st1               ; stack: [3.75]
    fstp qword [out]        ; stack: []

    mov r8, [out]           ; r8 = 0x400E000000000000

    mov rax, 60
    xor rdi, rdi
    syscall
```

The second `fld` changes the logical names without moving 1.5 between physical registers. Before
the addition, `st(0)` is 2.25 and `st(1)` is 1.5. `faddp st1` writes 3.75 into the old
`st(1)`, pops the old top, and exposes the result as the new `st(0)`. The store writes the binary64
bits to memory and empties the stack.

### Subtraction and division have an order

For subtraction and division, the old `st(1)` is the left operand and the old `st(0)` is the right
operand. This sequence calculates `(10.0 - 4.0) / 2.0`:

```x86
    fld qword [ten]         ; stack: [10.0]
    fld qword [four]        ; stack: [4.0, 10.0]
    fsubp st1               ; old st(1) - old st(0): stack [6.0]
    fld qword [two]         ; stack: [2.0, 6.0]
    fdivp st1               ; old st(1) / old st(0): stack [3.0]
    fstp qword [answer]     ; stack: []
```

After `fsubp`, the result first occupies the old `st(1)` physical register. The pop then makes it
the new `st(0)`. `fdivp` follows the same rule: it computes old `st(1) / st(0)`, places the result
in old `st(1)`, and pops.

Integer loads and stores use the same push/pop discipline. If `n` is a signed dword containing 7,
this balanced sequence stores the signed dword 4:

```x86
    fild dword [n]          ; stack: [7.0]
    fld1                    ; stack: [1.0, 7.0]
    faddp st1, st0          ; stack: [8.0]
    fld qword [half]        ; stack: [0.5, 8.0]
    fmulp st1, st0          ; stack: [4.0]
    fistp dword [iout]      ; stack: []; signed 32-bit result is 4
```

## Comparing and using integer flags

An ordinary integer conditional jump needs flags in `rflags`. The x87 instruction
`fucomip st0, st1` compares `st(0)` with `st(1)`, writes `ZF`, `PF`, and `CF`, and pops `st(0)`.
Its four possible results are:

| relation of old `st(0)` to old `st(1)` | `ZF` | `PF` | `CF` |
| -------------------------------------- | ---: | ---: | ---: |
| greater                                |    0 |    0 |    0 |
| less                                   |    0 |    0 |    1 |
| equal                                  |    1 |    0 |    0 |
| unordered                              |    1 |    1 |    1 |

**Unordered** means that at least one operand is a NaN. A quiet NaN is a NaN encoding intended to
flow through ordinary calculations without signaling the invalid-operation exception in this
comparison. `fucomip` reports a quiet NaN as unordered. Check `PF` first with `jp`; the unordered
row also has `CF=1` and `ZF=1`, so checking `jb` or `je` first would misclassify it.

Here `left` is 1.0 and `right` is 2.0. The remaining `fstp st0` discards the other operand. It does
not change the integer flags, so the jumps still read the result from `fucomip`:

```x86
    fld qword [right]       ; stack: [2.0]
    fld qword [left]        ; stack: [1.0, 2.0]
    fucomip st0, st1        ; compare 1.0 with 2.0; stack: [2.0]
    fstp st0                ; discard remaining value; stack: []; flags unchanged

    jp unordered_path       ; PF=1 must be tested first
    jb less_path            ; CF=1
    je equal_path           ; ZF=1
    jmp greater_path        ; ZF=PF=CF=0
```

A NaN comparison is therefore not simply “false.” It produces the distinct unordered flag pattern,
which the program must handle if NaNs are possible.

## Precision and exceptions

On hardware, each physical x87 register uses the 80-bit extended floating-point format. Arithmetic
still rounds according to the x87 control word, which selects a rounding direction and an arithmetic
precision. Storing to binary32 or binary64 memory rounds the value to that target format as well.

The playground represents x87 stack values as binary64 rather than as hardware's 80-bit register
format. Intermediate results can therefore differ from physical x87 execution. This matters most
when a calculation depends on its final few bits; the examples and exercises here use values whose
expected answers are exactly representable.

The control word also masks or unmasks exception classes. Masked conditions such as invalid
operations, division by zero, overflow, underflow, and inexact results are recorded in x87 status
while execution continues with a defined floating-point response. Unmasking an exception permits a
trap. Control-word programming is outside this first x87 lesson.

## Your turn

Calculate `(10.0 - 4.0) / 2.0` with the explicitly ordered popping forms. Store the binary64 result
at `out`, then copy its eight bits to `r8`. Every input and the result is exactly representable.

```x86|playground|x87|memory|exercise
default rel
global _start

section .data
left:       dq 10.0
subtract:   dq 4.0
divisor:    dq 2.0
out:        dq 0.0

section .text
_start:
    ; your code here

    mov r8, [out]

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": { "r8": "0x4008000000000000" },
    "expectedMemory": [
        {
            "type": "number-chunk",
            "address": "0x402018",
            "bytes": 8,
            "expected": ["0x4008000000000000"]
        }
    ]
}
```

<details>
<summary>Show solution</summary>

```x86|playground|x87|memory|solution
default rel
global _start

section .data
left:       dq 10.0
subtract:   dq 4.0
divisor:    dq 2.0
out:        dq 0.0

section .text
_start:
    fld qword [left]        ; stack: [10.0]
    fld qword [subtract]    ; stack: [4.0, 10.0]
    fsubp st1               ; stack: [6.0]
    fld qword [divisor]     ; stack: [2.0, 6.0]
    fdivp st1               ; stack: [3.0]
    fstp qword [out]        ; stack: []

    mov r8, [out]

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>

Now compare four pairs: less, equal, greater, and unordered. Write byte `-1`, `0`, `1`, or `2` to
the corresponding position in `results`. Load the final four bytes into `r8d`. For every pair,
load the right operand first and the left operand second, use `fucomip st1`, discard the one
remaining x87 value, and test `jp` before the ordered branches.

```x86|playground|x87|memory|exercise
default rel
global _start

section .data
lefts:      dq 1.0, 2.0, 4.0, 0x7FF8000000000000
rights:     dq 2.0, 2.0, 3.0, 0.0
results:    dd 0

section .text
_start:
    lea rdi, [rel lefts]
    lea rsi, [rel rights]
    lea rdx, [rel results]
    xor ebx, ebx

    ; your loop here

    mov r8d, [results]

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": { "r8": "0x00000000020100FF" },
    "expectedMemory": [
        {
            "type": "number-chunk",
            "address": "0x402040",
            "bytes": 1,
            "expected": ["0xFF", "0x00", "0x01", "0x02"]
        }
    ]
}
```

<details>
<summary>Show solution</summary>

```x86|playground|x87|memory|solution
default rel
global _start

section .data
lefts:      dq 1.0, 2.0, 4.0, 0x7FF8000000000000
rights:     dq 2.0, 2.0, 3.0, 0.0
results:    dd 0

section .text
_start:
    lea rdi, [rel lefts]
    lea rsi, [rel rights]
    lea rdx, [rel results]
    xor ebx, ebx

compare_next:
    fld qword [rsi + rbx*8]     ; stack: [right]
    fld qword [rdi + rbx*8]     ; stack: [left, right]
    fucomip st1                 ; compare left with right; stack: [right]
    fstp st0                    ; stack: []; integer flags unchanged

    jp compare_unordered        ; PF first: NaN was present
    jb compare_less
    ja compare_greater

    mov byte [rdx + rbx], 0     ; equal
    jmp compare_continue

compare_less:
    mov byte [rdx + rbx], -1
    jmp compare_continue

compare_greater:
    mov byte [rdx + rbx], 1
    jmp compare_continue

compare_unordered:
    mov byte [rdx + rbx], 2

compare_continue:
    inc rbx
    cmp rbx, 4
    jb compare_next

    mov r8d, [results]

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
