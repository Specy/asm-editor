A program cannot print. Printing means writing to a terminal, and a terminal belongs to the operating
system, in memory your program is not allowed to touch. The same goes for reading a file, asking for
more memory, and stopping. What a program can do is **ask**, and `syscall` is the instruction that
asks.

## One instruction, one agreement

`syscall` takes no operands. Everything about the request is in the registers when it runs, and which
register means what is settled by the **ABI**, the application binary interface: the written
agreement between programs and the kernel about where things go.

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

That is the System V convention from the calling lecture with one change: the fourth argument is in
`r10` and not `rcx`. The reason is that **`syscall` destroys `rcx` and `r11`**. The processor puts the
address to come back to in `rcx` and the flags in `r11` as part of carrying the instruction out, so
whatever you were keeping in either is gone, and `rcx` could not have carried an argument in.

The result comes back in `rax`. A small negative number means failure and the number says which
failure: `-2` is "no such file", `-9` is "bad file descriptor", `-38` is "this kernel does not
implement that call". There is no flag to check afterwards. The returned value is the whole answer.

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

`write` prints **exactly** the bytes you point it at and no more. It does not look for a terminator
and it does not add anything, so the line break is a byte you put in the string yourself, and the
length is counted by the assembler with `$ - greeting`. Take the `, 10` out and the console loses the
line break. Take one off the length and the `!` disappears.

A **file descriptor** is a small number naming something the kernel has open on your behalf. Every
program starts with three: **0** is standard input, **1** is standard output, **2** is standard
error. Writing to 2 instead of 1 still reaches the console here, and it is where a program puts a
message that is not part of its answer, so that somebody redirecting the output to a file still sees
the complaint.

## Stopping

Call 60 is `exit`, and its one argument is the status the program finishes with, which is the number
a shell reports afterwards. Zero means success by convention and anything else means something went
wrong.

Nothing else stops a program, and `exit` never returns. Code that runs off the end of `_start` carries
on into whatever bytes happen to come next in memory and executes them as instructions. Here that ends
the run quietly a moment later, which is not an ending to rely on.

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

Three calls work together on a file: `open` takes a path and returns a descriptor, `read` fills a
buffer through it, and `close` hands the descriptor back. The program the editor runs is itself a
file, called `/program`, so a program here can open and read its own bytes.

```x86|playground|no-flags
default rel
global _start

section .rodata
path:   db "/program", 0    ; the kernel reads a path up to a zero byte

section .bss
buf:    resb 16

section .text
_start:
    mov rax, 2              ; call 2: open
    lea rdi, [path]
    xor rsi, rsi            ; flags: read only is 0
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

`r12` comes out at 3, the first descriptor free after the three every program starts with. `r13` is 4,
which is the number of bytes `read` actually delivered and not the number you asked for. Those two are
allowed to differ, and a program that assumes they do not is a program that loses data on a slow file.

`r14` is `464C457F`. Read it as bytes, little endian, and it is `7F 45 4C 46`: a `7F` followed by the
letters `ELF`, which is the mark at the start of every Linux executable. The program has just read its
own header.

## The calls this emulator has

blink implements around 180 of the Linux calls, and the
[syscall page](/documentation/x86/syscall) lists every one with its number and arguments. These are
the ones this course uses:

| number | name            | arguments                                              |
| -----: | --------------- | ------------------------------------------------------ |
|      0 | `read`          | descriptor, buffer, count                              |
|      1 | `write`         | descriptor, buffer, count                              |
|      2 | `open`          | path, flags, mode                                      |
|      3 | `close`         | descriptor                                             |
|      9 | `mmap`          | address, length, protection, flags, descriptor, offset |
|     11 | `munmap`        | address, length                                        |
|     60 | `exit`          | status                                                 |
|    228 | `clock_gettime` | which clock, where to put the answer                   |

A number nothing implements returns `-38` and does not stop the program, so a call that appears to do
nothing at all is usually one this emulator does not have.

**Reading the console does not work here yet.** `read` from descriptor 0 is how a Linux program takes
a line you type, and the editor cannot yet hand a typed line to an x86 program: the program sits
waiting on the `read` while the line goes to the shell that blink runs around it. So every program in
this course prints and none of them reads.

## What a request costs

Despite the name, this is not a call to a subroutine. `syscall` changes the processor's **privilege
level**, from ring 3, where your program runs and the operating system's memory is unreachable, to
ring 0, where the kernel's code runs and everything is reachable. The kernel reads your register values, checks that you
are allowed to ask for what you asked for, does the work, and puts you back in ring 3 with the answer
in `rax`.

All of that checking and switching is why a `write` of one byte costs hundreds of times what a `mov`
costs. It is also why nearly every language's print function collects characters in a buffer of its
own and calls `write` once per line, or once per screenful, rather than once per character.

`int 0x80` is the older way of making the same transition, from before `syscall` existed. It still
works for 32 bit programs and it uses a different table of numbers, so a call number you find in an
old book may not be the one to use here.

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
through a loop. The console should read `assembly` with no newline. Eight requests to the kernel where
one would have done, which is exactly what a buffered print function exists to avoid.

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
