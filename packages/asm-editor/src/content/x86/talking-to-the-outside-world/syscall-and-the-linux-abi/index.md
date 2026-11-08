# `syscall` and the Linux x86-64 ABI

The **Linux x86-64 system-call ABI**, also called the Linux AMD64 system-call ABI, defines the
call numbers and registers a 64-bit program uses to request Linux services. Old 32-bit x86 examples
use a different ABI, so their call numbers and register rules do not match the table below.

An **application binary interface**, or **ABI**, is the binary-level agreement about details such as
call numbers, argument registers, and results.

A user program does not have permission to perform every operation that the kernel can perform. To
send bytes to an open file, request memory, or ask the kernel for another service, the program puts a
request in registers and executes `syscall`. The kernel validates the request, performs it when
allowed, and returns a result.

## Registers for a system call

`syscall` has no written operands. Linux reads the system-call number and as many as six arguments
from these registers:

| value              | register |
| ------------------ | -------- |
| system-call number | `rax`    |
| argument 1         | `rdi`    |
| argument 2         | `rsi`    |
| argument 3         | `rdx`    |
| argument 4         | `r10`    |
| argument 5         | `r8`     |
| argument 6         | `r9`     |
| result or error    | `rax`    |

After `syscall`, treat **`rax`, `rcx`, and `r11` as changed**. Linux places the result in `rax`.
The processor uses `rcx` and `r11` while entering and returning from the kernel, so their previous
values are lost. Keep every value needed after a system call in memory or in another register.

The register order resembles the System V function-call convention, but it is a separate
convention. In particular, a System V function receives its fourth integer argument in `rcx`, while
a Linux system call receives its fourth argument in `r10`. `rcx` cannot carry that argument because
the `syscall` instruction overwrites it.

## File descriptors in this playground

A **file descriptor** is a small integer that names an open I/O object in one process. Linux
programs normally inherit these three descriptors from the process that starts them:

| descriptor | conventional name | usual connection              |
| ---------: | ----------------- | ----------------------------- |
|          0 | standard input    | input source                  |
|          1 | standard output   | ordinary output destination   |
|          2 | standard error    | diagnostic output destination |

Each descriptor names its current connection and may be redirected. Descriptor 1 can name a file,
and descriptor 2 reaches a console only when standard error is connected there.

In this playground, standard output is connected to the console panel, and standard input is what
you type there: a read of descriptor 0 waits for a line ended with Enter.
The [x86 syscall reference](/documentation/x86/syscall) lists the system calls supported by the
playground, with their numbers and arguments.

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

## `write`: descriptor, address, requested count

Linux system-call number 1 is `write`. Its three arguments are:

| register | `write` value             |
| -------- | ------------------------- |
| `rdi`    | file descriptor           |
| `rsi`    | address of the first byte |
| `rdx`    | number of bytes requested |

`write` sends bytes to the object named by the descriptor. With descriptor 1 connected to a
terminal, sending text bytes there makes text appear on that terminal.

The call requests **up to** `rdx` bytes. A nonnegative result in `rax` is the number actually
written, which may be smaller than the requested count. `write` does not search for a zero
terminator and does not add a newline. The program supplies both the address and the exact byte
count it wants to send.

## One request from start to finish

This program makes one write request, preserves its result, then exits. At the first `syscall`,
`rax = 1` selects `write`, `rdi = 1` selects standard output, `rsi` holds the greeting's address,
and `rdx = 14` requests fourteen bytes.

`db` emits thirteen text bytes and byte `10`, a newline. `equ` names an assembly-time constant.
At `GLEN equ $ - greeting`, `$` is the current assembly position, immediately after those bytes.
Subtracting the starting address `greeting` gives their length, 14. No instruction runs to
calculate `GLEN`.

A successful `write` returns a nonnegative byte count; a negative result means an error. The
`test rax, rax` instruction sets flags without changing `rax`, and `js` branches when its sign bit
is set. The program uses that check to choose its exit status.

```x86|playground|console
default rel
global _start

section .rodata
greeting:   db "Hello, world!", 10
GLEN        equ $ - greeting

section .text
_start:
    mov eax, 1              ; write
    mov edi, 1              ; standard output
    lea rsi, [rel greeting] ; address of the bytes
    mov edx, GLEN           ; requested byte count
    syscall

    mov r12, rax            ; keep the result before replacing rax
    test rax, rax
    js write_failed         ; negative result means an error

    mov eax, 60             ; exit
    xor edi, edi            ; status 0
    syscall

write_failed:
    mov eax, 60
    mov edi, 1              ; status 1
    syscall
```

Writing `eax` clears the upper half of `rax`, so `mov eax, 1` sets the full register to 1.
The address goes in the full `rsi` because addresses are 64 bits.

In the playground, the console shows the greeting and a newline, and `r12` holds 14. The program
copies the result before loading the exit call number into `rax`. This version makes only one
write request: a nonnegative result lets it exit even if fewer than fourteen bytes were written.

## Recognizing an error

A successful call returns its result in `rax`. What that result means depends on the call. Linux reports errors as negative values
from `-1` through `-4095`. There is no separate error flag to read after `syscall`; test the value in
`rax`.

For example, an invalid descriptor makes `write` return `-9`, the bad-file-descriptor error.
The greeting checks for a negative result with `test rax, rax` followed by `js`. This works because
successful write counts are nonnegative.

This unsigned comparison recognizes the complete reserved error range:

```x86
    syscall
    cmp rax, -4095
    jae syscall_error       ; syscall_error is your error-handling label
```

For a concrete comparison, `-4095` has bits `0xFFFFFFFFFFFFF001`, and `-9` has bits
`0xFFFFFFFFFFFFFFF7`. As an unsigned value, `-9` is above the boundary, so `jae` branches. A
successful result of 14 has bits `0x000000000000000E`, below that boundary, so it does not branch.
In two's-complement form, those negative values occupy the top 4095 unsigned 64-bit values. That is
why the unsigned `jae` condition catches them.

The signed-negative test in the greeting is enough for `write`. Use the general range check when
successful results are not restricted to nonnegative signed values, for example when a call
returns an address.

## Writing the remaining bytes

A successful write may send only part of the requested bytes. This version keeps the address of
the next byte in `rsi` and the remaining count in `rdx`. Both registers survive `syscall`. After
each positive result, it advances the address and reduces the count by that result.

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

If the first request writes 5 bytes, `rsi` advances by 5 and `rdx` falls from 14 to 9. The next
request starts at the sixth byte and requests those remaining 9 bytes. When `rdx` reaches zero,
the loop exits with status 0. A negative result exits with status 1. A zero result for a nonempty
request would leave both the pointer and remaining count unchanged, so the separate zero branch
prevents an endless retry.

## Device access through the same convention

The playground also provides device files. A program uses `open` to obtain a descriptor, then
uses calls such as `read`, `write`, and `ioctl` on that descriptor. `ioctl` makes a device-specific
request, such as reading a screen's dimensions. `mmap` can return an address through which the
program accesses device memory. Each call has its own arguments and result rules, but uses the
same register convention above.

The device references describe how to use each device and the data formats it accepts:

- [Screen](/documentation/x86/screen): open `/dev/fb0`, map its pixel memory, and use framebuffer
  requests for screen information and double buffering.
- [Keys and the pointer](/documentation/x86/input): read keyboard and pointer events from
  `/dev/input`. These events are separate from text read through standard input.
- [Sound](/documentation/x86/sound): send tone events to the PC speaker, MIDI messages to
  `/dev/snd/midiC1D0`, or sound samples to `/dev/dsp`.

The [x86 syscall reference](/documentation/x86/syscall) lists supported call numbers, arguments,
results, and NASM include files that provide names for constants. A descriptor alone does not
describe the bytes a device expects; its reference supplies that format.

## Your turn

Make one `write` request for all nine bytes of `assembly` followed by a newline. Immediately after
the system call, preserve its result in `r12`, before using `rax` for another call. In this
exercise's playground run, the request writes all 9 bytes. Check for a negative result and exit
with a nonzero status on that path; otherwise exit with status 0.

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
