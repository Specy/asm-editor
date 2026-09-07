import type { ProjectTemplate } from '$lib/content/templates'

/**
 * The x86 templates, written here rather than read from a Course, because x86 has no Course:
 * `docs/courses/plan.md` defers it until its syntax is settled. These are provisional and expected
 * to be replaced by Examples once that decision lands, so they are deliberately few and short.
 *
 * NASM syntax, which is what `@specy/x86` assembles by default, and Linux syscalls, because the
 * Core is blink running a userland rather than a bare machine. That is why the ladder is shorter
 * than the other languages':
 *
 * - no input template. MARS and RARS have a service that reads an integer and Linux does not, so
 *   the program would be a hand written atoi. Worse, blink runs a shell around the program, and
 *   that shell reads standard input once the program exits, so a reader who types a line for their
 *   own program is then answering a prompt they never asked for. Input needs a decision about the
 *   userland before it can be a first program.
 * - no screen template. The screen is memory mapped in the other languages and x86's place in it
 *   is not settled.
 *
 * `templates.test.ts` assembles and runs every one of these, so they are held to the bar the Course
 * Examples are held to by `content/content.test.ts`.
 */
export const X86_TEMPLATES: ProjectTemplate[] = [
    {
        id: 'moving-values',
        name: 'Moving values around',
        description:
            'The three places a value can come from: an immediate, another register, and memory.',
        language: 'X86',
        order: 1,
        code: `global _start

section .data
value:  dq 7                ; a 64 bit variable in memory

section .text
_start:
    mov rax, 10             ; an immediate into a register
    mov rbx, rax            ; a register into another register
    add rbx, 5              ; rbx is now 15

    mov rcx, [value]        ; memory into a register
    imul rcx, rbx           ; rcx is now 105
    mov [value], rcx        ; and the answer back into memory

    mov rax, 60             ; syscall 60: exit
    xor rdi, rdi            ; with status 0
    syscall`
    },
    {
        id: 'counting-loop',
        name: 'Fill an array with the numbers from 1 to 10',
        description:
            'A counter, a comparison and a jump: the shape every loop in assembly is built from.',
        language: 'X86',
        order: 2,
        code: `global _start

section .bss
numbers: resq 10            ; ten 64 bit slots, not yet written

section .text
_start:
    xor rcx, rcx            ; the index, counting 0 to 9
fill:
    mov rax, rcx
    inc rax                 ; the value to store, 1 to 10
    mov [numbers + rcx * 8], rax
    inc rcx
    cmp rcx, 10
    jl fill                 ; keep going while the index is below 10

    mov rax, 60             ; syscall 60: exit
    xor rdi, rdi
    syscall`
    },
    {
        id: 'subroutine-with-register-arguments',
        name: 'A subroutine with its arguments in registers',
        description:
            'call and ret, with the System V convention: arguments in rdi and rsi, the answer in rax.',
        language: 'X86',
        order: 3,
        code: `global _start

section .text
; sum(a, b) -> a + b
; The System V convention puts the first two arguments in rdi and rsi
; and expects the return value in rax.
sum:
    mov rax, rdi
    add rax, rsi
    ret                     ; jumps back to the line after the call

_start:
    mov rdi, 20             ; the first argument
    mov rsi, 22             ; the second
    call sum                ; rax comes back as 42

    mov rax, 60             ; syscall 60: exit
    xor rdi, rdi
    syscall`
    },
    {
        id: 'hello-world',
        name: 'Print a string',
        description:
            'The write syscall: a file descriptor, an address and a length, handed to the kernel.',
        language: 'X86',
        order: 4,
        code: `global _start

section .data
greeting:   db "Hello, world!", 10      ; 10 is the newline
GREETING_LEN equ $ - greeting           ; the assembler counts the bytes

section .text
_start:
    mov rax, 1              ; syscall 1: write
    mov rdi, 1              ; to file descriptor 1, standard output
    mov rsi, greeting       ; the bytes to write
    mov rdx, GREETING_LEN   ; how many of them
    syscall

    mov rax, 60             ; syscall 60: exit
    xor rdi, rdi
    syscall`
    }
]
