The last lecture wrote the four sizes into memory. This one is about what the bits in them mean: how
a negative number is stored, what happens when a result does not fit, and the instructions that widen
a small number into a big register.

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

The point of two's complement is that **addition does not need to know**. `0xFF + 0x01` is `0x00`
with a carry out, which is right as -1 + 1 = 0 and right as 255 + 1 = 256 with the 256 dropped. So
`add`, `sub` and `mov` have one version and it works for both readings. What differs is:

- **The flags they set.** `CF` says the unsigned answer did not fit, `OF` says the signed one did not.
- **The conditional jumps.** `jb` and `ja` compare unsigned, `jl` and `jg` compare signed.
- **Multiplication and division.** `mul` and `div` are unsigned, `imul` and `idiv` are signed, and
  they are different instructions.

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
    xor rdi, rdi
    syscall
```

`al` comes out at `2C`, which is 44: the answer 300 is `1_0010_1100` and the byte kept the low eight
bits. `CF` is set, because the unsigned answer did not fit. `OF` is clear, because as signed
arithmetic `200` in a byte is -56, and -56 + 100 = 44, which fits perfectly well.

`rbx` comes out at `8000000000000000`. Unsigned that is the right answer. Signed it is the most
negative number there is, and `OF` is set to say so.

Nothing stops the program either time. **x86 has no trap on integer overflow.** The flags record what
happened and it is the program's job to look, which is what `jo` and `jc` are for.

## Widening a small number

Loading a byte into `al` leaves the seven bytes above it holding whatever they held. Most of the time
you want the byte turned into a full 64 bit number first, and which instruction does that depends on
whether the byte was signed.

- **`movzx`** zero extends: the new bits are all 0.
- **`movsx`** sign extends: the new bits are all copies of the old top bit.
- **`movsxd`** is `movsx` for the 32 to 64 case, which needed its own name.

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
    xor rdi, rdi
    syscall
```

The same byte `FD` becomes 253 or -3 depending on which instruction read it, and nothing in memory
said which one was meant. That is the whole of signedness in assembly: the type lives in the
instruction you chose, never in the data.

Try changing `movzx rbx, byte [sb]` to `movzx rbx, word [sb]`. It reads `FDFD`, which is the byte at
`sb` and the byte after it, the first byte of `sw`. The size comes from the word you wrote and not
from how big the thing at the label was.

## Widening rax in place

Four instructions with no operands widen the accumulator into itself. They exist because `mul`,
`div`, `idiv` and `cqo` were designed together.

| instruction | widens         | into      |
| ----------- | -------------- | --------- |
| `cbw`       | `al`, 8 bits   | `ax`      |
| `cwde`      | `ax`, 16 bits  | `eax`     |
| `cdqe`      | `eax`, 32 bits | `rax`     |
| `cwd`       | `ax`, 16 bits  | `dx:ax`   |
| `cdq`       | `eax`, 32 bits | `edx:eax` |
| `cqo`       | `rax`, 64 bits | `rdx:rax` |

The first three widen inside one register. The last three fill a **second** register with copies of
the sign bit, which is what `idiv` needs: signed division reads a dividend twice as wide as its
divisor, so dividing `rax` by something means filling `rdx` first.

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
    xor rdi, rdi
    syscall
```

`xor rdx, rdx` is what you write instead when the dividend is unsigned, since an unsigned number is
widened with zeroes. Forgetting either one is the usual way a division goes wrong, and the
"Arithmetic, logic and bits" lecture returns to it.

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
    xor rdi, rdi
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
    xor rdi, rdi
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
    xor rdi, rdi
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
    xor rdi, rdi
    syscall
```

</details>
