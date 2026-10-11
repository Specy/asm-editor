    default rel
    extern getchar
    extern scanf
    extern printf
    ; compiler-symbol L2 .L2
    ; compiler-symbol L10 .L10
    ; compiler-symbol L1 .L1
    ; compiler-symbol LC0 .LC0
    ; compiler-symbol LC1 .LC1
    ; compiler-symbol LC2 .LC2
    ; compiler-symbol LC3 .LC3
    ; compiler-symbol LC4 .LC4
    ; compiler-symbol LC5 .LC5
    ; compiler-symbol LC6 .LC6
    ; compiler-symbol LC7 .LC7
    ; compiler-symbol LC8 .LC8
    ; compiler-symbol LC9 .LC9
    ; compiler-symbol LC10 .LC10
    ; compiler-symbol LC11 .LC11
    ; compiler-symbol LC12 .LC12
    ; compiler-symbol LC13 .LC13
    ; compiler-symbol LC14 .LC14
    ; compiler-symbol LC15 .LC15
    ; compiler-symbol LC16 .LC16
    ; compiler-symbol LC17 .LC17
    ; compiler-symbol LC18 .LC18
    ; compiler-symbol LC19 .LC19
    ; compiler-symbol LC20 .LC20
    ; compiler-symbol LC21 .LC21
    ; compiler-symbol LC22 .LC22
    ; compiler-symbol LC23 .LC23
    section .text
    align 16
skip_line:
    sub rsp, 8
    jmp L2
L10:
    cmp eax, 10
    je L1
L2:
    call getchar
    cmp eax, -1
    jne L10
L1:
    add rsp, 8
    ret
    section .rodata align=8
LC0:
    db `%d %d`, 0
LC1:
    db `1: r=%d a=%d b=%d\n`, 0
LC2:
    db `%i %i %i %i`, 0
LC3:
    db `2: r=%d %d %d %d %d\n`, 0
LC4:
    db `%x %X %o %u`, 0
LC5:
    db `3: r=%d %d %d %d %u\n`, 0
LC6:
    db `%3d%2d%d`, 0
LC7:
    db `4: r=%d %d %d %d\n`, 0
LC8:
    db `%d,%d ; %d`, 0
LC9:
    db `5: r=%d %d %d %d\n`, 0
LC10:
    db `%*d %d%n`, 0
LC11:
    db `6: r=%d a=%d n=%d\n`, 0
LC12:
    db `%hhd %hd %ld %lld %llu`, 0
LC13:
    db `7: r=%d %d %d %ld %lld %llu\n`, 0
LC14:
    db `%d`, 0
    section .rodata
    align 8, db 0
LC15:
    db `8: r=%d (matching failure), next char '%c'\n`, 0
    section .rodata
LC16:
    db `%d%d`, 0
    section .rodata
    align 8, db 0
LC17:
    db `9: r=%d a=%d (partial), next char '%c'\n`, 0
    section .rodata
LC18:
    db `%u`, 0
LC19:
    db `10: r=%d u=%u\n`, 0
LC20:
    db ` total: %d%%`, 0
LC21:
    db `11: r=%d a=%d\n`, 0
LC22:
    db `12: r=%d at end\n`, 0
LC23:
    db `13: r=%d still at end\n`, 0
    section .text
    align 16
    global main
main:
    push r14
    mov edi, LC0
    xor eax, eax
    push r13
    push r12
    push rbp
    push rbx
    sub rsp, 48
    lea rbx, [rsp+4]
    lea rbp, [rsp+8]
    mov dword [rsp+4], 0
    mov rdx, rbp
    mov rsi, rbx
    mov dword [rsp+8], 0
    lea r12, [rsp+12]
    mov dword [rsp+12], 0
    lea r14, [rsp+16]
    lea r13, [rsp+20]
    mov dword [rsp+16], 0
    mov dword [rsp+20], 0
    call scanf
    mov ecx, dword [rsp+8]
    mov edx, dword [rsp+4]
    mov edi, LC1
    mov esi, eax
    xor eax, eax
    call printf
    mov r8, r14
    mov rcx, r12
    mov rdx, rbp
    mov rsi, rbx
    mov edi, LC2
    xor eax, eax
    call scanf
    mov r9d, dword [rsp+16]
    mov r8d, dword [rsp+12]
    mov edi, LC3
    mov ecx, dword [rsp+8]
    mov edx, dword [rsp+4]
    mov esi, eax
    xor eax, eax
    call printf
    mov r8, r13
    mov rcx, r12
    mov rdx, rbp
    mov rsi, rbx
    mov edi, LC4
    xor eax, eax
    call scanf
    mov r9d, dword [rsp+20]
    mov r8d, dword [rsp+12]
    mov edi, LC5
    mov ecx, dword [rsp+8]
    mov edx, dword [rsp+4]
    mov esi, eax
    xor eax, eax
    call printf
    mov rcx, r12
    mov rdx, rbp
    mov rsi, rbx
    mov edi, LC6
    xor eax, eax
    call scanf
    mov r8d, dword [rsp+12]
    mov ecx, dword [rsp+8]
    mov edi, LC7
    mov edx, dword [rsp+4]
    mov esi, eax
    xor eax, eax
    call printf
    mov rcx, r12
    mov rdx, rbp
    mov rsi, rbx
    mov edi, LC8
    xor eax, eax
    call scanf
    mov r8d, dword [rsp+12]
    mov ecx, dword [rsp+8]
    mov edi, LC9
    mov edx, dword [rsp+4]
    mov esi, eax
    xor eax, eax
    call printf
    mov rdx, r14
    mov rsi, rbx
    mov edi, LC10
    xor eax, eax
    call scanf
    mov ecx, dword [rsp+16]
    mov edx, dword [rsp+4]
    mov edi, LC11
    mov esi, eax
    xor eax, eax
    call printf
    xor eax, eax
    lea rcx, [rsp+24]
    lea rdx, [rsp+2]
    mov word [rsp+2], ax
    lea rsi, [rsp+1]
    lea r9, [rsp+40]
    xor eax, eax
    lea r8, [rsp+32]
    mov edi, LC12
    mov byte [rsp+1], 0
    mov qword [rsp+24], 0
    mov qword [rsp+32], 0
    mov qword [rsp+40], 0
    call scanf
    movsx ecx, word [rsp+2]
    movsx edx, byte [rsp+1]
    sub rsp, 8
    push qword [rsp+48]
    mov r9, qword [rsp+48]
    mov esi, eax
    mov edi, LC13
    mov r8, qword [rsp+40]
    xor eax, eax
    call printf
    call skip_line
    xor eax, eax
    mov rsi, rbx
    mov edi, LC14
    call scanf
    mov r12d, eax
    call getchar
    mov esi, r12d
    mov edi, LC15
    mov edx, eax
    xor eax, eax
    call printf
    call skip_line
    mov rdx, rbp
    mov rsi, rbx
    mov edi, LC16
    xor eax, eax
    mov dword [rsp+24], 0
    mov dword [rsp+20], 0
    call scanf
    mov ebp, eax
    call getchar
    mov edx, dword [rsp+20]
    mov esi, ebp
    mov edi, LC17
    mov ecx, eax
    xor eax, eax
    call printf
    call skip_line
    mov rsi, r13
    mov edi, LC18
    xor eax, eax
    call scanf
    mov edx, dword [rsp+36]
    mov edi, LC19
    mov esi, eax
    xor eax, eax
    call printf
    mov rsi, rbx
    mov edi, LC20
    xor eax, eax
    call scanf
    mov edx, dword [rsp+20]
    mov edi, LC21
    mov esi, eax
    xor eax, eax
    call printf
    mov rsi, rbx
    mov edi, LC14
    xor eax, eax
    call scanf
    mov edi, LC22
    mov esi, eax
    xor eax, eax
    call printf
    mov rsi, rbx
    mov edi, LC14
    xor eax, eax
    call scanf
    mov edi, LC23
    mov esi, eax
    xor eax, eax
    call printf
    add rsp, 64
    xor eax, eax
    pop rbx
    pop rbp
    pop r12
    pop r13
    pop r14
    ret
    section .text
