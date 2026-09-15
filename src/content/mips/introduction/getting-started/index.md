Here is a whole MIPS program. Press **Build**, then **Run**, and look for `$t2` in the registers
panel on the right.

```mips|playground
.text
main:
    li $t0, 10          # put 10 in a register
    li $t1, 32          # put 32 in another one
    add $t2, $t0, $t1   # add those two, answer into a third
```

`$t2` holds 42. Three lines, and all three of them are the same shape: a name for the operation,
then the register that gets written, then whatever the operation reads. `li` means load immediate,
where **immediate** is the word for a number written into the instruction itself rather than fetched
from somewhere. `add` reads the two registers you named on the right and writes the sum to the one
on the left, leaving both sources exactly as they were.

The buttons under the editor are the whole interface. **Build** turns your text into instructions
and points the machine at the first of them. **Run** goes to the end. **Step** does one instruction
and stops, which is how you watch a register change. `pc` at the bottom of the registers panel is
the address of the instruction that runs next, and it starts at `0x00400000`, the address this
editor loads code at.

Notice that nothing in the program says "stop". A program ends here when there is no next
instruction, which is the end of what you wrote. Later, once `syscall` has been introduced, programs
will end by asking to be ended.

## The machine underneath

MIPS came out of John Hennessy's group at Stanford between 1981 and 1984 and was sold from 1985 as
the R2000. It ran Silicon Graphics workstations, the PlayStation and the Nintendo 64. The name
stands for Microprocessor without Interlocked Pipeline Stages, which is a claim about how the chip
was built rather than about how you write for it, and the part of that claim you will feel is this:
the designers kept the instruction set small and regular on purpose, and refused anything that made
one instruction harder to decode than another.

What you get is:

- **32 registers**, 32 bits wide, written with a `$` in front. They have numbers, `$0` to `$31`, and
  names, `$t0`, `$s0`, `$a0` and so on. Any of them can hold a number or an address.
- **`$zero`**, which is register `$0`. It answers 0 to every read, and a write to it is thrown away.
  That sounds useless and turns out to be one of the most used registers on the machine.
- **`hi` and `lo`**, two registers outside the 32 that only multiplication and division write.
- **Memory**, one long array of bytes, reached with a 32 bit address. This editor puts your code at
  `0x00400000`, your data at `0x10010000`, and starts the stack pointer at `0x7fffeffc`.

There is no MIPS chip in your browser. The editor assembles your text and then works through the
instructions one at a time, keeping the registers and the bytes of memory that a real chip would
keep, and showing you both. Printing, reading what you type and asking for the time all go through
one instruction, `syscall`, which the "Talking to the outside world" module covers. Until then a
program shows what it did by what it leaves in the registers and in memory.

## Three operands, destination first

Nearly every MIPS instruction names three registers: one to write and two to read. The destination
is always the **first** one, and the order of the other two matters for anything that is not
addition.

```mips|playground
.text
main:
    li $t0, 10
    li $t1, 3
    sub $t2, $t0, $t1       # 10 - 3
    sub $t3, $t1, $t0       # 3 - 10
    add $t4, $t0, $zero     # $zero always reads 0, so this is a copy of $t0
    li $t5, 7
    add $zero, $t5, $t5     # this write goes nowhere
    add $t6, $zero, $zero   # so $zero is still 0
```

`$t3` reads `FFFFFFF9` rather than anything that looks like minus seven. A register is 32 bits and
it has no minus sign in it, so negative numbers are stored by a convention the panel will unpick for
you: hover a value and it shows you both readings, the one that treats the top bit as a sign and the
one that does not. "Words, halves and bytes" is where that convention gets taken apart.

The last three lines are the part worth stepping through. The `add $zero, $t5, $t5` really is
carried out; the hardware computes 14 and then throws it away, because register `$0` cannot be
written. So `$t6` is still 0 on the line after.

`$zero` has no row in the registers panel, since a row that always reads `00000000` would tell you
nothing.

## How a program is written down

A line is a label, an instruction, a directive, a comment, or nothing at all.

- A **comment** starts at a `#` and runs to the end of the line.
- A **label** goes at the start of the line and ends with a colon: `main:`. It gives a name to the
  address of whatever comes next, code or data. The colon is not optional.
- A **directive** starts with a dot and is addressed to the assembler rather than to the CPU. `.text`
  opens a section of code and `.data` opens a section of data, which is why every program on this
  page begins with `.text`. ".data, .text and directives" goes through the rest of them.
- Everything else is **indented**, one instruction per line.
- **Case does not matter** in an instruction name. Register names are lower case.

A number written as an operand is just a number, with no marker in front of it, because an operand
that is a register already carries a `$`:

| written | means                 |
| ------- | --------------------- |
| `100`   | decimal 100           |
| `0x64`  | hex, the same 100     |
| `'d'`   | the ASCII code of `d` |

The assembler reads those three and nothing else, so `0b1100100` is a build error. Negative numbers
take an ordinary minus sign.

## Memory takes a load and a store

Exactly two kinds of instruction reach memory. A **load** copies a value from memory into a
register, and a **store** copies one the other way. Everything else in the machine works on
registers and nothing but registers, which means a number sitting in memory cannot be added to where
it lies.

So working on a value in memory is always three steps. Load it, work on it, store it back.

Build this one with the memory panel next to the editor, type `10010000` into its address box, then
Run.

```mips|playground|memory
.data
total:  .word 25

.text
main:
    li $t0, 100         # a number of our own
    la $t1, total       # the address of total, not the 25
    lw $t2, 0($t1)      # follow that address, read the word there
    add $t0, $t0, $t2   # 100 + 25
    sw $t0, 0($t1)      # write the answer back where the 25 was
```

The three middle lines are the ones to slow down on, because two of them mention `total` and
mean different things by it.

| after            | `$t1`        | `$t2` | word at `0x10010000` |
| ---------------- | ------------ | ----- | -------------------- |
| `la $t1, total`  | `0x10010000` | 0     | 25                   |
| `lw $t2, 0($t1)` | `0x10010000` | 25    | 25                   |
| `add`            | `0x10010000` | 25    | 25                   |
| `sw $t0, 0($t1)` | `0x10010000` | 25    | 125                  |

`la` is load address: it puts the address of the label into the register, and reads nothing. `lw` is
load word: it takes the address it is given, goes to memory, and brings back the four bytes it finds
there. The `0($t1)` is the only way a load or a store can name an address: a register holding a base
address, and a constant number of bytes to add to it. `4($t1)` is the next word along and `-4($t1)`
the one before.

## The panels

The **registers panel** lists all 32 by name, with `pc`, `hi` and `lo` under them. The **B**, **W**
and **L** buttons in its header cut each register into bytes, halves or one whole word, and hovering
a value shows what it is as a signed and as an unsigned number.

The **memory panel** shows the bytes at whatever address you type into it. `0x00400000` is your
code, `0x10010000` your data, and the stack sits at the top of the address space.

The **screen panel** is a grid of pixels a program draws on by writing to memory, set up by a
comment line beginning `# @screen`. The **console** below the editor is where a program prints. Both
of those need instructions that have not been introduced yet.

## Two to try

The test starts with 42 already in `$t0`. Leave the number 100 in `$t1`, and the sum of the two in
`$t2`.

```mips|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "$t0": "0x2A" },
    "expectedRegisters": { "$t1": 100, "$t2": "0x8E" }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
main:
    li $t1, 100             # the number itself
    add $t2, $t0, $t1       # both operands read, a third register written
```

</details>

The second one has a word holding 10 in memory at `value`. Add 32 to it, write the answer back to
the same place, and leave it in `$t0` as well.

```mips|playground|memory|exercise
.data
value:  .word 10

.text
main:
    # your code here
```

```testcase
{
    "expectedRegisters": { "$t0": 42 },
    "expectedMemory": [{ "type": "number-chunk", "address": "0x10010000", "bytes": 4, "expected": [42] }]
}
```

<details>
<summary>Show solution</summary>

```mips|playground|memory|solution
.data
value:  .word 10

.text
main:
    la $t1, value       # the address of the word
    lw $t0, 0($t1)      # the 10 itself
    addi $t0, $t0, 32   # addi adds a constant, no second register needed
    sw $t0, 0($t1)      # and back it goes
```

</details>
