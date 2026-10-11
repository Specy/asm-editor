    default rel
    extern printf
    extern puts
    extern __dso_handle
    extern __cxa_atexit
    extern atexit
    ; compiler-symbol LC0 .LC0
    ; compiler-symbol LC1 .LC1
    ; compiler-symbol LC2 .LC2
    ; compiler-symbol LC3 .LC3
    ; compiler-symbol LC4 .LC4
    ; compiler-symbol LC5 .LC5
    ; compiler-symbol L11 .L11
    ; compiler-symbol L8 .L8
    ; compiler-symbol LC6 .LC6
    ; compiler-symbol LC7 .LC7
    ; compiler-symbol LC8 .LC8
    ; compiler-symbol LC9 .LC9
    section .text
    section .rodata align=8
LC0:
    db `destroy %s\n`, 0
    section .text
    align 2
    align 16
    global _ZN6TracerD2Ev:weak
_ZN6TracerD2Ev:
_ZN6TracerD1Ev:
    mov rsi, qword [rdi]
    xor eax, eax
    mov edi, LC0
    jmp printf
    global _ZN6TracerD1Ev:weak
    section .rodata
LC1:
    db `atexit handler`, 0
    section .text
    align 16
_ZL7handlerv:
    mov edi, LC1
    jmp puts
    section .rodata
LC2:
    db `function-local static`, 0
LC3:
    db `construct %s\n`, 0
    section .text
    align 16
_ZL5localv.part.0:
    sub rsp, 8
    mov esi, LC2
    mov edi, LC3
    xor eax, eax
    mov qword [rel _ZZL5localvE1t], LC2
    call printf
    mov edx, __dso_handle
    mov esi, _ZZL5localvE1t
    mov byte [rel _ZGVZL5localvE1t], 1
    mov edi, _ZN6TracerD1Ev
    add rsp, 8
    jmp __cxa_atexit
    section .rodata
    align 8, db 0
LC4:
    db `main starts, initializer returned %d\n`, 0
    section .rodata
LC5:
    db `main returns`, 0
    section .text
    align 16
    global main
main:
    sub rsp, 8
    mov esi, dword [rel _ZL17initialized_value]
    mov edi, LC4
    xor eax, eax
    call printf
    mov edi, _ZL7handlerv
    call atexit
    cmp byte [rel _ZGVZL5localvE1t], 0
    je L11
L8:
    mov edi, LC5
    call puts
    xor eax, eax
    add rsp, 8
    ret
L11:
    call _ZL5localv.part.0
    cmp byte [rel _ZGVZL5localvE1t], 0
    jne L8
    call _ZL5localv.part.0
    jmp L8
    section .rodata
LC6:
    db `global first`, 0
LC7:
    db `global second`, 0
    section .rodata
    align 8, db 0
LC8:
    db `dynamic initializer of an int\n`, 0
    align 8, db 0
LC9:
    db `global third, defined after main`, 0
    section .text
    align 16
_GLOBAL__sub_I_first:
    sub rsp, 8
    mov esi, LC6
    mov edi, LC3
    xor eax, eax
    mov qword [rel first], LC6
    call printf
    mov edx, __dso_handle
    mov esi, first
    mov edi, _ZN6TracerD1Ev
    call __cxa_atexit
    mov esi, LC7
    mov edi, LC3
    xor eax, eax
    mov qword [rel second], LC7
    call printf
    mov edx, __dso_handle
    mov esi, second
    mov edi, _ZN6TracerD1Ev
    call __cxa_atexit
    mov edi, LC8
    xor eax, eax
    call printf
    mov esi, LC9
    mov edi, LC3
    mov qword [rel third], LC9
    mov dword [rel _ZL17initialized_value], eax
    xor eax, eax
    call printf
    mov edx, __dso_handle
    mov esi, third
    mov edi, _ZN6TracerD1Ev
    add rsp, 8
    jmp __cxa_atexit
    section .init_array
    align 8, db 0
    dq _GLOBAL__sub_I_first
    global third
    section .bss align=8
    alignb 8
third:
    resb 8
    alignb 8
_ZGVZL5localvE1t: resb 8
    alignb 8
_ZZL5localvE1t: resb 8
    alignb 4
_ZL17initialized_value: resb 4
    global second
    alignb 8
second:
    resb 8
    global first
    alignb 8
first:
    resb 8
    section .text
