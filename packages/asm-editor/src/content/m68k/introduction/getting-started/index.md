# Getting started with M68K

You only need basic computer skills to start this course. You do not need experience with assembly
programming: the course introduces each M68K concept as you need it.

## Meet the Motorola 68000

Motorola introduced the 68000 processor in 1979. It became the first member of a family often
called **M68K**, short for Motorola 68000. Versions of this family powered many well-known systems,
including the original Apple Macintosh, the Commodore Amiga, the Atari ST and the Sega Mega Drive
(called the Genesis in North America).

Those machines did very different jobs with closely related processors. A Macintosh used its
processor to run a graphical personal computer; a Mega Drive used one to run games. In each case,
the processor followed a sequence of small instructions and worked with values stored inside the
machine.

The 68000 remains a useful processor to study because its design is regular and its assembly
language is reasonably easy to read. You can follow how individual instructions change values in
registers and memory. The ideas you meet here—processor instructions, registers, memory, decisions
and reusable pieces of code—also appear in modern computer systems.

## What assembly programming does

A processor executes **machine code**: instructions encoded as numbers for one particular kind of
processor. M68K machine code belongs to the M68K family, just as ARM machine code belongs to ARM
processors.

Writing those instructions directly as numbers would be difficult to read and maintain. **Assembly
language** gives the instructions short, human-readable names. A tool called an **assembler**
translates the assembly source into machine code that the processor can execute.

An assembly program describes work in small, explicit steps. A step might copy a value, perform a
calculation or choose which instruction should run next. You combine these small operations to
build larger programs. For a task that takes one statement in a high-level language, you may need
to choose and write several assembly instructions.

At a high level, the parts fit together like this:

```text
assembly source  ->  assembler  ->  machine-code program
                                           |
                                           v
                                  processor <-> memory
```

The **processor** carries out the program's instructions. It has small working areas called
**registers** for values it needs immediately. **Memory** holds the program and a much larger amount
of data. In the simulator, you can watch the values in registers and memory change as a program
runs.

## Why learn at this level?

Assembly rewards careful thinking. You decide where values are kept, which operation happens now
and where execution continues afterward. That makes several everyday computing ideas easier to
understand:

- how programs become instructions a processor can execute;
- how data is represented and moved through a machine;
- how decisions, loops and function calls are built from simple operations;
- how software communicates with hardware and its surrounding system.

This perspective is useful when debugging difficult problems, studying compilers, working with
embedded systems or simply learning what higher-level languages arrange on your behalf.

## What you will learn

You will begin by getting comfortable with the machine itself: its registers, memory and the
basic vocabulary of its instructions. You will learn how the same stored data can represent
different kinds of values and how an instruction identifies the data it should use.

From there, you will combine instructions into programs. Comparisons and repetition lead to
programs that make decisions and process collections of data. Arithmetic and bit operations show
how the processor calculates with numbers and changes individual bits. You will also work with
arrays and strings.

The next stage is program structure. You will build reusable routines, pass information between
them and see how a program keeps track of work that is currently in progress. You will use these
routines to organize larger programs.

Finally, programs will communicate with the world outside the processor. You will work with text,
input and graphics in the simulator, then examine how the processor responds when an event needs
special attention.

By the end, you will be able to read M68K assembly as a description of a running machine and write
programs that calculate, organize data, interact with input and produce visible results.
