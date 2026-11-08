# Getting started with the Z80

The Z80 is a **CPU**: the part of a computer that follows instructions and does the work those instructions describe. Zilog introduced it in 1976, and it went on to power machines such as the ZX Spectrum, Amstrad CPC, and MSX computers. These machines looked and behaved differently, but programmers working on them all had to understand the same processor.

In this course, you will learn where the Z80 keeps values, how an instruction changes them, and how the CPU chooses which instruction to run next. You can begin here with ordinary computer experience. You do not need to know assembly language.

## What assembly is

A CPU follows **machine instructions**, stored as numbers in a computer's memory. **Assembly language** gives those instructions readable names. You write **source code** such as `ld a, 10`; an **assembler** translates it into the numbered instructions the CPU can run.

The Z80 is often called an **8-bit** CPU. A _bit_ is a 0 or a 1, and eight bits make a _byte_. Many of the Z80's everyday operations work with one byte at a time. It also has **registers**, tiny places inside the CPU that hold values while it works. Memory holds more values and the program itself. Each place in memory has a number called an **address**, so the CPU can find it. An address identifies a place; the value at that place is its contents.

Assembly brings these small actions into view. A line might put a number in a register, add two values, or choose where the CPU goes next. Over this course, you will build from those actions to programs that work with memory, make decisions, repeat work, and communicate with the world around them.

## Meet the editor

This browser editor **emulates** the Z80: software carries out its instructions and lets you inspect the result. It gives us a place to explore the CPU without needing a vintage computer. A Z80 was used in many different machines, so a program for one machine's screen or keyboard would not automatically work on another's. Here we can begin with what they shared: the CPU.

The small program below adds 10 and 32. You will learn its syntax as you work through the course. For now, try running it and watching the registers. **Build** translates the source and reports any errors. **Run** executes it until `halt`. **Step** executes one instruction at a time, so you can watch a value change in the registers panel beside the program.

```z80|playground|no-flags
    .org 0x8000
    ld a, 10
    ld b, 32
    add a, b
    halt
```

The first line tells the assembler where to place this program in memory. The next two lines put numbers into registers named `a` and `b`. `add a, b` adds them and leaves 42 in `a`. The final line, `halt`, stops this editor's run. Registers are displayed in **hexadecimal**, a compact way to write numbers: the result appears as `2A`, which means 42 in the familiar decimal system. You can change 10 or 32, build again, and see what happens.

Throughout the course, you will write instructions, run them, and inspect what the CPU did. The names, number formats, and memory layout will become familiar as you use them.
