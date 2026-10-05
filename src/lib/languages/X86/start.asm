; The start code of an x86 program compiled from C or C++, until x86 has a Runtime library. The
; linker takes it for a program that has no `_start` of its own. It runs the program's
; constructors, calls main(0, NULL), runs the destructors of its static objects and exits with
; main's result.

    default rel

    global _start

    extern main
    extern __init_array_start           ; ld defines both, around .init_array
    extern __init_array_end
    extern __aed_run_destructors        ; support.asm

EXIT_GROUP equ 231

    section .text

_start:
    and rsp, -16                        ; every call below enters its callee 16-byte aligned
    lea rbx, [__init_array_start]       ; rbx and r12 are callee-saved: they survive the calls
    lea r12, [__init_array_end]
.constructors:
    cmp rbx, r12
    jae .call_main
    call [rbx]                          ; one constructor, in .init_array order
    add rbx, 8
    jmp .constructors
.call_main:
    xor edi, edi                        ; argc = 0
    xor esi, esi                        ; argv = NULL
    call main
    mov r12d, eax                       ; main's result is the exit status
    call __aed_run_destructors          ; the static objects', newest first
    mov edi, r12d
    mov eax, EXIT_GROUP
    syscall
