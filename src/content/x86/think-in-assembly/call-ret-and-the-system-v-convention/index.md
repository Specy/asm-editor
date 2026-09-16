# call, ret and the System V convention

A **subroutine** is a piece of code that can be called from several places and then return to the
place that called it. It is also called a function, procedure, or routine.

Returning is the interesting part. The same subroutine may have many callers, so it needs the
return address for this particular call. x86 keeps that address on the stack.

## What `call` and `ret` do

- **`call label`** pushes the address of the instruction immediately after the `call`, then puts
  the address named by `label` in `rip`.
- **`ret`** pops a qword into `rip`, so execution resumes at that address.

This program calls `sum` and continues at `mov r12, rax` when `sum` returns:

```x86|playground|no-flags
default rel
global _start

section .text
; sum(a, b) -> a + b
sum:
    mov rax, rdi
    add rax, rsi
    ret

_start:
    mov rdi, 20
    mov rsi, 22
    call sum
    mov r12, rax            ; execution resumes here; r12 = 42

    mov rax, 60
    xor rdi, rdi
    syscall
```

Trace the stack with a symbolic starting value. Immediately before `call sum`, let `rsp = S`.

| moment | `rsp` | stack and `rip` effect |
| ------ | ----- | ---------------------- |
| before `call` | `S` | the next instruction is `mov r12, rax` |
| on entry to `sum` | `S - 8` | `[S - 8]` holds the address of `mov r12, rax`; `rip` points at `sum` |
| after `ret` | `S` | `rip` holds the address loaded from `[S - 8]` |

There is no tag saying that the qword at `[S - 8]` is a return address. `ret` simply loads the
qword at `[rsp]` into `rip` and adds 8 to `rsp`. If `sum` pushed a value and failed to pop it, its
`ret` would read that value instead of the return address and try to execute code at the wrong
address. A function must undo its stack allocations and pushes in the right order so that `rsp`
points at its return address when it executes `ret`.

## Integer and pointer values in System V

The hardware defines `call` and `ret`, but it does not assign registers to parameters or return
values. Linux x86-64 code uses the **System V AMD64 ABI**, an application binary interface that
lets separately written functions agree on those details.

This table covers the integer and pointer subset used in this lesson:

| value | location |
| ----- | -------- |
| integer/pointer argument 1 | `rdi` |
| integer/pointer argument 2 | `rsi` |
| integer/pointer argument 3 | `rdx` |
| integer/pointer argument 4 | `rcx` |
| integer/pointer argument 5 | `r8` |
| integer/pointer argument 6 | `r9` |
| further integer/pointer arguments | the stack |
| one integer/pointer return value | `rax` |

The convention also assigns responsibility for preserving general-purpose registers:

| kind | registers | responsibility |
| ---- | --------- | -------------- |
| caller-saved | `rax`, `rcx`, `rdx`, `rsi`, `rdi`, `r8`–`r11` | the caller saves any value it needs after a call |
| callee-saved | `rbx`, `rbp`, `r12`–`r15` | a function that changes one restores the value it inherited |

`rsp` is special stack state. At the point just before `ret`, a function must have restored `rsp`
to its entry value, where the return address is waiting. The `ret` then removes that address and
restores the caller's pre-call `rsp`. Do not use `rsp` as an ordinary register for a long-lived
value.

The save rules apply at every call boundary. If a caller needs its current `rdi` or `rcx` after a
call, the caller must save that value before the call and restore it afterward. If a function uses
`rbx`, `rbp`, or `r12`–`r15`, that function must preserve the value supplied by its own caller.

Here `scale` uses `rbx` as scratch storage, so it saves and restores `rbx` itself:

```x86|playground|no-flags
default rel
global _start

section .text
; scale(x) -> x * 3
scale:
    push rbx                ; save the inherited value
    mov rbx, 3
    mov rax, rdi
    imul rax, rbx
    pop rbx                 ; restore it before ret
    ret

_start:
    mov rbx, 999
    mov rdi, 14
    call scale
    mov r12, rax            ; 42
    mov r13, rbx            ; still 999

    mov rax, 60
    xor rdi, rdi
    syscall
```

Removing the `push rbx` and `pop rbx` would make `scale` return the right result while breaking its
register-preservation promise: the caller would find 3 in `rbx` instead of 999.

## Stack alignment at a call

System V adds one more rule: **immediately before a normal `call`, `rsp` must be divisible by 16**.
The `call` then pushes an eight-byte return address, so on function entry `rsp` is 8 modulo 16.

For example, if the caller has aligned `rsp = S`, the boundary looks like this:

| moment | stack pointer modulo 16 |
| ------ | ----------------------- |
| immediately before `call` | 0 |
| on entry to the callee | 8 |
| after the callee's `ret` | 0 |

The playground starts `_start` with a 16-byte-aligned `rsp`. A direct call from `_start` therefore
meets the rule as long as earlier instructions have not changed `rsp`. Inside a function, pushes
and local allocations must be counted before every nested call. Code that ignores this rule may
seem to work until a called function uses an instruction or stack object that requires alignment.

## A stack frame with a local variable

When a function moves `rsp`, a fixed **frame pointer** makes its stack slots easier to name. By
convention that pointer is `rbp`. This function keeps its argument in a local qword while it calls
another function:

```x86|playground|no-flags
default rel
global _start

section .text
; twice(x) -> 2 * x
twice:
    lea rax, [rdi + rdi]
    ret

; three_times(x) -> 3 * x
three_times:
    push rbp                ; entry was 8 mod 16; rsp is now aligned
    mov rbp, rsp
    sub rsp, 16             ; one local qword plus padding; keep rsp aligned

    mov [rbp - 8], rdi      ; store x in the local qword
    call twice              ; rsp is divisible by 16 here
    mov rdx, [rbp - 8]      ; load x from the same local qword
    add rax, rdx

    leave                   ; mov rsp, rbp; pop rbp
    ret

_start:
    mov rdi, 14
    call three_times
    mov r12, rax            ; 42

    mov rax, 60
    xor rdi, rdi
    syscall
```

On entry to `three_times`, `rsp` is 8 modulo 16. `push rbp` both preserves the caller's frame
pointer and makes `rsp` divisible by 16. Reserving 16 more bytes keeps it divisible by 16 for the
nested `call twice`. Only `[rbp - 8]` is used here; the other eight reserved bytes provide the
space needed to keep the total allocation aligned.

`rbp` stays fixed while `rsp` moves, so `[rbp - 8]` keeps naming the same local qword. At the end,
`leave` is exactly `mov rsp, rbp` followed by `pop rbp`: it discards the local area, restores the
caller's `rbp`, and leaves `rsp` pointing at the return address. Then `ret` removes that address.

## A seventh integer argument

The first six integer or pointer arguments use registers. A seventh one is passed on the stack.
The caller must place it there while still satisfying the alignment rule.

Starting with aligned `rsp` in `_start`, padding comes before the argument:

```x86|playground|no-flags
default rel
global _start

section .text
; seventh(a, b, c, d, e, f, g) -> a + g
seventh:
    push rbp
    mov rbp, rsp
    mov rax, [rbp + 16]     ; g, the seventh argument
    add rax, rdi            ; a + g
    leave
    ret

_start:
    mov rdi, 1
    mov rsi, 2
    mov rdx, 3
    mov rcx, 4
    mov r8, 5
    mov r9, 6

    sub rsp, 8              ; alignment padding
    push 7                  ; seventh argument; rsp is aligned again
    call seventh
    add rsp, 16             ; remove the argument and padding
    mov r12, rax            ; 8

    mov rax, 60
    xor rdi, rdi
    syscall
```

Why does `[rbp + 16]` hold `g`? The caller places `g` on the stack, `call` places the return
address below it, and `push rbp` places the saved frame pointer below that. After `mov rbp, rsp`,
the layout is:

| location | contents | placed there by |
| -------- | -------- | --------------- |
| `[rbp + 24]` | alignment padding | `sub rsp, 8` |
| `[rbp + 16]` | seventh argument `g` | `push 7` |
| `[rbp + 8]` | return address | `call seventh` |
| `[rbp]` | caller's `rbp` | `push rbp` |
| below `rbp` | local storage, if reserved | the callee |

Arguments already on the stack have positive offsets from `rbp`; locals reserved after the frame
is established have negative offsets. The caller removes its stack argument and padding after the
call, restoring its original `rsp`.

## Recursion and caller-saved arguments

A recursive function follows the same rules as any other caller and callee. Every `call` adds its
own return address, and each active invocation has its own saved values.

```x86|playground|no-flags
default rel
global _start

section .text
; fact(n) -> n!, for n >= 0
fact:
    cmp rdi, 1
    jg fact_recurse
    mov rax, 1              ; 0! and 1! are 1
    ret

fact_recurse:
    push rdi                ; save n; this also aligns rsp for the call
    dec rdi
    call fact
    pop rdi                 ; restore this invocation's n
    imul rax, rdi
    ret

_start:
    mov rdi, 5
    call fact
    mov r12, rax            ; 120

    mov rax, 60
    xor rdi, rdi
    syscall
```

`rdi` is caller-saved. Each non-base invocation needs its own `n` after the recursive call, so it
pushes `rdi`. Function entry has `rsp` at 8 modulo 16; the push makes it divisible by 16 for
`call fact`. The matching pop restores both `n` and the entry value of `rsp` before `ret`.

If the push and pop were removed, `fact(5)` would return 1. The recursion reaches the base case
with `rdi = 1`, and that invocation leaves `rdi` equal to 1. Every invocation unwinding from it
would therefore multiply by 1 instead of by its own saved value.

Each non-base recursive step adds 16 bytes while the next invocation is active: eight for the
saved `rdi` and eight for the next return address. Enough recursive levels exhaust the available
stack and fault.

## Your turn

Write `maximum(a, b)` using the System V convention. Treat both arguments as signed qwords and
return the larger one in `rax`. The three calls cover left-less, left-greater, and equal inputs.
The first pair, -5 and 3, also distinguishes signed comparison from unsigned comparison because
the qword bit pattern for -5 is above 3 when read as unsigned. Keep the three results in
`r12`–`r14`.

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

    mov rdi, 12
    mov rsi, -4
    call maximum
    mov r13, rax

    mov rdi, 9
    mov rsi, 9
    call maximum
    mov r14, rax

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": { "r12": 3, "r13": 12, "r14": 9 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
maximum:
    mov rax, rdi
    cmp rsi, rax
    jle maximum_done        ; signed b <= a
    mov rax, rsi
maximum_done:
    ret

_start:
    mov rdi, -5
    mov rsi, 3
    call maximum
    mov r12, rax

    mov rdi, 12
    mov rsi, -4
    call maximum
    mov r13, rax

    mov rdi, 9
    mov rsi, 9
    call maximum
    mov r14, rax

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>

Now write recursive `fib(n)` for `n >= 0`, with `fib(0) = 0` and `fib(1) = 1`. Return the result in
`rax` and use `rbx` to keep `fib(n - 1)` across the second recursive call. Because `rbx` is
callee-saved, `fib` must restore the value it inherited before every return.

The test calls the base cases and a recursive case. A **sentinel** is a recognizable check value.
Before `fib(10)`, the test puts one in `rbx`; afterward it copies the preserved value to `r15`.
Keep the three Fibonacci results in `r12`–`r14` and the copied sentinel in `r15`. Every `call` must
be made with aligned `rsp`.

```x86|playground|exercise
default rel
global _start

section .text
fib:
    ; your code here
    ret

_start:
    mov rdi, 0
    call fib
    mov r12, rax

    mov rdi, 1
    call fib
    mov r13, rax

    mov rbx, 0x123456789ABCDEF0
    mov rdi, 10
    call fib
    mov r14, rax
    mov r15, rbx

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": {
        "r12": 0,
        "r13": 1,
        "r14": 55,
        "r15": "0x123456789ABCDEF0"
    }
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
    jge fib_recurse
    mov rax, rdi            ; fib(0) = 0; fib(1) = 1
    ret

fib_recurse:
    push rbx                ; preserve the inherited callee-saved value
    push rdi                ; save this invocation's n
    sub rsp, 8              ; align rsp for the first call

    dec rdi
    call fib                ; fib(n - 1)
    mov rbx, rax

    add rsp, 8              ; remove alignment padding
    pop rdi                 ; recover this invocation's n; rsp is aligned
    sub rdi, 2
    call fib                ; fib(n - 2)

    add rax, rbx
    pop rbx                 ; restore the inherited rbx and entry rsp
    ret

_start:
    mov rdi, 0
    call fib
    mov r12, rax

    mov rdi, 1
    call fib
    mov r13, rax

    mov rbx, 0x123456789ABCDEF0
    mov rdi, 10
    call fib
    mov r14, rax
    mov r15, rbx

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
