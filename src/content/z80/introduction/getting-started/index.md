# Getting started with the Z80

The Z80 is a **CPU**: the part of a computer that follows instructions and does the work those instructions describe. Zilog introduced it in 1976, and it went on to power machines such as the ZX Spectrum, Amstrad CPC, and MSX computers. These machines looked and behaved differently, but programmers working on them all had to understand the same processor.

That is our starting point. Learning one small, well-defined CPU makes it possible to see what happens beneath a program: where a value is kept, how an instruction changes it, and how the next instruction gets its turn. You can begin here with ordinary computer experience; no assembly knowledge is assumed.

## What assembly is

A CPU follows **machine instructions**, stored as numbers in a computer's memory. **Assembly language** gives those instructions readable names. You write **source code** such as `ld a, 10`; an **assembler** translates it into the numbered instructions the CPU can run.

The Z80 is often called an **8-bit** CPU. A *bit* is a 0 or a 1, and eight bits make a *byte*. Many of the Z80's everyday operations work with one byte at a time. It also has **registers**, tiny places inside the CPU that hold values while it works. Memory holds more values and the program itself. Each place in memory has a number called an **address**, so the CPU can find it. An address identifies a place; the value at that place is its contents.

Assembly brings these small actions into view. A line might put a number in a register, add two values, or choose where the CPU goes next. Over this course, you will build from those actions to programs that work with memory, make decisions, repeat work, and communicate with the world around them.

## Meet the editor

This browser editor **emulates** the Z80: software carries out its instructions and lets you inspect the result. It gives us a place to explore the CPU without needing a vintage computer. A Z80 was used in many different machines, so a program for one machine's screen or keyboard would not automatically work on another's. Here we can begin with what they shared: the CPU.

The small program below adds 10 and 32. Try it as an experiment, not a syntax test. **Build** translates the source and reports any errors. **Run** executes it until `halt`. **Step** executes one instruction at a time, so you can watch a value change in the registers panel beside the program.

```z80|playground|no-flags
    .org 0x8000
    ld a, 10
    ld b, 32
    add a, b
    halt
```

The first line tells the assembler where to place this program in memory. The next two lines put numbers into registers named `a` and `b`. `add a, b` adds them and leaves 42 in `a`. The final line, `halt`, stops this editor's run. Registers are displayed in **hexadecimal**, a compact way to write numbers: the result appears as `2A`, which means 42 in the familiar decimal system. You can change 10 or 32, build again, and see what happens.

That small change is the heart of the course: write an instruction, run it, and look closely at what the CPU did. The names, number formats, and memory layout will become familiar as you use them.
