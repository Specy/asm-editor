    default rel
    extern printf
    extern time
    extern clock
    extern difftime
    extern snprintf
    extern gmtime
    extern localtime
    extern mktime
    extern asctime
    extern ctime
    ; compiler-symbol LC0 .LC0
    ; compiler-symbol LC1 .LC1
    ; compiler-symbol LC2 .LC2
    ; compiler-symbol LC4 .LC4
    ; compiler-symbol LC5 .LC5
    ; compiler-symbol LC11 .LC11
    ; compiler-symbol LC12 .LC12
    ; compiler-symbol LC14 .LC14
    ; compiler-symbol LC15 .LC15
    ; compiler-symbol LC16 .LC16
    ; compiler-symbol LC17 .LC17
    ; compiler-symbol LC19 .LC19
    ; compiler-symbol LC20 .LC20
    ; compiler-symbol LC21 .LC21
    ; compiler-symbol L5 .L5
    ; compiler-symbol LC6 .LC6
    ; compiler-symbol LC7 .LC7
    ; compiler-symbol LC8 .LC8
    ; compiler-symbol LC9 .LC9
    ; compiler-symbol LC10 .LC10
    ; compiler-symbol L6 .L6
    ; compiler-symbol LC13 .LC13
    ; compiler-symbol LC18 .LC18
    section .text
    section .rodata align=16
    align 8, db 0
LC0:
    db `%s: %04d-%02d-%02d %02d:%02d:%02d wday=%d yday=%d isdst=%d\n`, 0
    section .text
    align 16
show:
    sub rsp, 16
    mov eax, dword [rsi+16]
    lea ecx, [rax+1]
    mov eax, dword [rsi+20]
    lea edx, [rax+1900]
    mov eax, dword [rsi+32]
    push rax
    mov eax, dword [rsi+28]
    push rax
    mov eax, dword [rsi+24]
    push rax
    mov eax, dword [rsi]
    push rax
    mov eax, dword [rsi+4]
    push rax
    mov r9d, dword [rsi+8]
    xor eax, eax
    mov r8d, dword [rsi+12]
    mov rsi, rdi
    mov edi, LC0
    call printf
    add rsp, 56
    ret
    section .rodata
    align 8, db 0
LC1:
    db `time plausible=%d stored equals returned=%d\n`, 0
    section .rodata
LC2:
    db `time(NULL) not before=%d\n`, 0
    section .rodata
    align 8, db 0
LC4:
    db `clock non-decreasing=%d CLOCKS_PER_SEC=%ld\n`, 0
    section .rodata
LC5:
    db `difftime=%g %g\n`, 0
LC11:
    db `gmtime(%lld)`, 0
LC12:
    db `localtime`, 0
LC14:
    db `mktime=%lld\n`, 0
LC15:
    db `normalized`, 0
    section .rodata
    align 8, db 0
LC16:
    db `mktime(gmtime(now)) == now: %d\n`, 0
    section .rodata
LC17:
    db `y2k=%lld\n`, 0
LC19:
    db `month 13`, 0
LC20:
    db `asctime: %s`, 0
LC21:
    db `ctime: %s`, 0
    section .text
    align 16
    global main
main:
    push r12
    push rbp
    push rbx
    sub rsp, 352
    mov qword [rsp+16], 0
    lea rdi, [rsp+16]
    call time
    xor edx, edx
    cmp qword [rsp+16], rax
    mov edi, LC1
    sete dl
    xor esi, esi
    cmp rax, 946684799
    mov qword [rsp+24], rax
    setg sil
    xor eax, eax
    call printf
    xor edi, edi
    call time
    xor esi, esi
    cmp rax, qword [rsp+24]
    mov edi, LC2
    setge sil
    xor eax, eax
    call printf
    call clock
    mov qword [rsp+32], 0x000000000
    mov rbx, rax
    xor eax, eax
L5:
    pxor xmm0, xmm0
    movsd xmm1, qword [rsp+32]
    cvtsi2sd xmm0, eax
    add eax, 1
    addsd xmm0, xmm1
    movsd qword [rsp+32], xmm0
    cmp eax, 200000
    jne L5
    call clock
    mov edx, 1000000
    mov edi, LC4
    lea r12, [rsp+344]
    cmp rbx, rax
    not rbx
    lea rbp, [rsp+208]
    setle sil
    shr rbx, 63
    xor eax, eax
    and esi, ebx
    lea rbx, [rsp+256]
    call printf
    mov esi, 86400
    xor edi, edi
    call difftime
    mov esi, 3
    mov edi, 10
    movsd qword [rsp+8], xmm0
    call difftime
    movsd xmm1, qword [rsp+8]
    mov edi, LC5
    mov eax, 2
    call printf
    movdqa xmm0, oword [rel LC6]
    movabs rax, 253402300799
    mov qword [rsp+336], rax
    movaps oword [rsp+256], xmm0
    movdqa xmm0, oword [rel LC7]
    movaps oword [rsp+272], xmm0
    movdqa xmm0, oword [rel LC8]
    movaps oword [rsp+288], xmm0
    movdqa xmm0, oword [rel LC9]
    movaps oword [rsp+304], xmm0
    movdqa xmm0, oword [rel LC10]
    movaps oword [rsp+320], xmm0
L6:
    mov rcx, qword [rbx]
    mov edx, LC11
    mov esi, 32
    mov rdi, rbp
    xor eax, eax
    call snprintf
    mov rdi, rbx
    add rbx, 8
    call gmtime
    mov rdi, rbp
    mov rsi, rax
    call show
    cmp r12, rbx
    jne L6
    lea rdi, [rsp+40]
    lea rbx, [rsp+64]
    mov qword [rsp+40], 1700000000
    call localtime
    mov edi, LC12
    mov rsi, rax
    call show
    mov rax, qword [rel LC13]
    mov rdi, rbx
    pxor xmm0, xmm0
    movaps oword [rsp+64], xmm0
    movaps oword [rsp+80], xmm0
    mov dword [rsp+76], 61
    mov dword [rsp+84], 124
    mov qword [rsp+68], rax
    mov dword [rsp+96], -1
    call mktime
    mov edi, LC14
    mov rsi, rax
    xor eax, eax
    call printf
    mov rsi, rbx
    mov edi, LC15
    call show
    lea rdi, [rsp+24]
    call gmtime
    lea rdi, [rsp+112]
    movdqu xmm1, oword [rax]
    movaps oword [rsp+112], xmm1
    movdqu xmm1, oword [rax+16]
    movaps oword [rsp+128], xmm1
    mov eax, dword [rax+32]
    mov dword [rsp+144], eax
    call mktime
    xor esi, esi
    cmp qword [rsp+24], rax
    mov edi, LC16
    sete sil
    xor eax, eax
    call printf
    pxor xmm0, xmm0
    lea rdi, [rsp+160]
    mov dword [rsp+192], 0
    movaps oword [rsp+160], xmm0
    movaps oword [rsp+176], xmm0
    mov dword [rsp+172], 1
    mov dword [rsp+180], 100
    call mktime
    mov edi, LC17
    mov rsi, rax
    xor eax, eax
    call printf
    mov rax, qword [rel LC18]
    pxor xmm0, xmm0
    mov rdi, rbp
    movaps oword [rsp+224], xmm0
    movaps oword [rsp+208], xmm0
    mov dword [rsp+240], 0
    mov qword [rsp+220], rax
    mov dword [rsp+228], 99
    call mktime
    mov rsi, rbp
    mov edi, LC19
    call show
    lea rdi, [rsp+48]
    mov qword [rsp+48], 0
    call gmtime
    mov rdi, rax
    call asctime
    mov edi, LC20
    mov rsi, rax
    xor eax, eax
    call printf
    lea rdi, [rsp+56]
    mov qword [rsp+56], 951782400
    call ctime
    mov edi, LC21
    mov rsi, rax
    xor eax, eax
    call printf
    add rsp, 352
    xor eax, eax
    pop rbx
    pop rbp
    pop r12
    ret
    section .rodata
    align 16, db 0
LC6:
    dq 0
    dq 86399
    align 16, db 0
LC7:
    dq 951782400
    dq 951868800
    align 16, db 0
LC8:
    dq 1234567890
    dq 2147483647
    align 16, db 0
LC9:
    dq 2147483648
    dq 4102444800
    align 16, db 0
LC10:
    dq -86400
    dq -2208988800
    section .rodata
    align 8, db 0
LC13:
    dd -30
    dd 25
    align 8, db 0
LC18:
    dd 1
    dd 13
    section .text
