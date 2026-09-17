A string reversed where it sits, with no second copy of it anywhere. Two addresses start at the two
ends of the string, swap the bytes they point at, and walk towards each other until they meet in the
middle.

Every byte is written exactly once, so the work is half the length of the string, and the loop needs
no count: it stops when the two addresses have run into each other.

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
and the terminator still sitting exactly where it was.

Keeping the zero out of the reversal is what `LEN equ $ - text - 1` is for. `$ - text` is nine, every
byte the `db` line produced, and the `- 1` takes the terminator back off, leaving eight characters to
reverse. Drop the `- 1` and the zero gets swapped to the front, where it turns the string into an
empty one.

`jae` compares two **addresses**, which is why it is the unsigned condition: addresses are never
negative, and the signed `jge` would give a different answer on any address with its top bit set. The
comparison is at the top of the loop, which handles both ways the two can finish. An odd length string
ends with both addresses on the same middle byte, and `jae` is true. An even length one ends with them
crossed over, one past each other, and `jae` is true then too. A single character string never enters
the loop at all.

Four `mov` instructions do the swap, where `xchg al, [rsi]` would do it in half the lines. That is
deliberate. `xchg` with a memory operand carries an implicit **`lock` prefix**, which tells the
processor to hold the memory bus for the whole instruction so that nothing else in the machine can
touch that address in the middle of it. That guarantee is exactly what you want when two threads share
a counter, and it costs far more than four plain moves when, as here, nobody else is looking.
