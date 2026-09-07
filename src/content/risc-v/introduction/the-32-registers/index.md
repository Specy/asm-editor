Getting started said RISC-V has 32 registers, all 32 bits wide, and that each of them has two names.
The hardware knows one thing about them, that `x0` reads 0. Everything else on this page is a
**convention**: a set of names people agreed on, which the assembler and every compiler follow, and
which nothing in the machine enforces.

## The numbers and the names

The number, `x0` to `x31`, is what goes into the instruction. The **ABI name** is the assembler's,
and it says what the register is for, so `t0` and `x5` are two spellings of one register and only
the second of them is in the machine code.

| number      | ABI name    | what it is for                                     |
| ----------- | ----------- | -------------------------------------------------- |
| `x0`        | `zero`      | always reads 0                                     |
| `x1`        | `ra`        | return address, written by `jal`                   |
| `x2`        | `sp`        | stack pointer                                      |
| `x3`        | `gp`        | global pointer                                     |
| `x4`        | `tp`        | thread pointer                                     |
| `x5`-`x7`   | `t0`-`t2`   | temporaries, which a subroutine may destroy        |
| `x8`        | `s0` / `fp` | saved, and the frame pointer, under two names      |
| `x9`        | `s1`        | saved, which a subroutine must give back unchanged |
| `x10`       | `a0`        | the first argument, and the first return value     |
| `x11`       | `a1`        | the second argument, and the second return value   |
| `x12`-`x17` | `a2`-`a7`   | the third to the eighth argument                   |
| `x18`-`x27` | `s2`-`s11`  | eight more saved registers                         |
| `x28`-`x31` | `t3`-`t6`   | four more temporaries                              |

Build this one and step through it. Every line names a register twice over, once by number and once
by name.

```riscv|playground
.text
main:
    li t0, 5
    add x5, x5, x5      # x5 is t0, so this doubles it
    li x6, 7            # x6 is t1
    add t2, t1, t1      # so this reads the 7 that line put there
    li fp, 42           # fp is x8
    mv t3, s0           # and s0 is the same register
    mv t4, x2           # x2 is sp
    mv t5, sp           # the same register under its other name
```

`t0` comes out at 10, `t1` at 7 and `t2` at 14, because `x5` and `x6` wrote the two registers `t0`
and `t1` name. `s0` and `t3` are both 42, since `fp` and `s0` are `x8` under two ABI names, and `t4`
and `t5` are both `7FFFEFFC`, the stack pointer read twice under its two spellings.

Writing register numbers is legal and unreadable, and the reason to know it is that a RISC-V
instruction has five bits per register field and no idea what a `t0` is. Five bits is 32 values,
which is exactly why there are 32 registers and no more.

## zero, the one that reads 0

`zero` is the one thing the hardware treats specially. It answers 0 to every read, and every write
to it is carried out and thrown away.

That sounds like a wasted register until you count what it saves. A machine with a register that is
always 0 needs no move instruction, no negate, no clear, no compare with zero, no unconditional jump
and no return, because all of them are the general instruction with `zero` in one operand. The
assembler gives you the short names and writes the real instruction underneath:

| you write        | the assembler writes  |
| ---------------- | --------------------- |
| `mv t1, t0`      | `add t1, zero, t0`    |
| `neg t1, t0`     | `sub t1, zero, t0`    |
| `li t0, 5`       | `addi t0, zero, 5`    |
| `nop`            | `addi zero, zero, 0`  |
| `j label`        | `jal zero, label`     |
| `ret`            | `jalr zero, ra, 0`    |
| `beqz t0, label` | `beq t0, zero, label` |
| `snez t1, t0`    | `sltu t1, zero, t0`   |

```riscv|playground
.text
main:
    li t0, 5
    mv t1, t0           # a copy
    not t2, t0          # every bit flipped
    neg t3, t0          # 0 - 5
    sub t4, zero, t0    # the same instruction, written out
    li t5, 9
    add zero, t5, t5    # this write goes nowhere
    add t6, zero, zero  # so zero still reads 0
    j onwards           # jal zero, so nothing records where we came from
    li s0, 99           # jumped over
onwards:
    li s1, 1
```

`t1` is 5, `t2` is `FFFFFFFA`, `t3` and `t4` are both `FFFFFFFB`, which is -5, and `t6` is 0. `s0`
stays 0 and `s1` comes out at 1, because the `j` jumped over the line between them.

`not` is the one in that program that is not built on `zero`: it becomes `xori t2, t0, -1`, since
exclusive or with all ones flips every bit.

`zero` is not in the registers panel: a row that always reads `00000000` says nothing.

## No scratch register, with one exception

The MIPS assembler keeps `$at` for itself, and any pseudo-instruction that needs somewhere to put a
half-finished value takes it. RISC-V pseudo-instructions build their value **in the register you
named**, so `li` and `la` cost two instructions and no register but the destination.

The exception is `call`, which becomes an `auipc` and a `jalr`, and the `auipc` has to put the
address somewhere before the jump uses it. This assembler puts it in `t1`.

```riscv|playground
.data
value: .word 7

.text
.globl main
main:
    li t1, 0x11111111   # a value of your own, in t1
    li t0, 100000       # a constant too big for one instruction
    la t2, value        # an address, which is also too big
    mv t3, t1           # both of those left t1 alone
    call helper         # and this one does not
    mv t4, t1
    li a7, 10
    ecall

helper:
    li t5, 1
    ret
```

`t0` comes out at `000186A0`, which is 100000, and `t2` at `10010000`, the address of `value`, and
`t3` is still `11111111`, so neither of them borrowed anything. `t4` is `0040001C`, the address of
the `auipc` inside the `call`, which is what that pseudo-instruction left in `t1`.

Click on the line `li t0, 100000` after building: the editor prints the instructions it was
assembled into underneath, which is where `lui t0, 24` and `addi t0, t0, 0x6a0` come from. It does
that for every line that turned into more than one instruction, which is how you find out what a
line you wrote really costs.

`jal helper` does the same call in one instruction and touches nothing but `ra`, so `call` is only
needed when the subroutine is more than a megabyte away, which in a program you write here it never
is. The `li a7, 10` and `ecall` are what stop the program before it walks into `helper`, and the
outside-world module is where they are explained.

## Temporaries and saved registers

`t0` to `t6` and `s0` to `s11` are nineteen registers with identical hardware and opposite
agreements about what happens across a subroutine call.

- A **temporary** may be destroyed by anything you call. If you have something in `t3` and you call
  a subroutine, assume `t3` is rubbish afterwards. Keeping it is the **caller's** job, which is why
  these are also called caller-saved.
- A **saved** register must come back unchanged. A subroutine that wants `s3` for its own work saves
  the caller's `s3` on the stack on entry and puts it back before returning, which makes these
  callee-saved.

In C those two categories are invisible: the compiler puts a variable that is only used between two
calls in a temporary, and one that has to survive a call in a saved register, and it emits the saves
for you. Here it is your agreement to keep, and there is nothing in the machine that will stop you
breaking it. The "jal, ret and the calling convention" lecture writes both sides out.

The rest of the list divides the same way:

- **`a0` to `a7`** carry the first eight arguments into a subroutine, and anything past eight goes on
  the stack. They are temporaries: a subroutine is free to use them for its own work once it has read
  them.
- **`a0` and `a1`** carry the answer back out as well. `a0` alone for anything that fits in a
  register, both for an answer that needs two.
- **`a7`** carries the service number into an `ecall`, which the outside-world module uses on every
  line that prints. It is an argument register the rest of the time.

There is no register reserved for an exception handler here, the way MIPS keeps `$k0` and `$k1`. A
RISC-V handler saves what it uses, or uses the `uscratch` control register, which "Exceptions, CSRs
and interrupts" comes back to.

## The four the environment set up

`sp`, `gp`, `tp` and `ra` are ordinary registers that already hold something when your program
starts, or that one instruction writes for you.

```riscv|playground
.text
main:
    mv t0, sp           # where the stack pointer starts
    mv t1, gp           # and the global pointer
    mv t2, tp           # the thread pointer
    mv t3, ra           # nothing has called us, so this is 0
    addi sp, sp, -8     # take eight bytes of stack
    mv t4, sp
```

`t0` comes out at `7FFFEFFC`, which is near the top of the address space, and `t1` at `10008000`,
which sits in the middle of the data segment. `t2` and `t3` are 0. After the `addi`, `sp` and `t4`
both read `7FFFEFF4`, eight bytes lower, because **the stack grows downwards** and moving the
pointer is all that taking room means.

- **`sp`** is the top of the stack. `lw` and `sw` through it are how a program keeps more than 32
  values, and every subroutine that saves anything moves it. "The stack and sp" is the lecture.
- **`fp`**, which is `s0`, is a second pointer into the same frame, and it stays still while `sp`
  moves. It is a saved register like the eleven that follow it, so a subroutine that uses it saves
  the caller's copy first.
- **`gp`** points into the data segment so that a global can be read as `lw t0, 0(gp)` with one
  instruction instead of the two an `la` costs. This simulator puts it at `0x10008000`.
- **`tp`** points at a per thread block of data. A program here has one thread and nothing sets it,
  so it stays 0.
- **`ra`** is written by `jal`, the call instruction, with the address to come back to. `ret` goes
  there, and it is `jalr zero, ra, 0` written short.

## No hi and lo

MIPS puts the product of a multiplication in two registers outside the 32, called `hi` and `lo`, and
four instructions exist only to move values in and out of them. RISC-V has nothing of the kind:
`mul`, `mulh`, `div` and `rem` each write one ordinary register you named, and the registers panel
has nothing under `pc`. "Arithmetic, logic and bits" is where they are used.

## Your turn

The test starts `t0` at 5. Leave a copy of it in `s0` and its negation in `s1`, which the panel
shows as `FFFFFFFB`, using `zero` in both instructions instead of a `mv` or a `neg`.

```riscv|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "startingRegisters": { "t0": 5 },
    "expectedRegisters": { "s0": 5, "s1": -5 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
main:
    add s0, t0, zero    # x + 0 is a copy
    sub s1, zero, t0    # 0 - x is a negation
```

</details>

The second one builds `0x12345678` out of the two real instructions `li` would have used, so that
you can see both halves. `lui` puts a 20 bit constant in the top of a register and clears the bottom
12 bits; leave what it produces in `t1`, which is `0x12345000`, and the whole number in `t0`.

```riscv|playground|exercise
.text
main:
    # your code here
```

```testcase
{
    "expectedRegisters": { "t0": "0x12345678", "t1": "0x12345000" }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|solution
.text
main:
    lui t1, 0x12345     # the top 20 bits, the low 12 cleared
    addi t0, t1, 0x678  # and the low 12 added in
```

</details>
