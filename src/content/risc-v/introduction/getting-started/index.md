## The machine

**RISC-V** is an instruction set. It was started in May 2010 at the University of California,
Berkeley, by Krste Asanović with Yunsup Lee and Andrew Waterman, and it was the fifth RISC design to
come out of that group, which is where the number in the name comes from. Anybody may build a chip
that implements it without paying anyone for a licence, and since 2015 the specification has been
looked after by an organisation of its members rather than by a single company.

What you get:

- **32 registers**, 32 bits each. Every one of them has two names: a number, `x0` to `x31`, and a
  working name, `zero`, `ra`, `sp`, `a0`, `t0`, `s0` and so on. `t0` and `x5` are two spellings of
  the same register, and this course uses the names.
- **`zero`**, which is `x0`. It always reads 0 and writing to it does nothing at all. You are
  allowed to name it anywhere, and it will keep answering 0.
- **Memory**, one long array of bytes reached by a 32 bit address. This editor puts your code at
  `0x00400000`, your data at `0x10010000`, and starts the stack pointer at `0x7FFFEFFC`.
- **Branches that compare for themselves.** There is no status register holding the result of the
  last comparison. A branch instruction names the two registers it wants compared and jumps or does
  not jump, all in one go. That has a lecture of its own later.

RISC-V is a **load/store architecture**, which means arithmetic works on registers and only on
registers. The only two instructions that go anywhere near memory are the load and the store:
`lw t0, 0(t1)` fetches a word into a register, `sw t0, 0(t1)` puts one back. There is no `add` that
reaches into memory, so a number in memory always makes the same round trip in and out.

It is also **little endian**. The lowest byte of a number sits at the lowest address, so a word you
wrote as `0x12345678` shows up in memory as `78 56 34 12`.

The last thing to know before you write a line of it: RISC-V is **a small base plus extensions**.
The base is called **RV32I**, it is about forty instructions, and it has no multiplication and no
division in it at all. `mul`, `div` and `rem` come from the **M extension**, a named group of
instructions a chip may or may not have, and which this assembler accepts. "The RISC-V instruction
set" is the lecture that goes through the letters.

## The simulator

There is no RISC-V chip in your browser. There is a simulator, and it runs the same 32 bit RISC-V
your program would be assembled for on real hardware. Printing, reading input and asking for the
time all go through one instruction, `ecall`, which the "Talking to the outside world" module
covers. Until then a program shows what it did in the registers and in memory.

RISC-V comes in a 32 bit and a 64 bit form, and the editor treats them as two separate languages.
**RISC-V** is the 32 bit one, and it is what every page of this course uses apart from "Going
64-bit". You pick one of the two when you create a project, and a program written for one does not
always assemble in the other.

## How a program is written down

A line is a label, an instruction, a directive, a comment, or nothing at all.

- A **comment** starts at a `#` and runs to the end of the line.
- A **label** goes at the start of the line and ends with a colon: `main:`. It is a name for the
  address of whatever comes next, code or data alike. The colon is required, and a label may not be
  spelled the same as a register, so `s1:` will not build and `sum:` is fine.
- A **directive** starts with a dot and is addressed to the assembler rather than to the processor.
  `.data` and `.text` open the two sections, `.word` writes data, `.space` reserves room. They get a
  lecture of their own.
- Everything else is **indented**, one instruction per line. Four spaces is what this course uses.
- **Case does not matter** for instruction names, so `ADD` and `add` are the same instruction.
  Register names are lower case only, and `T0` will not build.

Numbers can be written three ways, and none of them takes a marker in front, since a `#` would start
a comment:

| written | means                 |
| ------- | --------------------- |
| `100`   | decimal 100           |
| `0x64`  | hex, the same 100     |
| `'d'`   | the ASCII code of `d` |

There is no binary literal, so `0b1100100` does not assemble. Negative numbers are written with a
minus, `-1`.

## Your first program

Two numbers into registers, and add them. Press **Build**, then **Run**, and read `t2` in the
registers panel.

```riscv|playground
.text
main:
    li t0, 10
    li t1, 32
    add t2, t0, t1      # read t0 and t1, write t2
```

`li t0, 10` is load immediate: put the number 10 into `t0`. "Immediate" is the word for a number
written into the instruction itself rather than fetched from anywhere, and you will see it a lot.
`add t2, t0, t1` reads the two registers on the right, adds them, and writes the answer into the one
on the left. Neither `t0` nor `t1` is touched.

**Build** assembles what you wrote and points the simulator at the first instruction, **Run** runs
the whole program, and **Step** does one instruction at a time. The `pc` register at the bottom of
the panel holds the address of the instruction that runs next, and it starts at `0x00400000`.

Nothing in the program says "stop". The simulator ends a run when there is no next instruction,
which here is the end of what you wrote. A real RISC-V program ends by asking the outside world to
end it, with an `ecall`.

## Three operands, destination first

Nearly every instruction names three registers: the one it writes and the two it reads. The one it
writes comes **first**, and nothing is overwritten unless you name it there. The order of the other
two matters for anything that is not addition.

```riscv|playground
.text
main:
    li t0, 10
    li t1, 3
    sub t2, t0, t1      # 10 - 3
    sub t3, t1, t0      # 3 - 10
    add t4, t0, zero    # a copy of t0, since zero always reads 0
    li t5, 7
    add zero, t5, t5    # this write goes nowhere
    add t6, zero, zero  # so zero is still 0
```

`t3` comes out at `FFFFFFF9`, which is -7. The bits of a negative number are worth a lecture on
their own and get one; for now, the point is that the two source registers are not interchangeable.

`add t4, t0, zero` is how a value moves from one register to another: add nothing to it and put the
result somewhere else. There is no separate copy instruction underneath; this is it.

The last two lines are there to be watched. `add zero, t5, t5` really does run, the processor really
does work out 14, and then it throws the answer away because the destination is `zero`. Nothing
warns you. A destination register you did not mean to write is one of the quieter bugs available to
you here.

`zero` is not in the registers panel, since a row that always reads `00000000` would tell you
nothing.

Naming the same register as a source and as the destination is allowed and common: write
`add t0, t0, t1` and the answer lands on top of the 10 that was in `t0`. That is how a running total
is kept.

## Memory needs a load and a store

A number in memory cannot be added to anything. To work on it you load it into a register, do the
arithmetic there, and store it back. Build this one with the memory panel beside it and `10010000`
typed into its address box, then Run.

```riscv|playground|memory
.data
total: .word 25

.text
main:
    li t0, 100
    la t1, total        # the address of total, not the 25
    lw t2, 0(t1)        # the word stored at that address
    add t0, t0, t2
    sw t0, 0(t1)        # and back where it came from
```

`la t1, total` is load address, and the difference between it and a load is the whole lesson of this
section. `la` puts the **address** `10010000` into `t1`. `lw t2, 0(t1)` goes to that address and
brings back what is there, the 25. A label on its own means an address; getting at the value costs
an instruction.

After the `sw`, the four bytes at `0x10010000` read `7D 00 00 00`, which is 125 stored the little
endian way round.

`0(t1)` is the only form a load or a store has: one register, plus a fixed number of bytes. The
number is an offset in bytes, so `4(t1)` is the next word along and `-4(t1)` is the one before it.

## The panels

The **registers panel** lists the registers by their working names, with `pc` under them, and leaves
`zero` out. The **B**, **W** and **L** buttons in its header cut each register into bytes, halves or
one whole word, and hovering over a value shows you its signed and unsigned readings.

The **memory panel** shows the bytes at whatever address you type into it. `0x00400000` is your
code, `0x10010000` is your data, and the stack is up at the top of the address space.

The **screen panel** is a grid of pixels that a program draws on by writing to memory, and a comment
line beginning `# @screen` says how big it is and where it lives. The **console** below the editor
is where a program prints. Both of those wait for later modules.

## Your turn

The test starts `t0` at `0x2A`, which is 42. Leave the number 100 in `t1`, and `t0` plus 100 in
`t2`, which comes out at `0x8E`.

```riscv|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "t0": "0x2A" },
    "expectedRegisters": { "t1": 100, "t2": "0x8E" }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
main:
    li t1, 100          # the number itself
    add t2, t0, t1      # both operands read, a third register written
```

</details>

The second one has a word holding 10 at `value`, which the `.data` section puts at `0x10010000`. Add
32 to it, write the answer back to the same place and leave it in `t0` as well.

```riscv|playground|memory|exercise
.data
value: .word 10

.text
main:
    # your code here
```

```testcase
{
    "expectedRegisters": { "t0": 42 },
    "expectedMemory": [{ "type": "number-chunk", "address": "0x10010000", "bytes": 4, "expected": [42] }]
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|memory|solution
.data
value: .word 10

.text
main:
    la t1, value        # the address
    lw t0, 0(t1)        # the value there
    addi t0, t0, 32
    sw t0, 0(t1)        # put it back
```

</details>
