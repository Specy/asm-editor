; hand-built
; ELF64 x86-64 executable at fixed addresses (not PIE)
; Statically linked: no dynamic linker, no shared libraries
; Not stripped: names come from its symbol table, with invented words (v1) for the rest
; Entry point: 0x400080 (_start)
; Generated from the file, read-only and never saved: nothing builds from this Listing.

section .text

_start:
    call FUN_ardent_sable
    jmp .LAB_1
table:
    db 0x41, 0x42, 0x43, 0x44, 0x00, 0x00, 0x00, 0x00
.LAB_1:
    db 0x06
.LAB_2:
    xor eax, eax
    je _start+0x15
    mov eax, 0x01
    jne .LAB_2
    ret
    db 0x48, 0x69, 0x21, 0x00

g:
    push rbp
    pop rbp
    ret

FUN_ardent_sable:
    xor eax, eax
    ret
