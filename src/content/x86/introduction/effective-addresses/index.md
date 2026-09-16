# Effective addresses

For the ordinary bracketed memory operands used in this course in 64-bit mode, x86 can calculate an
address from this pattern:

```
[base + index * scale + displacement]
```

The calculated number is the **effective address**: the address of the first byte that the
instruction accesses.

- **base** is the value in a 64-bit general-purpose register.
- **index** is the value in a 64-bit general-purpose register, which may be the same register as the
  base. `rsp` cannot be the index.
- **scale** is `1`, `2`, `4`, or `8`.
- **displacement** is a fixed integer such as `8` or `-16`.

The base, index, and displacement are independently optional, but the expression must contain at
least one component. The scale belongs to the index, so it is omitted when there is no index.

Here are several valid shapes:

```x86
    mov r8, [rbx]                 ; base
    mov r8, [rbx + 8]             ; base + displacement
    lea r13, [rsi*8]              ; index * scale, with no base
    mov r8, [rbx + rsi*8]         ; base + index * scale
    mov r8, [rbx + rsi*8 + 16]    ; all four parts
```

In each `mov`, the processor calculates the address and then reads a qword from memory because `r8`
is a 64-bit register.

## Indexing a qword array

In this lesson, array indices start at zero. Index 0 selects the first element, index 1 selects the
second, and index 2 selects the third. This is called **zero-based indexing**.

Suppose a four-qword array begins at address `0x402000`:

| index | byte offset | effective address | value there |
| ----: | ----------: | ----------------: | ----------: |
| 0     | `0 * 8 = 0`  | `0x402000`         | 10          |
| 1     | `1 * 8 = 8`  | `0x402008`         | 20          |
| 2     | `2 * 8 = 16` | `0x402010`         | 30          |
| 3     | `3 * 8 = 24` | `0x402018`         | 40          |

Each qword occupies eight bytes, so the byte offset of index `i` is `i * 8`. If `rbx` contains the
array's starting address and `rsi` contains the index, `[rbx + rsi*8]` selects that qword.

```x86|playground|no-flags
default rel
global _start

section .data
arr:    dq 10, 20, 30, 40

section .text
_start:
    lea rbx, [rel arr]          ; rbx = address of the first qword
    mov rsi, 2                  ; zero-based index 2 means the third qword

    mov r8,  [rbx]             ; index 0: address arr + 0, value 10
    mov r9,  [rbx + 8]         ; index 1: address arr + 8, value 20
    mov r10, [rbx + rsi*8]     ; index 2: address arr + 16, value 30
    mov r12, [rbx + rsi*8 + 8] ; address arr + 24, value 40

    mov rax, 60
    mov rdi, 0
    syscall
```

After the four loads, `r8 = 10`, `r9 = 20`, `r10 = 30`, and `r12 = 40`. Those values remain in the
same registers when the program exits.

The four scale values are an x86 encoding rule. They also match the common strides of byte, word,
dword, and qword arrays:

| element width | byte stride | scale |
| ------------- | ----------: | ----: |
| byte          | 1           | 1     |
| word          | 2           | 2     |
| dword         | 4           | 4     |
| qword         | 8           | 8     |

The processor does not know the declared type of an array and does not choose the scale for you. A
qword load with scale 4 still reads eight bytes; it simply starts at the wrong address for qword
indexing. When an element's byte stride is not 1, 2, 4, or 8, calculate the needed byte offset in a
register before using it in a memory operand.

## `lea` calculates the number

Compare these two instructions when `rbx` is the array address and `rsi` is 2:

```x86
    mov r12, [rbx + rsi*8]
    lea r13, [rbx + rsi*8]
```

`mov` calculates `rbx + rsi * 8`, accesses memory at that address, and puts the qword stored there
in `r12`. For the array above, that value is 30.

`lea` calculates the same number and puts the number itself in `r13`. It does not access memory. If
`rbx` is `0x402000`, then `r13` becomes `0x402010`, the address of the qword containing 30.

The name `lea` means **load effective address**. Its bracketed operand describes a calculation, while
its first operand is the one destination register:

```x86
    lea r13, [rbx + rsi*8]      ; r13 = address of array[index]
```

The calculated number does not have to be used as an address. The same allowed scales make `lea`
useful for a few compact integer calculations:

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov rsi, 7

    lea r12, [rsi + 1]          ; 7 + 1 = 8
    lea r13, [rsi*8]            ; 7 * 8 = 56
    lea r14, [rsi + rsi*4]      ; 7 + 7 * 4 = 35
    lea r15, [rsi*8 + 3]        ; 7 * 8 + 3 = 59

    mov rax, 60
    mov rdi, 0
    syscall
```

At exit, `r12 = 8`, `r13 = 56`, `r14 = 35`, and `r15 = 59`. In the third calculation, `rsi` fills
both the base and index roles, so the result is five times `rsi`.

## Your turn

`grid` contains four qwords. Read two groups of indexed elements, using `rbx` as the base address and
each index with the qword scale.

- For the first group, `r12`, `r13`, and `r14` contain indices 3, 0, and 2. Put the selected qwords
  in `r8`, `r9`, and `r10`.
- For the second group, `r15`, `rsi`, and `rdx` contain indices 1, 3, and 0. Put the selected qwords
  in `r12`, `r13`, and `r14`. The first group has already used their original index values, so these
  registers can now hold results.

```x86|playground|exercise
default rel
global _start

section .data
grid:   dq 10, 20, 30, 40

section .text
_start:
    lea rbx, [rel grid]
    ; your code here

    mov rax, 60
    mov rdi, 0
    syscall
```

```testcase
{
    "startingRegisters": {
        "r12": 3,
        "r13": 0,
        "r14": 2,
        "r15": 1,
        "rsi": 3,
        "rdx": 0
    },
    "expectedRegisters": {
        "r8": 40,
        "r9": 10,
        "r10": 30,
        "r12": 20,
        "r13": 40,
        "r14": 10
    }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .data
grid:   dq 10, 20, 30, 40

section .text
_start:
    lea rbx, [rel grid]
    mov r8,  [rbx + r12*8]
    mov r9,  [rbx + r13*8]
    mov r10, [rbx + r14*8]
    mov r12, [rbx + r15*8]
    mov r13, [rbx + rsi*8]
    mov r14, [rbx + rdx*8]

    mov rax, 60
    mov rdi, 0
    syscall
```

</details>

Now calculate `9 * x + 2` for three inputs. The inputs are `r8 = 0`, `r9 = 1`, and `r10 = 5`.
Put the corresponding results 2, 11, and 47 in `r12`, `r13`, and `r14`. Try using `lea` for each
calculation: nine times a value can be written as the value plus eight times the value.

```x86|playground|exercise
default rel
global _start

section .text
_start:
    ; your code here

    mov rax, 60
    mov rdi, 0
    syscall
```

```testcase
{
    "startingRegisters": {
        "r8": 0,
        "r9": 1,
        "r10": 5
    },
    "expectedRegisters": {
        "r12": 2,
        "r13": 11,
        "r14": 47
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
    lea r12, [r8 + r8*8 + 2]
    lea r13, [r9 + r9*8 + 2]
    lea r14, [r10 + r10*8 + 2]

    mov rax, 60
    mov rdi, 0
    syscall
```

</details>

## Label addresses and `default rel`

A label such as `arr` names an address chosen when the program is assembled and linked. In 64-bit
mode, `default rel` tells NASM to use a RIP-relative reference for a bare label when that instruction
form allows it. Writing `rel` makes the choice explicit:

```x86
    mov r8, [rel arr]           ; read the qword at arr
    lea rbx, [rel arr]          ; calculate the address of arr
```

`rip` is the **instruction pointer**, the register that identifies the instruction being executed. In
this addressing form, it supplies the address immediately after the current instruction. The two
instructions above encode the signed distance from that address to `arr`, and the processor adds the
distance to `rip` while the instruction runs. The distance must fit in a signed 32-bit displacement.
This form lets the reference remain valid if the code and nearby data move together.

RIP-relative addressing cannot include an index register in the same memory operand. For indexed
arrays, first put the label's address in a register, then use that register as the base:

```x86
    lea rbx, [rel arr]
    mov r8, [rbx + rsi*8]
```

This is the practical pattern used throughout the lesson.
