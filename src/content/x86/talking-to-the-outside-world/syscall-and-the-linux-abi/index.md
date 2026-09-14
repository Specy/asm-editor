Every program in this course has ended with the same three lines and nobody has said what they do.
This lecture is those three lines: the one instruction that leaves your program, the agreement about
which register carries what, and the calls a program here can make.

## One instruction, one agreement

A program cannot print. Printing means writing to a terminal, and a terminal is a device the
operating system owns, in memory your program is not allowed to touch. What a program can do is
**ask**, and `syscall` is the instruction that asks.

`syscall` takes no operands. Everything about the request is in the registers when it runs:

| register | holds                       |
| -------- | --------------------------- |
| `rax`    | which call, by number       |
| `rdi`    | the first argument          |
| `rsi`    | the second                  |
| `rdx`    | the third                   |
| `r10`    | the fourth                  |
| `r8`     | the fifth                   |
| `r9`     | the sixth                   |
| `rax`    | the result, on the way back |

That is the System V convention again with one change: the fourth argument is in `r10` and not
`rcx`, because **`syscall` destroys `rcx` and `r11`**. The processor puts the return address in `rcx`
and the flags in `r11` as part of carrying out the instruction, so anything you were keeping in
either is gone.

The result comes back in `rax`. A small negative number means failure, and the number is the error:
`-2` is "no such file", `-9` is "bad file descriptor", `-38` is "this kernel does not implement that
call". There is no flag to check, the value is the answer.

## Printing

Call 1 is `write`, and it takes a file descriptor, an address and a count.

```x86|playground|console|no-registers
default rel
global _start

section .rodata
greeting:   db "Hello, world!", 10      ; 10 is the newline
GLEN        equ $ - greeting

section .text
_start:
    mov rax, 1              ; call 1: write
    mov rdi, 1              ; to descriptor 1, standard output
    lea rsi, [greeting]     ; the bytes
    mov rdx, GLEN           ; how many of them
    syscall

    mov rax, 60             ; call 60: exit
    xor rdi, rdi            ; with status 0
    syscall
```

`write` prints **exactly** the bytes you point it at and no more. There is no terminator involved and
nothing is added for you, so the newline is a byte in the string and the length is counted by the
assembler with `$ - greeting`. Take the `, 10` out and the console loses the line break; take one off
the length and the `!` disappears.

A **file descriptor** is a small number naming something open. Every program starts with three:
**0** is standard input, **1** is standard output, **2** is standard error. `write` to 2 instead of 1
and the bytes still reach the console here, which is what a program does with a message that is not
part of its answer.

## Stopping

Call 60 is `exit`, and its one argument is the status, which is what a shell reports as `$?`. Zero
means success by convention and anything else means something went wrong.

`exit` never returns. A program that reaches the end of its code without calling it does not stop, it
carries on into whatever bytes are next in memory and executes them as instructions. In this editor
that ends the run quietly a moment later, which is not an ending you should rely on: write the exit.

```x86|playground|console|no-registers
default rel
global _start

section .rodata
msg:    db "leaving with status 3", 10
MLEN    equ $ - msg

section .text
_start:
    mov rax, 1
    mov rdi, 1
    lea rsi, [msg]
    mov rdx, MLEN
    syscall

    mov rax, 60
    mov rdi, 3              ; the status this time
    syscall
```

## Opening a file

`open` takes a path and returns a descriptor, `read` fills a buffer from it, `close` gives it back.
The program the editor runs is a file on blink's own filesystem called `/program`, so a program can
open and read itself.

```x86|playground|no-flags
default rel
global _start

section .rodata
path:   db "/program", 0    ; a path is a C string, so it is terminated

section .bss
buf:    resb 16

section .text
_start:
    mov rax, 2              ; call 2: open
    lea rdi, [path]
    xor rsi, rsi            ; flags: O_RDONLY is 0
    xor rdx, rdx            ; mode, unused when not creating
    syscall
    mov r12, rax            ; the descriptor

    mov rdi, rax            ; call 0: read
    lea rsi, [buf]
    mov rdx, 4              ; four bytes
    xor rax, rax
    syscall
    mov r13, rax            ; how many it actually read

    mov r14d, [buf]         ; the four bytes themselves

    mov rdi, r12            ; call 3: close
    mov rax, 3
    syscall

    mov rax, 60
    xor rdi, rdi
    syscall
```

`r12` comes out at 3, the first descriptor after the three a program starts with. `r13` is 4, the
number of bytes `read` actually delivered, which is not always the number you asked for and is the
value to loop on. `r14` is `464C457F`, which little endian is the bytes `7F 45 4C 46`: a `7F` and
then `ELF`, the magic number at the start of every Linux executable. The program has just read its
own header.

## The calls this emulator has

blink implements around 180 of the Linux calls, and the
[syscall page](/documentation/x86/syscall) lists every one with its number and arguments. These are
the ones a program here is likely to want:

| number | name            | arguments                                              |
| -----: | --------------- | ------------------------------------------------------ |
|      0 | `read`          | descriptor, buffer, count                              |
|      1 | `write`         | descriptor, buffer, count                              |
|      2 | `open`          | path, flags, mode                                      |
|      3 | `close`         | descriptor                                             |
|      8 | `lseek`         | descriptor, offset, whence                             |
|      9 | `mmap`          | address, length, protection, flags, descriptor, offset |
|     11 | `munmap`        | address, length                                        |
|     35 | `nanosleep`     | the interval, where to put what is left                |
|     39 | `getpid`        | none                                                   |
|     60 | `exit`          | status                                                 |
|    228 | `clock_gettime` | which clock, where to put the answer                   |

A number nothing implements returns `-38` and does not stop the program, so a call that quietly does
nothing is usually one this emulator does not have.

**Reading the console does not work here yet.** `read` from descriptor 0 is how a Linux program takes
what you type, and this editor cannot yet hand a line you type to an x86 program: the program sits on
the `read` and the line goes to the shell blink runs around it. So every program in this course
prints and none of them reads, and the Examples that ask for input in the other languages have no x86
version.

## What a request costs

`syscall` is not a call to a subroutine. It changes the processor's **privilege level**, from ring 3,
where your program runs and the memory of the operating system is unreachable, to ring 0, where the
kernel's code runs and everything is reachable. The kernel reads your register values, checks them,
does the work, and returns you to ring 3 with the answer in `rax`.

That transition is why a `write` of one byte costs hundreds of times what a `mov` costs, and why C's
`printf` collects output in a buffer and calls `write` once for a whole line instead of once per
character.

`int 0x80` is the older way of making the same transition, from the days before `syscall` existed. It
still works for 32 bit programs and it uses a different table of numbers, so a number you read in an
old book may not be the one to use with `syscall`.

## Your turn

Print `assembly` followed by a newline, then exit with status 0. The string is nine bytes.

```x86|playground|console|exercise
default rel
global _start

section .rodata
; your data here

section .text
_start:
    ; your code here

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedOutput": "assembly\n"
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
    mov rax, 1              ; write
    mov rdi, 1              ; to standard output
    lea rsi, [phrase]
    mov rdx, PLEN           ; nine bytes, counted by the assembler
    syscall

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>

The second one prints the same string one character at a time, with a `write` of one byte per pass
through a loop. The console should read `assembly` with no newline. This is what `printf` avoids
doing.

```x86|playground|console|exercise
default rel
global _start

section .rodata
phrase: db "assembly"
PLEN    equ $ - phrase

section .text
_start:
    ; your code here

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedOutput": "assembly"
}
```

<details>
<summary>Show solution</summary>

```x86|playground|console|solution
default rel
global _start

section .rodata
phrase: db "assembly"
PLEN    equ $ - phrase

section .text
_start:
    xor r12, r12            ; the index, kept in a callee saved register
.next:
    mov rax, 1              ; write
    mov rdi, 1
    lea rsi, [phrase]
    add rsi, r12            ; the address of one character
    mov rdx, 1              ; one byte
    syscall

    inc r12
    cmp r12, PLEN
    jb .next

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
