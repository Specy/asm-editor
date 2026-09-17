# The flags register

Integer instructions can produce information besides the value written to their destination. x86
stores that information as individual bits in a register named `rflags`. The editor shows those
bits together in the flags row.

This lesson uses four arithmetic status flags:

| flag | meaning after an operation                                                                 |
| ---- | ------------------------------------------------------------------------------------------ |
| `ZF` | The result used to compute the flags is zero.                                              |
| `SF` | The top bit of the result used to compute the flags is 1.                                  |
| `CF` | An unsigned addition carried out of the chosen width, or an unsigned subtraction borrowed. |
| `OF` | The mathematical signed result is outside the signed range for the chosen width.           |

`ZF` is the **zero flag**, `SF` the **sign flag**, `CF` the **carry flag**, and `OF` the
**overflow flag**. The panel also displays other flags, including `PF` and `AF`. They may change
too, but the tables, comments, and explanations here report only the four flags above.

## Flags use the operation's width

The operand names select the width of an operation. `add al, 1` is an 8-bit addition, while
`add rax, 1` is a 64-bit addition. The flags describe the result at that selected width.

For a byte operation, only eight result bits are retained. Its top bit is bit 7, its unsigned range
is 0 to 255, and its signed range is -128 to 127. These two byte additions therefore set different
flags:

| operation  | byte result | `ZF` | `SF` | `CF` | `OF` |
| ---------- | ----------- | ---: | ---: | ---: | ---: |
| `0x7F + 1` | `0x80`      |    0 |    1 |    0 |    1 |
| `0xFF + 1` | `0x00`      |    1 |    0 |    1 |    0 |

In the first row, signed 127 plus 1 is outside the signed byte range, so `OF` is 1. The unsigned
answer 128 fits, so `CF` is 0. In the second row, unsigned 255 plus 1 needs a ninth bit, so `CF` is

1. Read as signed, `0xFF` is -1, and -1 plus 1 is 0, so `OF` is 0.

Subtraction gives `CF` the related unsigned meaning of a borrow. A qword calculation of `3 - 5`
cannot be represented as an unsigned qword without wrapping, so it sets `CF`. Its retained result
is `0xFFFFFFFFFFFFFFFE`: it is not zero, and its top bit is 1, so `ZF` is 0 and `SF` is 1. The signed
result -2 fits in a qword, so `OF` is 0.

## Watch four results

Build this program and keep the flags row visible while stepping through it:

```x86|playground
default rel
global _start

section .text
_start:
    mov rax, 5
    sub rax, 5              ; qword 0: ZF=1, SF=0, CF=0, OF=0

    mov rbx, 3              ; mov preserves those flags
    sub rbx, 5              ; qword -2: ZF=0, SF=1, CF=1, OF=0

    mov rcx, 0x7F           ; mov preserves the flags again
    add cl, 1               ; byte 0x80: ZF=0, SF=1, CF=0, OF=1

    mov rdx, 0xFF
    add dl, 1               ; byte 0: ZF=1, SF=0, CF=1, OF=0

    mov rax, 60
    mov rdi, 0
    syscall
```

Inspect the four focus flags immediately after each `sub` or `add`, before stepping over the next
arithmetic instruction. After the final `add`, the two exit-setup `mov` instructions still preserve
the flags; inspect them before stepping over `syscall`. The `mov` instructions between arithmetic
operations also preserve the existing flags. For example, after `sub rbx, 5`, the following
`mov rcx, 0x7F` does not erase the subtraction's `SF` and `CF` values.

## Flags keep their values

A status flag keeps its current value until a later instruction changes that flag. This is why an
instruction can produce flags and a later instruction can use them.

Many integer arithmetic and bitwise instructions update status flags. The exact set depends on the
instruction: for example, `add` and `sub` update all four flags discussed here, while `inc` and
`dec` leave `CF` unchanged. The `mov` and `lea` forms used in this course do not change these four
flags, and an ordinary unconditional `jmp` does not change them either. When preservation matters,
check the particular instruction rather than assuming that every calculation has the same effect.

## `cmp` and `test` produce flags

Two common instructions update flags without writing an arithmetic result to a general-purpose
register:

- `cmp left, right` updates flags as if it had calculated `left - right` at the operands' width. It
  discards that arithmetic result and leaves both operands unchanged.
- `test left, right` updates flags from `left AND right` at the operands' width. It discards the AND
  result and leaves both operands unchanged. For `test`, `CF` and `OF` are cleared, while `ZF` and
  `SF` describe the AND result.

The width rule still applies even when the result is discarded. This example uses the same bits in
a qword `test` and a byte `test`:

```x86|playground
default rel
global _start

section .text
_start:
    mov rax, 0x80
    test rax, rax           ; qword result 0x80: ZF=0, SF=0
    test al, al             ; byte result 0x80: ZF=0, SF=1

    mov rbx, 9
    cmp rbx, 9              ; hypothetical qword subtraction is 0: ZF=1
    mov rcx, rbx            ; rbx and the flags are unchanged

    mov rax, 60
    mov rdi, 0
    syscall
```

After `test rax, rax`, bit 63 of the qword result is clear, so `SF` is 0. After `test al, al`, bit 7
of the byte result is set, so `SF` is 1. Then `cmp rbx, 9` sets `ZF` because the subtraction used to
compute its flags would produce zero; `rbx` remains 9 because `cmp` discards that result. Inspect
after the first `test` before stepping over the second, after the second `test` before stepping over
`cmp`, and after `cmp` before stepping over `syscall`.
