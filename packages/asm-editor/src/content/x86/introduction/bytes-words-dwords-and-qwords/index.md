# Bytes, words, dwords and qwords

A general-purpose register family is 64 bits wide, but x86 instructions can work on its low 8, 16,
32, or all 64 bits. The width of an operation decides how many bits take part. Those bits can then
be interpreted as an unsigned number, a signed number, an address, or simply a bit pattern.

## The four widths

| name  | bytes | bits | unsigned range            | signed range                                |
| ----- | ----- | ---- | ------------------------- | ------------------------------------------- |
| byte  | 1     | 8    | 0 to 255                  | -128 to 127                                 |
| word  | 2     | 16   | 0 to 65535                | -32768 to 32767                             |
| dword | 4     | 32   | 0 to 4294967295           | -2147483648 to 2147483647                   |
| qword | 8     | 64   | 0 to 18446744073709551615 | -9223372036854775808 to 9223372036854775807 |

The register names from the previous lesson select these widths: `al` is a byte, `ax` is a word,
`eax` is a dword, and `rax` is a qword. Numbered register families follow the same pattern with names
such as `r8b`, `r8w`, `r8d`, and `r8`.

Memory references need a width too, but the way it is written depends on the instruction:

- In an ordinary move between a register and memory, the register selects the memory width.
  `mov eax, [value]` loads a dword, while `mov [value], ax` stores a word.
- An extension instruction has two different widths. Its destination register supplies the wider
  destination, and a memory source needs `byte`, `word`, or `dword` to state the narrower source:
  `movsx rbx, byte [value]`.
- A numeric immediate has no register width. An immediate-to-memory store therefore needs an
  explicit memory size, as in `mov word [value], 5`.

A data directive such as `db` or `dq` lays out a certain number of bytes, but its label remains an
address. It does not make later memory accesses remember the declaration's size.

## One pattern, two readings

There are no signed and unsigned versions of a general-purpose register. The byte pattern `0xFF`
can be read as unsigned 255 or signed -1. A `mov` copies the pattern without choosing between those
meanings.

Signed integers use **two's complement**. To form the negative of a bit pattern, flip every bit and
add 1. In one byte, positive 1 is `00000001`; flipping it gives `11111110`, and adding 1 gives
`11111111`. That final pattern is signed -1 and unsigned 255.

For a signed value, the highest bit is the **sign bit**. It is 1 for a negative value and 0 for a
non-negative value. The same all-ones pattern represents -1 at every width:

| width | pattern for signed -1 |
| ----- | --------------------- |
| byte  | `FF`                  |
| word  | `FFFF`                |
| dword | `FFFFFFFF`            |
| qword | `FFFFFFFFFFFFFFFF`    |

Two's complement lets the processor use the same fixed-width addition for both readings. The
meaning of the result depends on how the program interprets it.

## Fixed-width arithmetic wraps

An 8-bit operation can keep only eight result bits. If a mathematical answer needs more, the bits
above bit 7 are discarded. This is arithmetic modulo 256: after 255 comes 0.

```x86|playground
default rel
global _start

section .text
_start:
    mov r8, 0x1122334455667700
    mov r8b, 200
    add r8b, 100             ; 300 becomes 44 in eight bits

    mov ebx, 0x7FFFFFFF
    add ebx, 1               ; one past the largest signed dword

    mov rax, 60
    mov rdi, 0
    syscall
```

The mathematical sum `200 + 100` is 300, whose binary form is `1_0010_1100`. The byte addition
keeps `0010_1100`, so `r8b` becomes `0x2C`, or 44. Because only the low byte participated, the full
`r8` becomes `0x112233445566772C`.

The unsigned reading crossed its boundary: 255 is the largest unsigned byte, and 300 is 44 after
one wrap. The signed reading is different. In a byte, the starting pattern for 200 is signed -56,
so that same addition is -56 + 100 = 44, which fits the signed byte range.

The processor records those two views separately immediately after arithmetic. `CF` reports that an
unsigned result did not fit, while `OF` reports that a signed result did not fit. After the byte
addition above, `CF` is 1 and `OF` is 0. Step over that `add` to see them before later instructions
replace the flags.

The dword addition produces the pattern `0x80000000`. Unsigned, that is 2147483648 and it fits.
Signed, adding 1 to 2147483647 has crossed the signed maximum and wrapped to -2147483648, so this
addition sets `OF` and clears `CF`. Integer addition continues with the wrapped bits; it does not
stop the program.

## Widening a small value

Loading a byte with `mov bl, [value]` makes that byte available for 8-bit work, but it replaces only
the low byte of `rbx`. The other 56 bits keep their previous contents. To use the byte as a clean
wider value, choose how its meaning should be preserved:

- **`movzx`** zero-extends. It fills the new high bits with zero, preserving the unsigned reading.
- **`movsx`** sign-extends. It copies the old sign bit into the new high bits, preserving the signed
  reading.
- **`movsxd`** sign-extends a dword to a qword.

```x86|playground|no-flags
default rel
global _start

section .data
sb: db -3           ; FD
sw: dw -3           ; FD FF
sd: dd -3           ; FD FF FF FF

section .text
_start:
    movzx r12, byte [sb]        ; 0x00000000000000FD, unsigned 253
    movsx r13, byte [sb]        ; 0xFFFFFFFFFFFFFFFD, signed -3
    movsx r14, word [sw]        ; signed -3 from a word
    movsxd r15, dword [sd]      ; signed -3 from a dword

    mov rax, 60
    mov rdi, 0
    syscall
```

The destination names select 64-bit results. The keywords before the brackets select how many bytes
to read before extending them. In the first two lines, the same memory byte `FD` becomes 253 after
zero extension and -3 after sign extension.

Changing `byte [sb]` to `word [sb]` would deliberately read two adjacent bytes starting at `sb`.
Here that word would be `FDFD`: the `FD` at `sb`, followed by the first `FD` byte of `sw`. This
crosses from one declaration into the next. It is useful for seeing that a label carries no size,
but real code should depend on neighboring layout only when it intentionally defines the bytes as
one larger object.

## Your turn

`amount` is a byte intended to be read as signed -5. Read exactly that one byte: sign-extend it into
`r12`, leaving the 64-bit pattern for -5 there, and zero-extend it into `r13`, leaving unsigned 251
there. The nonzero `guard` byte makes an accidental word load produce a different result.

```x86|playground|exercise
default rel
global _start

section .data
amount: db -5
guard:  db 0x7A

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
        "r12": "0x1122334455667788",
        "r13": "0x8877665544332211"
    },
    "expectedRegisters": {
        "r12": "0xFFFFFFFFFFFFFFFB",
        "r13": "0x00000000000000FB"
    }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .data
amount: db -5
guard:  db 0x7A

section .text
_start:
    movsx r12, byte [amount]
    movzx r13, byte [amount]

    mov rax, 60
    mov rdi, 0
    syscall
```

</details>

Now perform two operations at their requested widths. Put 200 in `r8b` and add 100 to it, so the
byte wraps to 44 without changing the upper bytes of `r8`. The low dword of the supplied `rbx` is
already `0x7FFFFFFF`. Add 1 to it using `ebx`, leaving the wrapped dword result in `rbx`. Remember
that writing a 32-bit general-purpose register clears the upper 32 bits of its register family.

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
        "r8": "0x1122334455667788",
        "rbx": "0xFFEEDDCC7FFFFFFF"
    },
    "expectedRegisters": {
        "r8": "0x112233445566772C",
        "rbx": "0x0000000080000000"
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
    mov r8b, 200
    add r8b, 100

    add ebx, 1

    mov rax, 60
    mov rdi, 0
    syscall
```

</details>
