Every program in this course has left its answer in a register or in memory, and you read it in a
panel. A program that is any use has to do more: print a line, read what you typed, draw something,
open a file. None of those is arithmetic, and arithmetic, moving data and jumping are all a CPU can
do. There is no instruction that prints.

So the program asks somebody else to do it.

## Who it asks

On a real computer it asks the **operating system**, which is a program too, and one that was there
first: it loaded yours (we saw that in the lifecycle lecture) and it owns the screen, the keyboard
and the disk that your program wants.

It owns them because the CPU makes it own them. A CPU runs in one of two modes, and the names change
between architectures. In **user mode**, which is where your program runs, the instructions that
touch hardware are refused. In **supervisor mode**, also called kernel or privileged mode, they work.
So a program cannot write to the screen even if it knows exactly which address the screen is at,
which is the point: one program cannot take the machine down, and it cannot read what another
program is doing.

What is left to it is asking, and there is one instruction for that.

## How it asks

The instruction has a different name on every machine and the shape of the request is the same
everywhere. The program:

1. puts a **number** in an agreed register, saying which service it wants,
2. puts the **arguments** in other agreed registers, say the address of the string to print,
3. runs the one instruction that hands control over.

The CPU switches to supervisor mode, jumps to the piece of the operating system that was installed
for this, runs it, switches back, and carries on at the instruction after. If there is an answer, it
comes back in a register the two sides agreed on.

That instruction is a **trap** on some machines, a **software interrupt** on others, and the
**system call instruction** on the rest. The numbered thing you asked for is a **system call**, a
**service** or a **task**, depending on whose manual you are reading. They all describe the same
thing: the program asked, the environment did it.

| language | the instruction                           |
| -------- | ----------------------------------------- |
| M68K     | `trap`                                    |
| MIPS     | `syscall`                                 |
| RISC-V   | `ecall`                                   |
| x86      | `int` or `syscall`                        |
| Z80      | none, it uses ports, see the next lecture |

Those five words are the vocabulary you need to recognise a system call when you meet one. In M68K
the three steps come out like this:

```
    move.b #14, d0      ; the number: 14 is "print the string whose address is in a1"
    lea message, a1     ; the argument
    trap #15            ; hand over
```

What I want, what to work on, go. The other languages write the same three lines with different
names in them, and which names is what their own course is for.

## The numbers belong to the environment, not to the CPU

The CPU knows the instruction. It knows nothing whatsoever about the number 14. That number means
"print a string" because the environment on the other side decided it does, and for no other reason.

Change the environment and the numbers change under a program that has not changed at all. This is
why a program built for Linux does not run on Windows even on the same processor: every instruction
in it is valid, and the conversation it tries to have is with somebody who is not there.

The list of numbers, the registers each service reads, and where it leaves its answer are together
the environment's **calling convention**. That is the same term we used for subroutines, and the
same idea: two sides agreeing on where things go, with nothing in the hardware to enforce the
agreement.

## What this editor does

There is no operating system here. Each language imitates a simulator that already existed, and the
simulator answers the trap itself: what a program prints appears in the console panel, and what it
reads comes from the box under that panel. While a program waits for input the run is stopped in the
middle of that one instruction, which is exactly what happens on a real machine. A program that
reads a lot of input spends most of its life inside a system call.

The services on offer are much the same wherever you look, because programs want the same things:

- print a string, a number or a single character
- read a number, a character or a whole line
- ask for a block of memory
- ask what the time is, or to be left alone for a while
- end the program

That last one is worth knowing about now. On most environments a program has to say that it is
finished, because the CPU would otherwise carry straight on into whatever bytes follow it and try to
decode them as instructions.

Which number each of those is, and which register carries it, is exactly the sort of thing that
differs between languages, so it is taught in each language's own course rather than here.

The next lecture is the other way of reaching a device, where a program writes to an address and
nobody is asked at all.
