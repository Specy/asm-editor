## What a register is

A processor needs somewhere close by to keep the values it is working with. A **register** is one
of these small storage places inside the processor. There are far fewer registers than locations in
memory, but the processor can work with registers directly and quickly.

The basic 32-bit RISC-V design has 32 **integer registers**. Each one holds 32 bits: 32 binary digits
that can each be zero or one. A program can use that pattern of bits as a number, an address or
another kind of value.

Registers already exist and already have names. When writing assembly, you choose which register
will hold each value and keep track of that choice.

## Numbered names and aliases

The 32 integer registers have numbered names from `x0` through `x31`. RISC-V assembly also gives
them descriptive names such as `t0`, `s0` and `a0`.

These are two naming systems for the same set of registers. For example:

| numbered name | descriptive name |
| ------------- | ---------------- |
| `x0`          | `zero`           |
| `x5`          | `t0`             |
| `x8`          | `s0` or `fp`     |
| `x10`         | `a0`             |

An alternative name for the same thing is called an **alias**. `x5` and `t0` name one storage
place. If that register holds 12, reading either `x5` or `t0` gives 12. Replacing the value through
the name `t0` also replaces the value seen through the name `x5`.

The same applies to `x8`, which has two descriptive aliases. `x8`, `s0` and `fp` are three
accepted names for one register.

The descriptive names are often called the **ABI names**. An ABI is a set of conventions that helps
separately written parts of a program work together. The numbered name tells you which register it
is; the ABI name also suggests the job that register usually has.

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

The table gives each ABI name its conventional meaning. `t0` through `t6` are temporary registers:
programs commonly use them for values needed during a piece of work. Keep the table nearby when
you encounter the other names.

With one exception, these roles are agreements between programmers and tools. The processor allows
any ordinary register to hold a value. The group names make their conventional jobs visible when
you read a program.

## The register that is always zero

`x0`, also called `zero`, is the exception. Its behaviour is part of the processor design, not
just a naming convention:

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

The main ideas are simple: a register is a small storage place inside the processor, each integer
register has an `x` number, and its ABI name is an alias that suggests its conventional role.
`zero` is special because the processor guarantees that it always reads as 0.
