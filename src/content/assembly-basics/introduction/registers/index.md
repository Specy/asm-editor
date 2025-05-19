Let's start with the first component of assembly languages, **registers**.

Registers are *few*, *very small* but **extremely fast** pieces of memory inside a CPU.

They are usually (depending on the CPU) between **8 and 32** in total, and can hold very few bits
(depends on the CPU, but usually *32-bit CPUs have 32-bit registers*, etc...), but they are **very fast to access** as they
are *physically inside the CPU* itself — unlike memory, which is further away and *slower* to access.

Each register has a **name** that identifies it.
For example, in **M68K** there are registers: `d0`, `d1`, ... `d7`, `a0`, `a1`, ... `a7`.

## General Purpose Registers

These are the most common type of registers and can be used for a wide variety of tasks, like storing data, addresses, etc...
Some architectures split this category further into:

* **Data registers** – they contain *numeric data*, like numbers, characters, etc...
* **Address registers** – they contain *addresses* and are used by instructions that *indirectly access memory*
* **Floating point** – they contain *floating point numbers*
* *etc...*

## Special Purpose Registers

They are *special registers* usually managed by the CPU itself and used for **specific purposes**.

