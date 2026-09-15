Six registers carry six arguments, so a subroutine with seven has a problem. The seventh goes on the
stack, and once anything is on the stack the subroutine needs a way to find it again while `rsp` moves
around underneath.

That is what makes this program worth reading: it builds a complete stack frame, and you can watch the
whole of it at once in the Stack tab of the memory panel.

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

Set a breakpoint on the `mov rax, rbx` line and open the **Stack** tab. Six qwords are laid out there,
and every one of them was put there by an instruction you can point at:

|              | holds                  | put there by  |
| ------------ | ---------------------- | ------------- |
| `[rbp + 16]` | 7, the last argument   | `push 7`      |
| `[rbp + 8]`  | the return address     | `call sum7`   |
| `[rbp]`      | the caller's `rbp`     | `push rbp`    |
| `[rbp - 8]`  | the running total      | `sub rsp, 16` |
| `[rbp - 16]` | a second local, unused | `sub rsp, 16` |
| `[rbp - 24]` | the saved `rbx`        | `push rbx`    |

`rbp` sits in the middle of that, which is the point of it. `rsp` is down at the bottom and moves
every time anything is pushed; `rbp` has not moved since the second instruction of the subroutine, so
`[rbp - 8]` names the same slot from the first line of the body to the last.

The order of the teardown is worth noticing. `pop rbx` comes **before** `leave`, not after, because
`leave` sets `rsp` back to `rbp` in one go and would sail straight past the saved `rbx` without
restoring it. Anything pushed after the frame is set up has to be popped before the frame comes down.

`add rsp, 8` after the `call` is the caller taking its own argument off again. The convention puts
that job on the caller rather than the callee, and the reason is subroutines that take a variable
number of arguments: the callee often cannot know how many were pushed, and this way it does not have
to.

Delete the `push rbx` and the `pop rbx` and the answer is still 28. `rbx` in the caller is destroyed,
though, and nothing in this program notices, which is exactly how that bug behaves in a large one.
