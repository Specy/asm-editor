    default rel
    extern printf
    ; compiler-symbol LC0 .LC0
    ; compiler-symbol L2 .L2
    section .text
    section .rodata
LC0:
    db `valid argv=%d\n`, 0
    section .text
    align 16
    global main
main:
    sub rsp, 8
    xor eax, eax
    test rsi, rsi
    je L2
    movsx rdi, edi
    xor eax, eax
    cmp qword [rsi+rdi*8], 0
    sete al
L2:
    mov esi, eax
    mov edi, LC0
    xor eax, eax
    call printf
    xor eax, eax
    add rsp, 8
    ret
    section .text
