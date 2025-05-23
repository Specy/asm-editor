As we mentioned before, each processor has a different **Instruction Set Architecture (ISA)**, which is a set of instructions that the CPU can understand.

Each instruction is identified by an **OP code**, which is a **binary number** that tells the CPU what operation to perform.
To make it easier to understand, assembly languages convert this binary number into a human-readable format, which we call a _mnemonic_,
and is what we usually consider "_an instruction_".

## The assembler

The **assembler** can be seen similarly as a compiler that **converts the assembly code into machine code**.

The programmer writes code in assembly language, which then gets fed to the **assembler**, which will convert it into machine code.

Even though instructions often share the same structure, the way that **data is represented in each instruction can be different**.
The assembler hides this complexity from the programmer, who usually just needs to worry about **picking the right instruction** and
the **right operands**.

## Syntax of assembly languages

Most assembly languages follow the same syntax, which is:

```
<instruction mnemonic> <operand1>, <operand2>, ...
```

Where the **instruction mnemonic** is the name of the instruction we want to use, followed by a list (possibly even empty) of **operands**.
Each operand can be a **register**, **memory address**, **immediate value** (a constant value), etc.

Here are examples of adding two registers in different assembly languages:

```x86
# x86
add eax, ebx

# RISC-V
add a0, a1, a2

# MIPS
add $t0, $t1, $t2

# M68K
add d0, d1
```

## Labels, macros and directives

Assemblers also allow you to write _labels_, which are a way to **name a specific address in memory**, often used to
mark the position of a specific instruction. During assembly, the assembler will **replace the label with the actual address** of the instruction.

The assembler will also allow you to use _macros_ and _directives_.

- _Macros_ are a way to **define a sequence of instructions** that can be reused multiple times in the code.

- _Directives_ are **special instructions** that are **not executed by the CPU**, but are used by the **assembler** to control the assembly process.
  They can, for example, be used to **define constants**, **reserve space in memory**, or **include other files**.
