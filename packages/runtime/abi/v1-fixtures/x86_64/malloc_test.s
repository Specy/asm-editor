    default rel
    extern malloc
    extern printf
    extern realloc
    extern free
    extern calloc
    extern errno
    ; compiler-symbol LC0 .LC0
    ; compiler-symbol LC1 .LC1
    ; compiler-symbol LC3 .LC3
    ; compiler-symbol LC4 .LC4
    ; compiler-symbol LC5 .LC5
    ; compiler-symbol LC6 .LC6
    ; compiler-symbol LC7 .LC7
    ; compiler-symbol LC8 .LC8
    ; compiler-symbol LC9 .LC9
    ; compiler-symbol LC10 .LC10
    ; compiler-symbol LC11 .LC11
    ; compiler-symbol L2 .L2
    ; compiler-symbol L3 .L3
    ; compiler-symbol L32 .L32
    ; compiler-symbol L9 .L9
    ; compiler-symbol L37 .L37
    ; compiler-symbol L34 .L34
    ; compiler-symbol L6 .L6
    ; compiler-symbol L35 .L35
    ; compiler-symbol L36 .L36
    ; compiler-symbol L10 .L10
    ; compiler-symbol L12 .L12
    ; compiler-symbol L11 .L11
    ; compiler-symbol L38 .L38
    ; compiler-symbol L13 .L13
    ; compiler-symbol L14 .L14
    ; compiler-symbol L15 .L15
    section .text
    section .rodata align=8
    align 8, db 0
LC0:
    db `malloc(10) non-null=%d aligned8=%d\n`, 0
    section .rodata
LC1:
    db `grown keeps=%s\n`, 0
LC3:
    db `shrunk keeps=%s\n`, 0
LC4:
    db `calloc zero sum=%d\n`, 0
    section .rodata
    align 8, db 0
LC5:
    db `calloc overflow null=%d errno==ENOMEM %d\n`, 0
    align 8, db 0
LC6:
    db `malloc huge null=%d errno==ENOMEM %d\n`, 0
    align 8, db 0
LC7:
    db `realloc huge null=1 errno==ENOMEM %d old=%s\n`, 0
    section .rodata
LC8:
    db `malloc(0) non-null=%d\n`, 0
LC9:
    db `realloc(NULL)=%s\n`, 0
    section .rodata
    align 8, db 0
LC10:
    db `interleaved corrupted bytes=%d\n`, 0
    section .rodata
LC11:
    db `repeated alloc/free ok=%d\n`, 0
    section .text
    align 16
    global main
main:
    push r15
    mov edi, 10
    movabs rax, 9223372036854775807
    push r14
    push r13
    push r12
    push rbp
    push rbx
    sub rsp, 1640
    mov qword [rsp], -1
    mov qword [rsp+8], rax
    mov qword [rsp+16], 4
    call malloc
    xor esi, esi
    mov edx, 1
    mov edi, LC0
    test rax, rax
    mov rbx, rax
    setne sil
    xor eax, eax
    call printf
    mov edx, 105
    mov rdi, rbx
    movabs rax, 7523094288207667809
    mov word [rbx+8], dx
    mov esi, 100
    mov qword [rbx], rax
    call realloc
    mov edi, LC1
    mov rbx, rax
    mov rsi, rax
    xor eax, eax
    call printf
    mov byte [rbx+99], 0
    mov esi, 2021161080
    mov rdi, rbx
    movd xmm0, esi
    mov esi, 5
    pshufd xmm0, xmm0, 0
    movups oword [rbx+74], xmm0
    movups oword [rbx+10], xmm0
    movups oword [rbx+26], xmm0
    movups oword [rbx+42], xmm0
    movups oword [rbx+58], xmm0
    movups oword [rbx+83], xmm0
    call realloc
    mov edi, LC3
    mov byte [rax+4], 0
    mov rsi, rax
    mov rbx, rax
    xor eax, eax
    call printf
    mov rdi, rbx
    call free
    mov esi, 4
    mov edi, 1000
    call calloc
    pxor xmm0, xmm0
    mov rbx, rax
    lea rdx, [rax+4000]
L2:
    movdqu xmm2, oword [rax]
    add rax, 16
    paddd xmm0, xmm2
    cmp rax, rdx
    jne L2
    movdqa xmm1, xmm0
    mov edi, LC4
    xor eax, eax
    psrldq xmm1, 8
    paddd xmm0, xmm1
    movdqa xmm1, xmm0
    psrldq xmm1, 4
    paddd xmm0, xmm1
    movd esi, xmm0
    call printf
    mov rdi, rbx
    call free
    mov dword [rel errno], 0
    mov rsi, qword [rsp+16]
    mov rdi, qword [rsp+8]
    call calloc
    mov edi, LC5
    mov qword [rsp+24], rax
    mov edx, dword [rel errno]
    mov rax, qword [rsp+24]
    cmp edx, 12
    sete dl
    xor esi, esi
    test rax, rax
    sete sil
    movzx edx, dl
    xor eax, eax
    call printf
    mov dword [rel errno], 0
    mov rdi, qword [rsp]
    call malloc
    mov edi, LC6
    mov qword [rsp+24], rax
    mov edx, dword [rel errno]
    mov rax, qword [rsp+24]
    cmp edx, 12
    sete dl
    xor esi, esi
    test rax, rax
    sete sil
    movzx edx, dl
    xor eax, eax
    call printf
    mov edi, 16
    call malloc
    mov dword [rel errno], 0
    mov rsi, qword [rsp]
    mov rbx, rax
    movabs rax, 7307126045456036979
    mov qword [rbx], rax
    mov rdi, rbx
    sub rsi, 4096
    mov dword [rbx+7], 6648421
    call realloc
    mov rdi, rax
    test rax, rax
    je L3
L32:
    call free
    xor edi, edi
    lea rbp, [rsp+32]
    call malloc
    xor esi, esi
    mov edi, LC8
    test rax, rax
    mov rbx, rax
    setne sil
    xor eax, eax
    xor r14d, r14d
    xor r13d, r13d
    call printf
    mov rdi, rbx
    call free
    mov edi, 8
    call malloc
    mov edi, LC9
    mov rbx, rax
    mov dword [rax], 1936028262
    mov eax, 104
    mov word [rbx+4], ax
    mov rsi, rbx
    xor eax, eax
    call printf
    mov rdi, rbx
    movabs rbx, 72340172838076673
    call free
    jmp L9
L37:
    test r12b, 4
    jne L34
    test r12d, r12d
    je L6
    mov byte [rdx], al
    test r12b, 2
    jne L35
L6:
    add r13, 1
    add r14d, 37
    cmp r13, 200
    je L36
L9:
    mov eax, r14d
    mov r15d, r14d
    imul rax, rax, 458129845
    shr rax, 37
    imul eax, eax, 300
    sub r15d, eax
    lea r12d, [r15+1]
    movsx rdi, r12d
    call malloc
    mov qword [rbp+0+r13*8], rax
    mov rdx, rax
    movzx eax, r13b
    imul rax, rbx
    cmp r12d, 8
    jb L37
    shr r15d, 3
    mov r12d, r12d
    mov rdi, rdx
    mov ecx, r15d
    mov qword [rdx-8+r12], rax
    rep stosq
    jmp L6
L34:
    mov r12d, r12d
    mov dword [rdx], eax
    mov dword [rdx-4+r12], eax
    jmp L6
L35:
    mov r12d, r12d
    mov word [rdx-2+r12], ax
    jmp L6
L36:
    mov r12, rbp
    mov rbx, rbp
L10:
    mov rdi, qword [rbx]
    add rbx, 16
    call free
    lea rax, [rsp+1632]
    cmp rax, rbx
    jne L10
    mov edi, 37
    mov esi, 1
    xor ebx, ebx
L12:
    mov eax, edi
    mov rdx, qword [rbp+0+rsi*8]
    mov ecx, edi
    imul rax, rax, 458129845
    shr rax, 37
    imul eax, eax, 300
    sub ecx, eax
    lea rax, [rdx+1]
    movsx rcx, ecx
    add rcx, rax
    jmp L11
L38:
    add rax, 1
L11:
    movzx edx, byte [rdx]
    cmp edx, esi
    setne dl
    movzx edx, dl
    add ebx, edx
    mov rdx, rax
    cmp rcx, rax
    jne L38
    add rsi, 2
    add edi, 74
    cmp rsi, 201
    jne L12
L13:
    mov edi, 64
    add rbp, 16
    call malloc
    mov qword [rbp-16], rax
    lea rax, [rsp+1632]
    cmp rax, rbp
    jne L13
L14:
    mov rdi, qword [r12]
    add r12, 8
    call free
    lea rax, [rsp+1632]
    cmp rax, r12
    jne L14
    mov esi, ebx
    mov edi, LC10
    xor eax, eax
    mov ebx, 1000
    call printf
    xor ebp, ebp
L15:
    mov edi, 1000
    call malloc
    cmp rax, 1
    mov rdi, rax
    sbb ebp, -1
    call free
    sub ebx, 1
    jne L15
    mov esi, ebp
    mov edi, LC11
    xor eax, eax
    call printf
    add rsp, 1640
    xor eax, eax
    pop rbx
    pop rbp
    pop r12
    pop r13
    pop r14
    pop r15
    ret
L3:
    mov eax, dword [rel errno]
    xor esi, esi
    mov edi, LC7
    mov rdx, rbx
    cmp eax, 12
    sete sil
    xor eax, eax
    call printf
    mov rdi, rbx
    jmp L32
    section .text
