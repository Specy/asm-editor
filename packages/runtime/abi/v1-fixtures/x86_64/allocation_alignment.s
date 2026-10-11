    default rel
    extern malloc
    extern calloc
    extern printf
    extern realloc
    extern _Znwm
    extern _Znam
    extern free
    extern _ZdlPvm
    extern _ZdaPv
    ; compiler-symbol LC0 .LC0
    ; compiler-symbol LC1 .LC1
    ; compiler-symbol LC2 .LC2
    ; compiler-symbol L2 .L2
    ; compiler-symbol L3 .L3
    ; compiler-symbol L4 .L4
    section .text
    section .rodata align=8
    align 8, db 0
LC0:
    db `malloc aligned=%d calloc aligned=%d\n`, 0
    section .rodata
LC1:
    db `realloc aligned=%d\n`, 0
    section .rodata
    align 8, db 0
LC2:
    db `new aligned=%d array aligned=%d alignas16=%d\n`, 0
    section .text
    align 16
    global main
main:
    push r13
    mov edi, 1
    push r12
    push rbp
    push rbx
    sub rsp, 8
    call malloc
    mov esi, 7
    mov edi, 3
    mov rbp, rax
    call calloc
    xor edx, edx
    mov rbx, rax
    test rax, rax
    je L2
    mov rdx, rax
    shr rdx, 3
    and edx, 1
    xor edx, 1
L2:
    movzx edx, dl
    xor esi, esi
    test rbp, rbp
    je L3
    mov rsi, rbp
    shr rsi, 3
    and esi, 1
    xor esi, 1
L3:
    movzx esi, sil
    mov edi, LC0
    xor eax, eax
    call printf
    mov esi, 73
    mov rdi, rbp
    call realloc
    xor esi, esi
    mov rbp, rax
    test rax, rax
    je L4
    mov rsi, rax
    shr rsi, 3
    and esi, 1
    xor esi, 1
L4:
    movzx esi, sil
    mov edi, LC1
    xor eax, eax
    call printf
    mov edi, 16
    call _Znwm
    mov edi, 48
    mov r13, rax
    call _Znam
    xor esi, esi
    test r13b, 15
    mov edi, LC2
    sete sil
    xor edx, edx
    test al, 15
    mov r12, rax
    sete dl
    mov ecx, esi
    xor eax, eax
    call printf
    mov rdi, rbp
    call free
    mov rdi, rbx
    call free
    mov rdi, r13
    mov esi, 16
    call _ZdlPvm
    mov rdi, r12
    call _ZdaPv
    add rsp, 8
    xor eax, eax
    pop rbx
    pop rbp
    pop r12
    pop r13
    ret
    section .text
