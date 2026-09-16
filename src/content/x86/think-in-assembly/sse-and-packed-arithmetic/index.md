# SSE2 scalar and packed arithmetic

x86-64 guarantees the **SSE2** instruction set. In 64-bit mode it provides sixteen registers named
`xmm0` through `xmm15`, each 128 bits wide. These registers hold bits; an instruction decides
whether those bits represent one floating-point value or several values side by side.

This lesson draws every XMM register from its **low bits to its high bits**, left to right:

```
             low bits                                      high bits
xmm0  [ lane 0: bits 0..63       | lane 1: bits 64..127        ]
```

Each 64-bit region above is a **lane** when an instruction treats the register as two binary64
values. Lane 0 is the low lane and lane 1 is the high lane.

## Reading the instruction suffixes

In the instruction families used here, the final letters say how many values the instruction uses
and which format it gives those bits:

| suffix | meaning         | lanes used in one XMM register   |
| ------ | --------------- | -------------------------------- |
| `ss`   | scalar binary32 | one 32-bit value in the low bits |
| `sd`   | scalar binary64 | one 64-bit value in the low lane |
| `ps`   | packed binary32 | four 32-bit lanes                |
| `pd`   | packed binary64 | two 64-bit lanes                 |

**Scalar** means one value. **Packed** means several independent lanes. For example, `addsd` adds
the low binary64 values, while `addpd` adds both pairs of binary64 lanes.

The examples begin with binary64, so their arithmetic mnemonics end in `sd` or `pd`.

## Scalar arithmetic and the high half

The two-operand scalar SSE2 instructions used here read the low lane of each operand, write their
answer to the destination's low lane, and preserve the destination's high 64 bits. This first
calculation starts with memory loads whose high halves become zero:

```x86|playground|sse|no-flags
default rel
global _start

section .data
a:      dq 1.5
b:      dq 2.25
two:    dq 2.0

section .text
_start:
    movsd xmm0, [a]         ; [low 1.5  | high 0]
    movsd xmm1, [b]         ; [low 2.25 | high 0]
    addsd xmm0, xmm1        ; [low 3.75 | high 0]
    mulsd xmm0, [two]       ; [low 7.5  | high 0]

    mov rax, 60
    xor rdi, rdi
    syscall
```

Here is the complete `addsd` change:

```
before: xmm0 = [ low 1.5  | high 0 ]
        xmm1 = [ low 2.25 | high 0 ]
after:  xmm0 = [ low 3.75 | high 0 ]
```

Only the low lanes take part in the addition. The high lane shown in the result is the old high lane
of `xmm0`.

The source form of `movsd` determines what happens to that high half:

- `movsd xmm0, [value]` loads eight bytes into the low lane and clears the high 64 bits.
- `movsd xmm0, xmm1` copies the low lane and preserves the high 64 bits already in `xmm0`.

This example gives the preserved half a visible value:

```x86|playground|sse|no-flags
default rel
global _start

section .data
destination:    dq 1.0, 99.0
source:         dq 4.0

section .text
_start:
    movupd xmm0, [destination]  ; [low 1.0 | high 99.0]
    movsd xmm1, [source]        ; [low 4.0 | high 0]
    movsd xmm0, xmm1            ; [low 4.0 | high 99.0]

    mov rax, 60
    xor rdi, rdi
    syscall
```

The register-to-register move changes `xmm0` like this:

```
before: xmm0 = [ low 1.0 | high 99.0 ]
        xmm1 = [ low 4.0 | high 0    ]
after:  xmm0 = [ low 4.0 | high 99.0 ]
```

`subsd`, `mulsd`, `divsd`, and `sqrtsd` follow the same destination rule: they replace the low
binary64 lane and preserve the destination's high 64 bits.

## Packed loads and arithmetic

Packed binary64 instructions use both 64-bit lanes. With `dq 1.0, 2.0`, the first qword is at the
lower address and becomes low lane 0. The next qword becomes high lane 1:

```
increasing address  ---->
memory left:  [ qword 1.0 | qword 2.0 ]
xmm0:         [ low 1.0   | high 2.0  ]
```

`movupd` loads or stores all 128 bits and has no alignment requirement. `addpd` then adds
corresponding lanes independently:

```x86|playground|sse|no-flags
default rel
global _start

section .data
left:   dq 1.0, 2.0
right:  dq 10.0, 20.0
out:    dq 0.0, 0.0

section .text
_start:
    movupd xmm0, [left]     ; [low 1.0  | high 2.0]
    movupd xmm1, [right]    ; [low 10.0 | high 20.0]
    addpd xmm0, xmm1        ; [low 11.0 | high 22.0]
    movupd [out], xmm0

    mov rax, 60
    xor rdi, rdi
    syscall
```

|        lane | `xmm0` before | `xmm1` | `xmm0` after |
| ----------: | ------------: | -----: | -----------: |
|  low lane 0 |           1.0 |   10.0 |         11.0 |
| high lane 1 |           2.0 |   20.0 |         22.0 |

`mulpd` has the same lane-by-lane shape, with multiplication in place of addition. Neither packed
operation carries a value from one lane into the other.

## Converting signed integers and binary64 values

Conversion instructions change the representation of a value:

| instruction           | operation                                                                     |
| --------------------- | ----------------------------------------------------------------------------- |
| `cvtsi2sd xmm0, rax`  | convert the signed qword in `rax` to binary64 in the low lane                 |
| `cvttsd2si rax, xmm0` | convert the low binary64 value to a signed qword, truncating toward zero      |
| `cvtsd2si rax, xmm0`  | convert the low binary64 value to a signed qword using MXCSR rounding control |
| `movq rax, xmm0`      | copy only the low 64 raw bits, with no numerical conversion                   |

The usual MXCSR rounding mode is nearest, with halfway cases going to the result whose low bit is
even. In that mode, `cvtsd2si` rounds 2.7 to 3. `cvttsd2si` always truncates toward zero, so it
converts 2.7 to 2 regardless of that rounding setting.

Like scalar arithmetic, `cvtsi2sd xmm, r64` replaces the low lane and preserves the destination's
high 64 bits:

```x86|playground|sse|no-flags
default rel
global _start

section .data
seed:   dq 1.0, 99.0
value:  dq 2.7

section .text
_start:
    movupd xmm0, [seed]     ; [low 1.0 | high 99.0]
    mov rcx, 7
    cvtsi2sd xmm0, rcx      ; [low 7.0 | high 99.0]

    movsd xmm1, [value]     ; [low nearest binary64 to 2.7 | high 0]
    cvttsd2si r8, xmm1      ; 2: always truncate toward zero
    cvtsd2si r9, xmm1       ; 3 in the usual nearest-even mode
    movq r10, xmm1          ; low 64 raw bits: 0x400599999999999A

    mov rax, 60
    xor rdi, rdi
    syscall
```

The conversion of 7 changes `xmm0` as follows:

```
before: xmm0 = [ low 1.0 | high 99.0 ]
after:  xmm0 = [ low 7.0 | high 99.0 ]
```

Decimal 2.7 has an infinite repeating expansion in base two. The assembler stores the nearest
binary64 encoding, `0x400599999999999A`, under its normal rounding rule. Its exponent makes the
normalized value approximately `1.35 x 2^1`; the stored fraction bits describe the digits after the
leading 1 in that significand. `movq` lets `r10` expose those low-lane bits without treating them as
an integer value to convert.

### MXCSR in brief

`mxcsr` holds control and status for SSE floating-point work, including its rounding-control field,
exception masks, and recorded exception conditions. The playground begins in the usual default
state: nearest-even rounding with the floating-point exceptions masked.

A masked exception records its condition and lets the instruction produce its defined
floating-point result. For example, a nonzero finite value divided by zero produces a signed
infinity when divide-by-zero is masked. `0.0 / 0.0` is an invalid operation and produces a NaN when
invalid operation is masked. The result for a masked exceptional operation depends on the operation
and condition; masking does not turn every invalid calculation into the same result.

## Comparing low lanes

`ucomisd xmm0, xmm1` compares only the low binary64 lanes. It ignores both high lanes and records
one of four outcomes in `ZF`, `PF`, and `CF`:

| relation of low `xmm0` to low `xmm1` | `ZF` | `PF` | `CF` |
| ------------------------------------ | ---: | ---: | ---: |
| greater                              |    0 |    0 |    0 |
| less                                 |    0 |    0 |    1 |
| equal                                |    1 |    0 |    0 |
| unordered                            |    1 |    1 |    1 |

Unordered means at least one operand is a NaN. Test it first with `jp`. Its row also satisfies the
flag conditions used by `jb` and `je`, so either of those jumps would misclassify a NaN if it ran
first.

```x86|playground|sse
default rel
global _start

section .data
left:   dq 0x7FF8000000000000    ; a quiet NaN
right:  dq 2.0

section .text
_start:
    movsd xmm0, [left]       ; [low NaN | high 0]
    movsd xmm1, [right]      ; [low 2.0 | high 0]
    ucomisd xmm0, xmm1       ; reads the low lanes only

    jp unordered_path        ; PF first
    jb less_path
    je equal_path
    mov r12, 1               ; greater
    jmp compare_done

less_path:
    mov r12, -1
    jmp compare_done

equal_path:
    mov r12, 0
    jmp compare_done

unordered_path:
    mov r12, 2

compare_done:
    mov rax, 60
    xor rdi, rdi
    syscall
```

This input leaves 2 in `r12`.

## Packed comparisons produce masks

A packed comparison writes a result into every lane. `cmppd` takes an immediate predicate; the
value 1 selects ordered signaling less-than: “left lane is less than right lane.” If that relation
is true, the result lane is all one bits. If it is false, the result lane is all zero bits. A quiet
NaN makes the lane false and all-zero, and it raises the invalid-operation condition. With the
masked default taught above, MXCSR records that condition and execution continues.

```x86|playground|sse|no-flags
default rel
global _start

section .data
left:   dq 1.0, 5.0
right:  dq 2.0, 4.0
mask:   dq 0, 0

section .text
_start:
    movupd xmm0, [left]      ; [low 1.0 | high 5.0]
    movupd xmm1, [right]     ; [low 2.0 | high 4.0]
    cmppd xmm0, xmm1, 1      ; each lane asks: left < right?
    movupd [mask], xmm0

    mov rax, 60
    xor rdi, rdi
    syscall
```

|        lane | comparison         | result bits          |
| ----------: | ------------------ | -------------------- |
|  low lane 0 | `1.0 < 2.0`, true  | `0xFFFFFFFFFFFFFFFF` |
| high lane 1 | `5.0 < 4.0`, false | `0x0000000000000000` |

Those all-one and all-zero lanes form a **mask**. They are bit patterns for selecting later data,
so the floating-point display of the result is not useful here.

## Floating-point arguments and results

For ordinary non-variadic System V x86-64 calls with simple scalar floating-point arguments, the
first floating arguments use `xmm0` through `xmm7`; integer arguments are counted separately in the
general-purpose argument registers. A floating-point result is returned in `xmm0`.

Every XMM register is caller-saved. A called function may change any of them. A caller that needs
an XMM value afterward must preserve it in memory, copy its bits elsewhere, or recompute it.

```x86|playground|sse|no-flags
default rel
global _start

section .data
x:      dq 3.0
y:      dq 4.0
out:    dq 0.0

section .text
; sum_of_squares(x in xmm0, y in xmm1) -> x*x + y*y in xmm0
sum_of_squares:
    mulsd xmm0, xmm0        ; changes low lane; preserves xmm0 high half
    mulsd xmm1, xmm1        ; changes low lane; preserves xmm1 high half
    addsd xmm0, xmm1
    xorpd xmm1, xmm1        ; deliberately zero both lanes, all 128 bits
    ret

_start:
    movsd xmm0, [x]         ; [low 3.0 | high 0]
    movsd xmm1, [y]         ; [low 4.0 | high 0]
    call sum_of_squares     ; rsp is 16-byte aligned immediately before call
    movsd [out], xmm0       ; low result is 25.0
    mov r12, [out]          ; raw result bits: 0x4039000000000000

    mov rax, 60
    xor rdi, rdi
    syscall
```

The playground gives `_start` a 16-byte-aligned `rsp`, and this code does not move `rsp` before the
call. `call` pushes the return address, so `rsp` is eight bytes away from a 16-byte boundary on
entry to `sum_of_squares`, as required by the convention. The function makes no nested calls.
`xorpd xmm1, xmm1` clears every bit in `xmm1`, so both of its 64-bit lanes become zero.

## Your turn: scalar sum and average

Use all four binary64 values at `values`. Calculate their sum in `xmm1` and their average in
`xmm0`. The exact sum is 18.0 and the exact average is 4.5; the stored divisor is 4.0, so loading the
divisor alone cannot produce either requested answer.

The fixed code stores both results and copies the low 64 raw bits into `r12` and `r13`. The checks
assert both memory values and both safe register copies.

```x86|playground|sse|memory|exercise
default rel
global _start

section .data
values:       dq 1.5, 2.25, 4.0, 10.25
count:        dq 4.0
sum_out:      dq 0.0
average_out:  dq 0.0

section .text
_start:
    ; your code here

    movsd [sum_out], xmm1
    movsd [average_out], xmm0
    movq r12, xmm1            ; copy only the low 64 raw bits
    movq r13, xmm0

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": {
        "r12": "0x4032000000000000",
        "r13": "0x4012000000000000"
    },
    "expectedMemory": [
        {
            "type": "number-chunk",
            "address": "0x402028",
            "bytes": 8,
            "expected": ["0x4032000000000000", "0x4012000000000000"]
        }
    ]
}
```

<details>
<summary>Show solution</summary>

```x86|playground|sse|memory|solution
default rel
global _start

section .data
values:       dq 1.5, 2.25, 4.0, 10.25
count:        dq 4.0
sum_out:      dq 0.0
average_out:  dq 0.0

section .text
_start:
    movsd xmm0, [values]
    addsd xmm0, [values + 8]
    addsd xmm0, [values + 16]
    addsd xmm0, [values + 24]   ; xmm0 low lane = 18.0
    movsd xmm1, xmm0            ; copy the low sum
    divsd xmm0, [count]         ; xmm0 low lane = 4.5

    movsd [sum_out], xmm1
    movsd [average_out], xmm0
    movq r12, xmm1
    movq r13, xmm0

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>

Now perform packed addition and multiplication. Load the two lanes at `left` and `right`, put their
lane-wise sums in `xmm0`, and put their lane-wise products in `xmm2`. The fixed code stores all four
answers and copies each low/high qword to a safe general-purpose register.

```x86|playground|sse|memory|exercise
default rel
global _start

section .data
left:         dq 1.5, 2.0
right:        dq 2.5, 4.0
sum_out:      dq 0.0, 0.0
product_out:  dq 0.0, 0.0

section .text
_start:
    ; your code here

    movupd [sum_out], xmm0
    movupd [product_out], xmm2
    mov r12, [sum_out]
    mov r13, [sum_out + 8]
    mov r14, [product_out]
    mov r15, [product_out + 8]

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": {
        "r12": "0x4010000000000000",
        "r13": "0x4018000000000000",
        "r14": "0x400E000000000000",
        "r15": "0x4020000000000000"
    },
    "expectedMemory": [
        {
            "type": "number-chunk",
            "address": "0x402020",
            "bytes": 8,
            "expected": [
                "0x4010000000000000",
                "0x4018000000000000",
                "0x400E000000000000",
                "0x4020000000000000"
            ]
        }
    ]
}
```

<details>
<summary>Show solution</summary>

```x86|playground|sse|memory|solution
default rel
global _start

section .data
left:         dq 1.5, 2.0
right:        dq 2.5, 4.0
sum_out:      dq 0.0, 0.0
product_out:  dq 0.0, 0.0

section .text
_start:
    movupd xmm0, [left]
    movupd xmm1, [right]
    movupd xmm2, xmm0
    addpd xmm0, xmm1            ; [low 4.0 | high 6.0]
    mulpd xmm2, xmm1            ; [low 3.75 | high 8.0]

    movupd [sum_out], xmm0
    movupd [product_out], xmm2
    mov r12, [sum_out]
    mov r13, [sum_out + 8]
    mov r14, [product_out]
    mov r15, [product_out + 8]

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
