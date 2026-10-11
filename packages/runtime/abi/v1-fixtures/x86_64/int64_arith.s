    default rel
    extern printf
    extern __popcountdi2
    ; compiler-symbol LC0 .LC0
    ; compiler-symbol LC1 .LC1
    ; compiler-symbol LC2 .LC2
    ; compiler-symbol LC3 .LC3
    ; compiler-symbol LC4 .LC4
    ; compiler-symbol LC5 .LC5
    ; compiler-symbol LC8 .LC8
    ; compiler-symbol LC9 .LC9
    ; compiler-symbol LC10 .LC10
    ; compiler-symbol L2 .L2
    ; compiler-symbol L5 .L5
    ; compiler-symbol L3 .L3
    ; compiler-symbol L46 .L46
    ; compiler-symbol L27 .L27
    ; compiler-symbol L6 .L6
    ; compiler-symbol L8 .L8
    ; compiler-symbol L7 .L7
    ; compiler-symbol L9 .L9
    ; compiler-symbol L10 .L10
    ; compiler-symbol L11 .L11
    ; compiler-symbol L17 .L17
    ; compiler-symbol L48 .L48
    ; compiler-symbol L13 .L13
    ; compiler-symbol L49 .L49
    ; compiler-symbol L15 .L15
    ; compiler-symbol L50 .L50
    ; compiler-symbol L16 .L16
    ; compiler-symbol L47 .L47
    ; compiler-symbol L22 .L22
    ; compiler-symbol L18 .L18
    ; compiler-symbol L51 .L51
    ; compiler-symbol LC6 .LC6
    ; compiler-symbol LC7 .LC7
    ; compiler-symbol L21 .L21
    section .text
    section .rodata align=8
LC0:
    db `%lld / %lld = %lld r %lld\n`, 0
LC1:
    db `%llu / %llu = %llu r %llu\n`, 0
    section .rodata
    align 8, db 0
LC2:
    db `%llx << %d = %llx, >> = %llx, sar = %lld\n`, 0
    align 8, db 0
LC3:
    db `%lld * 3 = %lld, * itself = %lld, to double %.17g, to float %.9g\n`, 0
    align 8, db 0
LC4:
    db `%llu to double %.17g to float %.9g popcount=%d clz=%d ctz=%d bswap=%llx\n`, 0
    section .rodata
LC5:
    db `%.17g to int64 %lld`, 0
LC8:
    db ` to uint64 %llu`, 0
LC9:
    db ` float to int64 %lld\n`, 0
    section .rodata
    align 8, db 0
LC10:
    db `32-bit: popcount=%d clz=%d ctz=%d bswap=%x\n`, 0
    section .text
    align 16
    global main
main:
    push r14
    push r13
    movabs r13, -9223372036854775808
    push r12
    xor r12d, r12d
    push rbp
    push rbx
    sub rsp, 16
L2:
    xor ebx, ebx
    movsx rbp, r12d
    jmp L5
L3:
    add ebx, 1
    cmp ebx, 14
    je L46
L5:
    movsx rax, ebx
    mov rsi, qword [sv+rbp*8]
    mov rdi, qword [sv+rax*8]
    test rdi, rdi
    je L3
    cmp rsi, r13
    jne L27
    cmp rdi, -1
    je L3
L27:
    mov rax, rsi
    add ebx, 1
    cqo
    idiv rdi
    mov r8, rdx
    mov rcx, rax
    mov rdx, rdi
    xor eax, eax
    mov edi, LC0
    call printf
    cmp ebx, 14
    jne L5
L46:
    add r12d, 1
    cmp r12d, 14
    jne L2
    xor r12d, r12d
L6:
    xor ebx, ebx
    movsx rbp, r12d
L8:
    movsx rax, ebx
    mov rsi, qword [uv+rbp*8]
    mov rdi, qword [uv+rax*8]
    test rdi, rdi
    je L7
    mov rax, rsi
    xor edx, edx
    div rdi
    mov r8, rdx
    mov rcx, rax
    mov rdx, rdi
    xor eax, eax
    mov edi, LC1
    call printf
L7:
    add ebx, 1
    cmp ebx, 10
    jne L8
    add r12d, 1
    cmp r12d, 10
    jne L6
    xor r12d, r12d
L9:
    xor ebx, ebx
    movsx rbp, r12d
L10:
    movsx rax, ebx
    mov edi, LC2
    add ebx, 1
    mov edx, dword [shifts+rax*4]
    mov rsi, qword [uv+rbp*8]
    mov ecx, edx
    mov rax, rsi
    mov r9, rsi
    mov r8, rsi
    sal rax, cl
    sar r9, cl
    shr r8, cl
    mov rcx, rax
    xor eax, eax
    call printf
    cmp ebx, 7
    jne L10
    add r12d, 1
    cmp r12d, 10
    jne L9
    xor ebx, ebx
L11:
    movsx rax, ebx
    pxor xmm1, xmm1
    pxor xmm0, xmm0
    mov edi, LC3
    mov rsi, qword [sv+rax*8]
    add ebx, 1
    mov eax, 2
    cvtsi2ss xmm1, rsi
    mov rcx, rsi
    lea rdx, [rsi+rsi*2]
    cvtsi2sd xmm0, rsi
    imul rcx, rsi
    cvtss2sd xmm1, xmm1
    call printf
    cmp ebx, 14
    jne L11
    xor ebp, ebp
    jmp L17
L48:
    xor r14d, r14d
    mov rdi, rbx
    rep bsf r14, rbx
    bsr r12, rbx
    call __popcountdi2
    xor r12d, 63
    mov edx, eax
    test rbx, rbx
    js L13
L49:
    pxor xmm1, xmm1
    cvtsi2ss xmm1, rbx
    cvtss2sd xmm1, xmm1
    test rbx, rbx
    js L15
L50:
    pxor xmm0, xmm0
    cvtsi2sd xmm0, rbx
L16:
    mov r9, r13
    mov r8d, r14d
    mov ecx, r12d
    mov rsi, rbx
    mov edi, LC4
    mov eax, 2
    add ebp, 1
    call printf
    cmp ebp, 10
    je L47
L17:
    movsx rax, ebp
    mov rbx, qword [uv+rax*8]
    mov r13, rbx
    bswap r13
    test rbx, rbx
    jne L48
    mov rdi, rbx
    mov r14d, -1
    mov r12d, -1
    call __popcountdi2
    mov edx, eax
    test rbx, rbx
    jns L49
L13:
    mov rax, rbx
    mov rcx, rbx
    pxor xmm1, xmm1
    shr rax, 1
    and ecx, 1
    or rax, rcx
    cvtsi2ss xmm1, rax
    addss xmm1, xmm1
    cvtss2sd xmm1, xmm1
    test rbx, rbx
    jns L50
L15:
    mov rax, rbx
    mov rcx, rbx
    pxor xmm0, xmm0
    shr rax, 1
    and ecx, 1
    or rax, rcx
    cvtsi2sd xmm0, rax
    addsd xmm0, xmm0
    jmp L16
L47:
    movabs r12, -9223372036854775808
    xor ebx, ebx
    jmp L22
L18:
    cvtsd2ss xmm0, xmm0
    cvttss2si rsi, xmm0
    mov edi, LC9
    xor eax, eax
    add ebx, 1
    call printf
    cmp ebx, 13
    je L51
L22:
    mov eax, ebx
    mov edi, LC5
    movsd xmm0, qword [dv+rax*8]
    mov eax, 1
    cvttsd2si rbp, xmm0
    movsd qword [rsp+8], xmm0
    mov rsi, rbp
    call printf
    movsd xmm0, qword [rsp+8]
    comisd xmm0, qword [rel LC6]
    jbe L18
    comisd xmm0, qword [rel LC7]
    mov rsi, rbp
    jb L21
    movapd xmm1, xmm0
    subsd xmm1, qword [rel LC7]
    cvttsd2si rsi, xmm1
    xor rsi, r12
L21:
    mov edi, LC8
    xor eax, eax
    movsd qword [rsp+8], xmm0
    call printf
    movsd xmm0, qword [rsp+8]
    jmp L18
L51:
    mov r8d, 16838784
    xor ecx, ecx
    xor edx, edx
    mov esi, 6
    mov edi, LC10
    xor eax, eax
    call printf
    add rsp, 16
    xor eax, eax
    pop rbx
    pop rbp
    pop r12
    pop r13
    pop r14
    ret
    section .data align=32
    align 16, db 0
shifts:
    dd 0
    dd 1
    dd 7
    dd 31
    dd 32
    dd 33
    dd 63
    align 32, db 0
dv:
    dd 0
    dd 0
    dd 0
    dd 1071644672
    dd 0
    dd -1075838976
    dd 0
    dd 1073217536
    dd 0
    dd -1074266112
    dd 524288
    dd 1106247680
    dd 524288
    dd -1041235968
    dd 0
    dd 1128267776
    dd 1733216256
    dd 1135329645
    dd 1733216256
    dd -1012154003
    dd -798530048
    dd 1138748221
    dd -798530048
    dd -1008735427
    dd 1475522593
    dd 1100836660
    align 32, db 0
uv:
    dq 0
    dq 1
    dq 2
    dq 10
    dq 4294967295
    dq 4294967296
    dq -2401053089206453570
    dq -1
    dq 1000000000000000000
    dq -6101065172474983726
    align 32, db 0
sv:
    dq 0
    dq 1
    dq -1
    dq 7
    dq -7
    dq 1000000007
    dq -1000000007
    dq 4294967296
    dq -4294967297
    dq 9223372036854775807
    dq -9223372036854775808
    dq 81985529216486895
    dq -81985529216486895
    dq 999999999999
    section .rodata
    align 8, db 0
LC6:
    dd 0
    dd -1074790400
    align 8, db 0
LC7:
    dd 0
    dd 1138753536
    section .text
