# Stack arguments and a stack frame

The first six integer arguments travel in registers. For a seventh, the caller uses the stack. This
example adds seven numbers and uses `rbp` to keep the stack argument and a local variable easy to
find while `rsp` changes.

```x86|playground|memory|allow-open
default rel
global _start

section .text
; sum7(a, b, c, d, e, f, g) -> the total
sum7:
    push rbp                ; save the caller's frame pointer
    mov rbp, rsp            ; fixed base for this frame
    sub rsp, 16             ; reserve two local qwords
    push rbx                ; save the caller's rbx before using it

    mov rbx, rdi            ; total of the first six arguments
    add rbx, rsi
    add rbx, rdx
    add rbx, rcx
    add rbx, r8
    add rbx, r9
    mov [rbp - 8], rbx      ; write that total to the first local
    add rbx, [rbp + 16]     ; add the seventh argument
    mov rax, rbx            ; return the answer

    pop rbx                 ; restore the caller's rbx
    leave                   ; mov rsp, rbp, then pop rbp
    ret

_start:
    mov rdi, 1
    mov rsi, 2
    mov rdx, 3
    mov rcx, 4
    mov r8, 5
    mov r9, 6
    sub rsp, 8              ; padding: _start began with rsp aligned to 16
    push 7                  ; seventh argument; rsp is aligned again
    call sum7
    add rsp, 16             ; remove the argument and padding
    mov r12, rax            ; keep the answer, 28, visible in the register view

    mov rax, 60
    xor rdi, rdi
    syscall
```

The playground starts `_start` with `rsp` divisible by 16. `sub rsp, 8` and `push 7` each move it
by eight bytes, so it is divisible by 16 immediately before `call`, as the System V convention
requires. The padding is _below_ the argument as the caller builds the stack, so it ends up above
the argument in the frame.

Set a breakpoint at `mov rax, rbx`, then inspect `rbp`, `rsp`, and nearby memory in the **Stack**
tab. Use the offsets in this table to find the slots; the view may not give reserved slots names.
At this point `rsp = rbp - 24` and `rbx` holds 28.

| Location     | Meaning                         | How it got there                          |
| ------------ | ------------------------------- | ----------------------------------------- |
| `[rbp + 24]` | alignment padding; value unused | `sub rsp, 8` reserved it                  |
| `[rbp + 16]` | 7, the seventh argument         | `push 7` wrote it                         |
| `[rbp + 8]`  | return address                  | `call sum7` wrote it                      |
| `[rbp]`      | caller's `rbp`                  | `push rbp` wrote it                       |
| `[rbp - 8]`  | 21, total of the first six      | `sub rsp, 16` reserved it; `mov` wrote it |
| `[rbp - 16]` | second local; value unused      | `sub rsp, 16` reserved it                 |
| `[rbp - 24]` | saved caller's `rbx`            | `push rbx` wrote it                       |

Reserving a slot only moves `rsp`; it does not put a useful value there. Neither the padding nor
the second local is read, so do not rely on whatever bytes the debugger displays for them. The
first local becomes 21 only when `mov [rbp - 8], rbx` runs.

`rbp` stays fixed while `rsp` changes. That makes `[rbp + 16]` the seventh argument and
`[rbp - 8]` the first local throughout this call. To finish, `pop rbx` must run before `leave`:
`leave` sets `rsp` back to `rbp`, past the saved `rbx`. Then `ret` reads the return address.
The caller's `add rsp, 16` releases both the argument and its padding. Step past `mov r12, rax`
to see 28 in `r12`; the exit setup then reuses `rax`.

## Your turn

Complete a call to `sum7(3, 4, 5, 6, 7, 8, 9)`. The first six arguments are set up for you.
In the caller, reserve padding, push the seventh argument, and remove both after the call. In
`sum7`, build a frame, reserve 16 bytes, save `rbx`, add the first six arguments in `rbx`, store
that subtotal at `[rbp - 8]`, then add the seventh from `[rbp + 16]`. Return the total in `rax`
and restore both `rbx` and the frame.

Before running, predict the subtotal and final answer. Press **Test** to check that `r12` has
the answer, `r13` has the caller's original `rbx`, and `r14` and `r15` are zero. The caller
records `rsp % 16` in `r14` immediately before `call`, so zero checks the call's alignment.
It subtracts the final `rsp` from the original one in `r15`, so zero also checks cleanup.

```x86|playground|memory|exercise
default rel
global _start

section .text
sum7:
    ; Build a frame, reserve two qwords, and save rbx.

    ; Add the first six arguments in rbx and store the subtotal locally.
    ; Add the seventh argument and put the answer in rax.

    ; Restore rbx and the frame before returning.
    ret

_start:
    mov rbx, 1234           ; recognizable value the caller wants preserved
    mov r15, rsp            ; remember the original stack pointer
    mov rdi, 3
    mov rsi, 4
    mov rdx, 5
    mov rcx, 6
    mov r8, 7
    mov r9, 8
    ; Add padding and push the seventh argument, 9.

    mov r14, rsp
    and r14, 15             ; record rsp % 16 immediately before call
    call sum7
    ; Remove the seventh argument and padding.
    sub r15, rsp            ; zero only if the caller restored rsp

    mov r12, rax            ; answer
    mov r13, rbx            ; caller's rbx after the call
    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": {
        "r12": 42,
        "r13": 1234,
        "r14": 0,
        "r15": 0
    }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|memory|solution
default rel
global _start

section .text
sum7:
    push rbp
    mov rbp, rsp
    sub rsp, 16
    push rbx

    mov rbx, rdi
    add rbx, rsi
    add rbx, rdx
    add rbx, rcx
    add rbx, r8
    add rbx, r9
    mov [rbp - 8], rbx      ; 33
    add rbx, [rbp + 16]     ; 33 + 9 = 42
    mov rax, rbx

    pop rbx
    leave
    ret

_start:
    mov rbx, 1234
    mov r15, rsp
    mov rdi, 3
    mov rsi, 4
    mov rdx, 5
    mov rcx, 6
    mov r8, 7
    mov r9, 8
    sub rsp, 8
    push 9
    mov r14, rsp
    and r14, 15
    call sum7
    add rsp, 16
    sub r15, rsp

    mov r12, rax
    mov r13, rbx
    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
