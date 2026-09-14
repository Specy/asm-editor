Every number so far has been an integer. This lecture is the other kind: how a fractional number is
stored in bits, and the two separate units x86 has for doing arithmetic on them, each with a register
file of its own that the registers panel shows under its own tab.

## What a coprocessor is

When the 8086 shipped in 1978 it could add integers and nothing else. Floating point was done in
software, a few hundred instructions per multiplication, and for the programs that needed it, mostly
engineering and graphics, that was far too slow.

Intel's answer was a second chip, the **8087**, sitting beside the processor on the same board and
watching the same instruction stream. Instructions it recognised, the ones beginning with `f`, it
carried out itself while the 8086 waited; everything else it ignored. It had eight registers of its
own that the 8086 could not see, and it worked to a precision the main chip had no way to represent.
That is what a **coprocessor** is: a second unit with its own registers and its own instructions,
reached through instructions the main processor hands over.

The 80486 of 1989 put it on the same die, and it stopped being a separate chip. The name survived,
and so did the design: the `f` instructions and their eight register stack are still there, still
called **x87**, and still work exactly as they did.

In 1999 the Pentium III added a second floating point unit with a different design, **SSE**, sixteen
flat 128 bit registers with ordinary two operand instructions. It was faster, easier to generate code
for, and able to do several numbers at once. Every 64 bit x86 processor has both, the System V
convention passes floating point arguments in the SSE registers, and compilers emit SSE. x87 is what
you reach for when SSE has no instruction for what you want.

MIPS took the other road and never merged: its floating point unit is still addressed as
**coprocessor 1**, with `mtc1` and `mfc1` to move values across the boundary. RISC-V made it an
optional extension with its own registers. The idea is the same in all three.

## How a number is stored

A floating point number is three fields: a **sign** bit, an **exponent**, and a **mantissa**, the
digits. The value is the mantissa times two to the power of the exponent, with the sign applied,
which is scientific notation in binary.

| type   | bytes | written | sign | exponent | mantissa | about             |
| ------ | ----- | ------- | ---- | -------- | -------- | ----------------- |
| single | 4     | `dd`    | 1    | 8        | 23       | 7 decimal digits  |
| double | 8     | `dq`    | 1    | 11       | 52       | 16 decimal digits |

NASM writes either from a literal with a dot in it, so `dq 1.5` is eight bytes and `dd 1.5` is four.
The bits are the IEEE 754 encoding, which every processor in this editor uses.

Two consequences follow from the mantissa being binary.

**Most decimal fractions cannot be stored exactly.** 0.1 in binary repeats for ever, the way 1/3 does
in decimal, so what a double holds is the nearest representable number to 0.1, and 0.1 + 0.2 is not
0.3. That is not a bug in the processor, it is what happens when you write a base 10 fraction in base 2.

**Some values are not numbers at all.** An exponent of all ones means either an **infinity**, when the
mantissa is zero, or a **NaN**, not a number, when it is not. Zero divided by zero is a NaN, one
divided by zero is an infinity, and a NaN compared with anything, including itself, answers false.

## SSE, one number at a time

The sixteen `xmm` registers are 128 bits each. An instruction says how much of one it means, in its
last two letters:

| ending | means                                          |
| ------ | ---------------------------------------------- |
| `sd`   | **scalar double**: one double, the low 64 bits |
| `ss`   | **scalar single**: one single, the low 32 bits |
| `pd`   | **packed double**: two doubles at once         |
| `ps`   | **packed single**: four singles at once        |

So `addsd` adds one pair of doubles and `addpd` adds two pairs. The scalar forms are ordinary
arithmetic; the packed ones are the reason the registers are this wide.

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

The panel is on its **SSE** tab, which shows each register as the doubles it holds. `xmm0` reads
`3.75`, `xmm2` reads `2.875` and `xmm3` reads `1.5`. Hover one to see the raw bits and the single
precision reading of the same sixteen bytes, because nothing in the register records which of the
three the program meant.

`divsd`, `minsd`, `maxsd` and `sqrtsd` complete the arithmetic. There is no `modsd` and no `sinsd`:
SSE does the four operations and a square root, and everything else is a library function or x87.

## Moving between the two worlds

An integer register and an `xmm` register hold different encodings of a number, so moving a value
across converts it.

| instruction            | does                                           |
| ---------------------- | ---------------------------------------------- |
| `cvtsi2sd xmm0, rax`   | integer to double                              |
| `cvttsd2si rax, xmm0`  | double to integer, **truncating** towards zero |
| `cvtsd2si rax, xmm0`   | double to integer, rounding as `mxcsr` says    |
| `cvtss2sd`, `cvtsd2ss` | single to double and back                      |
| `movq rax, xmm0`       | the raw bits, with no conversion at all        |

The extra `t` in `cvttsd2si` is for truncate, and it is the one that matches what C's
`(int)` cast does. Without it the conversion rounds to nearest, so `(int)2.7` would come out at 3.

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

`r8` is 2, `r9` is 3 and `r10` holds `400599999999999A`, which is the closest a double gets to 2.7.
The run of nines in the hex is the repeating binary fraction, and it is why the value is not exactly
2.7.

## Comparing floats

`ucomisd` compares two doubles and writes `ZF`, `CF` and `PF`. It does **not** write `SF` or `OF`, so
the conditions to read it with are the **unsigned** ones, `jb`, `ja`, `je`, and never `jl` or `jg`.

| after `ucomisd xmm0, xmm1` | true when            |
| -------------------------- | -------------------- |
| `jb`                       | `xmm0 < xmm1`        |
| `je`                       | they are equal       |
| `ja`                       | `xmm0 > xmm1`        |
| `jp`                       | one of them is a NaN |

The `jp` row is the part with no integer equivalent. When either operand is a NaN, `ucomisd` sets
`ZF`, `CF` **and** `PF`, which reads as "equal" to anything that only looks at `ZF`. Code that has to
be right about NaN tests `PF` first.

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

`r8` is 1, `r9` and `r10` are 0, and `r11` is 200.

## Packed: four numbers, one instruction

The packed forms apply the operation to every lane of the register at once. This is **SIMD**, single
instruction multiple data, and it is what the 128 bits are for.

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

The SSE tab shows `xmm0` as two values, `11` and `22`, added by one instruction. `movupd` is the
unaligned load; `movapd` is the aligned one, faster on older processors and a fault on an address
that is not a multiple of 16.

A loop that adds two arrays of doubles does two elements per pass with `addpd`, or four singles with
`addps`, and AVX widened the same registers to 256 and then 512 bits for four and eight doubles. The
arithmetic is the arithmetic you already know; what changes is how many of it happen per instruction.

## x87, a stack instead of a file

The x87 registers are not numbered, they are a **stack of eight**. `st0` is whatever is on top, and a
push renames everything below it: what was `st0` becomes `st1`.

| instruction                                | does                                                |
| ------------------------------------------ | --------------------------------------------------- |
| `fld qword [x]`                            | push the double at `x`                              |
| `fild dword [n]`                           | push an integer, converted                          |
| `fld1`, `fldz`, `fldpi`                    | push 1.0, 0.0 or pi                                 |
| `faddp`                                    | add the top two, pop one, leaving the answer on top |
| `fmulp`, `fsubp`, `fdivp`                  | the same for the other three operations             |
| `fsqrt`, `fsin`, `fcos`, `fpatan`, `f2xm1` | replace `st0` with a function of it                 |
| `fstp qword [x]`                           | store `st0` and pop                                 |
| `fistp dword [n]`                          | store as an integer, **rounded**, and pop           |
| `fxch`                                     | swap `st0` and `st1`                                |

```x86|playground|x87|no-flags
default rel
global _start

section .data
a:      dq 1.5
b:      dq 2.25
n:      dd 7

section .bss
out:    resq 1
iout:   resd 1

section .text
_start:
    fld qword [a]           ; st0 = 1.5
    fld qword [b]           ; st0 = 2.25, st1 = 1.5
    faddp                   ; st0 = 3.75, and the stack is one deep again
    fstp qword [out]        ; store it and empty the stack
    mov r8, [out]

    fldpi                   ; pi
    fsqrt                   ; the square root of pi
    fstp qword [out]
    mov r9, [out]

    fild dword [n]          ; 7 as a float
    fsqrt                   ; 2.6457...
    fistp dword [iout]      ; and back to an integer
    mov r10d, [iout]

    mov rax, 60
    xor rdi, rdi
    syscall
```

Step through it with the panel on its **x87** tab. `st0` fills, then a second push moves the first
value down to `st1`, then `faddp` leaves one value where two were. A slot the stack has not filled,
or has popped, shows blank: the bits are still there, and the tag word says the slot is empty, which
is what the panel reads.

`r8` holds `400E000000000000`, which is 3.75. `r9` holds the square root of pi. `r10` is **3**, not
2, because `fistp` rounds to nearest and the square root of 7 is 2.6457.

`fsin`, `fcos`, `fpatan` and `f2xm1` are the reason x87 is still worth knowing: SSE has no
instruction for any of them, so a program that wants a sine either calls a library or uses the
coprocessor.

This emulator keeps the x87 stack as ordinary 64 bit doubles. Real hardware computes at **80 bit**
extended precision inside the unit and only rounds when a value is stored, so a long chain of x87
arithmetic here can differ from a physical processor in the last bits.

## Floats and the calling convention

The System V convention has a second set of rules for floating point:

- Floating point arguments go in `xmm0` to `xmm7`, counted separately from the integer arguments in
  `rdi` and the rest. So `f(int a, double x, int b, double y)` puts `a` in `rdi`, `b` in `rsi`, `x` in
  `xmm0` and `y` in `xmm1`.
- A floating point result comes back in `xmm0`.
- **Every `xmm` register is caller saved.** None of them survives a call, so a value that has to
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

`xmm0` comes out at 5 on the SSE tab.

## mxcsr

`mxcsr` is SSE's control and status register, shown at the bottom of the SSE tab. It holds the
rounding mode, the masks that decide whether an invalid operation stops the program or quietly
produces a NaN, and the flags recording which of those conditions has happened. `ldmxcsr` and
`stmxcsr` move it to and from memory.

It starts at `1F80`, which is every exception masked and round to nearest. Masked is why dividing by
zero here gives an infinity instead of stopping the program, and it is what almost every program
wants. x87 has three registers doing the same three jobs, `fctrl`, `fstat` and `ftag`, which the x87
tab shows.

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

The second one uses the coprocessor for something SSE cannot do. Leave the sine of the double at
`angle` in the dword at `out`, stored as a double, and read it back into `r8`. `angle` holds the
number of radians in a right angle, so the sine of it is 1.0 and `r8` should read
`3FF0000000000000`.

```x86|playground|x87|exercise
default rel
global _start

section .data
angle:  dq 1.5707963267948966     ; pi / 2

section .bss
out:    resq 1

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
    "expectedRegisters": { "r8": "0x3FF0000000000000" }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|x87|solution
default rel
global _start

section .data
angle:  dq 1.5707963267948966     ; pi / 2

section .bss
out:    resq 1

section .text
_start:
    fld qword [angle]       ; push the angle
    fsin                    ; replace it with its sine
    fstp qword [out]        ; store and pop

    mov r8, [out]

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
