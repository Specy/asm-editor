An overflowing `add`, a `lw` at an address that is not a multiple of four and a `syscall` all do the
same thing to the program counter: they take it away from your program and give it to a handler. On
MIPS there is one handler, at one address, and this editor runs the one you write.

Three words for the machinery, which Assembly basics set out. An **exception** is the CPU refusing
to carry out the instruction it is on, at an instruction your program chose. An **interrupt** comes from a device between two instructions and has
nothing to do with which two they were. A **trap** is an instruction you ran on purpose to hand
control over, which on MIPS is `syscall`.

## One address, not a table

The M68K has 256 vectors at the bottom of memory, one per cause, and the CPU reads the address of the
handler out of the table. MIPS does not: **every exception goes to `0x80000180`**, and the handler
works out what happened by reading a register.

That address is in the **kernel text** segment, which is what `.ktext` opens:

```
.ktext 0x80000180
```

Everything after that line is assembled there, and `.kdata` does the same for the handler's own data.
A program with no `.ktext` section has no handler, and then a fault ends the run and puts a message
under the editor.

## Coprocessor 0

The registers that describe an exception are not among the 32. They live in **coprocessor 0**, the
part of a MIPS chip that deals with exceptions and memory management, and two instructions reach it:

- **`mfc0 $t0, $13`** moves from coprocessor 0 register 13 into `$t0`.
- **`mtc0 $t0, $14`** moves the other way.

Four of its registers matter here:

| number | name       | what it holds                                                              |
| -----: | ---------- | -------------------------------------------------------------------------- |
|      8 | `BadVAddr` | the address that caused an address error                                   |
|     12 | `Status`   | the interrupt mask and the mode bits. `0x0000FF11` before anything happens |
|     13 | `Cause`    | why the exception happened, in bits 6 to 2                                 |
|     14 | `EPC`      | the address of the instruction that caused it                              |

`Cause` holds the **exception code** in bits 6 to 2, so `srl` by 2 and `andi` with `0x1F` reads it
out:

| code | what happened                                            |
| ---: | -------------------------------------------------------- |
|    4 | address error on a load, including an unaligned one      |
|    5 | address error on a store                                 |
|    8 | `syscall`, including a service number nothing answers to |
|    9 | `break`                                                  |
|   10 | an instruction the CPU does not know                     |
|   12 | arithmetic overflow, from `add`, `addi` or `sub`         |

## A handler that works

The four steps a handler takes are always the same: find out what happened, deal with it, **move
`EPC` past the instruction that faulted**, and `eret`.

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

`$t2` comes out at 5, so the program survived the overflow and ran to its `syscall`. `$t1` is 0,
because an `add` that overflows writes nothing. `$k0` ends at `0x30`, which is the `Cause` value, and
`$k1` at `0040000C`, the address the handler sent the program back to.

`eret`, return from exception, puts `EPC` into the program counter and clears bit 1 of `Status`, the
**exception level** bit that the CPU set on the way in. Step through the program with the `pc`
register in view and you can watch it jump to `80000180` and come back.

**The `addi $k1, $k1, 4` is the line that matters.** `EPC` is the address of the instruction that
faulted, not the one after it, so a handler that returns without moving it runs the same `add` again,
overflows again, and goes round for ever. Delete that line and the `mtc0` under it and press Run: the
program stops when the Playground's two million instructions run out, with the `pc` parked on the
`add`.

Adding 4 is right here because the handler decided to skip the instruction. A handler that has
actually fixed the problem, by loading a page or emulating a missing instruction, returns to the same
address so the instruction runs again, and leaves `EPC` alone.

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

`code` comes out at 12, arithmetic overflow. `status` is `0000FF13`, which is the `0000FF11` a
program starts with plus bit 1, the exception level bit set on the way in. `bad` is 0, because an
overflow has no address to report; change the `add` to an unaligned `lw` and `code` becomes 4 while
`bad` holds the address that was not a multiple of four.

## $k0 and $k1

A handler runs between two instructions of a program that knows nothing about it, so every register
it writes has to be one nobody minds losing. `$k0` and `$k1` are the two the convention reserves for
exactly this, and that is the whole reason a program is told never to keep anything in them.

Two registers is not much. A handler that needs more saves them, which is why real handlers begin by
storing registers into a `.kdata` block of their own: pushing onto `$sp` would be wrong, because the
program that was interrupted may be in the middle of moving `$sp` itself.

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

`$s0` comes out at 3, and none of the three faults stopped the program. `$t1` and `$t3` are 0,
because every one of the three instructions was skipped without writing anything, which is what a
handler that only steps past the problem leaves behind.

## What this editor does not do

**No device raises an interrupt here.** The bitmap display never interrupts, and the keyboard's
interrupt enable bit, bit 1 of the receiver control register at `0xffff0000`, ends the run with a
message saying so and telling you to poll the Ready bit instead. So `Status`'s interrupt mask, the
`0xFF` in `0000FF11`, is a set of bits nothing will ever raise, and the handler above only ever runs
for exceptions the program caused itself.

Polling is what replaces an interrupt, and the previous lecture's keyboard loop is what it looks
like: read a status register, and when nothing is ready, let some program time pass with `syscall`
service 32 and go and look again.

**A fault with no handler ends the run.** These are the messages you will meet, each naming the line:

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

Every one of those raises an exception with a code from the table above, so a `.ktext` handler
catches all of them. Without one they end the program, which for a program you are debugging is
usually what you want.

## Your turn

The program below overflows on purpose and the handler section is empty, so the run stops on the
`add`. Fill the handler in so the program carries on and `$t2` comes out at 5.

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
