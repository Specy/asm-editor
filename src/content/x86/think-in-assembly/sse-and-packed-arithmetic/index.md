The x87 stack works, and it is awkward. There is no way to name a register directly, every operation
shuffles what is underneath it, and eight slots go quickly. SSE is the answer to all three: sixteen
ordinary registers, called `xmm0` to `xmm15`, and instructions that take a destination and a source
like every other instruction you have written.

They are also 128 bits wide, which is twice as much as any number needs, and that turns out to be the
interesting part.

## Scalar first

An `xmm` register is wide enough to hold two doubles or four singles side by side. So an instruction
has to say not only what operation to do but how much of the register it means, and it says it in the
last two letters of its name.

| ending | means                                          |
| ------ | ---------------------------------------------- |
| `sd`   | **scalar double**: one double, the low 64 bits |
| `ss`   | **scalar single**: one single, the low 32 bits |
| `pd`   | **packed double**: two doubles at once         |
| `ps`   | **packed single**: four singles at once        |

`addsd` adds one pair of doubles and ignores the rest of the register. `addpd` adds two pairs. Start
with the scalar ones, which are ordinary arithmetic on ordinary numbers.

```x86|playground|sse|no-flags
default rel
global _start

section .data
a:      dq 1.5
b:      dq 2.25
half:   dq 0.5

section .text
_start:
    movsd xmm0, [a]         ; load one double
    movsd xmm1, [b]
    addsd xmm0, xmm1        ; 1.5 + 2.25 = 3.75

    movsd xmm2, [a]
    mulsd xmm2, [b]         ; 3.375, reading the second operand from memory
    subsd xmm2, [half]      ; 2.875

    movsd xmm3, [b]
    sqrtsd xmm3, xmm3       ; 1.5, since 1.5 squared is 2.25

    mov rax, 60
    xor rdi, rdi
    syscall
```

The panel is on its **SSE** tab, which reads each register as the doubles it holds. Hover one and you
also get the raw bits and the single precision reading of the same sixteen bytes, which is the right
moment to notice that nothing in the register records which of the readings the program meant. The
same 128 bits are two doubles or four singles depending entirely on which instruction touches them
next.

`divsd`, `minsd`, `maxsd` and `sqrtsd` finish the arithmetic. There is no `modsd` and no `sinsd`: SSE
does the four operations and a square root, and anything beyond that is a library function or a trip
back to x87.

## Moving between integers and floats

An integer register and an `xmm` register hold completely different encodings, so a value crossing
between them has to be converted rather than copied.

| instruction            | does                                           |
| ---------------------- | ---------------------------------------------- |
| `cvtsi2sd xmm0, rax`   | integer to double                              |
| `cvttsd2si rax, xmm0`  | double to integer, **truncating** towards zero |
| `cvtsd2si rax, xmm0`   | double to integer, rounding to nearest         |
| `cvtss2sd`, `cvtsd2ss` | single to double and back                      |
| `movq rax, xmm0`       | the raw bits, with no conversion at all        |

The extra `t` in `cvttsd2si` is for truncate, and the difference between the two conversions is a
whole bug waiting to happen: one of them turns 2.7 into 2 and the other turns it into 3.

```x86|playground|sse|no-flags
default rel
global _start

section .data
value:  dq 2.7

section .text
_start:
    mov rcx, 7
    cvtsi2sd xmm0, rcx      ; 7.0 as a double

    movsd xmm1, [value]     ; 2.7
    cvttsd2si r8, xmm1      ; 2, truncated
    cvtsd2si r9, xmm1       ; 3, rounded

    movq r10, xmm1          ; the bits themselves, 0x400599999999999A

    mov rax, 60
    xor rdi, rdi
    syscall
```

`movq` is the one that converts nothing, and `r10` is where the last lecture's arithmetic pays off.
`400599999999999A`: the exponent field is `0x400`, which is 1024, so the real exponent is 1, and the
mantissa begins `0101 1001 1001 1001 ...`. Those repeating `1001` groups are the binary expansion of
0.7 running out of room, and the final `A` is the last group rounded up rather than cut off. The
register does not hold 2.7. It holds the closest double there is to 2.7, and this is what that looks
like written down.

## Comparing floats

`ucomisd` compares two doubles and writes `ZF`, `CF` and `PF`. It does **not** write `SF` or `OF`, so
the conditions that read it are the **unsigned** ones, `jb`, `ja` and `je`, and never `jl` or `jg`.

| after `ucomisd xmm0, xmm1` | true when            |
| -------------------------- | -------------------- |
| `jb`                       | `xmm0 < xmm1`        |
| `je`                       | they are equal       |
| `ja`                       | `xmm0 > xmm1`        |
| `jp`                       | one of them is a NaN |

That last row has no equivalent anywhere in integer arithmetic. Two integers are always in some
order. Two floats are not, because a NaN is in no order with anything, and `ucomisd` reports that
case by setting `ZF`, `CF` **and** `PF` together. To code that only looks at `ZF`, a NaN therefore
reads as "equal", which it is not, to anything, including itself. Code that has to be right about
NaN tests `PF` first, and `PF` is the flag that seemed useless back in the flags lecture.

```x86|playground|sse
default rel
global _start

section .data
a:      dq 1.5
b:      dq 2.25

section .text
_start:
    movsd xmm0, [a]
    movsd xmm1, [b]
    ucomisd xmm0, xmm1      ; 1.5 against 2.25

    setb r8b                ; below: 1
    seta r9b                ; above: 0
    setp r10b               ; unordered: 0, neither is a NaN

    jb .less
    mov r11, 100
    jmp .done
.less:
    mov r11, 200
.done:

    mov rax, 60
    xor rdi, rdi
    syscall
```

## Packed: several numbers, one instruction

Here is what the other half of the register is for. A packed instruction applies its operation to
every **lane** of the register at once, where a lane is one of the numbers sitting side by side
inside it.

```
 xmm0  [      1.0      ][      2.0      ]     two doubles, 64 bits each
 xmm1  [     10.0      ][     20.0      ]
       ----------------------------------  addpd
 xmm0  [     11.0      ][     22.0      ]     both sums, one instruction
```

```x86|playground|sse|no-flags
default rel
global _start

section .data
left:   dq 1.0, 2.0         ; two doubles, so one whole xmm register
right:  dq 10.0, 20.0

section .text
_start:
    movupd xmm0, [left]     ; both lanes
    movupd xmm1, [right]
    addpd xmm0, xmm1        ; 11.0 in the low lane, 22.0 in the high one

    mov rax, 60
    xor rdi, rdi
    syscall
```

The SSE tab shows `xmm0` as two values rather than one. This is **SIMD**, single instruction multiple
data, and it is where the speed of modern numerical code comes from: a loop that adds two arrays of
doubles does two elements per pass with `addpd` and four singles per pass with `addps`, for the same
one instruction it would have spent on a single element. The later AVX extensions widened the same
registers to 256 and then 512 bits, for four and then eight doubles per instruction, and the
arithmetic inside is unchanged. Only the number of lanes moves.

`movupd` is the unaligned load and `movapd` is the aligned one. `movapd` is faster on older
processors and faults outright on an address that is not a multiple of 16, which is the reason the
calling convention cares about keeping `rsp` aligned.

## Floats and the calling convention

The System V agreement has a second set of rules for floating point, alongside the integer ones from
the calling lecture.

- Floating point arguments go in `xmm0` to `xmm7`, counted separately from the integer arguments. A
  subroutine taking a whole number, then a double, then another whole number gets the first integer
  in `rdi`, the second integer in `rsi`, and the double in `xmm0`.
- A floating point result comes back in `xmm0`.
- **Every `xmm` register is caller saved.** Not one of them survives a call, so a value that has to
  outlive one goes on the stack.

```x86|playground|sse|no-flags
default rel
global _start

section .text
; hypot_squared(x in xmm0, y in xmm1) -> x*x + y*y in xmm0
hypot_squared:
    mulsd xmm0, xmm0
    mulsd xmm1, xmm1
    addsd xmm0, xmm1
    ret

_start:
    mov rax, 3
    cvtsi2sd xmm0, rax      ; x = 3.0
    mov rax, 4
    cvtsi2sd xmm1, rax      ; y = 4.0
    call hypot_squared      ; xmm0 = 25.0
    sqrtsd xmm0, xmm0       ; 5.0

    mov rax, 60
    xor rdi, rdi
    syscall
```

## mxcsr

`mxcsr` is SSE's control and status register, shown at the bottom of the SSE tab. It holds the
rounding mode, the masks that decide whether an invalid operation stops the program or quietly
produces a NaN, and the flags recording which of those conditions has happened since you last looked.
`ldmxcsr` and `stmxcsr` move it to and from memory.

It starts at `1F80`: round to nearest, every exception masked. Masked is why dividing by zero here
gives you an infinity and carries on rather than ending the run, and it is what almost every program
wants, because a NaN travelling through a calculation is easier to find at the end than a program
that stopped in the middle.

## Your turn

Compute the average of the three doubles at `values` using SSE and leave it in `xmm0`. Their total is
9.0, so the answer is 3.0. The test checks the bits through `r8`, so store the answer and load it
back.

```x86|playground|sse|exercise
default rel
global _start

section .data
values: dq 1.5, 3.25, 4.25
three:  dq 3.0

section .bss
out:    resq 1

section .text
_start:
    ; your code here

    movsd [out], xmm0
    mov r8, [out]

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": { "r8": "0x4008000000000000" }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|sse|solution
default rel
global _start

section .data
values: dq 1.5, 3.25, 4.25
three:  dq 3.0

section .bss
out:    resq 1

section .text
_start:
    movsd xmm0, [values]        ; 1.5
    addsd xmm0, [values + 8]    ; + 3.25
    addsd xmm0, [values + 16]   ; + 4.25, so 9.0
    divsd xmm0, [three]         ; 3.0

    movsd [out], xmm0
    mov r8, [out]

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
