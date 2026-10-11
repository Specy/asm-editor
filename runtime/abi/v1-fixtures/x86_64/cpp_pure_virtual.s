    default rel
    extern puts
    extern stdout
    extern fflush
    extern __cxa_pure_virtual:weak
    ; compiler-symbol LC0 .LC0
    section .text
    section .rodata align=8
    align 8, db 0
LC0:
    db `Shape constructor calls describe()`, 0
    section .text
    align 16
    global main
main:
    sub rsp, 8
    mov edi, LC0
    call puts
    mov rdi, qword [rel stdout]
    call fflush
    call __cxa_pure_virtual
    section .text
