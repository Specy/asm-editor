.intel_syntax noprefix
.global main

.section .text
main:
    mov eax, 1
    mov edi, 1
    lea rsi, [rip + prompt]
    mov edx, prompt_end - prompt
    syscall

    xor eax, eax
    xor edi, edi
    lea rsi, [rip + answer]
    mov edx, 16
    syscall

    cmp BYTE PTR [rip + answer], 65
    je accepted
    lea rsi, [rip + retry_message]
    mov edx, retry_end - retry_message
    jmp print_result
accepted:
    lea rsi, [rip + accepted_message]
    mov edx, accepted_end - accepted_message
print_result:
    mov eax, 1
    mov edi, 1
    syscall
    mov eax, 60
    xor edi, edi
    syscall

.section .rodata
prompt: .ascii "Type a letter: "
prompt_end:
retry_message: .ascii "Try again\n"
retry_end:
accepted_message: .ascii "Accepted\n"
accepted_end:

.section .bss
answer: .skip 16

.section .note.GNU-stack,"",@progbits
