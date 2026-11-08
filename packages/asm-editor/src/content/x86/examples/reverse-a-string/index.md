This program reverses a string in place, without making a second copy. Two pointers start at the
ends of the string. The loop swaps the bytes they point at, then moves the pointers towards each
other until they meet or cross.

Each swap writes two character bytes. The loop makes half as many swaps as there are characters,
rounded down, and never writes the zero terminator. It needs no count: it stops when the two
addresses meet or cross. This example starts with a nonempty string.

```x86|playground|memory|allow-open
default rel
global _start

section .data
text:   db "assembly", 0
LEN     equ $ - text - 1        ; eight, without the terminator

section .text
_start:
    lea rsi, [text]             ; left, at the first character
    lea rdi, [text + LEN - 1]   ; right, at the last
.swap:
    cmp rsi, rdi
    jae .done                   ; they have met or crossed
    mov al, [rsi]
    mov bl, [rdi]
    mov [rsi], bl               ; the two bytes, exchanged
    mov [rdi], al
    inc rsi
    dec rdi
    jmp .swap
.done:

    mov rax, 60
    xor rdi, rdi
    syscall
```

Type `402000` into the memory panel. The nine bytes read `79 6C 62 6D 65 73 73 61 00`: `ylbmessa`,
followed by the zero terminator at its original address.

`LEN equ $ - text - 1` excludes the zero terminator from the reversal. `$ - text` is nine, the number
of bytes the `db` line produced. Subtracting one excludes the terminator, leaving eight characters to
reverse. Drop the `- 1` and the zero gets swapped to the front, where it turns the string into an
empty one.

`jae` uses an unsigned comparison of the two addresses. The comparison is at the top of the loop,
before either byte is read. With an odd number of characters, the addresses meet on the middle
character, which stays where it is. With an even number, they cross after the last swap. `jae`
stops the loop in both cases. For a single character, the addresses start together, so there is
no swap.

## Your turn

Reverse `"rocket"` in place. The starting addresses are set up for you: `rsi` points to `r`,
and `rdi` points to `t`, the last character before the zero. Write the loop that compares the
addresses, swaps their bytes through `al` and `bl`, moves both addresses inward, and repeats.
Use **Test** to check that memory at `0x402000` reads `74 65 6B 63 6F 72 00`:
`tekcor` followed by the original zero terminator. You can also inspect those bytes in the
memory panel after running.

```x86|playground|memory|exercise
default rel
global _start

section .data
text:   db "rocket", 0
LEN     equ $ - text - 1

section .text
_start:
    lea rsi, [text]
    lea rdi, [text + LEN - 1]
.swap:
    ; Stop when rsi has met or passed rdi.
    ; Swap the two character bytes, then move the addresses inward.

.done:
    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedMemory": [
        {
            "type": "number-chunk",
            "address": "0x402000",
            "bytes": 1,
            "expected": [116, 101, 107, 99, 111, 114, 0]
        }
    ]
}
```

<details>
<summary>Show solution</summary>

```x86|playground|memory|solution
default rel
global _start

section .data
text:   db "rocket", 0
LEN     equ $ - text - 1

section .text
_start:
    lea rsi, [text]
    lea rdi, [text + LEN - 1]
.swap:
    cmp rsi, rdi
    jae .done
    mov al, [rsi]
    mov bl, [rdi]
    mov [rsi], bl
    mov [rdi], al
    inc rsi
    dec rdi
    jmp .swap
.done:
    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
