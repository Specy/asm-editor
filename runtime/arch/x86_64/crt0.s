; Runtime ABI v1 startup. Preserve the loader's arguments across constructors.
default rel
global _start
extern main
extern exit
extern __init_array_start
extern __init_array_end

section .text
_start:
    mov r13, [rsp]
    lea r14, [rsp + 8]
    lea r15, [r14 + r13 * 8 + 8]
    and rsp, -16
    lea rbx, [__init_array_start]
    lea r12, [__init_array_end]
.constructors:
    cmp rbx, r12
    jae .main
    call [rbx]
    add rbx, 8
    jmp .constructors
.main:
    mov rdi, r13
    mov rsi, r14
    mov rdx, r15
    call main
    mov edi, eax
    call exit
    hlt
