## What RISC-V is

Every processor needs an agreed vocabulary of basic commands. That vocabulary is called an
**instruction set architecture**, usually shortened to **ISA**. It describes the operations a
processor understands and the rules software follows when using them.

RISC-V is one such ISA. It sits in the same broad category as Arm and x86: it is a specification
that processor designers can implement and software developers can target. It is not one
particular chip, computer or company. Two RISC-V processors can have very different prices, speeds
and uses while still following the same shared rules.

**RISC-V assembly** is the human-readable way to write commands from that instruction set.

## Where it came from

RISC-V began in 2010 as a research project at the University of California, Berkeley. The team
wanted an instruction set that was clean enough for teaching and research, but practical enough to
use in real processors. Existing instruction sets were often tied to particular companies, carried
decades of history, or could not be freely adapted for a new experiment.

The name is pronounced “risk-five.” **RISC** names the design family, and the Roman numeral **V**
marks it as the fifth major RISC instruction-set design from Berkeley. The project later grew far
beyond the university. Today, the standard is developed through RISC-V International, with
contributors from many organizations and countries.

## The RISC family

RISC stands for **reduced instruction set computer**. The name comes from a design tradition that
favours a relatively small, regular set of basic operations. More complicated work is built by
combining those operations.

“Reduced” does not mean that a RISC-V computer is only useful for simple jobs, nor does it tell you
how fast a particular processor will be. It describes the shape of the instruction set, not the
ambition of the programs that can run on it. RISC-V systems can range from tiny controllers to
machines capable of running a full operating system.

RISC-V also has a small common foundation that can be expanded for different needs. A simple device
can include the facilities it needs without carrying every feature of a larger computer.

## What “open” means

One reason RISC-V attracted so much interest is that its specification is an open standard. Anyone
can study it, write tools for it or design a compatible processor without paying for permission to
use the instruction set. Universities can experiment with it, companies can adapt processors for
particular products, and software projects can support all of those implementations through a
shared standard.

An open instruction set does not mean that every RISC-V product is open source. A company may keep
its chip design or other technology private. What remains open is the common specification that
says how RISC-V software and processors fit together.

## Where RISC-V is used

RISC-V was designed to cover more than one class of machine. You may encounter it in:

- small embedded controllers inside larger devices;
- development boards and computers that run operating systems such as Linux;
- university teaching and processor research; and
- custom processors built for a particular product or workload.

That range is part of what makes RISC-V interesting to learn. It is simple enough to study from the
ground up, and the same architectural ideas extend into real hardware and software systems.

## How this course is organized

The course begins with **32-bit RISC-V**. In this editor, choose **RISC-V**. Use **RISC-V 64** only
when a page specifically asks for it.

The material then develops in four stages:

1. **Introduction** presents the processor’s working storage areas, memory, instructions and the
   structure of an assembly file.
2. **Think in assembly** uses those pieces to express decisions, repetition, arithmetic, arrays,
   text and reusable parts of a program.
3. **Talking to the outside world** explains how a simulated program communicates with its
   environment, including text input and output, a screen and a keyboard.
4. **Examples** brings the ideas together in complete programs, starting small and building toward
   games and familiar algorithms.

The editor provides a RISC-V simulator, so you can run the course programs in the browser and
inspect what changes as a program runs.

RISC-V is an open, modern instruction set from the RISC family: a practical computing platform and
a clear way to study what processors do.
