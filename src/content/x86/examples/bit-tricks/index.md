# Even or odd, count the set bits, multiply by shifting

We will answer four questions about 37 (`0b100101`): is it even, how many bits are set, what is
37 × 10, and is bit 5 set? Run the program, then inspect `r8`, `r9`, `r10`, and `r13` in the
register panel. The exit code at the end changes `rax`, so the answers are saved elsewhere.

```x86|playground|allow-open
default rel
global _start

section .text
_start:
    mov rax, 37             ; 0b100101 in binary

    mov r8, 0               ; setcc writes only one byte
    test rax, 1             ; check the lowest bit without changing rax
    setz r8b                ; 1 if that bit is zero (the number is even)

    mov rbx, rax            ; work on a copy while counting set bits
    xor r9, r9
.count:
    test rbx, rbx
    jz .counted
    mov rcx, rbx
    dec rcx
    and rbx, rcx            ; clear the lowest set bit
    inc r9
    jmp .count
.counted:

    mov r10, rax
    shl r10, 3              ; 37 × 8
    mov r11, rax
    shl r11, 1              ; 37 × 2
    add r10, r11            ; 37 × 10

    mov r13, 0              ; initialize the whole register before setc
    bt rax, 5               ; copy bit 5 into the carry flag
    setc r13b               ; copy that flag into the low byte

    mov rax, 60
    xor rdi, rdi
    syscall
```

The first answer comes from the rightmost bit, bit 0. An even number has a zero there. `test rax, 1`
sets the zero flag when that bit is clear, and `setz r8b` writes 1 in that case. `test` keeps `rax`
at 37, ready for the other questions. `setz` writes only `r8b`; initializing `r8` first makes
the full register a usable 0 or 1. The `test` and `setz` lines stay together so no instruction
changes their flags between them.

## Count by clearing one bit at a time

The loop uses `rbx` as a working copy. On each pass, `rbx & (rbx - 1)` clears its lowest set bit,
while `r9` increases by one. Watch the working copy of 37 in binary:

| `rbx`    | `rbx - 1` | `and` result |
| -------- | --------- | ------------ |
| `100101` | `100100`  | `100100`     |
| `100100` | `100011`  | `100000`     |
| `100000` | `011111`  | `000000`     |

Subtracting one turns the lowest 1 into a 0 and the zeroes to its right into ones. The `and`
therefore removes that one set bit. After each pass, the working copy has one fewer set bit and
the count has increased by one. Three passes leave `rbx = 0` and `r9 = 3`.

The shifts make `r10 = 37 × 8 + 37 × 2 = 370`. Bit positions for `bt` start at 0 on the right:
in `0b100101`, bit 5 is the leftmost 1. `bt` puts that bit in the carry flag; `setc` copies it
into `r13b`. As with `r8`, initializing all of `r13` first makes its full value predictable.

The final saved answers are `r8 = 0` (37 is odd), `r9 = 3`, `r10 = 370` (decimal, or `0x172`),
and `r13 = 1`. In a hexadecimal register view, these are `0x0`, `0x3`, `0x172`, and `0x1`.

## Your turn

Use the same four patterns for 30 (`0b11110`). Write the instructions in the marked blocks.
Leave 1 in `r8` if the number is even and 0 otherwise; count its set bits in `r9`; form
30 × 10 in `r10` using shifts and addition; and leave bit 5's value in `r13`. Initialize
the full `r8` and `r13` registers before writing their low bytes. Save every answer before
the exit setup changes `rax`.

Predict the results, then press **Test**. It expects `r8 = 1`, `r9 = 4`, `r10 = 300`
(`0x12C`), and `r13 = 0`. You can also inspect those registers in the panel.

```x86|playground|exercise
default rel
global _start

section .text
_start:
    mov rax, 30             ; 0b11110

    ; Test the lowest bit. Save 1 for even, 0 for odd in r8.

    ; Count the set bits in a working copy. Save the count in r9.

    ; Make 30 × 10 with shifts and addition. Save it in r10.

    ; Test bit 5. Save its value, 0 or 1, in r13.

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": {
        "r8": 1,
        "r9": 4,
        "r10": 300,
        "r13": 0
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
    mov rax, 30

    mov r8, 0
    test rax, 1
    setz r8b

    mov rbx, rax
    xor r9, r9
.count:
    test rbx, rbx
    jz .counted
    mov rcx, rbx
    dec rcx
    and rbx, rcx
    inc r9
    jmp .count
.counted:

    mov r10, rax
    shl r10, 3
    mov r11, rax
    shl r11, 1
    add r10, r11

    mov r13, 0
    bt rax, 5
    setc r13b

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
