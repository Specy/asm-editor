Somewhere in this course you have run a program that stopped with `arithmetic overflow` or
`store address not aligned on word boundary`, and that was the end of it. One bad instruction, run
over, nothing you could do.

It does not have to end there. When an instruction cannot be carried out, the CPU does not give up:
it stops doing what you asked, writes down what went wrong and where, and jumps to a fixed address
to run whatever code it finds. That code is called a **handler**, and on this machine it is code you
write, in the same file, in the same language. A handler can count faults, print a diagnosis, patch
up whatever went wrong and retry the instruction, or simply skip it and carry on. The program keeps
running either way.

Three words before the machinery. An **exception** is the CPU refusing an instruction of yours. An
**interrupt** arrives from a device between two instructions and has nothing to do with which two
they were. A **trap** is an instruction you ran deliberately to hand control over, and on MIPS that
is `syscall`. All three take the same route out of your program.

## What actually happens

Take the program further down this page: it puts the largest positive word in `$t0` and then runs
`add $t1, $t0, $t0`, which overflows. That `add` sits at `0x00400008`. Between it and the next
instruction, the CPU does five things, none of which your program can see happening:

1. **It abandons the instruction.** `$t1` is not written. Whatever was in it stays there.
2. **It saves where you were.** `0x00400008`, the address of the faulting instruction, goes into a
   register called `EPC`, the exception program counter.
3. **It writes down why.** A number identifying the fault goes into a register called `Cause`.
4. **It notes that it is inside a handler**, by setting bit 1 of a register called `Status`.
5. **It sets `pc` to `0x80000180`** and carries on from there.

Then your handler runs, doing whatever you wrote. One instruction at the end of it undoes steps 4
and 5 together:

- **`eret`**, return from exception, copies `EPC` into `pc` and clears that bit of `Status`.

| when                       | `pc`           | `EPC`        | `$t1`       |
| -------------------------- | -------------- | ------------ | ----------- |
| about to run the `add`     | `0x00400008`   | anything     | whatever    |
| first handler line         | `0x80000180`   | `0x00400008` | not written |
| after the handler's `mtc0` | in the handler | `0x0040000C` | not written |
| after `eret`               | `0x0040000C`   | `0x0040000C` | not written |

Read the last two rows twice, because this is where handlers go wrong. `EPC` holds the address of
the instruction that **faulted**, not the one after it. Return without changing it and the CPU runs
the same `add` again, which overflows again, which calls the handler again, for ever.

So a handler that means to give up on the instruction adds 4 to `EPC` first. A handler that has
actually fixed the problem leaves `EPC` alone, so the instruction gets a second try.

## Where the handler lives

Every exception on MIPS goes to the same address, `0x80000180`. There is no table of addresses to
fill in and no registering anything: put code at that address and it is the handler.

That address is in the **kernel text** segment, which `.ktext` opens the way `.text` opens the
ordinary one:

```
.ktext 0x80000180
```

Everything after that line is assembled there, and `.kdata` does the same for data the handler owns.
A program with no `.ktext` section has no handler at all, and then a fault ends the run and prints a
message under the editor, which is every program you have written so far.

## Coprocessor 0

`EPC`, `Cause` and `Status` are not among the 32 registers. They belong to **coprocessor 0**, a
second register bank that holds everything about faults and memory management, and two instructions
reach across to it:

- **`mfc0 $t0, $13`** copies coprocessor 0 register 13 into `$t0`.
- **`mtc0 $t0, $14`** copies `$t0` into coprocessor 0 register 14.

The registers are named by number, and four of them matter here:

| number | name       | what it holds                                        |
| -----: | ---------- | ---------------------------------------------------- |
|      8 | `BadVAddr` | the address that caused an address error             |
|     12 | `Status`   | mode bits. `0x0000FF11` before anything has happened |
|     13 | `Cause`    | which fault this was                                 |
|     14 | `EPC`      | the address of the instruction that caused it        |

### Getting the code out of Cause

`Cause` does not hold the fault number on its own. It holds several things at once, and the one you
want, the **exception code**, occupies bits 6 down to 2:

```
 bit  31                        7 6 5 4 3 2 1 0
      +-------------------------+---------+---+
      |      other fields       | ExcCode |   |
      +-------------------------+---------+---+
                                  5 bits
```

Two instructions get it out, and both halves are worth understanding rather than copying:

- **`srl $k0, $k0, 2`** slides everything right by two places, so the bottom of the code lands at
  bit 0. Whatever was in bits 1 and 0 falls off the end, which is what you want.
- **`andi $k0, $k0, 0x1F`** keeps the low five bits and clears the rest. `0x1F` is `11111` in
  binary, five bits set, which is exactly the width of the field.

Those are the same mask-and-shift moves from "Arithmetic, logic and bits", used on a register the
hardware filled in rather than one you did. The code that comes out means:

| code | what happened                                            |
| ---: | -------------------------------------------------------- |
|    4 | address error on a load, including an unaligned one      |
|    5 | address error on a store                                 |
|    8 | `syscall`, including a service number nothing answers to |
|    9 | `break`                                                  |
|   10 | an instruction the CPU does not know                     |
|   12 | arithmetic overflow, from `add`, `addi` or `sub`         |

## A handler that works

Four steps, always in this order: find out what happened, deal with it, decide what `EPC` should be,
and `eret`.

```mips|playground
.text
.globl main
main:
    li $t0, 0x7FFFFFFF
    add $t1, $t0, $t0       # overflow: nothing is written and the handler runs
    li $t2, 5               # and the program carries on here
    li $v0, 10
    syscall

.ktext 0x80000180
    mfc0 $k0, $13           # Cause, so the handler knows what happened
    mfc0 $k1, $14           # EPC, the address of the add
    addi $k1, $k1, 4        # the instruction after it
    mtc0 $k1, $14
    eret                    # back to the program, at the new EPC
```

`$t2` is 5, so the program survived the overflow and reached its `syscall`. `$t1` is 0, because an
`add` that overflows writes nothing at all.

Step through it with `pc` in view. You will watch it leave the `add`, appear at `80000180`, run four
lines that are nowhere near your program, and come back to the `li $t2, 5`. Nothing in `main` knows
any of that happened.

Now delete the `addi $k1, $k1, 4` and the `mtc0` under it and press Run. The program stops when the
Playground's two million instructions run out, with `pc` parked on the `add`: the handler kept
returning to the instruction that called it. That is the loop the table above was warning about, and
it is worth seeing once.

## Reading Cause

```mips|playground|memory
.data
code:   .word 0
status: .word 0
bad:    .word 0

.text
.globl main
main:
    li $t0, 0x7FFFFFFF
    add $t1, $t0, $t0       # code 12
    li $t2, 5
    li $v0, 10
    syscall

.ktext 0x80000180
    mfc0 $k0, $13           # Cause
    srl $k0, $k0, 2
    andi $k0, $k0, 0x1F     # the exception code out of bits 6 to 2
    la $k1, code
    sw $k0, 0($k1)
    mfc0 $k0, $12           # Status
    sw $k0, 4($k1)
    mfc0 $k0, $8            # BadVAddr
    sw $k0, 8($k1)
    mfc0 $k1, $14
    addi $k1, $k1, 4
    mtc0 $k1, $14
    eret
```

`code` is 12, arithmetic overflow, dug out of `Cause` by the shift and the mask. `status` is
`0000FF13`, which is the `0000FF11` a program starts with, plus bit 1: that is the CPU's note to
itself that a handler is running, and `eret` is what clears it again.

`bad` is 0, because an overflow happens to a pair of registers and has no address to report. Change
the `add` to a `lw` at an odd address and both change: `code` becomes 4 and `bad` holds the address
that was not a multiple of four, which is the one piece of information that makes an address error
fixable.

## $k0 and $k1

A handler starts running between two instructions of a program that has no idea it exists, and it
has to hand every register back exactly as it found it. That is a hard promise to keep when you need
somewhere to put a value, so the convention sets two registers aside, `$k0` and `$k1`, and says no
ordinary program may keep anything in them. Now the handler has two registers it can scribble on for
free. This is why "The 32 registers" told you to leave those two alone.

Two is not many. A handler that needs more room saves registers into a `.kdata` block of its own
rather than pushing them on the stack, and the reason is worth a second: the interrupted program may
have been part way through moving `$sp` when the fault hit, so `$sp` cannot be trusted to point
anywhere sensible.

`.kdata` is the kernel form of `.data`, and this handler keeps a count of the faults it has caught in
one word of it. The program below causes three, two overflows and an unaligned load, and reads the
count back afterwards.

```mips|playground|memory
.data
odd:    .byte 1
        .align 0            # so the word below lands on an odd address
w:      .word 0x12345678

.text
.globl main
main:
    li $t0, 0x7FFFFFFF
    add $t1, $t0, $t0       # one: arithmetic overflow
    add $t1, $t0, $t0       # two: the same again
    la $t2, w
    lw $t3, 0($t2)          # three: an address error on a load
    lw $s0, faults          # what the handler counted
    li $v0, 10
    syscall

.kdata
faults: .word 0

.ktext 0x80000180
    la $k0, faults
    lw $k1, 0($k0)
    addi $k1, $k1, 1        # one more fault
    sw $k1, 0($k0)
    mfc0 $k1, $14
    addi $k1, $k1, 4
    mtc0 $k1, $14
    eret
```

`$s0` is 3: three faults, counted by a handler in a word the program itself never wrote. And none of
the three stopped the run.

`$t1` and `$t3` are both 0, which is the cost of this handler's policy. It steps past every fault
without fixing anything, so all three instructions were skipped and none of them wrote a result. A
handler that counts is useful; a handler that also leaves the program's arithmetic half done is
something to be deliberate about.

## Handlers here run for your own faults

Exceptions and interrupts share this machinery on real hardware, but no device here raises
an interrupt: the display never does, and setting the keyboard's interrupt enable bit ends the run
with a message telling you to poll instead. So the handler you write runs for faults your own
program caused, and nothing else.

Polling is what takes the place of an interrupt, and the previous lecture's keyboard loop is what it
looks like: read a status register, and when nothing is ready, let some program time pass with
`syscall` service 32 and go round again.

## The messages you get without a handler

Each of these ends the run and names the line it happened on:

| what you did                       | the message                                        |
| ---------------------------------- | -------------------------------------------------- |
| `add`, `addi` or `sub` overflowed  | `arithmetic overflow`                              |
| `lw` at an odd address             | `fetch address not aligned on word boundary 0x...` |
| `sw` at an odd address             | `store address not aligned on word boundary 0x...` |
| read outside every segment         | `address out of range 0x...`                       |
| read the instructions as data      | `Cannot read directly from text segment!0x...`     |
| a `syscall` number nothing answers | `invalid or unimplemented syscall service: 99`     |
| `break`, or a `rem` by zero        | `break instruction executed; no code given.`       |
| `jr` to an address with no code    | `invalid program counter value: 0x00000000`        |

Every one of those is an exception with a code from the table above, so a `.ktext` handler catches
any of them. Most of the time you do not want to: a program that stops on the line that broke is
easier to debug than one that quietly carries on. Write a handler when carrying on is genuinely the
right answer.

## Write two handlers

The program below overflows on purpose and its handler section is empty, so the run stops on the
`add`. Fill the handler in so the program survives and reaches the `li $t2, 5`.

```mips|playground|exercise
.text
.globl main
main:
    li $t0, 0x7FFFFFFF
    add $t1, $t0, $t0
    li $t2, 5
    li $v0, 10
    syscall

.ktext 0x80000180
    # your handler here
```

```testcase
{
    "expectedRegisters": { "$t2": 5 }
}
```

<details>
<summary>Show solution</summary>

```mips|playground|solution
.text
.globl main
main:
    li $t0, 0x7FFFFFFF
    add $t1, $t0, $t0
    li $t2, 5
    li $v0, 10
    syscall

.ktext 0x80000180
    mfc0 $k1, $14           # EPC, the instruction that faulted
    addi $k1, $k1, 4        # the one after it
    mtc0 $k1, $14
    eret
```

</details>

The second one faults on an unaligned `lw`. Write a handler that stores the exception code from
`Cause` into `code` and the faulting address from `BadVAddr` into `bad`, then steps past the
instruction. The code for an address error on a load is 4, and `w` lands at `0x10010009`.

```mips|playground|memory|exercise
.data
code:   .word 0
bad:    .word 0
b:      .byte 1
        .align 0
w:      .word 0x12345678

.text
.globl main
main:
    la $t0, w               # an odd address, since .align 0 turned padding off
    lw $t1, 0($t0)
    li $t2, 5
    li $v0, 10
    syscall

.ktext 0x80000180
    # your handler here
```

```testcase
{
    "expectedMemory": [
        { "type": "number-chunk", "address": "0x10010000", "bytes": 4, "expected": [4, "0x10010009"] }
    ]
}
```

<details>
<summary>Show solution</summary>

```mips|playground|memory|solution
.data
code:   .word 0
bad:    .word 0
b:      .byte 1
        .align 0
w:      .word 0x12345678

.text
.globl main
main:
    la $t0, w
    lw $t1, 0($t0)
    li $t2, 5
    li $v0, 10
    syscall

.ktext 0x80000180
    mfc0 $k0, $13           # Cause
    srl $k0, $k0, 2
    andi $k0, $k0, 0x1F
    la $k1, code
    sw $k0, 0($k1)
    mfc0 $k0, $8            # BadVAddr
    sw $k0, 4($k1)
    mfc0 $k1, $14
    addi $k1, $k1, 4
    mtc0 $k1, $14
    eret
```

</details>
