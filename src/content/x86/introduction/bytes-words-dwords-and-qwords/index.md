A register holds 64 bits. What those bits mean is not written anywhere: the same eight bytes are a
positive number, a negative number, four characters or an address depending only on which instruction
reads them.

## The four sizes

| name  | bytes | bits | unsigned range            | signed range                                |
| ----- | ----- | ---- | ------------------------- | ------------------------------------------- |
| byte  | 1     | 8    | 0 to 255                  | -128 to 127                                 |
| word  | 2     | 16   | 0 to 65535                | -32768 to 32767                             |
| dword | 4     | 32   | 0 to 4294967295           | -2147483648 to 2147483647                   |
| qword | 8     | 64   | 0 to 18446744073709551615 | -9223372036854775808 to 9223372036854775807 |

The register you name picks the size, `al` for a byte up to `rax` for a qword, and the `byte`, `word`,
`dword` and `qword` keywords pick it when no register does.

## Signed and unsigned are the same bits

There is no signed register and no unsigned one. `0xFF` in `al` is 255 if you read it as unsigned and
-1 if you read it as signed, and the register holds the same eight bits either way.

Negative numbers are stored in **two's complement**: to negate a number, flip every bit and add one.
`1` is `00000001`, so `-1` is `11111110 + 1`, which is `11111111`. The top bit ends up set for every
negative number and clear for every positive one, which is why it is called the sign bit.

The point of doing it that way is that **addition does not need to know**. `0xFF + 0x01` is `0x00`
with a carry out, and that is the right answer read as -1 + 1 = 0 and the right answer read as
255 + 1 = 256 with the 256 dropped off the top. So `add`, `sub` and `mov` have one version each and
it serves both readings. Three things do differ:

- **The flags they set.** `CF` says the unsigned answer did not fit, `OF` says the signed one did not.
- **The conditional jumps.** `jb` and `ja` compare unsigned, `jl` and `jg` compare signed.
- **Multiplication and division.** `mul` and `div` are unsigned, `imul` and `idiv` are signed, and
  they really are different instructions.

The registers panel shows a value in hex; hovering it shows what those bits read as signed and as
unsigned.

## When the answer does not fit

```x86|playground
default rel
global _start

section .text
_start:
    mov al, 200
    add al, 100             ; 300, which does not fit in a byte

    mov rbx, 0x7FFFFFFFFFFFFFFF     ; the largest signed qword
    add rbx, 1                      ; one more than that

    mov rax, 60
    mov rdi, 0
    syscall
```

`al` comes out at `2C`, which is 44. The answer 300 is `1_0010_1100` in binary and a byte kept the
low eight bits of it. `CF` is set, because the unsigned answer did not fit. `OF` is clear, and this is
the part worth pausing on: read as signed, `200` in a byte is already -56, and -56 + 100 = 44, which
fits perfectly well. One addition, two readings, and only one of them overflowed.

`rbx` comes out at `8000000000000000`. Unsigned that is the right answer. Signed it is the most
negative number there is, and `OF` is set to say the answer went off the top of the signed range and
came back round the bottom.

Nothing stopped the program either time. **x86 has no trap on integer overflow.** The flags record
what happened and it is the program's job to look, which is what `jo` and `jc` are for.

## Widening a small number

Loading a byte into `al` leaves the seven bytes above it holding whatever they held, so a byte read
out of memory is not yet a number you can do 64 bit arithmetic on. Turning it into one means filling
those seven bytes, and how to fill them depends on whether the byte was signed.

- **`movzx`** zero extends: the new bits are all 0.
- **`movsx`** sign extends: the new bits are all copies of the old top bit, so a negative byte stays
  negative.
- **`movsxd`** is `movsx` for the 32 to 64 case, which needed a name of its own.

```x86|playground|no-flags
default rel
global _start

section .data
sb: db -3           ; FD
sw: dw -3           ; FD FF
sd: dd -3           ; FD FF FF FF

section .text
_start:
    movzx rbx, byte [sb]        ; 0x00000000000000FD, which is 253
    movsx rcx, byte [sb]        ; 0xFFFFFFFFFFFFFFFD, which is -3
    movsx r10, word [sw]        ; -3 again, from two bytes
    movsxd r11, dword [sd]      ; and from four

    mov rax, 60
    mov rdi, 0
    syscall
```

The one byte `FD` became 253 in one register and -3 in another, and nothing in memory said which one
was meant. The instruction you chose is the only thing that decided.

The `byte` keyword in `movzx rbx, byte [sb]` is doing real work. Change it to
`movzx rbx, word [sb]` and the instruction reads `FDFD`: the byte at `sb` and the byte that happens
to follow it, which is the first byte of `sw`. The size comes from the word you wrote, not from how
big the thing at the label was declared to be.

## Widening rax in place

Six instructions widen `rax` without taking any operands at all. They exist for division. `div` and
`idiv` read a dividend twice as wide as the number you divide by, spread across `rdx` and `rax`, so
before dividing `rax` by something you have to fill `rdx` with the right thing, and "the right thing"
for a signed number means copies of its sign bit.

The names look like line noise until you know the key. The `c` is convert; the letters after it are
the size it starts from and the size it ends at, `b` for byte, `w` for word, `d` for dword, `q` for
quadword and `o` for a sixteen byte octword. A final **`e`** means extended, which is this family's
way of saying "keep the answer inside one register".

| instruction | widens         | into      | reads as                    |
| ----------- | -------------- | --------- | --------------------------- |
| `cbw`       | `al`, 8 bits   | `ax`      | convert byte to word        |
| `cwde`      | `ax`, 16 bits  | `eax`     | word to dword, extended     |
| `cdqe`      | `eax`, 32 bits | `rax`     | dword to quadword, extended |
| `cwd`       | `ax`, 16 bits  | `dx:ax`   | word to dword               |
| `cdq`       | `eax`, 32 bits | `edx:eax` | dword to quadword           |
| `cqo`       | `rax`, 64 bits | `rdx:rax` | quadword to octword         |

So the three with an `e` grow a value inside the register it is already in. The three without spill
into a **second** register, and those are the ones a division needs. `cwd` and `cwde` start from the
same `ax` and differ only in where they put the answer, which is exactly what the `e` is there to
tell you.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov eax, -3
    cdqe                    ; eax into rax: FFFFFFFD becomes FFFFFFFFFFFFFFFD
    mov r8, rax

    mov rax, -3
    cqo                     ; rax into rdx:rax: rdx becomes all ones
    mov r9, rdx

    mov rax, 60
    mov rdi, 0
    syscall
```

Both lines did the same thing to the same value and put the result in different places. `cdqe` left
one register holding -3 in 64 bits. `cqo` left two registers holding -3 in 128 bits, which is
`FFFFFFFFFFFFFFFF` in `rdx` and `FFFFFFFFFFFFFFFD` in `rax`: all ones above, and the number itself
below.

Before an **unsigned** division you write `xor rdx, rdx` instead, because an unsigned number is
widened with zeroes and not with its top bit. Forgetting either line is how a division goes wrong,
and "Arithmetic, logic and bits" comes back to it with the fault it causes.

## Your turn

`amount` is a signed byte holding -5. Leave it in `rbx` as a full 64 bit -5, and leave the same byte
read as an unsigned number in `rcx`, which is 251.

```x86|playground|exercise
default rel
global _start

section .data
amount: db -5

section .text
_start:
    ; your code here

    mov rax, 60
    mov rdi, 0
    syscall
```

```testcase
{
    "expectedRegisters": { "rbx": "0xFFFFFFFFFFFFFFFB", "rcx": 251 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .data
amount: db -5

section .text
_start:
    movsx rbx, byte [amount]    ; the sign bit copied upwards
    movzx rcx, byte [amount]    ; zeroes instead

    mov rax, 60
    mov rdi, 0
    syscall
```

</details>

The second one overflows on purpose. Add 1 to the largest signed dword there is, `0x7FFFFFFF`, in
`ebx`, so that `rbx` ends at `0x80000000` and `OF` is set.

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
    "expectedRegisters": { "rbx": "0x80000000" }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    mov ebx, 0x7FFFFFFF     ; the largest signed 32 bit number
    add ebx, 1              ; one more, which OF reports and nothing stops

    mov rax, 60
    mov rdi, 0
    syscall
```

</details>
