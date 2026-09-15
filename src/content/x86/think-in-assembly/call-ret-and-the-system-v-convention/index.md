A subroutine is a piece of code you can run from several places and come back from. The coming back
is the hard half: the code has to end up at whichever of those places called it this time, and it
cannot know which one that is when it is written.

## call and ret

The answer is to leave a note on the stack.

- **`call label`** pushes the address of the instruction after it, then jumps to `label`.
- **`ret`** pops an address off the stack and puts it in `rip`.

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

Step through it with `rsp` and `rip` both in view. The `call` drops `rsp` by 8 and writes `0x401010`
or thereabouts into the slot it just made; `ret` reads that address back out, puts it in `rip`, and
`rsp` climbs back to where it was.

Notice what is not happening. Nothing marks that slot as a return address, and `ret` does not check
anything: it takes whatever eight bytes `rsp` points at and jumps there. A subroutine that pushes
something and forgets to pop it will `ret` to the value it pushed, and the program will run off into
memory that was never code. That is worth knowing early, because the symptom looks nothing like the
cause.

The subroutine is written **above** `_start` here. Order in the file does not matter to the assembler,
and it matters to the program only in that a subroutine written below `_start` would be run into by
anything that reached the end of `_start` without exiting.

## The System V convention

`rdi` and `rsi` in that program are not the hardware's choice. They come from the **System V AMD64
ABI**, an **application binary interface**: a written agreement about the things two pieces of
machine code have to settle between them before they can call each other, such as which register
carries the first argument and who is allowed to destroy what. Every Linux compiler, library and
program follows the same one, which is why code from different sources fits together at all.

| what                     | where                                  |
| ------------------------ | -------------------------------------- |
| integer arguments 1 to 6 | `rdi`, `rsi`, `rdx`, `rcx`, `r8`, `r9` |
| further arguments        | on the stack, pushed in reverse order  |
| the return value         | `rax`, or `rdx:rax` for 128 bits       |

And the registers split in two, by who is responsible for a value surviving a call:

| kind         | registers                                        | means                                                              |
| ------------ | ------------------------------------------------ | ------------------------------------------------------------------ |
| callee saved | `rbx`, `rbp`, `r12`, `r13`, `r14`, `r15`, `rsp`  | a subroutine that writes one must put it back                      |
| caller saved | `rax`, `rcx`, `rdx`, `rsi`, `rdi`, `r8` to `r11` | a subroutine may destroy them, so save them first if you need them |

Read the second table as advice about your own code. If a value has to survive a `call`, keep it in
`rbx` or `r12` to `r15` and let the subroutine worry about it. If it is scratch, use `rax` or `rcx`
and expect it to be gone afterwards.

There is nothing inevitable about any of it. Windows settled on a different set of registers for the
same processor, which is why an object file built for one system will not link against the other even
though the instructions inside it are identical.

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

Delete the `push rbx` and the `pop rbx` and `r13` comes back as 3. The subroutine still returns the
right answer, and it has quietly destroyed something that was not its to destroy, in a way that will
surface somewhere else entirely.

## The stack frame

A subroutine with local variables has a problem: it keeps them on the stack, and the stack pointer
moves. Every push, every call, and `[rsp + 8]` means something different from what it meant two lines
ago.

The usual fix is to take a copy of `rsp` at the start and never move the copy. That copy is the
**frame pointer**, and by convention it lives in `rbp`:

```
    push rbp                ; save the caller's frame pointer
    mov rbp, rsp            ; this frame starts here
    sub rsp, 32             ; room for local variables
    ...
    mov rsp, rbp            ; throw the locals away
    pop rbp                 ; and give the caller's frame pointer back
    ret
```

`rbp` now stays still for the whole subroutine, so everything the subroutine owns has a fixed name:
`[rbp - 8]` is the first local variable and stays the first local variable however much `rsp` moves
underneath it.

The two lines that take the frame down are so common they have an instruction of their own.
**`leave`** is exactly `mov rsp, rbp` followed by `pop rbp`, in one byte. (`enter` exists for the two
lines at the top, and nobody uses it, because writing them out is faster.)

## Arguments that do not fit in registers

Six registers carry six arguments. The seventh goes on the stack, pushed by the caller before the
`call` and taken off again by the caller afterwards.

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

Why `[rbp + 16]`? Count upwards from `rbp` and everything is where the two instructions before it put
it.

| where        | holds                                       | put there by  |
| ------------ | ------------------------------------------- | ------------- |
| `[rbp + 16]` | the seventh argument                        | `push 7`      |
| `[rbp + 8]`  | the return address                          | `call`        |
| `[rbp]`      | the caller's `rbp`                          | `push rbp`    |
| `[rbp - 8]`  | the first local variable, if there were one | `sub rsp, 32` |

Arguments are above `rbp` because they were pushed before the frame existed, and locals are below it
because they were made after. Eight bytes for the saved `rbp`, eight for the return address, and the
argument is the next thing up.

None of this is required by the hardware. A subroutine that never moves `rsp` after it starts can
reach its locals from `rsp` directly and keep `rbp` as one more general register, which is what a
compiler does with optimisation turned on. The frame pointer earns its place when something has to
walk back through the calls: each saved `rbp` points at the one below it, so the chain of them is the
list of who called whom, which is where a debugger's backtrace comes from.

## Recursion

A subroutine that calls itself needs nothing new. Every call pushes its own return address, so the
addresses stack up naturally, and anything else a level wants to survive its own call goes on the
stack beside them.

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

`push rdi` is there because `rdi` is caller saved, and the thing being called is `fact` itself, which
is therefore free to destroy it. Delete the push and the pop and the answer becomes 1: `rdi` comes
back as 0 from the bottom of the recursion, and every multiplication on the way out is by zero except
the last.

Each level uses 16 bytes of stack, 8 for the return address and 8 for the saved `rdi`. Call it with
`rdi` at a million and the stack grows down into memory that has nothing mapped in it, the program
stops on the store, and that is what a stack overflow is.

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
