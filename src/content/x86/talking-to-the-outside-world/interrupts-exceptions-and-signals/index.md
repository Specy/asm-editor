# Interrupts, exceptions and signals

When `div` cannot produce a quotient, the CPU leaves the ordinary instruction sequence and enters
kernel-controlled code. A device interrupt can also make the CPU enter the kernel. The `syscall`
instruction requests a kernel service through another entry path. Linux may then deliver a signal
to a program.

These events are related control transfers. Their names belong to different layers, so it helps to
follow one event all the way through the machine.

## Four layers of one event

1. **A cause occurs.** An instruction divides by zero, a memory access breaks a protection rule, a
   device asks for attention, or a program executes `syscall`.
2. **The CPU chooses an entry mechanism.** An exception, a hardware interrupt, and the `int n`
   instruction select numbered x86 vectors. `syscall` uses its own special entry mechanism.
3. **Kernel code responds.** Linux may complete a system call, service a device, repair a memory
   mapping, or decide that a user program caused an unrecoverable error.
4. **The user program observes a result.** It may resume, receive a system-call result, have a Linux
   signal delivered to a handler, or end because of a signal's default action.

An event can therefore enter the kernel and later return to the next user instruction. A system
call normally does exactly that. A faulting instruction may instead be tried again after the kernel
repairs the cause, or it may lead to a signal.

## Precise x86 terms

An **exception** is generated synchronously by the CPU while it is processing an instruction. The
same register and memory state leads to the exception at the same instruction. Division errors,
invalid instruction encodings, and page faults are examples.

Intel divides exceptions into subtypes. The two useful terms here are:

- A **fault** reports a problem with the current instruction. The saved instruction pointer normally
  points at that instruction, allowing it to be tried again after the cause is repaired.
- A **trap** is reported after an instruction has executed. The breakpoint exception raised by
  `int3` is a trap, so its saved instruction pointer points after the one-byte `int3` instruction.

In this lesson, **trap** means that Intel exception subtype. It is not a general name for every
deliberate entry into the kernel.

A **hardware interrupt** is an asynchronous request from hardware such as a timer or network
device. The CPU recognizes it at an instruction boundary. Its timing comes from activity outside
the instruction currently running.

The **`int n` instruction** is a synchronous software instruction. It contains a vector number and
asks the CPU to enter the handler for that vector. It is often called a _software interrupt_, even
though its timing is determined by the program executing `int n`.

The **`syscall` instruction** is a separate fast entry path. It does not select an interrupt vector
and does not look up an entry in the interrupt descriptor table.

## Vectors and the interrupt descriptor table

An x86 **vector** is a number from 0 through 255 that identifies a cause. The **interrupt descriptor
table**, or **IDT**, has one descriptor for each vector. A descriptor tells the CPU where the
handler begins and what privilege checks and transitions apply.

Linux builds the IDT during boot. The privileged `lidt` instruction tells the CPU where the table
is. An ordinary ring-3 program can cause entries to be used, but it cannot replace the table.

Vectors 0 through 31 are reserved by the architecture for processor-defined exceptions and
interrupts. This table shows five selected exception vectors that explain common user-program
failures:

| vector | name  | subtype | one cause                                                                        |
| -----: | ----- | ------- | -------------------------------------------------------------------------------- |
|      0 | `#DE` | fault   | `div` or `idiv` has a zero divisor or an unrepresentable quotient                |
|      3 | `#BP` | trap    | the one-byte breakpoint instruction `int3`                                       |
|      6 | `#UD` | fault   | an invalid or unsupported instruction encoding; `ud2` requests this deliberately |
|     13 | `#GP` | fault   | a protection rule is broken, such as executing a disallowed `in` in ring 3       |
|     14 | `#PF` | fault   | a page is absent or forbids the attempted read, write, or instruction fetch      |

An attempt to execute bytes in a non-executable page therefore raises `#PF`. `#UD` describes bytes
that the processor decodes as an invalid or unsupported instruction.

Maskable external device interrupts are assigned vectors by the operating system and its
interrupt-controller setup. They commonly use vectors above 31. For an exception, a hardware
interrupt, or an allowed `int n`, the CPU saves return state and uses the selected IDT descriptor to
enter a handler. Kernel handlers commonly return with `iretq`, which restores the saved execution
state.

`syscall` follows different CPU rules. During boot, Linux places the kernel entry address and
related settings in x86 **model-specific registers**, or **MSRs**. `syscall` uses those settings
directly. If the requested service returns, Linux resumes the user program at the instruction after
`syscall`.

## How Linux turns an exception into a signal

The IDT leads to kernel code. A **signal** is a Linux notification delivered by the kernel to a
process or thread. It is an operating-system mechanism rather than an x86 vector.

When an exception comes from user mode, Linux first handles what it can. For example, a page fault
may tell Linux to provide a valid demand-loaded page and retry the instruction. If Linux cannot
resolve the cause, it commonly chooses a signal according to the exception and its details:

| CPU event | usual Linux signal for an unresolved user-mode cause | meaning in this case                                          |
| --------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| `#DE`     | `SIGFPE`                                             | integer division failed, despite the signal's historical name |
| `#UD`     | `SIGILL`                                             | the instruction encoding is invalid or unsupported            |
| `#BP`     | `SIGTRAP`                                            | the program reached a breakpoint instruction                  |
| `#PF`     | `SIGSEGV`                                            | the attempted memory access or instruction fetch is invalid   |
| `#GP`     | usually `SIGSEGV`                                    | the user program broke a protection rule                      |

Each signal has a **disposition**: an installed user handler, an ignored disposition where Linux
allows one, or a default action. Default actions vary by signal; they can terminate, terminate and
produce a core dump, stop, continue, or ignore a process. The normal default action for the fault
signals in the table is termination, with core-dump creation subject to system settings.

A program can ask Linux to install a signal handler. On delivery, Linux builds a signal frame in
user memory and resumes user mode at that handler. The handler is ordinary ring-3 code. The CPU's
original exception handler remains kernel code entered through the IDT.

Ctrl-C illustrates a different route. Keyboard hardware may first interrupt the kernel. The
terminal driver then interprets the configured interrupt character, commonly Ctrl-C, and Linux
sends `SIGINT` to the foreground process group. The process receives a Linux signal; it never
receives the keyboard's hardware interrupt.

## What faults look like in this playground

This playground runs the program in a user-mode environment and implements selected Linux system
calls. Its fault display is simpler than a real Linux process:

- No device generates a hardware interrupt.
- No Linux signal is delivered, and an installed signal handler will not run.
- A CPU fault ends the run silently. `rip` remains on the faulting instruction, and instructions
  after it do not execute.

Known register values make that last rule visible. This divide-by-zero fault leaves `r8` at
`0x1111` and `r9` at `0x2222`; the assignment after `div` is never reached.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov r8, 0x1111
    mov r9, 0x2222
    mov eax, 10
    xor edx, edx
    xor ecx, ecx
    div rcx                 ; #DE: the divisor is zero
    mov r9, 0x3333          ; never reached

    mov eax, 60
    xor edi, edi
    syscall
```

The next program stops on the load from `0x10`, which is outside this program's mappings. It leaves
the same sentinel values and parks `rip` on the `mov` that raises `#PF`.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov r8, 0x1111
    mov r9, 0x2222
    mov rax, [0x10]         ; #PF: no page is mapped here
    mov r9, 0x3333          ; never reached

    mov eax, 60
    xor edi, edi
    syscall
```

`ud2` is an instruction provided specifically to raise `#UD`. Here it stops the run on its own line
and leaves `r9` at its known value.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov r9, 0x2222
    ud2                     ; #UD
    mov r9, 0x3333          ; never reached

    mov eax, 60
    xor edi, edi
    syscall
```

The disallowed `in` from the previous lesson follows the same playground rule: it raises `#GP`,
stops on the `in`, and does not execute the following instruction.

## The complete unsigned `div` rule

For `div rbx`, the CPU treats `rdx:rax` as one 128-bit unsigned dividend. `rdx` is the high 64 bits
and `rax` is the low 64 bits. After a successful division, `rax` holds the quotient and `rdx` holds
the remainder.

`div rbx` raises `#DE` in either of these cases:

- `rbx` is zero.
- The quotient is larger than the 64 bits available in `rax`.

For a nonzero divisor, the quotient overflows exactly when the high half of the dividend is greater
than or equal to the divisor. For `div rbx`, that test is `rdx >= rbx`. A nonzero `rdx` can still be
valid when it is smaller than `rbx`.

This program makes the overflow condition certain. The first division leaves remainder 2 in
`rdx`. The second divisor is also 2, so its high half is greater than or equal to its divisor. The
second `div` raises `#DE`, `rip` stays there, and the sentinel values in `r8` and `r9` remain.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov r8, -1
    mov r9, -1

    mov eax, 100
    mov ebx, 7
    xor edx, edx
    div rbx                 ; rax = 14, rdx = 2

    mov eax, 200
    mov ebx, 2
    div rbx                 ; #DE because rdx (2) >= rbx (2)
    mov r8, rax             ; never reached
    mov r9, rdx             ; never reached

    mov eax, 60
    xor edi, edi
    syscall
```

When the intended dividend is the 64-bit value in `rax`, clear `rdx` before `div`. This makes the
high half zero, so every nonzero 64-bit divisor passes the overflow test. Code that intentionally
divides a full 128-bit value must instead ensure that its high half is smaller than the divisor.

## Check before dividing

A program can avoid `#DE` by checking a possibly zero divisor before `div`. This routine returns a
quotient in `r8` and 0 in `r9` on success. For a zero divisor it returns 0 in `r8` and 1 in `r9`.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov eax, 100
    xor ebx, ebx            ; zero divisor for this call
    call divide_checked

    mov eax, 60
    xor edi, edi
    syscall

divide_checked:
    xor r8d, r8d            ; failure quotient
    mov r9d, 1              ; begin with failure status
    test rbx, rbx
    jz .done

    xor edx, edx            ; dividend is the 64-bit value in rax
    div rbx
    mov r8, rax
    xor r9d, r9d            ; success status
.done:
    ret
```

The example reaches `exit` with `r8` equal to 0 and `r9` equal to 1. Changing `rbx` to 4 takes the
success path and produces `r8 = 25` and `r9 = 0`.

## Your turn

Complete `divide_checked`. It receives an unsigned 64-bit dividend in `rax` and a divisor in `rbx`.
Return the quotient in `r8` and 0 in `r9` when division succeeds. For a zero divisor, return 0 in
`r8` and 1 in `r9` without executing `div`.

The program calls your routine twice. It saves the successful result of `100 / 4` in `r12:r13`,
then leaves the failure result of `100 / 0` in `r8:r9`. Thus one test run observes both paths.

```x86|playground|exercise
default rel
global _start

section .text
_start:
    mov r8, -1
    mov r9, -1
    mov eax, 100
    mov ebx, 4
    call divide_checked
    mov r12, r8
    mov r13, r9

    mov r8, -1
    mov r9, -1
    mov eax, 100
    xor ebx, ebx
    call divide_checked

    mov eax, 60
    xor edi, edi
    syscall

divide_checked:
    ; your code here
    ret
```

```testcase
{
    "expectedRegisters": { "r8": 0, "r9": 1, "r12": 25, "r13": 0 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    mov r8, -1
    mov r9, -1
    mov eax, 100
    mov ebx, 4
    call divide_checked
    mov r12, r8
    mov r13, r9

    mov r8, -1
    mov r9, -1
    mov eax, 100
    xor ebx, ebx
    call divide_checked

    mov eax, 60
    xor edi, edi
    syscall

divide_checked:
    xor r8d, r8d
    mov r9d, 1
    test rbx, rbx
    jz .done

    xor edx, edx
    div rbx
    mov r8, rax
    xor r9d, r9d
.done:
    ret
```

</details>

The next program deliberately carries the remainder 2 into a division by 2. Without the missing
line, the second `div` raises `#DE` because its high half is equal to its divisor. Add one instruction
that makes the intended second dividend equal to the 64-bit value 200. A completed run must leave
100 in `r8` and 0 in `r9`.

```x86|playground|exercise
default rel
global _start

section .text
_start:
    mov r8, -1
    mov r9, -1

    mov eax, 100
    mov ebx, 7
    xor edx, edx
    div rbx                 ; rax = 14, rdx = 2

    mov eax, 200
    mov ebx, 2
    ; one instruction goes here
    div rbx
    mov r8, rax
    mov r9, rdx

    mov eax, 60
    xor edi, edi
    syscall
```

```testcase
{
    "expectedRegisters": { "r8": 100, "r9": 0 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    mov r8, -1
    mov r9, -1

    mov eax, 100
    mov ebx, 7
    xor edx, edx
    div rbx

    mov eax, 200
    mov ebx, 2
    xor edx, edx            ; high half of the intended dividend is zero
    div rbx
    mov r8, rax
    mov r9, rdx

    mov eax, 60
    xor edi, edi
    syscall
```

</details>
