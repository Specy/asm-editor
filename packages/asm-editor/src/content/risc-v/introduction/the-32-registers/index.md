## What a register is

A **register** is a small storage place inside the processor. The processor uses registers to hold
the values it is working with. There are far fewer registers than locations in memory, but the
processor can work with registers directly and quickly.

The basic 32-bit RISC-V design has 32 **integer registers**. Each one holds 32 bits: 32 binary digits
that can each be zero or one. A program can use that pattern of bits as a number, an address or
another kind of value.

When writing assembly, you choose which register will hold each value. You use the register's name
to refer to that value in your instructions.

## Numbered names and aliases

The 32 integer registers have numbered names from `x0` through `x31`. RISC-V assembly also gives
them descriptive names such as `t0`, `s0` and `a0`.

Each descriptive name refers to one of the numbered registers:

| numbered name | descriptive name |
| ------------- | ---------------- |
| `x0`          | `zero`           |
| `x5`          | `t0`             |
| `x8`          | `s0` or `fp`     |
| `x10`         | `a0`             |

An alternative name for the same thing is called an **alias**. `x5` and `t0` name the same register.
If you store 12 in `t0`, reading either `x5` or `t0` gives 12. If you then store a different value in
`x5`, reading `t0` gives that new value too.

The same applies to `x8`, which has two descriptive aliases. `x8`, `s0` and `fp` are three
accepted names for one register.

The descriptive names are often called the **ABI names**. An ABI is a set of conventions that helps
separately written parts of a program work together. These conventions include agreements about
which registers hold which values. The numbered name identifies the register, and the ABI name
suggests its usual job.

## The complete register table

Use this table as a lookup when you meet an unfamiliar register name. You do not need to memorize
it.

| numbered name | ABI name(s) | conventional role                           |
| ------------- | ----------- | ------------------------------------------- |
| `x0`          | `zero`      | always reads as zero                        |
| `x1`          | `ra`        | return address                              |
| `x2`          | `sp`        | stack pointer                               |
| `x3`          | `gp`        | global pointer                              |
| `x4`          | `tp`        | thread pointer                              |
| `x5`-`x7`     | `t0`-`t2`   | temporary values                            |
| `x8`          | `s0` / `fp` | saved value; also an optional frame pointer |
| `x9`          | `s1`        | saved value                                 |
| `x10`-`x11`   | `a0`-`a1`   | arguments and return values                 |
| `x12`-`x17`   | `a2`-`a7`   | arguments                                   |
| `x18`-`x27`   | `s2`-`s11`  | saved values                                |
| `x28`-`x31`   | `t3`-`t6`   | temporary values                            |

`t0` through `t6` are temporary registers, commonly used to hold values during a calculation.
Names such as "stack pointer" and "return address" describe other jobs that registers have when
parts of a program work together. You can look up those names here as you learn to use them.

With one exception, the processor does not enforce the roles in the table. Programmers and tools
follow these conventions so that each part of a program knows where to find the values it needs.

## The register that is always zero

`x0`, also called `zero`, is the exception. Its behaviour is part of the processor design:

- Reading `zero` always gives 0.
- Trying to replace its value has no effect. The new value is discarded.

For example, imagine that a program tries to place 99 in `x0`. Reading either `x0` or `zero`
afterwards still gives 0. A program can use this guaranteed zero as an input or discard a result by
placing it in `zero`.

Do not assume that the other registers begin at zero. Their starting values depend on the system
running the program. Only `x0` is guaranteed by RISC-V to read as zero at all times.

## Check the names

Use the table to answer these questions:

1. If `t0` holds 37, what value does `x5` hold?
2. A value is placed in `x8`. Which two descriptive names refer to that same value?
3. What are the descriptive names for `x18` and `x19`?
4. A program tries to replace the value in `zero` with 8. What will the next read from `x0`
   produce?

<details>
<summary>Show answers</summary>

1. `x5` holds 37 because `x5` and `t0` are aliases for one register.
2. `s0` and `fp` both refer to `x8`.
3. `x18` is `s2`, and `x19` is `s3`.
4. It produces 0. A value written to `zero` is discarded.

</details>
