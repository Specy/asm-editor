# `syscall` and the Linux x86-64 ABI

This lesson is specifically about the **Linux x86-64 system-call ABI**, also called the Linux AMD64
system-call ABI. Its call numbers and register assignments belong to this operating system and this
64-bit ABI. Old 32-bit x86 examples use a different ABI; do not combine their call numbers or
register rules with the table below.

An **application binary interface**, or **ABI**, is the binary-level agreement about details such as
call numbers, argument registers, and results.

A user program does not have permission to perform every operation that the kernel can perform. To
send bytes to an open file, request memory, or ask the kernel for another service, the program puts a
request in registers and executes `syscall`. The kernel validates the request, performs it when
allowed, and returns a result.

## Registers for a system call

`syscall` has no written operands. Linux reads the system-call number and as many as six arguments
from these registers:

| value | register |
| ----- | -------- |
| system-call number | `rax` |
| argument 1 | `rdi` |
| argument 2 | `rsi` |
| argument 3 | `rdx` |
| argument 4 | `r10` |
| argument 5 | `r8` |
| argument 6 | `r9` |
| result or error | `rax` |

After `syscall`, treat **`rax`, `rcx`, and `r11` as changed**. Linux places the result in `rax`.
The processor uses `rcx` and `r11` while entering and returning from the kernel, so their previous
values are lost. Keep every value needed after a system call in memory or in another register.

The register order resembles the System V function-call convention, but it is a separate
convention. In particular, a System V function receives its fourth integer argument in `rcx`, while
a Linux system call receives its fourth argument in `r10`. `rcx` cannot carry that argument because
the `syscall` instruction overwrites it.

## Results and errors

A successful call returns a call-specific result in `rax`. Linux reports errors as negative values
from `-1` through `-4095`. There is no separate error flag to read after `syscall`; test the value in
`rax`.

This unsigned comparison recognizes the complete reserved error range:

```x86
    syscall
    cmp rax, -4095
    jae syscall_error       ; syscall_error is your error-handling label
```

In two's-complement form, those negative values occupy the top 4095 unsigned 64-bit values. That is
why the unsigned `jae` condition catches them. The useful general pattern is
`cmp rax, -4095` followed by `jae` to the error path.

Some calls, including `write`, can only have nonnegative successful results. For such a call, a
signed-negative test is a simpler local check:

```x86
    syscall
    test rax, rax
    js syscall_error        ; syscall_error is your error-handling label
```

The error path handles the failure and finishes with a nonzero status in this lesson's `write`
examples.

## `write`: descriptor, address, requested count

Linux system-call number 1 is `write`. Its three arguments are:

| register | `write` value |
| -------- | ------------- |
| `rdi` | file descriptor |
| `rsi` | address of the first byte |
| `rdx` | number of bytes requested |

`write` sends bytes to the object named by the descriptor. With descriptor 1 connected to a
terminal, sending text bytes there makes text appear on that terminal.

The call requests **up to** `rdx` bytes. A nonnegative result in `rax` is the number actually
written, which may be smaller than the requested count. `write` does not search for a zero
terminator and does not add a newline. The program supplies both the address and the exact byte
count it wants to send.

This program keeps writing until the complete greeting has been sent. `rsi` advances past bytes
already written, `rdx` decreases by the same amount, and `r12` accumulates the total. These
registers survive each system call, so they hold the loop state across every request.

```x86|playground|console
default rel
global _start

section .rodata
greeting:   db "Hello, world!", 10
GLEN        equ $ - greeting

section .text
_start:
    lea rsi, [rel greeting] ; next byte to write
    mov rdx, GLEN           ; bytes still requested
    xor r12, r12            ; total bytes written

write_more:
    test rdx, rdx
    jz write_done

    mov eax, 1              ; Linux x86-64 write
    mov edi, 1              ; standard output
    syscall

    test rax, rax
    js write_failed         ; negative result
    jz write_stalled        ; nonempty request made no progress

    add rsi, rax            ; advance by the bytes actually written
    sub rdx, rax            ; that many fewer remain
    add r12, rax            ; preserve the running total
    jmp write_more

write_done:
    mov eax, 60             ; Linux x86-64 exit
    xor edi, edi            ; status 0: success
    syscall

write_failed:
    mov eax, 60
    mov edi, 1              ; nonzero status: failure
    syscall

write_stalled:
    mov eax, 60
    mov edi, 2              ; avoid repeating forever without progress
    syscall
```

On the normal path, the console shows the greeting and `r12` remains `14`, the number of bytes
written in total. The loop also handles a short successful write: it requests only the remaining
suffix on the next pass. A zero result for a nonempty request would leave both the pointer and
remaining count unchanged, so the separate zero branch prevents an endless retry.

## File descriptors in this playground

A **file descriptor** is a small integer that names an open I/O object in one process. Linux
programs normally inherit these three descriptors from the process that starts them:

| descriptor | conventional name | usual connection |
| ---------: | ----------------- | ---------------- |
| 0 | standard input | input source |
| 1 | standard output | ordinary output destination |
| 2 | standard error | diagnostic output destination |

Each descriptor names its current connection and may be redirected. Descriptor 1 can name a file,
and descriptor 2 reaches a console only when standard error is connected there.

In this playground, standard output is connected to the console panel. Interactive input is not
connected to the x86 program's descriptor 0, so examples here should not wait for a line from it.
The precise system calls implemented by the playground, with their numbers and arguments, are on
the [x86 syscall reference](/documentation/x86/syscall).

## Ending the program with `exit`

Linux system-call number 60 is `exit`. Put the status in `rdi`:

```x86
    mov eax, 60
    xor edi, edi            ; zero conventionally means success
    syscall                 ; does not return when successful
```

A nonzero status conventionally reports failure. An `_start` program should explicitly request an
exit when its work is complete. A successful `exit` has no return value for the program to use
because execution does not resume after its `syscall`.

## Your turn

Make one `write` request for all nine bytes of `assembly` followed by a newline. Immediately after
the system call, preserve its result in `r12`, before using `rax` for another call. For this output
in the playground, the successful result is 9. Check for a negative result and exit with a nonzero
status on that path; otherwise exit with status 0.

```x86|playground|console|exercise
default rel
global _start

section .rodata
phrase: db "assembly", 10
PLEN    equ $ - phrase

section .text
_start:
    ; your code here
```

```testcase
{
    "expectedOutput": "assembly\n",
    "expectedRegisters": { "r12": 9 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|console|solution
default rel
global _start

section .rodata
phrase: db "assembly", 10
PLEN    equ $ - phrase

section .text
_start:
    mov eax, 1
    mov edi, 1
    lea rsi, [rel phrase]
    mov edx, PLEN
    syscall

    mov r12, rax            ; preserve the returned byte count or error
    test rax, rax
    js phrase_error

phrase_done:
    mov eax, 60
    xor edi, edi
    syscall

phrase_error:
    mov eax, 60
    mov edi, 1
    syscall
```

</details>

The next exercise receives a descriptor in `r14`. Make a one-byte `write` request to that
descriptor and preserve its result in `r12`. Use the general `-4095` comparison and leave `r13`
equal to 1 when the result is in Linux's error range, or 0 otherwise.

Use the classification to select a visible one-byte report: write `E` to standard output for an
error and `S` for a success. Preserve `r12` and `r13` while making this second system call. Finish
with a nonzero status after reporting an error and status 0 after reporting a success. The supplied
descriptor is `-1`, so the expected path reports `E` and preserves the bad-file-descriptor result
`-9`.

```x86|playground|exercise
default rel
global _start

section .rodata
one_byte:       db "X"
error_mark:     db "E"
success_mark:   db "S"

section .text
_start:
    ; your code here
```

```testcase
{
    "startingRegisters": { "r14": "0xFFFFFFFFFFFFFFFF" },
    "expectedOutput": "E",
    "expectedRegisters": {
        "r12": "0xFFFFFFFFFFFFFFF7",
        "r13": 1
    }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .rodata
one_byte:       db "X"
error_mark:     db "E"
success_mark:   db "S"

section .text
_start:
    mov eax, 1
    mov rdi, r14            ; descriptor supplied at run time
    lea rsi, [rel one_byte]
    mov edx, 1
    syscall

    mov r12, rax            ; -9: bad file descriptor
    xor r13d, r13d
    cmp rax, -4095
    jae error_result

success_result:
    lea rsi, [rel success_mark]
    xor r15d, r15d          ; final status 0
    jmp report_result

error_result:
    mov r13, 1
    lea rsi, [rel error_mark]
    mov r15d, 1             ; final status 1

report_result:
    mov eax, 1
    mov edi, 1
    mov edx, 1
    syscall

    test rax, rax
    js report_failed
    jz report_failed

    mov eax, 60
    mov edi, r15d
    syscall

report_failed:
    mov eax, 60
    mov edi, 2
    syscall
```

</details>
