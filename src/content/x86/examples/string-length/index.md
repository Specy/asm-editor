A string in memory and its length in a register. The program does it twice, once with an ordinary
loop and once with the string instruction built for it, and both answers land side by side.

A string here is bytes and a rule: the reading stops at the first zero. Nothing records the length
anywhere, so finding it means walking the string until the terminator turns up.

**You need to know:** the "Arrays, strings and the string instructions" lecture. What is new here is
`repne scasb` and the two lines of arithmetic that turn what it leaves in `rcx` into a length.

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

Both `r8` and `r9` come out at 8.

`cmp byte [rsi + rcx], 0` needs the word `byte` because neither operand says a size: a memory operand
is an address and `0` is a number. Without it the assembler picks one, and picking it yourself is the
habit to keep.

`repne scasb` compares `al` with the byte at `[rdi]`, steps `rdi` and counts `rcx` **down**, stopping
when the bytes match. So `rcx` finishes at `-1` minus the number of steps taken, `not rcx` turns that
into the number of steps, and the `dec` drops the terminator the scan stopped on. Every C library's
`strlen` for x86 is some version of those two lines.

Try changing the string. Both answers follow it, and a string with no `, 0` at the end makes both
loops run on into whatever the assembler put next.
