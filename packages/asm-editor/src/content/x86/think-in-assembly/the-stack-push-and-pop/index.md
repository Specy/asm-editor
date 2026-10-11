# The stack, push and pop

Registers are convenient temporary storage, but there are only sixteen general-purpose register
families. The **stack** is an area of memory that a program can use for more temporary storage.
The register `rsp`, the **stack pointer**, holds the address of the current top of the stack.

Stack use works through cooperation. In **nested use**, one part of a program reserves stack space
and another part reserves more before the first part releases its space. Their current ranges are
distinct when each part releases exactly what it reserved. The mechanism cannot prevent code from
changing `rsp` incorrectly or writing to an arbitrary address and corrupting another range.

## `rsp` and downward growth

The x86-64 stack grows toward lower addresses. This lesson uses the 64-bit general-purpose
register forms of `push` and `pop`, so each operation changes `rsp` by eight bytes:

```x86
    push rax                    ; rsp -= 8, then store rax at [rsp]
    pop rax                     ; load rax from [rsp], then rsp += 8
```

Eight bytes is the width of these particular forms, not a rule that every stack value has this
size. The 16-bit form, such as `push ax`, changes `rsp` by two bytes, and there is no ordinary
`push eax` form in 64-bit mode. A manual allocation with `sub rsp, N` can reserve any chosen number
of bytes.

Here two qwords are pushed and then popped:

```x86|playground|memory|no-flags
default rel
global _start

section .text
_start:
    mov rax, 0x1111111111111111
    mov rbx, 0x2222222222222222

    push rax
    push rbx

    pop r8
    pop r9

    mov rax, 60
    xor rdi, rdi
    syscall
```

In this playground, `rsp` begins at `0x4FFFFFFFFED0`. Before either push, the nearby qwords look
like this (the green marker shows `rsp`):

|          address |         value         |
| ---------------: | :-------------------: |
| `0x4FFFFFFFFEC0` |  `0000000000000000`   |
| `0x4FFFFFFFFEC8` |  `0000000000000000`   |
| `0x4FFFFFFFFED0` | 🟢 `0000000000000001` |

The first push subtracts 8, making `rsp` equal to `0x4FFFFFFFFEC8`, and stores the first value
there:

|          address |         value         |
| ---------------: | :-------------------: |
| `0x4FFFFFFFFEC0` |  `0000000000000000`   |
| `0x4FFFFFFFFEC8` | 🟢 `1111111111111111` |
| `0x4FFFFFFFFED0` |  `0000000000000001`   |

The second push subtracts another 8, making `rsp` equal to `0x4FFFFFFFFEC0`, and stores the second
value:

|          address |         value         |
| ---------------: | :-------------------: |
| `0x4FFFFFFFFEC0` | 🟢 `2222222222222222` |
| `0x4FFFFFFFFEC8` |  `1111111111111111`   |
| `0x4FFFFFFFFED0` |  `0000000000000001`   |

`pop r8` reads the qword at the current `rsp`, so `r8` receives
`0x2222222222222222`. It then raises `rsp` by 8. `pop r9` reads the next qword, so `r9` receives
`0x1111111111111111`, and `rsp` returns to `0x4FFFFFFFFED0`.

The last value pushed is the first value popped. This order is called **last in, first out**, or
**LIFO**.

A pop does not erase the bytes it read. After both pops, the two values are still visible at
`0x4FFFFFFFFEC0` and `0x4FFFFFFFFEC8`, but those bytes are no longer reserved by these pushes.
Later stack use may overwrite them, so a program must not treat a popped value as current storage.

## Reserving several slots

You can reserve a block directly by subtracting its byte count from `rsp`. This example reserves
24 bytes and uses them as three qword slots:

```x86|playground|memory|no-flags
default rel
global _start

section .text
_start:
    sub rsp, 24                 ; reserve bytes rsp through rsp + 23

    mov qword [rsp], 1          ; slot 0: bytes at offsets 0 through 7
    mov qword [rsp + 8], 2      ; slot 1: bytes at offsets 8 through 15
    mov qword [rsp + 16], 3     ; slot 2: bytes at offsets 16 through 23

    mov r8, [rsp + 8]           ; load 2 from the second slot

    add rsp, 24                 ; release exactly the 24 reserved bytes

    mov rax, 60
    xor rdi, rdi
    syscall
```

Immediately after the subtraction, the three qword slots begin at `[rsp]`, `[rsp + 8]`, and
`[rsp + 16]`. These addresses stay at those offsets only while `rsp` is not changed again. Another
push, pop, subtraction, or addition of `rsp` would move the base used by the same expressions.

The matching `add rsp, 24` restores the stack pointer to its value before the allocation. If the
subtraction and addition use different byte counts, later stack use begins from the wrong address.
As with popped values, releasing the block does not erase its bytes; it only ends this use of the
range.

## Saving and restoring registers

A common use of `push` is to preserve a register while its current value is temporarily replaced:

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov rbx, 100
    mov r12, 200

    push rbx                    ; save rbx
    push r12                    ; save r12

    mov rbx, 0xFF
    mov r12, 0xFF

    pop r12                     ; restore the value saved last
    pop rbx                     ; restore the value saved first

    mov rax, 60
    xor rdi, rdi
    syscall
```

The final values are again `rbx = 100` and `r12 = 200`. When several saved values must return to
their original registers, pop them in the reverse order of their pushes. That reverse order follows
directly from LIFO.

## Your turn

`rbx` and `r12` hold 11 and 22. Swap them with exactly two `push` instructions followed by exactly
two `pop` instructions. Do not use `xchg`, a third register, or arithmetic for the swap. Restore
`rsp` to its starting value. Afterward, the released qwords at `0x4FFFFFFFFEC0` and
`0x4FFFFFFFFEC8` should still contain 22 and 11.

```x86|playground|memory|exercise
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
    "startingRegisters": { "rbx": 11, "r12": 22 },
    "expectedRegisters": {
        "rbx": 22,
        "r12": 11,
        "rsp": "0x4FFFFFFFFED0"
    },
    "expectedMemory": [
        {
            "type": "number-chunk",
            "address": "0x4FFFFFFFFEC0",
            "bytes": 8,
            "expected": [22, 11]
        }
    ]
}
```

<details>
<summary>Show solution</summary>

```x86|playground|memory|solution
default rel
global _start

section .text
_start:
    push rbx
    push r12
    pop rbx
    pop r12

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>

Now reserve 32 bytes with `sub rsp, 32` and use all four qword slots. Store 5, 7, 8, and 9 at
offsets 0, 8, 16, and 24 respectively. Load the qword at offset 8 into `r8` and the qword at offset
24 into `r9`. Finally, release the whole block with `add rsp, 32`, restoring `rsp` to its starting
value. The released bytes remain observable at their fixed addresses.

```x86|playground|memory|exercise
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
    "expectedRegisters": {
        "r8": 7,
        "r9": 9,
        "rsp": "0x4FFFFFFFFED0"
    },
    "expectedMemory": [
        {
            "type": "number-chunk",
            "address": "0x4FFFFFFFFEB0",
            "bytes": 8,
            "expected": [5, 7, 8, 9]
        }
    ]
}
```

<details>
<summary>Show solution</summary>

```x86|playground|memory|solution
default rel
global _start

section .text
_start:
    sub rsp, 32
    mov qword [rsp], 5
    mov qword [rsp + 8], 7
    mov qword [rsp + 16], 8
    mov qword [rsp + 24], 9

    mov r8, [rsp + 8]
    mov r9, [rsp + 24]

    add rsp, 32

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
