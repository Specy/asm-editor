Let's start with the first component of assembly languages, **registers**.

Registers are _few_, _very small_ but **extremely fast** pieces of memory inside a CPU.

They are usually (depending on the CPU) between **8 and 32** in total, and can hold very few bits
(depends on the CPU, but usually _32-bit CPUs have 32-bit registers_, etc...), but they are **very fast to access** as they
are _physically inside the CPU_ itself — unlike memory, which is further away and _slower_ to access.

Each register has a **name** that identifies it.
For example, in **M68K** there are registers: `d0`, `d1`, ..., `d7`, `a0`, `a1`, ..., `a7`.

## General Purpose Registers

These are the most common type of registers and can be used for a wide variety of tasks, like storing data, addresses, etc...
Some architectures split this category further into:

- **Data registers** – they contain _numeric data_, like numbers, characters, etc...
- **Address registers** – they contain _addresses_ and are used by instructions that _indirectly access memory_
- **Floating point** – they contain _floating point numbers_
- _etc..._

## Special Purpose Registers

They are _special registers_ usually managed by the CPU itself and used for **specific purposes**, there will be a more in depth explaination
in future lectures.
