The vector instructions use the 256-bit `ymm` registers and the three-operand **VEX** encoding introduced by **AVX** (Advanced Vector Extensions). This emulator runs them in assembled programs and in imported [Executables](/documentation/x86/executables). This chapter covers which extensions run, how an instruction treats the upper bits of a register, which instructions move data between the two 128-bit halves of a `ymm` register, how memory operands are sized and aligned, and how the fused multiply-add forms are read.

## What runs {#what-runs}

The emulator runs every VEX-encoded instruction of these extensions:

| Extension         | Examples                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------- |
| AVX               | `vaddps`, `vmovups`, `vperm2f128`, `vbroadcastss`, `vzeroupper`                           |
| AVX2              | `vpaddd ymm`, `vpermq`, `vpsllvd`, `vpbroadcastd`, `vinserti128`                          |
| FMA3              | `vfmadd132ps`, `vfmadd213sd`, `vfmsub231pd`, `vfnmadd213ps`                               |
| F16C              | `vcvtph2ps`, `vcvtps2ph`                                                                  |
| Gathers           | `vpgatherdd`, `vgatherdps`, `vgatherqpd`                                                  |
| Masked moves      | `vmaskmovps`, `vpmaskmovd`                                                                |
| BMI1, BMI2        | `andn`, `blsr`, `blsmsk`, `blsi`, `bextr`, `bzhi`, `pdep`, `pext`, `mulx`, `rorx`, `shlx` |
| AES-NI, PCLMULQDQ | `vaesenc`, `vaesdec`, `vaeskeygenassist`, `vpclmulqdq xmm`                                |
| SSE4.1, SSE4.2    | `vpminsd`, `vpmovzxbw`, `vblendvps`, `vptest`, `vroundps`, `vdpps`, `vpcmpistri`          |

Most of SSE4.1, SSE4.2 and AES-NI run only in their `v` form: write `vpminsd xmm0, xmm0, xmm1`, not `pminsd xmm0, xmm1`. The legacy encodings without `v` stop the program with `SIGILL`, the illegal-instruction signal, and the **Log** names the instruction: "The program ran `pminsd xmm0, xmm1` at `0x401000`, which the emulator does not support". Four run in both forms: `pmulld`, `movntdqa`, `pclmulqdq` and `crc32`, which has no `v` form. SSE, SSE2, SSE3 and SSSE3 run in both forms.

These do not run, and stop the program with `SIGILL` in the same way:

- **AVX-512**: the EVEX encoding, the `zmm` registers, `ymm16` to `ymm31`, the `k` mask registers, masking such as `{k1}{z}` and embedded broadcasts such as `{1to16}`. The Log says "AVX-512 instructions are not currently supported."
- **VAES**, the 256-bit forms of the AES instructions, such as `vaesenc ymm0, ymm1, ymm2`.
- The 256-bit form of `vpclmulqdq`.
- **MMX**: every instruction on the 64-bit `mm` registers, such as `paddd mm0, mm1` or `movq mm0, rax`. Only `emms` runs, and does nothing.

## CPUID {#cpuid}

The emulator's `cpuid` reports none of AVX, AVX2, FMA, F16C, BMI, AES-NI, SSE4.1 or SSE4.2, although it runs them; of the extensions above it reports only PCLMULQDQ (bit 1 of `ecx` with `eax = 1`). `cpuid` with `eax = 1` leaves bit 28 of `ecx` (AVX) clear, and with `eax = 7, ecx = 0` it leaves bit 5 of `ebx` (AVX2) and the BMI bits clear. A processor that runs AVX reports it there, and a program checks two more things before it uses AVX: bit 27 of `ecx` (OSXSAVE), and the `xgetbv` instruction, which says whether the operating system saves the `ymm` registers. Here bits 27 and 28 are clear, so such a program takes its SSE2 path, while code that uses AVX instructions without asking runs.

## Registers {#registers}

There are sixteen vector registers, `ymm0` to `ymm15`, each 256 bits wide, and `xmmN` is the low 128 bits of `ymmN`. Writing `xmm3` writes part of `ymm3`; there is no separate storage. The low 128 bits of a `ymm` register are its **low half**, bits 128 to 255 its **high half**.

The **Registers** panel has an **AVX** tab beside **SSE** and **x87**. It shows each `ymm` register as one 256-bit row, which can be read as four doubles, eight singles, or hex. The SSE tab shows the low halves as `xmm0` to `xmm15`, with `mxcsr`.

Floating-point lanes are numbered from the low bits: lane 0 of `ymm0` is bits 0 to 31 when it holds singles. In memory, lane 0 is at the lowest address.

## Upper bits {#upper-bits}

How an instruction that writes an `xmm` register treats bits 128 to 255 depends on its encoding:

| Instruction               | Writes     | Bits 128 to 255 of the destination        |
| ------------------------- | ---------- | ----------------------------------------- |
| `addps xmm0, xmm1`        | bits 0–127 | unchanged                                 |
| `vaddps xmm0, xmm1, xmm2` | bits 0–127 | set to zero                               |
| `vaddps ymm0, ymm1, ymm2` | bits 0–255 | the result                                |
| `vaddss xmm0, xmm1, xmm2` | bits 0–31  | set to zero; bits 32–127 come from `xmm1` |

A legacy SSE instruction, written without `v`, preserves the high half. A VEX instruction with `xmm` operands zeroes it. A scalar VEX instruction takes bits 32 to 127 from its **first source**, not from the destination: `vaddss xmm0, xmm1, xmm2` puts `xmm1[0] + xmm2[0]` in bits 0 to 31, copies bits 32 to 127 of `xmm1`, and zeroes bits 128 to 255. The legacy `addss xmm0, xmm1` keeps bits 32 to 255 of `ymm0`. The same holds for `vmovss` and `vmovsd` between registers, the other scalar arithmetic, and the scalar conversions such as `vcvtsi2sd xmm0, xmm1, rax`.

`vzeroupper` sets bits 128 to 255 of all sixteen registers to zero; `vzeroall` sets all 256 bits of all sixteen to zero. A legacy SSE instruction must preserve the high halves, which makes it slow on many processors while some high half holds nonzero bits. Compilers therefore emit `vzeroupper` at the end of 256-bit code before a `call` or `ret`. The emulator does not model that cost; it applies the rules in the table.

## Three operands {#three-operands}

Most `v` instructions take a destination and two sources: `vaddps ymm0, ymm1, ymm2` computes `ymm0 = ymm1 + ymm2` and changes neither source. The second source can be a memory operand, `vaddps ymm0, ymm1, [rel b]`; the first source is a register. An instruction that has an immediate takes it last, as in `vshufps ymm0, ymm1, ymm2, 0x44`.

Moves, conversions and some others keep two operands: `vmovups ymm0, [rel a]`, `vcvtdq2ps ymm0, ymm1`, `vpshufd ymm0, ymm1, 0x1b`. The FMA instructions have three operands and overwrite the first, which is also an input; see [FMA](#fma).

A `v` mnemonic names the AVX form of the SSE instruction without the `v`: `vaddps` does what `addps` does, on 128 or 256 bits, with a separate destination.

## 128-bit lanes {#lanes}

Most 256-bit instructions operate on the two 128-bit halves separately and identically, as two 128-bit instructions would. Intel's manuals call each half a **128-bit lane**. For lane-wise arithmetic this makes no difference. For instructions that rearrange data, it means a value cannot move from one half to the other.

These never move data between the halves; their index or immediate selects within the half:

- `vpshufb`: each control byte's low four bits pick a byte of the same half; a control byte with bit 7 set gives zero.
- `vpshufd`, `vpshuflw`, `vpshufhw`, `vshufps` and `vpermilps` with an immediate: the same immediate is applied to each half.
- `vshufpd` and `vpermilpd` with an immediate: one bit per element, so the low half takes bits 0 and 1 and the high half bits 2 and 3. `vshufpd ymm0, ymm1, ymm2, 1` gives `ymm1[1], ymm2[0]` in the low half and `ymm1[2], ymm2[2]` in the high half.
- `vpermilps` and `vpermilpd` with a register: each element's control is in the same element of the control register and picks within its half.
- `vpalignr`: concatenates and shifts each half separately.
- `vpunpcklbw` and the other `vpunpck*`, `vunpcklps`, `vunpckhps`: interleave within each half, so `vpunpcklbw ymm` takes bytes 0–7 and 16–23 of its sources.
- `vpacksswb`, `vpackssdw`, `vpackuswb`, `vpackusdw`: pack each half separately. The low half of the result holds the packed low half of the first source, then that of the second; the high half holds their packed high halves in the same order.
- `vhaddps`, `vhaddpd`: add neighbouring lanes within each half.
- `vpslldq`, `vpsrldq`: shift each half by bytes.

These move data between the halves:

| Instruction                                                      | What it does                                                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `vperm2f128`, `vperm2i128`                                       | build each half of the result from either half of either source, or zero, by the immediate |
| `vpermq`, `vpermpd`                                              | place any of the four qwords in each qword position, by the immediate                      |
| `vpermd`, `vpermps`                                              | place any of the eight dwords in each dword position, by the indices in a register         |
| `vinsertf128`, `vinserti128`                                     | replace one half with an `xmm` register or 16 bytes of memory                              |
| `vextractf128`, `vextracti128`                                   | copy one half to an `xmm` register or to memory                                            |
| `vbroadcastss`, `vbroadcastsd`, `vpbroadcast*`, `vbroadcastf128` | copy one element, or 16 bytes, to every position                                           |
| `vpmovzx*`, `vpmovsx*`                                           | widen the elements of a 128-bit source into a 256-bit destination                          |
| `vcvtdq2pd ymm, xmm`, `vcvtps2pd ymm, xmm`                       | widen four elements to four doubles                                                        |
| `vcvtpd2ps xmm, ymm`, `vcvttpd2dq xmm, ymm`                      | narrow four doubles to four 32-bit elements in an `xmm` register                           |

A shift by an `xmm` count, such as `vpsllw ymm0, ymm1, xmm2`, shifts both halves by the same count, the low 64 bits of `xmm2`. The variable shifts `vpsllvd`, `vpsrlvd`, `vpsravd`, `vpsllvq` and `vpsrlvq` shift each element by the count in the same element of the last operand.

To reduce a whole `ymm` register to one value, cross once and then work in 128 bits:

```x86
    vextractf128 xmm1, ymm0, 1      ; high half of ymm0
    vaddps xmm0, xmm0, xmm1         ; four sums
    vhaddps xmm0, xmm0, xmm0        ; two sums, each twice
    vhaddps xmm0, xmm0, xmm0        ; the total in every lane
```

## Memory operands {#memory}

A 256-bit memory operand is 32 bytes, a 128-bit one 16 bytes. NASM takes the size from the register operand where it can, so `vmovdqu ymm0, [rel v]` and `vaddps ymm0, ymm1, [rel v]` need no size. Where the register does not decide it, write the size: `yword` is 32 bytes and `oword` 16. NASM has no `xword`.

```x86
    vcvtpd2ps xmm0, yword [rel p]   ; four doubles from 32 bytes
    vcvtpd2ps xmm0, oword [rel p]   ; two doubles from 16 bytes
    vcvtdq2pd ymm1, oword [rel i]   ; four dwords from 16 bytes
```

Without a size, `vcvtpd2ps xmm0, [rel p]` assembles as the 16-byte form and converts two doubles, with no error.

## Alignment {#alignment}

Only the aligned moves require an aligned address: `vmovaps`, `vmovapd`, `vmovdqa`, `vmovntps`, `vmovntpd`, `vmovntdq` and `vmovntdqa` need a multiple of 16 with an `xmm` register and a multiple of 32 with a `ymm` register. Any other address ends the program with `SIGSEGV`, a segmentation fault, with `rip` on the instruction. An instruction that faults changes no register and no memory, apart from a gather, below.

Every other instruction accepts any address: `vmovups`, `vmovupd`, `vmovdqu`, the broadcasts, and the memory operand of arithmetic, compare, shuffle and conversion instructions. On a processor, the legacy SSE forms require 16-byte alignment for a memory operand, as in `addps xmm0, [rel v]`, and their `v` forms do not. This emulator checks the alignment of the legacy aligned moves and of most integer SSE instructions (`movaps`, `movdqa`, `paddd`, `pxor`), but not of the floating-point arithmetic ones, `pshufd` and its relatives, or `palignr`, so `addps xmm0, [rel v + 4]` runs here and faults on a processor.

`align 32` before a label in `.data` or `.bss` places it on a multiple of 32:

```x86
section .data
align 32
table:  dd 1, 2, 3, 4, 5, 6, 7, 8

section .text
    vmovdqa ymm0, [rel table]       ; aligned: loads
    vmovdqa ymm1, [rel table + 4]   ; misaligned: SIGSEGV
```

A masked move reads and writes only the elements its mask selects. `vmaskmovps ymm0, ymm1, [rsi]` loads the elements whose mask element in `ymm1` has its top bit set and sets the others to zero; an element left out of the mask does not fault even when its address is not mapped. A gather such as `vpgatherdd ymm0, [rsi + ymm1*4], ymm2` loads element `i` from `rsi + ymm1[i]*4` where the top bit of `ymm2[i]` is set, and sets `ymm2` to zero when it completes. If an element's address faults, the elements before it stay loaded and their mask elements cleared, so the gather can be run again to finish.

## Instruction families {#families}

The vector instructions group into these families. Each mnemonic has packed and scalar, 128-bit and 256-bit forms where the suffix allows it.

| Family                      | Representative mnemonics                                              | Notes                                                                                |
| --------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Moves                       | `vmovups`, `vmovdqu`, `vmovaps`, `vmovd`, `vmovq`                     | `vmovaps` and `vmovdqa` require [alignment](#alignment)                              |
| Arithmetic                  | `vaddps`, `vmulpd`, `vpaddd`, `vpmulld`, `vsqrtps`                    | integer forms on `ymm` are AVX2                                                      |
| Compare, minimum, maximum   | `vcmpps`, `vpcmpeqd`, `vpcmpgtq`, `vminps`, `vpmaxsd`                 | comparisons write all-one or all-zero elements                                       |
| Shuffles and permutes       | `vpshufb`, `vshufps`, `vpermq`, `vperm2f128`, `vpermd`                | see [128-bit lanes](#lanes)                                                          |
| Blends and masks            | `vblendps`, `vblendvps`, `vpblendvb`, `vptest`, `vmovmskps`           | `vblendv*` selects by the top bit of each element of the last operand                |
| Conversions                 | `vcvtdq2ps`, `vcvtps2pd`, `vcvttps2dq`, `vcvtph2ps`, `vcvtps2ph`      | `vcvtph2ps` and `vcvtps2ph` convert half precision (F16C)                            |
| Fused multiply-add          | `vfmadd231ps`, `vfmsub213pd`, `vfnmadd132ss`                          | see [FMA](#fma)                                                                      |
| Gathers, masked moves       | `vpgatherdd`, `vgatherdps`, `vmaskmovps`, `vpmaskmovd`                | see [Alignment](#alignment)                                                          |
| Bit manipulation            | `andn`, `bextr`, `bzhi`, `pdep`, `pext`, `shlx`, `rorx`, `mulx`       | BMI1 and BMI2 work on general registers; `shlx` and `rorx` leave the flags unchanged |
| AES and carry-less multiply | `vaesenc`, `vaesenclast`, `vaesdec`, `vaeskeygenassist`, `vpclmulqdq` | 128-bit forms only                                                                   |
| String compares             | `vpcmpistri`, `vpcmpistrm`, `vpcmpestri`, `vpcmpestrm`                | 128-bit forms only                                                                   |

## FMA {#fma}

A fused multiply-add computes `a * b + c` and rounds once, where `vmulps` followed by `vaddps` rounds the product and then the sum. The two results can differ:

```x86
section .data
a:  dd 0x3F800001                   ; 1 + 2^-23
b:  dd 0x3F7FFFFE                   ; 1 - 2^-23
c:  dd -1.0

section .text
    vmovss xmm0, [rel a]
    vmovss xmm1, [rel b]
    vmovss xmm2, [rel c]
    vmulss xmm3, xmm0, xmm1         ; 1 - 2^-46 rounds to 1.0
    vaddss xmm3, xmm3, xmm2         ; 0.0
    vmovaps xmm4, xmm0
    vfmadd213ss xmm4, xmm1, xmm2    ; -2^-46, 0xA8800000
```

The three digits of the mnemonic name the operands by position, destination first: 1 is the destination, 2 the middle operand, 3 the last, which can be memory. The first two digits are multiplied, the third is added, and the result replaces operand 1:

| Form                     | Computes          | Typical use                                        |
| ------------------------ | ----------------- | -------------------------------------------------- |
| `vfmadd132ps y1, y2, y3` | `y1 = y1*y3 + y2` | the multiplier is in memory, the addend a register |
| `vfmadd213ps y1, y2, y3` | `y1 = y2*y1 + y3` | Horner's rule: `y1 = x*y1 + c`                     |
| `vfmadd231ps y1, y2, y3` | `y1 = y2*y3 + y1` | accumulating products into `y1`                    |

The other FMA mnemonics follow the same numbering: `vfmsub` computes `a*b - c`, `vfnmadd` `-(a*b) + c`, `vfnmsub` `-(a*b) - c`, and `vfmaddsub` and `vfmsubadd` alternate subtraction and addition by element. The suffixes `ps`, `pd`, `ss` and `sd` mean what they mean for `vaddps`.

## Floating-point results {#floating-point}

On a processor, the vector floating-point instructions round by the rounding-control field of `mxcsr`, which starts at round to nearest, ties to even. This emulator follows that field only in `vroundps`, `vcvtps2ph` and the conversions to integers; its arithmetic, fused multiply-adds and other conversions round to nearest whatever `mxcsr` says, and no instruction sets the exception flags of `mxcsr` apart from the invalid-operation flag of `vcomiss` and its relatives. `vroundps` uses the field when bit 2 of its immediate is set (`vroundps ymm0, ymm1, 4`), and otherwise the mode in bits 0 and 1 of the immediate: 0 nearest, 1 down, 2 up, 3 toward zero. The conversions `vcvtps2dq` and `vcvtpd2dq` round by `mxcsr`; the `vcvtt` forms truncate toward zero. `vstmxcsr` and `vldmxcsr` store and load `mxcsr`.

When an arithmetic result is a NaN, which NaN comes out of an operation on two NaNs is not something to rely on: examples and tests should not depend on its payload. `vrcpps` and `vrcpss` return the correctly rounded reciprocal here, and `vrsqrtps` and `vrsqrtss` divide 1 by the rounded square root, which can be one unit off the correctly rounded result. A processor returns an approximation with a relative error up to 1.5 × 2⁻¹², and different processors return different approximations, so a program that compares their results bit for bit can pass here and fail elsewhere.

## Where AVX code comes from {#sources}

AVX instructions reach the emulator in two ways: assembly written in the editor, and imported [Executables](/documentation/x86/executables). An Executable built elsewhere with AVX, for example by GCC with `-mavx2`, runs, and its Listing shows its AVX instructions, which can be stepped and given Breakpoints like any other. A program that selects its code by `cpuid` takes its non-AVX path here; see [CPUID](#cpuid).

The editor's own C and C++ [Compile](/documentation/x86/using-c) does not produce AVX. It translates GCC's output to NASM and accepts only the x86-64 baseline with SSE, SSE2 and SSE3, so a vector loop in C is compiled to SSE2. To use AVX from a compiled C program, write the function in an assembly File and call it, as [Linking project Files](/documentation/x86/using-c#linking-project-files) describes. Under the System V calling convention every `ymm` register is caller-saved, and a function that returns after using 256-bit registers should execute `vzeroupper` first.
