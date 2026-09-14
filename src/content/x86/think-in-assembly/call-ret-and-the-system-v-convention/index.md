The stack lecture said that `call` pushes an address and `ret` pops it. This lecture is the rest of
what a function call is: where the arguments go, where the answer comes back, which registers a
subroutine is allowed to destroy, and what a stack frame is.

## call and ret

In C you call a function and it returns to where it was called from. In x86 the call is `call` and
the return is `ret`, and the address to return to lives on the stack.

- **`call label`** pushes the address of the instruction after it, then jumps to `label`.
- **`ret`** pops an address off the stack into `rip`.

Nothing checks that what `ret` pops is a return address. A subroutine that pushes something and
forgets to pop it returns to whatever it pushed, which is the single most common way a program in
assembly goes wrong.

```x86|playground|no-flags
default rel
global _start

section .text
; sum(a, b) -> a + b
sum:
    mov rax, rdi            ; the first argument
    add rax, rsi            ; plus the second
    ret                     ; back to the line after the call

_start:
    mov rdi, 20             ; a
    mov rsi, 22             ; b
    call sum                ; rax comes back as 42
    mov r12, rax

    mov rax, 60
    xor rdi, rdi
    syscall
```

Step through it and watch `rsp` and `rip` together. The `call` drops `rsp` by 8 and puts `0x401010`
or thereabouts on the stack; the `ret` takes it back off and `rip` lands on `mov r12, rax`.

The subroutine is written **above** `_start` here. Order in the file does not matter to the
assembler, and it matters to the program only in that a subroutine written below `_start` would be
run into by anything that reached the end of `_start` without an `exit`.

## The System V convention

`rdi` and `rsi` in that program are not the hardware's choice. They are the **System V AMD64 ABI**,
the agreement every Linux compiler, library and program follows so that code from different sources
can call each other.

| what                            | where                                  |
| ------------------------------- | -------------------------------------- |
| integer arguments 1 to 6        | `rdi`, `rsi`, `rdx`, `rcx`, `r8`, `r9` |
| floating point arguments 1 to 8 | `xmm0` to `xmm7`                       |
| further arguments               | on the stack, pushed in reverse order  |
| the return value                | `rax`, or `rdx:rax` for 128 bits       |
| a floating point return         | `xmm0`                                 |

And the registers split in two, by who is responsible for a value surviving a call:

| kind         | registers                                        | means                                                              |
| ------------ | ------------------------------------------------ | ------------------------------------------------------------------ |
| callee saved | `rbx`, `rbp`, `r12`, `r13`, `r14`, `r15`, `rsp`  | a subroutine that writes one must put it back                      |
| caller saved | `rax`, `rcx`, `rdx`, `rsi`, `rdi`, `r8` to `r11` | a subroutine may destroy them, so save them first if you need them |

Read the second table as advice about your own code. If a value has to survive a `call`, keep it in
`rbx` or `r12` to `r15` and let the subroutine worry about it; if it is scratch, use `rax` or `rcx`
and expect it to be gone afterwards.

The Windows convention is different, using `rcx`, `rdx`, `r8` and `r9` for arguments. Same processor,
different agreement, which is why an object file from one system does not link against the other.

## A subroutine that saves what it uses

```x86|playground|no-flags
default rel
global _start

section .text
; scale(x) -> x * 3, using rbx as scratch
scale:
    push rbx                ; rbx is callee saved, so it is borrowed, not taken
    mov rbx, 3
    mov rax, rdi
    imul rax, rbx
    pop rbx                 ; and given back
    ret

_start:
    mov rbx, 999            ; something the caller cares about
    mov rdi, 14
    call scale              ; rax = 42
    mov r12, rax
    mov r13, rbx            ; still 999

    mov rax, 60
    xor rdi, rdi
    syscall
```

`r12` comes out at 42 and `r13` at 999. Delete the `push rbx` and the `pop rbx` and `r13` becomes 3:
the subroutine still returns the right answer and has quietly destroyed something that was not its
to destroy.

## Arguments that do not fit in registers

The seventh argument onwards goes on the stack, pushed in **reverse** order so that the seventh ends
up nearest the top. The caller puts them there and the caller takes them off again.

```x86|playground|no-flags
default rel
global _start

section .text
; seventh(a, b, c, d, e, f, g) -> a + g
seventh:
    push rbp
    mov rbp, rsp            ; rbp now points at the saved rbp
    mov rax, [rbp + 16]     ; the seventh argument
    add rax, rdi            ; plus the first
    leave
    ret

_start:
    mov rdi, 1
    mov rsi, 2
    mov rdx, 3
    mov rcx, 4
    mov r8, 5
    mov r9, 6
    push 7                  ; the seventh argument
    call seventh
    add rsp, 8              ; the caller takes it off again
    mov r12, rax

    mov rax, 60
    xor rdi, rdi
    syscall
```

`r12` is 8, which is 1 + 7.

Why `[rbp + 16]`? Count what is between `rbp` and the argument. Inside the subroutine, after
`push rbp`, the stack reads:

| where        | holds                                      |
| ------------ | ------------------------------------------ |
| `[rbp]`      | the caller's `rbp`, just pushed            |
| `[rbp + 8]`  | the return address, pushed by `call`       |
| `[rbp + 16]` | the seventh argument, pushed by the caller |

Eight bytes for the saved `rbp`, eight for the return address, and the argument is next.

## The stack frame

`rbp` in that subroutine is the **frame pointer**: a register that stays still while `rsp` moves, so
that everything the subroutine owns can be named as a fixed offset from it. The three lines that set
it up and the two that take it down are the same in every function a C compiler writes:

```
    push rbp                ; save the caller's frame pointer
    mov rbp, rsp            ; this frame starts here
    sub rsp, 32             ; room for local variables
    ...
    mov rsp, rbp            ; throw the locals away
    pop rbp                 ; and restore the caller's frame pointer
    ret
```

`leave` is one instruction for the last two lines, `mov rsp, rbp` and `pop rbp`. `enter` exists for
the first two and nobody uses it, because it is slower than writing them out.

Locals live **below** `rbp` and arguments **above** it:

| where        | holds                       |
| ------------ | --------------------------- |
| `[rbp + 16]` | the seventh argument and up |
| `[rbp + 8]`  | the return address          |
| `[rbp]`      | the caller's saved `rbp`    |
| `[rbp - 8]`  | the first local variable    |
| `[rbp - 16]` | the second                  |

None of this is required by the hardware. A function that never moves `rsp` can reach its locals from
`rsp` directly and keep `rbp` as one more general register, which is what a compiler does with
optimisation turned on. The frame pointer earns its place when a debugger has to walk the call stack,
because the chain of saved `rbp` values is the list of who called whom.

## Recursion

A subroutine that calls itself needs nothing special. Every call pushes its own return address, and
anything else the subroutine wants to survive its own call goes on the stack too.

```x86|playground|no-flags
default rel
global _start

section .text
; fact(n) -> n!
fact:
    cmp rdi, 1
    jg .recurse
    mov rax, 1              ; fact(1) is 1, and the recursion stops here
    ret
.recurse:
    push rdi                ; n has to survive the call, and rdi is caller saved
    dec rdi
    call fact               ; rax = fact(n - 1)
    pop rdi                 ; n again
    imul rax, rdi           ; n * fact(n - 1)
    ret

_start:
    mov rdi, 5
    call fact               ; 120
    mov r12, rax

    mov rax, 60
    xor rdi, rdi
    syscall
```

`r12` comes out at `78`, which is 120.

`push rdi` is there because `rdi` is caller saved: `fact` is free to destroy it, and `fact` is what
is being called. Deleting the push and the pop gives 1, since `rdi` comes back as 0 from the bottom
of the recursion and every multiplication is by zero except the last.

Each level of the recursion uses 16 bytes of stack, 8 for the return address and 8 for the saved
`rdi`. Call it with `rdi` at a million and the stack runs into memory that is not mapped, the program
stops, and that is what a stack overflow is.

## Your turn

Write `maximum(a, b)` in the System V convention: the two arguments arrive in `rdi` and `rsi`, and
the larger of the two, read as signed, comes back in `rax`. The test calls it with -5 and 3.

```x86|playground|exercise
default rel
global _start

section .text
maximum:
    ; your code here
    ret

_start:
    mov rdi, -5
    mov rsi, 3
    call maximum
    mov r12, rax

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": { "r12": 3 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
maximum:
    mov rax, rdi            ; assume the first
    cmp rsi, rax
    jle .done               ; and it is, unless the second is bigger
    mov rax, rsi
.done:
    ret

_start:
    mov rdi, -5
    mov rsi, 3
    call maximum
    mov r12, rax

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>

The second one is recursive. Write `fib(n)` returning the nth Fibonacci number, with `fib(0) = 0` and
`fib(1) = 1`. The test calls it with 10, so the answer is 55. `rbx` is callee saved, which makes it
the right place to keep the first half of the answer across the second call.

```x86|playground|exercise
default rel
global _start

section .text
fib:
    ; your code here
    ret

_start:
    mov rdi, 10
    call fib
    mov r12, rax

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": { "r12": 55 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
fib:
    cmp rdi, 2
    jge .recurse
    mov rax, rdi            ; fib(0) is 0 and fib(1) is 1
    ret
.recurse:
    push rbx                ; borrowed, so it is saved
    push rdi
    dec rdi
    call fib                ; fib(n - 1)
    mov rbx, rax            ; kept across the next call
    pop rdi
    sub rdi, 2
    call fib                ; fib(n - 2)
    add rax, rbx
    pop rbx
    ret

_start:
    mov rdi, 10
    call fib
    mov r12, rax

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
