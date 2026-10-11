    default rel
    extern puts
    extern atexit
    extern printf
    extern exit
    ; compiler-symbol LC0 .LC0
    ; compiler-symbol LC1 .LC1
    section .text
    section .rodata
LC0:
    db `handler ran`, 0
    section .text
    align 16
handler:
    mov edi, LC0
    jmp puts
    section .rodata
LC1:
    db `exiting at level %d\n`, 0
    section .text
    align 16
    global main
main:
    sub rsp, 8
    mov edi, handler
    call atexit
    mov edi, LC1
    mov esi, 3
    xor eax, eax
    call printf
    mov edi, 7
    call exit
    section .text
