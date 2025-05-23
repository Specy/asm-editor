This course is generalist, it covers topics that are commonly used in most assembly languages. It might feel a bit too
"rushed" as we will cover a lot of topics shallowly and quickly, it's ok if you don't understand everything, the individual
courses for each assembly language will go more in depth on all of the topics, and show you examples of how to use them.

The goal of the course is to give you a _general understanding_ of the fundamentals needed to understand assembly.

## Why assembly?

Programmers are often used to working with **code**, which is a _high-level abstraction_ that humans can easily
understand,
but that is **not** what the computer (or rather the CPU) actually executes.

CPUs are _"dumb"_, that is, they don't understand code, or meaning behind it, they only understand **numbers**, **zeros**, and **ones**, and can only perform a limited set of operations on them.

Those operations are called **"machine instructions"**, often basic operations like _addition_, _multiplication_,
or _moving data around_.
The goal of a programming language, regardless of its level, is to convert (or _"compile"_) the code you write into a
sequence of machine instructions that the CPU can execute — this is what we consider **"machine code"**.

Machine code is dependent on the **CPU architecture** (like _x86, ARM, RISC-V_, etc...), what we call the **"instruction
set architecture" (ISA).**

In concrete terms, instructions are represented as **binary numbers**, which are sequences of **0s and 1s**.
**Assembly languages** are a _human-readable_ representation of these binary instructions, to make it easier (or rather
possible) for humans to write and understand them.

## How CPUs run code

As we saw, CPUs only understand **machine code**, which is a sequence of binary numbers.

When you hear about **"Ghz/Mhz"** of a processor, that refers to the _amount of operations_ that the CPU can perform in
a second.
The steps that a CPU takes to execute a program are:

1. **Fetch**: The CPU _fetches_ the next instruction from memory (RAM) that it needs to execute.
2. **Decode**: The CPU _decodes_ the instruction to understand what operation it needs to perform.
3. **Execute**: The CPU _executes_ the instruction, performing the operation on the data it has.

We can call those 3 steps the **"fetch-decode-execute" cycle**, or **"instruction cycle"**.

Let's now try to understand how the CPU interprets numbers into instructions.
Let's write `d0 = 100` and `d7 = 200` in assembly. As an example, we pick the **M68K assembly language**, where it looks
like:
`moveq #100, d0` and `moveq #200, d7`.

This is the _human-readable_ representation of the instruction (assembly), but the CPU itself will only see the **binary
representation**, which is:

```mips
0111000001100100 # moveq #100, d0
0111111011001000 # moveq #200, d7
```

Which we can see as:

| OP Code | Destination | Padding |  Source  |
| :-----: | :---------: | :-----: | :------: |
|  0111   |     000     |    0    | 01100100 |
|  0111   |     111     |    0    | 11001000 |

The first 4 bits are the **OP code**, it tells the CPU what operation it needs to perform — in this case, `0111` is the
OP code for the `moveq` instruction.
Each instruction has its own **OP code**.

The next bits are dependent on the instruction itself. In this case, the next 3 bits tell us the **destination register**
(we will explain later what _registers_ are — pretend it's a variable for now), where `000` is the register `d0` and
`111` is the register `d7`.

Then there is a **padding** of 1 bit, which we can ignore, and the last 8 bits are the **source**, which is the value we
want to move into the register.
In this case:

- `01100100` is binary for **100**
- `11001000` is binary for **200**

During the **decode** step, the CPU will look at the **OP code** to understand what operation it needs to perform, and
the rest
of the instruction to understand what data it needs to work with.

You might have heard before about **"64-bit"** or **"32-bit"** CPUs — this refers to the _size of a single instruction_,
and how much data a CPU can process at once.

## Components of assembly languages and CPUs

CPUs (and assembly languages) mostly work with the same components, which are:

- **Registers**: _Small, fast storage locations_ within the CPU that hold data temporarily. They are used for quick
  access to frequently used values.
- **Memory**: _Larger storage area_ (RAM) where data and instructions are stored. Memory is slower than registers but
  can hold much more data.
- **Instruction Set Architecture (ISA)**: The set of instructions that a CPU can execute. Each instruction has a
  specific binary representation (**opcode**) and may operate on registers or memory.
- **Addressing Modes**: The ways in which the CPU can access data. Different addressing modes determine how the CPU
  interprets the operands of an instruction.
- **Flags**: _Special bits_ in the CPU that indicate the status of operations.
