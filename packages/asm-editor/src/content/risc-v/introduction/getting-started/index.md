## What RISC-V is

A processor executes basic commands called **instructions**. An **instruction set architecture**,
usually shortened to **ISA**, defines those instructions and the rules software follows when using
them.

RISC-V is one such ISA, as are Arm and x86. Processor designers use its specification to build
chips, and software developers use it to write programs for those chips. RISC-V names the
architecture rather than a particular chip, computer or company. Two RISC-V processors can have
very different prices, speeds and uses while following the same specification.

**RISC-V assembly** is the human-readable way to write commands from that instruction set.

## Where it came from

RISC-V began in 2010 as a research project at the University of California, Berkeley. The team
wanted an instruction set they could use for teaching and research and implement in real
processors. Existing instruction sets were often tied to particular companies, carried
decades of history, or could not be freely adapted for a new experiment.

The name is pronounced “risk-five.” **RISC** names the design family, and the Roman numeral **V**
marks it as the fifth major RISC instruction-set design from Berkeley. The project later grew far
beyond the university. Today, the standard is developed through RISC-V International, with
contributors from many organizations and countries.

## The RISC family

RISC stands for **reduced instruction set computer**. The name comes from a design tradition that
favours a relatively small, regular set of basic operations. More complicated work is built by
combining those operations.

The word “reduced” describes the instruction set. It does not limit the complexity of a program
or tell you how fast a processor will run it. RISC-V systems range from tiny controllers to
machines capable of running a full operating system.

RISC-V also has a small common foundation that can be expanded for different needs. A simple device
can include the facilities it needs without carrying every feature of a larger computer.

## What “open” means

The RISC-V specification is an open standard. Anyone can study it, write tools for it or design
a compatible processor without paying for permission to use the instruction set. Universities can
experiment with it, companies can adapt processors for particular products, and software projects
can support all of those implementations through a shared standard.

An open instruction set does not mean that every RISC-V product is open source. A company may keep
its chip design or other technology private. What remains open is the common specification that
says how RISC-V software and processors fit together.

## Where RISC-V is used

RISC-V was designed to cover more than one class of machine. You may encounter it in:

- small embedded controllers inside larger devices;
- development boards and computers that run operating systems such as Linux;
- university teaching and processor research
- custom processors built for a particular product or workload.

## How this course is organized

The course begins with **32-bit RISC-V**. In this editor, choose **RISC-V**. Use **RISC-V-64** only
when a page specifically asks for it.

The course has four modules:

1. **Introduction** introduces registers, the processor’s working storage, along with memory,
   instructions and the structure of an assembly file.
2. **Think in assembly** uses those pieces to express decisions, repetition, arithmetic, arrays,
   text and reusable parts of a program.
3. **Talking to the outside world** explains how a simulated program communicates with its
   environment, including text input and output, a screen and a keyboard.
4. **Examples** brings the ideas together in complete programs, starting small and building toward
   games and familiar algorithms.

You can run the course programs in the browser using the editor’s RISC-V simulator and inspect
what changes as each program runs.
