; Excerpt of the Listing of hello-atexit-static, whose whole text has SHA-256 5743025537b902f8c403432094bea8eb8c3109b4098cb3edf1e36829579ba57f
; hello-atexit-static
; ELF64 x86-64 executable at fixed addresses (not PIE)
; Statically linked: no dynamic linker, no shared libraries
; Not stripped: names come from its symbol table
; Entry point: 0x401780 (_start)
section .init
section .plt
section .text
section .fini
section .note.gnu.build_id
section .rela.plt
section .rodata
section .stapsdt.base
section rodata.cst32
section .eh_frame
section .gcc_except_table
section .note.gnu.property
section .note.ABI_tag
section .tdata
section .init_array
section .fini_array
section .data.rel.ro
section .got
section .got.plt
section .data
section .bss
_start:
    endbr64
    xor ebp, ebp
    mov r9, rdx
    pop rsi
    mov rdx, rsp
    and rsp, 0xfffffffffffffff0
    push rax
    push rsp
    xor r8d, r8d
    xor ecx, ecx
    mov rdi, 0x4018bf                   ; main
    call __libc_start_main
    hlt
    nop word cs:[rax+rax*1]
main:
    endbr64
    push rbp
    mov rbp, rsp
    sub rsp, 0x10
    mov [rbp-0x04], edi
    mov [rbp-0x10], rsi
    lea rax, [rel farewell]
    mov rdi, rax
    call atexit
    mov rax, [rbp-0x10]
    mov rax, [rax]
    mov edx, [rbp-0x04]
    lea rcx, [rel s_hello_s_argc_d]     ; "hello %s argc=%d\n"
    mov rsi, rax
    mov rdi, rcx
    mov eax, 0x00
    call printf
    mov eax, 0x03
    leave
    ret
    nop word cs:[rax+rax*1]
    nop word cs:[rax+rax*1]
    nop dword [rax]
farewell:
    endbr64
    push rbp
    mov rbp, rsp
    lea rax, [rel s_atexit_handler]     ; "atexit handler"
    mov rdi, rax
    call puts
    nop
    pop rbp
    ret
s_atexit_handler: db "atexit handler", 0
s_hello_s_argc_d: db "hello %s argc=%d", 10, 0
