    default rel
    extern printf
    extern stdout
    extern fprintf
    extern stderr
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
    ; compiler-symbol LC24 .LC24
    ; compiler-symbol LC25 .LC25
    ; compiler-symbol LC26 .LC26
    ; compiler-symbol LC27 .LC27
    ; compiler-symbol LC28 .LC28
    ; compiler-symbol LC29 .LC29
    ; compiler-symbol LC30 .LC30
    ; compiler-symbol LC31 .LC31
    ; compiler-symbol LC32 .LC32
    ; compiler-symbol LC33 .LC33
    ; compiler-symbol LC23 .LC23
    section .text
    section .rodata align=8
    align 8, db 0
LC0:
    db `[%d] [%i] [%u] [%o] [%x] [%X]\n`, 0
    section .rodata
LC1:
    db `returned %d\n`, 0
    section .rodata
    align 8, db 0
LC2:
    db `[%5d] [%-5d] [%05d] [%+d] [% d] [%+5d] [%-+5d] [% 05d]\n`, 0
    align 8, db 0
LC3:
    db `[%.3d] [%8.3d] [%-8.3d] [%.0d] [%+.0d] [%5.0d]\n`, 0
    align 8, db 0
LC4:
    db `[%#x] [%#X] [%#o] [%#o] [%#x] [%#.3o] [%#10x] [%#010x]\n`, 0
    align 8, db 0
LC5:
    db `[%*d] [%-*d] [%*d] [%.*d] [%*.*d] [%.*d]\n`, 0
    section .rodata
LC6:
    db `[%d] [%d] [%u] [%x]\n`, 0
    section .rodata
    align 8, db 0
LC7:
    db `[%hhd] [%hhu] [%hd] [%hu] [%hhx] [%hx]\n`, 0
    section .rodata
LC8:
    db `[%ld] [%lu] [%lx] [%lo]\n`, 0
    section .rodata
    align 8, db 0
LC9:
    db `[%lld] [%lld] [%llu] [%llx] [%llX] [%llo]\n`, 0
    align 8, db 0
LC10:
    db `[%jd] [%ju] [%zd] [%zu] [%td] [%zx]\n`, 0
    align 8, db 0
LC11:
    db `[%d] [%c] [%5c] [%-5c] [%c%c%c]\n`, 0
    section .rodata
LC12:
    db `xyz`, 0
LC13:
    db `abcdef`, 0
LC14:
    db `hi`, 0
LC15:
    db `hello`, 0
    section .rodata
    align 8, db 0
LC16:
    db `[%s] [%10s] [%-10s] [%.3s] [%10.2s] [%-10.4s] [%.0s] [%s]\n`, 0
    section .rodata
LC17:
    db ``, 0
LC18:
    db `gone`, 0
LC19:
    db `truncate`, 0
LC20:
    db `[%%] [%%%%] [100%%]\n`, 0
LC21:
    db `world`, 0
    section .rodata
    align 8, db 0
LC22:
    db `[%2$s %1$s] [%3$d %3$x] [%1$s]\n`, 0
    align 8, db 0
LC24:
    db `[%1$*2$d] [%1$-*2$d] [%3$.*4$f]\n`, 0
    section .rodata
LC25:
    db `%s`, 0
LC26:
    db `empty returned %d\n`, 0
LC27:
    db `%c`, 0
LC28:
    db `|NUL returned %d\n`, 0
LC29:
    db `fprintf`, 0
LC30:
    db `%d-%s\n`, 0
LC31:
    db `fprintf returned %d\n`, 0
LC32:
    db `to stderr %d\n`, 0
LC33:
    db `stderr returned %d\n`, 0
    section .text
    align 16
    global main
main:
    sub rsp, 16
    mov ecx, 42
    mov edx, -42
    xor eax, eax
    push 255
    mov r9d, 255
    mov r8d, 8
    mov esi, 42
    mov edi, LC0
    call printf
    mov edi, LC1
    mov esi, eax
    xor eax, eax
    call printf
    mov dword [rsp], 42
    mov r9d, 42
    mov r8d, 42
    push 42
    mov ecx, 42
    mov edx, 42
    xor eax, eax
    push 42
    mov esi, 42
    mov edi, LC2
    call printf
    add rsp, 24
    xor r9d, r9d
    xor r8d, r8d
    push 0
    mov ecx, 7
    mov edx, 7
    xor eax, eax
    mov esi, 7
    mov edi, LC3
    call printf
    xor r9d, r9d
    xor r8d, r8d
    mov ecx, 8
    mov dword [rsp], 255
    mov edx, 255
    mov esi, 255
    xor eax, eax
    push 255
    mov edi, LC4
    push 8
    call printf
    add rsp, 32
    mov ecx, 6
    xor eax, eax
    push 7
    mov r9d, -6
    mov r8d, 2
    mov edx, 1
    push -1
    mov esi, 6
    mov edi, LC5
    push 6
    push 3
    push 8
    push 5
    push 4
    push 3
    call printf
    add rsp, 64
    mov ecx, -1
    xor eax, eax
    mov r8d, -1
    mov edx, -2147483648
    mov esi, 2147483647
    mov edi, LC6
    call printf
    sub rsp, 8
    mov ecx, 70000
    xor eax, eax
    push 131071
    mov r9d, 511
    mov r8d, 70000
    mov edx, 300
    mov esi, 300
    mov edi, LC7
    call printf
    mov r8d, 511
    xor eax, eax
    mov ecx, 3735928559
    mov edx, 4000000000
    mov rsi, -2000000000
    mov edi, LC8
    call printf
    pop rax
    mov edi, LC9
    xor eax, eax
    movabs rdx, 23528931761549395
    mov rcx, -1
    movabs r9, -81985529216486896
    movabs r8, 81985529216486895
    movabs rsi, 9223372036854775807
    push rdx
    movabs rdx, -9223372036854775808
    call printf
    mov r9d, 12
    mov r8d, 4
    xor eax, eax
    mov rcx, -5
    mov edi, LC10
    movabs rdx, 18000000000
    movabs rsi, -9000000000
    mov qword [rsp], 2748
    call printf
    push 99
    mov r9d, 97
    xor eax, eax
    push 98
    mov r8d, 122
    mov ecx, 121
    mov edx, 120
    mov esi, 1
    mov edi, LC11
    call printf
    add rsp, 24
    mov ecx, LC14
    xor eax, eax
    push LC17
    mov rdx, rcx
    mov esi, LC15
    mov edi, LC16
    push LC18
    mov r9d, LC12
    mov r8d, LC13
    push LC19
    call printf
    add rsp, 32
    mov edi, LC20
    xor eax, eax
    call printf
    mov ecx, 255
    mov edx, LC15
    xor eax, eax
    mov esi, LC21
    mov edi, LC22
    call printf
    mov ecx, 2
    mov edx, 5
    movsd xmm0, qword [rel LC23]
    mov esi, 7
    mov edi, LC24
    mov eax, 1
    call printf
    mov esi, LC17
    mov edi, LC25
    xor eax, eax
    call printf
    mov edi, LC26
    mov esi, eax
    xor eax, eax
    call printf
    xor esi, esi
    mov edi, LC27
    xor eax, eax
    call printf
    mov edi, LC28
    mov esi, eax
    xor eax, eax
    call printf
    mov rdi, qword [rel stdout]
    mov ecx, LC29
    xor eax, eax
    mov edx, 12345
    mov esi, LC30
    call fprintf
    mov edi, LC31
    mov esi, eax
    xor eax, eax
    call printf
    mov rdi, qword [rel stderr]
    mov edx, 7
    xor eax, eax
    mov esi, LC32
    call fprintf
    mov edi, LC33
    mov esi, eax
    xor eax, eax
    call printf
    xor eax, eax
    add rsp, 8
    ret
    section .rodata
    align 8, db 0
LC23:
    dd -266631570
    dd 1074340345
    section .text
