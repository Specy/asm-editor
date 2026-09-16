Start with one visible change. This program puts the number 42 in a register, a small storage
location inside the CPU.

```mips|playground
.text
main:
    li $t0, 42
```

Press **Build**, then find `$t0` in the registers panel. Before running the instruction, predict
what will appear there. Press **Step** once: `$t0` now holds 42.

The instruction `li $t0, 42` reads from left to right: `li` is the operation, `$t0` is the register
it changes, and `42` is the value it puts there. For this first run, you can treat `.text` and
`main:` as the small program's setup. Their exact roles will become useful when programs have more
parts.

**Build** translates the assembly text into instructions the processor can execute. **Step** runs
one instruction and pauses, which lets you connect a line of source code with a change in the
machine. **Run** continues through all remaining instructions. Stepping is especially useful while
you are learning because every result has a concrete cause you can inspect.

## What MIPS is

A processor needs a defined set of instructions and rules. Together, those rules form an
**instruction set architecture**, or ISA. MIPS is an ISA and a family of processors that implement
it. MIPS assembly expresses its machine instructions with readable names, so people can write and
discuss them without working directly with encoded bit patterns.

MIPS began as a research project led by John Hennessy at Stanford University in the early 1980s.
It became an influential example of **RISC**, a design approach built around a relatively small set
of straightforward instructions. Commercial MIPS processors later appeared in Silicon Graphics
workstations and game consoles including the original PlayStation and Nintendo 64.

## Why learn MIPS?

MIPS keeps many actions simple and visible. Values are held in registers, data in memory is moved
explicitly, and decisions use branches and jumps. Its instructions follow a few regular patterns,
although different jobs use different forms. This makes MIPS a good setting for seeing how a
program changes processor state one instruction at a time.

The course will build outward from the change you just observed. You will learn how MIPS names its
registers, organizes source code, works with memory, performs calculations, makes decisions, and
combines those pieces into complete programs. Keep using the same habit as the program above:
predict a change, step once, and compare the visible result with your prediction.
