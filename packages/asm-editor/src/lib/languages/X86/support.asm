; What GCC's output may call without the program asking, until x86 has a Runtime library: memcpy,
; memmove, memset and memcmp, which GCC expects of every environment, and the C++ ABI's hooks for
; static destructors, pure and deleted virtual calls and virtual destructors. The linker takes it
; for a program that uses any of them, and with start.asm, which calls __aed_run_destructors. They
; are weak, so a definition in the program wins over them.

    default rel

    global memcpy:weak
    global memmove:weak
    global memset:weak
    global memcmp:weak
    global __cxa_atexit:weak
    global __dso_handle:weak
    global __cxa_pure_virtual:weak
    global __cxa_deleted_virtual:weak
    global _ZdlPv:weak                  ; operator delete(void *)
    global _ZdlPvm:weak                 ; operator delete(void *, unsigned long)
    global _ZdlPvSt11align_val_t:weak   ; operator delete(void *, std::align_val_t)
    global _ZdlPvmSt11align_val_t:weak  ; operator delete(void *, unsigned long, std::align_val_t)
    global __aed_run_destructors

DESTRUCTOR_LIMIT equ 64                 ; static objects whose destructor runs at exit; later ones' don't
EXIT_GROUP equ 231
WRITE equ 1

    section .text

; void *memcpy(void *destination, const void *source, size_t size)
memcpy:
    mov rax, rdi
    mov rcx, rdx
    rep movsb
    ret

; void *memmove(void *destination, const void *source, size_t size)
memmove:
    mov rax, rdi
    mov rcx, rdx
    cmp rdi, rsi
    jbe .upwards                        ; the destination starts at or before the source
    lea rsi, [rsi + rcx - 1]            ; otherwise copy downwards, from the last byte
    lea rdi, [rdi + rcx - 1]
    std
    rep movsb
    cld
    ret
.upwards:
    rep movsb
    ret

; void *memset(void *destination, int value, size_t size)
memset:
    mov r8, rdi
    mov eax, esi
    mov rcx, rdx
    rep stosb
    mov rax, r8
    ret

; int memcmp(const void *a, const void *b, size_t size)
memcmp:
    xor eax, eax                        ; also sets ZF, so a size of 0 compares equal
    mov rcx, rdx
    repe cmpsb
    je .done
    movzx eax, byte [rdi - 1]           ; the first bytes that differ
    movzx ecx, byte [rsi - 1]
    sub eax, ecx
.done:
    ret

; int __cxa_atexit(void (*destructor)(void *), void *object, void *dso)
; GCC registers a static object's destructor here once its constructor has run.
__cxa_atexit:
    mov rax, [destructor_count]
    cmp rax, DESTRUCTOR_LIMIT
    jae .full
    shl rax, 4
    lea rcx, [destructors]
    mov [rcx + rax], rdi
    mov [rcx + rax + 8], rsi
    inc qword [destructor_count]
    xor eax, eax
    ret
.full:
    mov eax, -1                         ; the destructor will not run
    ret

; void __aed_run_destructors(void)
; Runs the registered destructors, the newest first, the reverse of construction.
__aed_run_destructors:
    push rbx                            ; callee-saved, and keeps the calls below aligned
.next:
    mov rbx, [destructor_count]
    test rbx, rbx
    jz .done
    dec rbx
    mov [destructor_count], rbx
    shl rbx, 4
    lea rax, [destructors]
    mov rdi, [rax + rbx + 8]            ; the object
    call [rax + rbx]                    ; its destructor
    jmp .next
.done:
    pop rbx
    ret

; A call through a vtable entry left pure virtual, which only a constructor or destructor can make,
; or through the entry of a deleted virtual function. Either ends the program as abort does: status
; 134 is how a shell reports a SIGABRT death.
__cxa_pure_virtual:
    lea rsi, [pure_virtual_message]
    mov edx, pure_virtual_length
    jmp abort_with_message
__cxa_deleted_virtual:
    lea rsi, [deleted_virtual_message]
    mov edx, deleted_virtual_length
abort_with_message:
    mov eax, WRITE
    mov edi, 2                          ; standard error
    syscall
    mov edi, 134
    mov eax, EXIT_GROUP
    syscall

; operator delete, plain, sized and aligned. Nothing here allocates, so there is nothing to give
; back; a class with a virtual destructor refers to one even when nothing is ever deleted.
_ZdlPv:
_ZdlPvm:
_ZdlPvSt11align_val_t:
_ZdlPvmSt11align_val_t:
    ret

    section .rodata
pure_virtual_message:
    db 'pure virtual method called', 10
pure_virtual_length equ $ - pure_virtual_message
deleted_virtual_message:
    db 'deleted virtual method called', 10
deleted_virtual_length equ $ - deleted_virtual_message

    section .data
    align 8
__dso_handle:
    dq 0                                ; GCC passes its address to __cxa_atexit; nothing reads it

    section .bss
    alignb 8
destructor_count:
    resq 1
destructors:
    resq 2 * DESTRUCTOR_LIMIT           ; destructor and object, in registration order
