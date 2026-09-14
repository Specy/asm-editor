A division by zero, a write to an address that is not yours and a `syscall` all do the same thing to
the instruction pointer: they take it away from your program and give it to somebody else's code.
This lecture is the machinery behind that, and what a Linux program sees of it.

Three words, which Assembly basics set out. An **exception** is the processor refusing to carry out
the instruction it is on, caused by your program at an instruction you chose. An **interrupt** comes
from a device between two instructions and has nothing to do with which two they were. A **trap** is
an instruction you ran on purpose to hand control over, which on x86 is `int` or `syscall`.

## The interrupt descriptor table

x86 has 256 **vectors**, numbered 0 to 255, and a table in memory with one entry per vector saying
which code handles it. The table is the **IDT**, the interrupt descriptor table, and the processor is
told where it is by `lidt`, an instruction only ring 0 may execute.

The first 32 vectors are the processor's own. These are the ones a program meets:

| vector | short name | raised by                                                                       |
| -----: | ---------- | ------------------------------------------------------------------------------- |
|      0 | `#DE`      | `div` or `idiv` by zero, or a quotient too big for the register                 |
|      3 | `#BP`      | the one byte breakpoint instruction, which is how a debugger works              |
|      6 | `#UD`      | bytes that are not an instruction                                               |
|     13 | `#GP`      | general protection: a privileged instruction in ring 3, among many other things |
|     14 | `#PF`      | page fault: an address with no mapping, or a write to something read only       |

Vectors 32 and up are for devices, and which device has which is up to the operating system. When a
handler is done it runs `iretq`, return from interrupt, which restores the instruction pointer, the
code segment and the flags from the stack in one instruction.

`syscall` is the exception to all of this. It was added because going through the IDT was slow: it
does not look at the table at all, it reads the handler's address out of a register the kernel set up
at boot. `int 0x80`, the older way of making a system call, is a real vector and a real table lookup,
which is why it was worth replacing.

## Your program sees signals, not vectors

None of the table is reachable from ring 3. What a Linux program gets instead is a **signal**: the
kernel takes the exception, works out which program caused it, and delivers a number to that program.

| vector          | signal    | what it usually means             |
| --------------- | --------- | --------------------------------- |
| `#DE`           | `SIGFPE`  | divided by zero                   |
| `#UD`           | `SIGILL`  | jumped somewhere that is not code |
| `#GP`, `#PF`    | `SIGSEGV` | touched memory that is not yours  |
| `#BP`           | `SIGTRAP` | hit a breakpoint                  |
| a device, later | `SIGINT`  | somebody pressed ctrl-C           |

A program with no handler for a signal is killed by it, and the shell reports which one. A program
can install a handler with `rt_sigaction`, and then the kernel writes a frame onto its stack, points
`rip` at the handler and lets it run in ring 3, which is a user mode imitation of what the processor
did in ring 0.

## What ends a run here

This emulator does not deliver signals. A fault ends the run where it happened, with **no message**,
and the instruction pointer parked on the instruction that caused it. Reading `rip` in the registers
panel is how you find out which one it was.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov r8, 1               ; this runs
    mov rax, 10
    xor rdx, rdx
    xor rcx, rcx
    div rcx                 ; divide by zero: #DE
    mov r9, 2               ; never reached

    mov rax, 60
    xor rdi, rdi
    syscall
```

Press Run. `r8` is 1, `r9` is 0, and `rip` is on the `div`. The program did not exit, it stopped.

The four ways to get there, all of which behave the same way:

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov r8, 1
    mov rax, [0x10]         ; an address with nothing mapped at it: #PF
    mov r9, 2               ; never reached

    mov rax, 60
    xor rdi, rdi
    syscall
```

The other two are a write into `section .text`, which is mapped read only, and a privileged
instruction such as the `in` of the last lecture. Each one stops on its own line.

A **divide error** deserves a second look, because it is the one that catches working code. `div`
raises it when the divisor is zero **and** when the quotient does not fit in the register, which
happens whenever `rdx` holds something left over from earlier:

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov rax, 100
    mov rbx, 7
    xor rdx, rdx
    div rbx                 ; rax = 14, rdx = 2, and rdx is now not zero

    mov rax, 200
    mov rbx, 7
    div rbx                 ; no xor rdx, rdx: the dividend is now enormous

    mov r9, 1               ; never reached

    mov rax, 60
    xor rdi, rdi
    syscall
```

The second `div` stops the program, and its instruction is correct in isolation. The missing line is
the `xor rdx, rdx` above it. Put it back and the program runs to the end.

## Catching it yourself

With no signal handler, there is one thing left: **check before you divide**.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov rax, 100
    xor rbx, rbx            ; the divisor, zero this time
    xor r8, r8              ; the answer
    mov r9, -1              ; and a flag saying it could not be worked out

    test rbx, rbx
    jz .cannot              ; nothing to do, and no fault either
    xor rdx, rdx
    div rbx
    mov r8, rax
    xor r9, r9
.cannot:

    mov rax, 60
    xor rdi, rdi
    syscall
```

`r9` comes out at `FFFFFFFFFFFFFFFF` and the program reaches its exit. This is what a language with
exceptions does for you: the check is still there, it is just in the runtime instead of your source.

## The debugger's instruction

Vector 3 is the breakpoint, and it has a one byte encoding, `CC`, spelled `int3`. A debugger sets a
breakpoint by writing that byte over the first byte of an instruction, catching the `SIGTRAP`, and
putting the original byte back. One byte, so it fits over any instruction however short.

The breakpoints in this editor are not that. They are the emulator checking an address before each
instruction, which is why setting one changes nothing about the bytes of your program. `int3` and
`hlt` both stop the emulator itself here instead of the program, so neither belongs in a program you
run in this editor.

## What this emulator does not have

**No device raises an interrupt.** There are no devices, as the last lecture said. Vectors 32 and up
never fire, nothing arrives between two instructions, and a program here is only ever interrupted by
something it did itself.

**No handler runs.** `rt_sigaction` is in blink's table of calls, and a program that installs a
handler and then faults does not reach it. So the fault table above describes the machine and not
anything you can catch here. MIPS and RISC-V in this editor differ: a handler you write there really
does run.

**The run ends silently.** Every other simulator here prints a message naming what went wrong. This
one stops, and the line `rip` is parked on is the whole of the diagnosis.

## Your turn

Divide `rax` by `rbx` without letting a zero divisor stop the program. Leave the quotient in `r8` and
0 in `r9` when the division happened, and leave `r8` at 0 and `r9` at 1 when it did not. The test
gives 100 and 0, so the answer is `r8` at 0 and `r9` at 1.

```x86|playground|exercise
default rel
global _start

section .text
_start:
    ; your code here

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "startingRegisters": { "rax": 100, "rbx": 0 },
    "expectedRegisters": { "r8": 0, "r9": 1 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    xor r8, r8
    mov r9, 1               ; assume it cannot be done
    test rbx, rbx
    jz .done                ; and it cannot, when the divisor is zero
    xor rdx, rdx            ; the high half of the dividend
    div rbx
    mov r8, rax
    xor r9, r9              ; it worked after all
.done:

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>

The second one is the `rdx` trap. The program below stops on its second `div`. Add the one line that
makes it run to the end, leaving 28 in `r8` and 4 in `r9`.

```x86|playground|exercise
default rel
global _start

section .text
_start:
    mov rax, 100
    mov rbx, 7
    xor rdx, rdx
    div rbx                 ; 14 remainder 2

    mov rax, 200
    mov rbx, 7
    ; one line goes here
    div rbx
    mov r8, rax
    mov r9, rdx

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": { "r8": 28, "r9": 4 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    mov rax, 100
    mov rbx, 7
    xor rdx, rdx
    div rbx

    mov rax, 200
    mov rbx, 7
    xor rdx, rdx            ; the remainder of the first division, cleared
    div rbx
    mov r8, rax
    mov r9, rdx

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
