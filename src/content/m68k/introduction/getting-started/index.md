# Getting started with M68K

This course starts from ordinary computer literacy. Prior experience with assembly programming is
optional: every M68K idea used in the course is introduced here in the course itself.

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
language is reasonably easy to read. It makes the activity inside a computer concrete. The ideas
you meet here—processor instructions, temporary working storage, memory, decisions and reusable
pieces of code—also appear in modern computer systems.

## What assembly programming does

A processor executes **machine code**: instructions encoded as numbers for one particular kind of
processor. M68K machine code belongs to the M68K family, just as ARM machine code belongs to ARM
processors.

Writing those instructions directly as numbers would be difficult to read and maintain. **Assembly
language** gives the instructions short, human-readable names. A tool called an **assembler**
translates the assembly source into machine code that the processor can execute.

An assembly program describes work in small, explicit steps. A step might copy a value, perform a
calculation or choose which instruction should run next. Larger behaviour grows from these small
operations. Tasks that look simple in a high-level language become visible as a sequence of choices
made by the programmer.

At a high level, the parts fit together like this:

```text
assembly source  ->  assembler  ->  machine-code program
                                           |
                                           v
                                  processor <-> memory
```

The **processor** carries out the program's instructions. It has small working areas called
**registers** for values it needs immediately. **Memory** holds the program and a much larger amount
of data. The course's simulator lets you watch these parts change as a program runs, turning events
that are normally hidden inside a computer into something you can inspect.

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

## The journey through the course

You will begin by getting comfortable with the machine itself: its working storage, memory and the
basic vocabulary of its instructions. You will learn how the same stored data can represent
different kinds of values and how an instruction identifies the data it should use.

From there, you will combine instructions into useful behaviour. Comparisons and repetition lead to
programs that make decisions and process collections of data. Arithmetic and bit operations reveal
how the processor works with numbers at a fine level, while arrays and strings provide familiar
problems to solve.

The next stage is program structure. You will build reusable routines, pass information between
them and see how a program keeps track of work that is currently in progress. These ideas support
larger programs without hiding the machine underneath them.

Finally, programs will communicate with the world outside the processor. You will work with text,
input and graphics in the simulator, then examine how the processor responds when an event needs
special attention.

By the end, you will be able to read M68K assembly as a description of a running machine and write
programs that calculate, organize data, interact with input and produce visible results.
