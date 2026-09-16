# The 16 registers and their halves

x86-64 gives ordinary integer code sixteen **general-purpose integer register families**. They are
small, named workspaces inside the processor. An instruction can use one to hold an integer value
or an address; the name does not permanently assign a meaning to the value.

The processor also has other kinds of registers. This lesson is only about these sixteen
general-purpose integer registers and the different names for parts of each one.

## The sixteen families

The first eight families have names inherited from older versions of x86. The remaining eight use a
numbered pattern. All sixteen are equally 64 bits wide when named with their `r...` form.

| 64-bit | 32-bit | 16-bit | low 8-bit |
| ------ | ------ | ------ | --------- |
| `rax`  | `eax`  | `ax`   | `al`      |
| `rbx`  | `ebx`  | `bx`   | `bl`      |
| `rcx`  | `ecx`  | `cx`   | `cl`      |
| `rdx`  | `edx`  | `dx`   | `dl`      |
| `rsi`  | `esi`  | `si`   | `sil`     |
| `rdi`  | `edi`  | `di`   | `dil`     |
| `rbp`  | `ebp`  | `bp`   | `bpl`     |
| `rsp`  | `esp`  | `sp`   | `spl`     |
| `r8`   | `r8d`  | `r8w`  | `r8b`     |
| `r9`   | `r9d`  | `r9w`  | `r9b`     |
| `r10`  | `r10d` | `r10w` | `r10b`    |
| `r11`  | `r11d` | `r11w` | `r11b`    |
| `r12`  | `r12d` | `r12w` | `r12b`    |
| `r13`  | `r13d` | `r13w` | `r13b`    |
| `r14`  | `r14d` | `r14w` | `r14b`    |
| `r15`  | `r15d` | `r15w` | `r15b`    |

The `d`, `w`, and `b` endings in the numbered names mean 32-bit, 16-bit, and 8-bit. For example,
`r14`, `r14d`, `r14w`, and `r14b` are four ways to name parts of one register family.

## One family, several overlapping names

The names in one table row do not describe separate storage locations. They select overlapping low
parts of the same 64-bit register. **Least-significant** means the part that represents the smallest
place values of a binary number. It is at the right-hand end when a hexadecimal value is written in
the usual order.

For `rax`, the bytes can be pictured like this. `b0` is the least-significant byte.

```
 rax  [ b7 ][ b6 ][ b5 ][ b4 ][ b3 ][ b2 ][ b1 ][ b0 ]
 eax                    [ b3 ][ b2 ][ b1 ][ b0 ]
 ax                                  [ b1 ][ b0 ]
 ah                                  [ b1 ]
 al                                        [ b0 ]
```

So if `rax` contains `0x1122334455667788`, then `eax` reads `0x55667788`, `ax` reads `0x7788`,
`ah` reads `0x77`, and `al` reads `0x88`. Reading a narrower name takes only that low portion;
it does not change the register.

Here are copies of several portions. Immediately before the template at the end, the destination
registers have the values listed below.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov rax, 0x1122334455667788
    mov rbx, 0xAAAAAAAAAAAAAAAA
    mov rcx, 0xBBBBBBBBBBBBBBBB
    mov r10, 0xCCCCCCCCCCCCCCCC

    mov bl, al                  ; `al` is 0x88
    mov cl, ah                  ; `ah` is 0x77
    mov r10w, ax                ; `ax` is 0x7788
    mov r11d, eax               ; `eax` is 0x55667788
    mov r12, rax                ; all 64 bits

    mov rax, 60
    mov rdi, 0
    syscall
```

| register | value before the template |
| -------- | ------------------------- |
| `rbx`    | `0xAAAAAAAAAAAAAA88`      |
| `rcx`    | `0xBBBBBBBBBBBBBB77`      |
| `r10`    | `0xCCCCCCCCCCCC7788`      |
| `r11`    | `0x0000000055667788`      |
| `r12`    | `0x1122334455667788`      |

The first four families also have the old high-byte names `ah`, `bh`, `ch`, and `dh`. Each selects
the second-lowest byte, as `ah` does above. Prefer the ordinary low-byte names when possible:
high-byte names cannot appear in the same instruction as an `r8`–`r15` name.

## What a narrow write leaves behind

Writing an 8-bit or 16-bit register name replaces only that low portion. The upper bits stay as
they were. A write to any 32-bit general-purpose destination is different: it writes the low 32 bits
and clears the upper 32 bits to zero.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov r8,  0xFFFFFFFFFFFFFFFF
    mov r9,  0xFFFFFFFFFFFFFFFF
    mov r10, 0xFFFFFFFFFFFFFFFF

    mov r8b,  0                 ; only the low byte changes
    mov r9w,  0                 ; only the low two bytes change
    mov r10d, 0                 ; low four bytes change; upper four become zero

    mov rax, 60
    mov rdi, 0
    syscall
```

Before the template, `r8` is `0xFFFFFFFFFFFFFF00`, `r9` is
`0xFFFFFFFFFFFF0000`, and `r10` is `0x0000000000000000`.

This rule is especially useful when reading code. `mov edx, 5` does more than put 5 in the low half
of `rdx`: it makes the complete 64-bit `rdx` equal to `0x0000000000000005`.

## Your turn

`r8` holds `0xCAFEBABEDEADBEEF`. Copy its least-significant byte to `bl`, its least-significant two
bytes to `cx`, and its least-significant four bytes to `edx`. The initial destination values are
chosen so that the preserved and cleared upper bits are visible.

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
        "r8": "0xCAFEBABEDEADBEEF",
        "rbx": "0x1122334455667700",
        "rcx": "0x2233445566770000",
        "rdx": "0xFFFFFFFF00000000"
    },
    "expectedRegisters": {
        "rbx": "0x11223344556677EF",
        "rcx": "0x223344556677BEEF",
        "rdx": "0x00000000DEADBEEF"
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
    mov bl, r8b
    mov cx, r8w
    mov edx, r8d

    mov rax, 60
    mov rdi, 0
    syscall
```

</details>

Use the numbered register names directly in this one. Copy the low byte of `r9` to `r13b`, the low
two bytes of `r10` to `r14w`, and the low four bytes of `r11` to `r15d`.

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
        "r9": "0x0123456789ABCDEF",
        "r10": "0xFFEEDDCCBEEF2468",
        "r11": "0xA5A5A5A512345678",
        "r13": "0x1111111111111100",
        "r14": "0x2222222222220000",
        "r15": "0x33333333FFFFFFFF"
    },
    "expectedRegisters": {
        "r13": "0x11111111111111EF",
        "r14": "0x2222222222222468",
        "r15": "0x0000000012345678"
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
    mov r13b, r9b
    mov r14w, r10w
    mov r15d, r11d

    mov rax, 60
    mov rdi, 0
    syscall
```

</details>
