A subroutine with seven arguments. Six of them arrive in registers, and the seventh has nowhere to go
but the stack, which is what makes this program show a whole stack frame: a saved frame pointer, room
for locals, a saved register and an argument reached from above.

**You need to know:** the "The stack, push and pop" lecture and the "call, ret and the System V
convention" lecture. What is new here is `rbp` as a frame pointer and the offsets that reach either
side of it.

```x86|playground|memory|allow-open
default rel
global _start

section .text
; sum7(a, b, c, d, e, f, g) -> the total
; Six arguments arrive in registers and the seventh on the stack.
sum7:
    push rbp                ; the caller's frame pointer
    mov rbp, rsp            ; this frame starts here
    sub rsp, 16             ; room for two local qwords
    push rbx                ; callee saved, and this subroutine borrows it

    mov rbx, rdi            ; the total so far
    add rbx, rsi
    add rbx, rdx
    add rbx, rcx
    add rbx, r8
    add rbx, r9
    mov [rbp - 8], rbx      ; a local variable holding it
    add rbx, [rbp + 16]     ; plus the seventh argument
    mov rax, rbx

    pop rbx                 ; given back
    leave                   ; mov rsp, rbp, then pop rbp
    ret

_start:
    mov rdi, 1
    mov rsi, 2
    mov rdx, 3
    mov rcx, 4
    mov r8, 5
    mov r9, 6
    push 7                  ; the seventh argument, pushed by the caller
    call sum7
    add rsp, 8              ; and taken off again by the caller
    mov r12, rax

    mov rax, 60
    xor rdi, rdi
    syscall
```

`r12` comes out at `1C`, which is 28.

`[rbp + 16]` is the seventh argument. Count what is between: `[rbp]` holds the caller's `rbp`, just
pushed; `[rbp + 8]` holds the return address, pushed by `call`; and the argument the caller pushed is
the next thing up. Locals go the other way, below `rbp`, which is why the first one is `[rbp - 8]`.

`leave` is one instruction for `mov rsp, rbp` and `pop rbp`, and it undoes the `sub rsp, 16` without
having to remember the 16. The `push rbx` after the `sub` is popped by hand before it, because
`leave` would throw it away along with the locals.

`add rsp, 8` after the `call` is the caller taking its own argument off. System V puts that job on
the caller, which is what makes a function with a variable number of arguments possible: `printf`
cannot know how many were pushed, and it does not have to.

Set a breakpoint on the `mov rax, rbx` line and look at the **Stack** tab of the memory panel. The
seventh argument, the return address and the saved `rbp` are three qwords in a row, and the two
locals and the saved `rbx` are under them.

Try deleting the `push rbx` and the `pop rbx`. The answer is still 28, and `rbx` in the caller is
gone, which is the bug that shows up much later in a bigger program.
