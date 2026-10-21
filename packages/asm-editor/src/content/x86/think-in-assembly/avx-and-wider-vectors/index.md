# AVX and 256-bit vectors

**AVX** (Advanced Vector Extensions) widens the sixteen vector registers from 128 to 256 bits. The
wide registers are named `ymm0` through `ymm15`. `xmm0` is not a separate register: it is the low
128 bits of `ymm0`, and the same holds for every `xmmN` and `ymmN`. One 256-bit instruction
therefore works on eight binary32 lanes or four binary64 lanes, twice as many as an SSE
instruction.

As in the SSE lesson, registers are drawn from their low bits on the left to their high bits on the
right. A YMM register has two 128-bit **halves**; the low half is the XMM register of the same
number:

```
            low half = xmm0 (bits 0..127)      high half (bits 128..255)
ymm0  [ s0   | s1   | s2   | s3   ||  s4   | s5   | s6   | s7   ]   eight binary32 lanes
      [ d0          | d1          ||  d2          | d3          ]   four binary64 lanes
```

The AVX form of an SSE instruction has the same mnemonic with a `v` in front: `vaddps`, `vmulpd`,
`vmovups`. The playgrounds below open the registers panel on its **AVX** tab, which shows each
`ymm` register as one 256-bit row that can be read as eight singles, four doubles, or hex.

## Eight lanes in one instruction

`vmovups` with a `ymm` register loads or stores 32 bytes, at any address. The first `dd` value, at
the lowest address, becomes lane 0. `vaddps` with `ymm` operands adds all eight pairs of lanes:

```x86|playground|avx|no-flags
default rel
global _start

section .data
a:      dd 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0
b:      dd 0.5, 0.5, 0.5, 0.5, 10.0, 10.0, 10.0, 10.0
out:    dd 0, 0, 0, 0, 0, 0, 0, 0

section .text
_start:
    vmovups ymm0, [a]           ; 32 bytes: lanes 0..7 of a
    vmovups ymm1, [b]
    vaddps ymm2, ymm0, ymm1     ; ymm2 = ymm0 + ymm1, lane by lane
    vmovups [out], ymm2

    mov rax, 60
    xor rdi, rdi
    syscall
```

| lane   |   0 |   1 |   2 |   3 |    4 |    5 |    6 |    7 |
| ------ | --: | --: | --: | --: | ---: | ---: | ---: | ---: |
| `ymm0` | 1.0 | 2.0 | 3.0 | 4.0 |  5.0 |  6.0 |  7.0 |  8.0 |
| `ymm1` | 0.5 | 0.5 | 0.5 | 0.5 | 10.0 | 10.0 | 10.0 | 10.0 |
| `ymm2` | 1.5 | 2.5 | 3.5 | 4.5 | 15.0 | 16.0 | 17.0 | 18.0 |

Lanes 0 to 3 are in the low half, `xmm2`; lanes 4 to 7 are in the high half.

## A separate destination

`vaddps ymm2, ymm0, ymm1` has three operands: the destination, then two sources. It writes
`ymm2 = ymm0 + ymm1` and only reads `ymm0` and `ymm1`. SSE's `addps xmm0, xmm1` overwrites its
first source, so SSE code that still needs that value afterwards copies it with `movaps` first. With
the AVX form the copy is unnecessary.

This program computes `a + b` and `a - b` from the same two registers, then multiplies the results,
which gives `a*a - b*b` for each of the four binary64 lanes:

```x86|playground|avx|no-flags
default rel
global _start

section .data
a:      dq 1.0, 2.0, 3.0, 4.0
b:      dq 0.25, 0.5, 0.75, 1.0

section .text
_start:
    vmovupd ymm0, [a]           ; [1.0  | 2.0 | 3.0  | 4.0]
    vmovupd ymm1, [b]           ; [0.25 | 0.5 | 0.75 | 1.0]
    vaddpd ymm2, ymm0, ymm1     ; [1.25 | 2.5 | 3.75 | 5.0]
    vsubpd ymm3, ymm0, ymm1     ; [0.75 | 1.5 | 2.25 | 3.0]
    vmulpd ymm4, ymm2, ymm3     ; [0.9375 | 3.75 | 8.4375 | 15.0]

    mov rax, 60
    xor rdi, rdi
    syscall
```

After the run, `ymm0` and `ymm1` still hold `a` and `b`. The second source may be a memory operand,
as in `vaddpd ymm2, ymm0, [b]`; the destination and the first source are registers.

## What an XMM write does to the high half

An instruction that names an `xmm` register writes only bits 0 to 127 of the YMM register. What
happens to bits 128 to 255 depends on how the instruction is encoded:

| instruction               | bits 0..127 | bits 128..255 |
| ------------------------- | ----------- | ------------- |
| `addps xmm0, xmm2`        | the sum     | unchanged     |
| `vaddps xmm1, xmm1, xmm2` | the sum     | set to zero   |
| `vaddps ymm1, ymm1, ymm2` | the sum     | the sum       |

The first row is a legacy SSE instruction, written without `v`. The second is the AVX form with
`xmm` operands. Every AVX instruction that writes an `xmm` register clears the high half:

```x86|playground|avx|no-flags
default rel
global _start

section .data
ones:   dd 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0
twos:   dd 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0

section .text
_start:
    vmovups ymm0, [ones]        ; [1 1 1 1 || 1 1 1 1]
    vmovups ymm1, [ones]        ; [1 1 1 1 || 1 1 1 1]
    vmovups ymm2, [twos]        ; [2 2 2 2 || 2 2 2 2]

    addps xmm0, xmm2            ; [3 3 3 3 || 1 1 1 1]  legacy SSE: high half kept
    vaddps xmm1, xmm1, xmm2     ; [3 3 3 3 || 0 0 0 0]  AVX, xmm: high half zeroed

    mov rax, 60
    xor rdi, rdi
    syscall
```

The scalar AVX instructions have one more rule. `vaddss xmm3, xmm2, xmm4` adds the low binary32
lanes of `xmm2` and `xmm4`, copies bits 32 to 127 from the **first source**, `xmm2`, and zeroes bits
128 to 255. The old contents of `xmm3` play no part, which is different from SSE's `addss`, where
the destination keeps its bits 32 to 127:

```x86|playground|avx|no-flags
default rel
global _start

section .data
ones:   dd 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0
twos:   dd 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0

section .text
_start:
    vmovups ymm2, [twos]        ; [2 2 2 2 || 2 2 2 2]
    vmovups ymm3, [ones]        ; [1 1 1 1 || 1 1 1 1]
    vmovups ymm4, [ones]        ; [1 1 1 1 || 1 1 1 1]

    vaddss xmm3, xmm2, xmm4     ; [3 2 2 2 || 0 0 0 0]

    mov rax, 60
    xor rdi, rdi
    syscall
```

Lane 0 of `ymm3` is `2.0 + 1.0`; lanes 1 to 3 are the 2.0s of `xmm2`; the four 1.0s that were in
`ymm3` are gone.

`vzeroupper` sets bits 128 to 255 of all sixteen YMM registers to zero, and `vzeroall` sets all 256
bits of all sixteen to zero. Because a legacy SSE instruction must keep the high halves it does not
write, many processors run SSE code slowly while some high half holds nonzero bits. Compilers
therefore end a stretch of 256-bit code with `vzeroupper` before a `call` or `ret` that may reach
SSE code.

## Two halves that rarely meet

Most 256-bit instructions perform the 128-bit operation twice, once on each half, and never move a
value from one half to the other. Intel's manuals call each half a **128-bit lane**. For lane-wise
arithmetic such as `vaddps` this changes nothing. For instructions that rearrange data it limits
where a value can go.

`vpshufb ymm1, ymm0, ymm3` builds each byte of `ymm1` from a control byte at the same position in
`ymm3`. The control byte's low four bits pick one of the 16 bytes of `ymm0` in the **same half**; a
control byte with its top bit set produces zero. With the control bytes `15, 14, ..., 0` in both
halves, `vpshufb` reverses each half separately. Reversing all 32 bytes needs a second instruction
that does cross: `vpermq ymm2, ymm1, 0x4E` rearranges the four qwords of `ymm1`. Its immediate holds
four 2-bit fields; field `i`, starting from the low bits, names the source qword for destination
qword `i`. `0x4E` is `01 00 11 10` in binary, so destination qwords 0 to 3 take source qwords 2, 3,
0 and 1, which swaps the halves.

```x86|playground|avx|no-flags
default rel
global _start

section .data
bytes:  db 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15
        db 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31
reverse:
        db 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0
        db 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0

section .text
_start:
    vmovdqu ymm0, [bytes]       ; bytes 0..31
    vmovdqu ymm3, [reverse]
    vpshufb ymm1, ymm0, ymm3    ; 15..0 || 31..16: each half reversed in place
    vpermq ymm2, ymm1, 0x4E     ; 31..16 || 15..0: halves swapped

    mov rax, 60
    xor rdi, rdi
    syscall
```

Switch the AVX tab to hex to read the bytes. In `ymm1`, byte 0 is 15 and byte 16 is 31: no byte left
its half. In `ymm2` the bytes run from 31 down to 0.

The instructions that move data between halves include `vpermq`, `vpermd`, `vperm2i128`,
`vperm2f128`, `vextractf128`, `vinsertf128` and the broadcasts. Shuffles such as `vpshufd`,
`vshufps`, `vpunpcklbw` and `vpalignr` stay within each half.

## Broadcast and fused multiply-add

`vbroadcastss ymm1, [c2]` reads one binary32 value from memory and writes it into all eight lanes,
so that one constant can be combined with eight different values in a single instruction.

A **fused multiply-add** (FMA) computes `a * b + c` and rounds the result once. Separate `vmulps`
and `vaddps` instructions round the product and then the sum, so the two can differ in the last
bit. The FMA instructions are a separate extension from AVX, and this emulator runs both.

The three digits in an FMA mnemonic say which operands are multiplied and which is added. Number
the operands 1, 2 and 3 from left to right; the first two digits are the factors, the third is the
addend, and the result always goes to operand 1:

| instruction              | computes            |
| ------------------------ | ------------------- |
| `vfmadd132ps y1, y2, y3` | `y1 = y1 * y3 + y2` |
| `vfmadd213ps y1, y2, y3` | `y1 = y2 * y1 + y3` |
| `vfmadd231ps y1, y2, y3` | `y1 = y2 * y3 + y1` |

`213` suits Horner's rule for a polynomial: `2x² - 3x + 1` is `(2x - 3)x + 1`, so the running value
is multiplied by `x` and the next coefficient is added. This program evaluates the polynomial at
`x = 0, 1, ..., 7` at once:

```x86|playground|avx|no-flags
default rel
global _start

section .data
xs:     dd 0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0
c2:     dd 2.0
c1:     dd -3.0
c0:     dd 1.0

section .text
_start:
    vmovups ymm0, [xs]              ; x in each lane
    vbroadcastss ymm1, [c2]         ; 2.0 in every lane
    vbroadcastss ymm2, [c1]         ; -3.0 in every lane
    vbroadcastss ymm3, [c0]         ; 1.0 in every lane

    vfmadd213ps ymm1, ymm0, ymm2    ; ymm1 = x * 2 + (-3)
    vfmadd213ps ymm1, ymm0, ymm3    ; ymm1 = x * (2x - 3) + 1

    mov rax, 60
    xor rdi, rdi
    syscall
```

`ymm1` ends as `1, 0, 3, 10, 21, 36, 55, 78`.

## A dot product and its horizontal sum

`vfmadd231ps ymm0, ymm1, [b + rcx*4]` multiplies eight elements of `a` by eight elements of `b` and
adds the products to `ymm0`. In a loop, `ymm0` collects eight partial sums of the dot product of two
16-element arrays:

```x86|playground|avx|no-flags
default rel
global _start

section .data
a:      dd 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0
        dd 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0
b:      dd 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0
        dd 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0

section .text
_start:
    vxorps ymm0, ymm0, ymm0         ; eight partial sums, all 0
    xor ecx, ecx                    ; element index
dot_loop:
    vmovups ymm1, [a + rcx*4]
    vfmadd231ps ymm0, ymm1, [b + rcx*4]
    add ecx, 8
    cmp ecx, 16
    jb dot_loop

    vextractf128 xmm1, ymm0, 1      ; high half of ymm0 into xmm1
    vaddps xmm0, xmm0, xmm1         ; four partial sums
    vhaddps xmm0, xmm0, xmm0        ; two
    vhaddps xmm0, xmm0, xmm0        ; one, in every lane of xmm0
    vzeroupper

    vmovd r12d, xmm0                ; 236.0 = 0x436C0000

    mov rax, 60
    xor rdi, rdi
    syscall
```

Adding the lanes of one register together is a **horizontal sum**. It takes three steps here:

1. `vextractf128 xmm1, ymm0, 1` copies the high half of `ymm0` into `xmm1`. The immediate 1 selects
   the high half; 0 would select the low one.
2. `vaddps xmm0, xmm0, xmm1` adds the high half to the low half, leaving four sums.
3. `vhaddps xmm0, xmm0, xmm0` adds neighbouring lanes: the result is `[s0+s1, s2+s3, s0+s1, s2+s3]`
   when both sources are `xmm0`. A second `vhaddps` leaves the total in every lane.

`vhaddps` with `ymm` operands does the same within each half, so it would never add a lane of the low
half to a lane of the high half. The extract does that crossing. The total is
`(1+...+8)·1 + (9+...+16)·2 = 36 + 200 = 236`.

## Alignment

`vmovups`, `vmovdqu`, and the memory operand of an arithmetic instruction such as `vaddps` accept any
address. The aligned moves `vmovaps`, `vmovapd` and `vmovdqa` require an address that is a multiple
of 32 for a `ymm` register, or of 16 for an `xmm` register. `align 32` before a label in `.data`
places the label on a multiple of 32.

```x86|playground|avx|no-flags
default rel
global _start

section .data
align 32
v:      dd 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12

section .text
_start:
    mov r8, 1
    vmovdqa ymm0, [v]           ; v is a multiple of 32
    vmovdqu ymm1, [v + 4]       ; any address: the values 2..9
    vmovdqa ymm2, [v + 4]       ; not a multiple of 32: SIGSEGV
    mov r8, 2                   ; never reached

    mov rax, 60
    xor rdi, rdi
    syscall
```

The program stops on the second `vmovdqa` with SIGSEGV, a segmentation fault. `rip` stays on that
instruction, `ymm2` is unchanged and `r8` is still 1. A compiler emits an aligned move only where
it knows the address is aligned, so the fault reveals an address that broke that assumption.

## Checking for AVX

Not every x86-64 processor has AVX, so a program meant to run anywhere asks the `cpuid` instruction
before it uses AVX instructions: `cpuid` with `eax = 1` reports AVX in bit 28 of `ecx`. This
emulator's `cpuid` does not set that bit, although the emulator runs AVX instructions; a real
processor with AVX would set it. A program that checks first therefore takes its SSE path here,
while code that uses AVX instructions directly, like the programs on this page, runs.

## Your turn: scale and offset eight values

Compute `x * scale + offset` for all eight binary32 values at `x`, with the result in `ymm0`.
`scale` and `offset` are single values, so they have to reach every lane first. One FMA instruction
can do the multiplication and the addition.

The fixed code stores `ymm0` to `out` and loads its four qwords into `r12` to `r15`, because a
Testcase reads memory and the general registers but not the vector registers. Each qword holds two
lanes, the lower-numbered one in its low 32 bits.

```x86|playground|avx|memory|exercise
default rel
global _start

section .data
x:          dd 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0
scale:      dd 1.5
offset:     dd -2.0
out:        dd 0, 0, 0, 0, 0, 0, 0, 0

section .text
_start:
    ; your code here

    vmovups [out], ymm0
    mov r12, [out]              ; lanes 0 and 1
    mov r13, [out + 8]          ; lanes 2 and 3
    mov r14, [out + 16]         ; lanes 4 and 5
    mov r15, [out + 24]         ; lanes 6 and 7

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": {
        "r12": "0x3F800000BF000000",
        "r13": "0x4080000040200000",
        "r14": "0x40E0000040B00000",
        "r15": "0x4120000041080000"
    },
    "expectedMemory": [
        {
            "type": "number-chunk",
            "address": "0x402028",
            "bytes": 8,
            "expected": [
                "0x3F800000BF000000",
                "0x4080000040200000",
                "0x40E0000040B00000",
                "0x4120000041080000"
            ]
        }
    ]
}
```

<details>
<summary>Show solution</summary>

```x86|playground|avx|memory|solution
default rel
global _start

section .data
x:          dd 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0
scale:      dd 1.5
offset:     dd -2.0
out:        dd 0, 0, 0, 0, 0, 0, 0, 0

section .text
_start:
    vmovups ymm0, [x]
    vbroadcastss ymm1, [scale]
    vbroadcastss ymm2, [offset]
    vfmadd213ps ymm0, ymm1, ymm2    ; ymm0 = scale * x + offset
                                    ; [-0.5 1.0 2.5 4.0 || 5.5 7.0 8.5 10.0]

    vmovups [out], ymm0
    mov r12, [out]
    mov r13, [out + 8]
    mov r14, [out + 16]
    mov r15, [out + 24]

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
