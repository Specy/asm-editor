A string reversed where it sits, with no second buffer. Two pointers start at the two ends, swap the
bytes they point at, and step towards each other until they meet.

Swapping in place is what makes this different from copying. There is no room for a second copy and
none is needed: every byte is written exactly once, and the loop stops when the two pointers have met
rather than after a count.

**You need to know:** the "Arrays, strings and the string instructions" lecture. What is new here is
two pointers moving in opposite directions, and `equ` doing the arithmetic that finds the last
character.

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

Type `402000` into the memory panel. The nine bytes read `79 6C 62 6D 65 73 73 61 00`, which is
`ylbmessa` and the terminator still where it was. The reversal left the zero alone, because `LEN`
subtracted it out.

`jae` compares the two **addresses**, and it is the unsigned condition because an address is never
negative. The check is at the top of the loop, so a string of one character swaps nothing at all:
the two pointers start on the same byte and `jae` is true straight away.

Two `mov` pairs rather than `xchg`. `xchg al, [rsi]` exists and would halve the lines, and on a
memory operand it carries an implicit `lock` prefix that makes it far slower than the four moves.

Try reversing a string with an even number of characters, say `db "abcd", 0`. The pointers cross
between `b` and `c` without ever landing on the same byte, and `jae` catches that too.
