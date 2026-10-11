# Getting started with x86

This course is about **x86-64**, the 64-bit form of x86. x86 is an **instruction-set architecture**:
the family of instructions that a processor understands. An **assembly language** is a readable way
to write those small machine instructions. You already know the general ideas behind instructions,
registers, memory, and control flow. Here you will meet the particular names and habits of the x86
family.

x86 is a long-lived design. It began with Intel's 8086 processor in 1978, grew from 16 to 32 bits in
the 1980s, and gained its 64-bit form through an AMD design introduced in 2003. Newer processors
kept much of the older design working. That history is why familiar-looking old names still appear
inside modern x86-64 programs: compatibility is part of the architecture, not just trivia about it.

## Why learn it?

x86-64 is common in personal computers, servers, virtual machines, and the tools that support them.
Knowing it makes compiled programs less mysterious: you can inspect what a compiler produced,
follow a debugger, understand performance-sensitive code, and see how an operating system and a
program meet.

Assembly also gives you a direct view of a program's work. You choose instructions, keep track of
values, and follow the changes one instruction at a time. The programs in this course stay small so
that view remains useful.

## The tools in this course

You will write source code in **NASM syntax**. NASM is an assembler: it turns the instruction text
you write into machine code. Another spelling, called AT&T syntax, appears in some online examples
and tools, so a line of x86 found elsewhere may look different while describing the same processor.

The editor runs the assembled programs with **blink**, in a Linux-style environment. This matters
because a program is more than a sequence of calculations: it starts as a process, has a place for
its code and data, and can ask the surrounding system to do useful work. The editor lets you build a
program, run it, and inspect its state as it executes.

## A first look

Here is a complete, runnable program. The lines around the middle are a program template; for now,
use the three arithmetic lines as the part to observe. Build and run it, then find `42` in `rbx` in
the registers panel.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov rax, 10
    mov rbx, 32
    add rbx, rax

    mov rax, 60
    mov rdi, 0
    syscall
```

`mov` puts the two numbers in processor registers, small storage locations inside the CPU. `add`
combines them, leaving the result in `rbx`. The template gives the program the shape needed to run
in this environment; its individual lines will become familiar through the course.

## The route ahead

The introduction establishes the x86-64 building blocks: registers and memory, how values are
represented, the instruction set, addresses, flags, and the layout of a source file.

After that, the course has three main parts:

- **Think in assembly** develops comparisons, branches, loops, arithmetic, data structures, the
  stack, and subroutines into complete program logic.
- **Talking to the outside world** shows how an x86 program works with Linux and the wider machine.
- **Examples** brings the pieces together in practical programs, from moving data and working with
  arrays to recursion, sorting, searching, and printing.

By the end, you will be able to read and write compact x86-64 programs with a clear sense of what
each instruction asks the machine to do.
