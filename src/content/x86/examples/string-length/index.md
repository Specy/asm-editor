The same job done twice in one program: eight instructions of ordinary loop, and four instructions
using the hardware built for it. Both answers land in adjacent registers so you can see them agree.

Nothing anywhere records how long the string is. There are bytes, and a rule that says the reading
stops at the first zero, so finding the length means going and looking.

```x86|playground|memory|allow-open
default rel
global _start

section .data
text:   db "assembly", 0    ; eight characters and the terminator

section .text
_start:
    lea rsi, [text]
    xor rcx, rcx            ; the length so far
.next:
    cmp byte [rsi + rcx], 0 ; the terminator?
    je .done
    inc rcx
    jmp .next
.done:
    mov r8, rcx             ; eight, the hand written way

    lea rdi, [text]         ; and now the same thing in four instructions
    xor al, al              ; the byte being looked for
    mov rcx, -1             ; the largest count there is
    cld                     ; scan forwards
    repne scasb             ; stop at the first zero
    not rcx
    dec rcx
    mov r9, rcx             ; eight again

    mov rax, 60
    xor rdi, rdi
    syscall
```

Both `r8` and `r9` come out at 8, and the `not rcx` and `dec rcx` that get `r9` there are taken apart
line by line in the "Arrays, strings and the string instructions" lecture.

`cmp byte [rsi + rcx], 0` needs the word `byte` spelling out the size, because neither operand carries
one: a memory operand is an address and `0` is a number, and a comparison has to know how wide the
thing it is comparing is. Leave it out and NASM picks for you.

The two versions are not the same speed, and not in the direction you would guess. The hand written
loop is one comparison and one branch per character. `repne scasb` is two bytes of instruction, but a
repeated `scasb` examines one byte per step and cannot be turned into anything wider, so on a current
processor a short hand written loop often beats it. `rep movsb` is the exception in this family: it is
the one the hardware genuinely optimises.

Now break it. Take the `, 0` off the end of `text` and run again. Neither loop stops where the string
does, because neither of them can: they are looking for a zero byte, the zero byte is gone, and they
will keep reading through whatever the assembler happened to put next until they find one. A string is
its terminator.
