A `lw` at an address that is not a multiple of four and a `lw` at an address that is in no segment do
the same thing to the program counter: they take it away from your program and give it to a handler.
On RISC-V the address of that handler is in a register, and this editor runs the one you write there.

Three words for the machinery, which Assembly basics set out. An **exception** is the CPU refusing to
carry out the instruction it is on, at an instruction your program chose. An **interrupt** comes from
a device between two instructions and has nothing to do with which two they were. A **trap** is an
instruction you ran on purpose to hand control over, which on RISC-V is `ecall`.

## No table, and no fixed address either

The M68K has 256 vectors at the bottom of memory, one per cause, and the CPU reads the address of the
handler out of the table. MIPS has one handler at one fixed address, `0x80000180`, in a segment of
its own. RISC-V has neither: the handler is **ordinary code in `.text`**, at whatever address it
happens to land, and your program writes that address into a control register called **`utvec`**
before anything can fault.

Nothing is reserved. A program with no handler installed leaves `utvec` at 0, and then a fault ends
the run and puts a message under the editor, which is every program in this course before this page.

## Control and status registers

The registers that describe an exception are not among the 32. They are **CSRs**, control and status
registers, a separate file of up to 4096 numbered registers, and instructions of their own reach
them. RISC-V calls that group the **Zicsr** extension.

The user level ones this editor has:

|  number | name       | what it holds                                         |
| ------: | ---------- | ----------------------------------------------------- |
| `0x000` | `ustatus`  | **bit 0 switches the handler on**                     |
| `0x004` | `uie`      | which interrupts are enabled                          |
| `0x005` | `utvec`    | the address of the handler                            |
| `0x040` | `uscratch` | one word that belongs to the handler                  |
| `0x041` | `uepc`     | the address of the instruction that faulted           |
| `0x042` | `ucause`   | why it faulted                                        |
| `0x043` | `utval`    | the address or value that went wrong                  |
| `0x044` | `uip`      | which interrupts are pending                          |
| `0xC00` | `cycle`    | a cycle counter, with `time` and `instret` next to it |

Every CSR instruction does a read and a write **at the same time**, which is what makes them atomic:
the old value comes out into the register you named while the new one goes in.

| instruction                  | what it does                                               |
| ---------------------------- | ---------------------------------------------------------- |
| `csrrw rd, csr, rs`          | read the CSR into `rd` and write `rs` into it              |
| `csrrs rd, csr, rs`          | read it into `rd` and set the bits `rs` has set            |
| `csrrc rd, csr, rs`          | read it into `rd` and clear the bits `rs` has set          |
| `csrrwi`, `csrrsi`, `csrrci` | the same three with a 5 bit constant instead of a register |

Six is more than anyone wants to write, so there are short names, and each of them is one of the six
with `zero` in an operand:

| you write          | what it becomes           |
| ------------------ | ------------------------- |
| `csrr t0, ucause`  | `csrrs t0, ucause, zero`  |
| `csrw t0, utvec`   | `csrrw zero, utvec, t0`   |
| `csrs t0, ustatus` | `csrrs zero, ustatus, t0` |
| `csrsi ustatus, 1` | `csrrsi zero, ustatus, 1` |

The register comes **first** in `csrr` and in `csrw`, so `csrw t0, utvec` writes `t0` into `utvec`
and reads nothing back.

## The bit that switches it on

Writing `utvec` is not enough. **Bit 0 of `ustatus` has to be set**, and until it is, a fault ends the
run whatever `utvec` holds. That is the line people leave out.

```riscv|playground|memory
.data
odd: .byte 1
     .align 0
w:   .word 0x12345678

.text
.globl main
main:
    la t0, handler
    csrw t0, utvec              # where to go when something faults
    csrsi ustatus, 1            # and switch the handler on
    la t1, w                    # an odd address, since .align 0 turned padding off
    lw t2, 0(t1)                # a load that is not word aligned
    li s0, 5                    # and the program carries on here
    li a7, 10
    ecall

handler:
    csrr s1, ucause             # why we are here
    csrr s2, uepc               # the address of the lw
    addi s2, s2, 4              # the instruction after it
    csrw s2, uepc
    uret                        # back to the program, at the new uepc
```

`s0` comes out at 5, so the program survived the fault and ran to its `ecall`. `t2` is 0, because a
load that faults writes nothing. `s1` is 4, the cause code for a misaligned load, and `s2` is
`0040001C`, the address the handler sent the program back to.

Delete the `csrsi ustatus, 1` line and press Run: the handler is still installed and it is not
entered, and the run ends with
`Runtime exception at 0x00400018: Load address not aligned to word boundary 0x10010001`. Then put it
back.

`uret`, return from a user trap, puts `uepc` into the program counter. Step through the program with
the `pc` register in view and you can watch it jump into the handler and come back.

**The `addi s2, s2, 4` is the line that matters.** `uepc` is the address of the instruction that
faulted, not the one after it, so a handler that returns without moving it runs the same `lw` again,
faults again, and goes round for ever. Delete that line and the `csrw` under it and press Run: the
program stops when the Playground's two million instructions run out, with the `pc` parked on the
`lw`.

Adding 4 is right here because the handler decided to skip the instruction. A handler that has
actually fixed the problem, by loading a page or emulating a missing instruction, returns to the same
address so the instruction runs again, and leaves `uepc` alone.

## ucause and utval

`ucause` holds a number saying what happened, and `utval` holds the address or the value the fault
was about.

| code | what happened                               |
| ---: | ------------------------------------------- |
|    4 | load address misaligned                     |
|    5 | load access fault, an address in no segment |
|    6 | store address misaligned                    |
|    7 | store access fault                          |

Those four are the ones a program you write here can raise. The specification numbers more of them,
2 for an illegal instruction and 3 for a breakpoint among others, and this assembler will not let you
write an instruction that raises them.

```riscv|playground|memory
.data
code:   .word 0
epc:    .word 0
bad:    .word 0
odd:    .byte 1
        .align 0
w:      .word 0x12345678

.text
.globl main
main:
    la t0, handler
    csrw t0, utvec
    csrsi ustatus, 1
    la t1, w
    lw t2, 0(t1)                # a load that is not word aligned
    li s0, 5
    li a7, 10
    ecall

handler:
    csrr t3, ucause
    la t4, code
    sw t3, 0(t4)
    csrr t3, uepc
    sw t3, 4(t4)
    csrr t3, utval
    sw t3, 8(t4)
    csrr t5, uepc
    addi t5, t5, 4
    csrw t5, uepc
    uret
```

`code` comes out at 4, `epc` at `00400018`, the address of the `lw`, and `bad` at `1001000D`, the
address that was not a multiple of four. Change the `lw` to a `sw` and `code` becomes 6, and point it
at address 4 instead and `code` becomes 5 with `bad` at `00000004`.

## The registers a handler may use

MIPS reserves two registers, `$k0` and `$k1`, that a program is told never to keep anything in, so
its handler always has two registers to work with. **RISC-V reserves none.** A handler here runs
between two instructions of a program that is using all 32, and every register it writes is one it
has taken.

What it gets instead is `uscratch`, one control register that belongs to it. The usual idiom is
`csrrw sp, uscratch, sp`, which swaps the handler's own stack pointer in and the program's out in one
instruction, and then the handler has a stack and can save whatever it likes on it.

The program below causes three faults, two loads at an address in no segment and one unaligned load,
and the handler counts them in `uscratch` and touches nothing else the program cares about.

```riscv|playground
.data
odd: .byte 1
     .align 0
w:   .word 0x12345678

.text
.globl main
main:
    la t0, handler
    csrw t0, utvec
    csrsi ustatus, 1
    li t1, 4
    lw t2, 0(t1)                # one: an address outside every segment
    lw t2, 0(t1)                # two: the same again
    la t3, w
    lw t4, 0(t3)                # three: a load that is not word aligned
    csrr s0, uscratch           # what the handler counted
    li a7, 10
    ecall

handler:
    csrr t5, uscratch
    addi t5, t5, 1              # one more fault
    csrw t5, uscratch
    csrr t6, uepc
    addi t6, t6, 4              # step past the instruction that faulted
    csrw t6, uepc
    uret
```

`s0` comes out at 3, and none of the three faults stopped the program. `t2` and `t4` are 0, because
every one of the three loads was skipped without writing anything, which is what a handler that only
steps past the problem leaves behind. The handler still destroyed `t5` and `t6`, which is fine here
because `main` was not using them and would have been a bug if it had been.

## What this editor does not do

**No device raises an interrupt here.** The bitmap display never interrupts, and the keyboard's
interrupt enable bit, bit 1 of the receiver control register at `0xffff0000`, ends the run with a
message saying so and telling you to poll the Ready bit instead. So `uie` and `uip` are registers
nothing will ever set, and the handler above only ever runs for exceptions the program caused itself.

Polling is what replaces an interrupt, and the previous lecture's keyboard loop is what it looks
like: read a status register, and when nothing is ready, let some program time pass with `ecall`
service 32 and go and look again.

**`ebreak` pauses instead of trapping.** The instruction that a debugger uses to plant a breakpoint
stops the run here, and it does that whether or not a handler is installed, so `ebreak` is a way of
stopping a program and not something a handler can catch.

**A fault with no handler ends the run.** These are the messages you will meet, each naming the line:

| what you did                             | the message                                           |
| ---------------------------------------- | ----------------------------------------------------- |
| `lw` at an address not a multiple of 4   | `Load address not aligned to word boundary 0x...`     |
| `sw` at one                              | `Store address not aligned to word boundary 0x...`    |
| `lh` at an odd address                   | `Load address not aligned on halfword boundary 0x...` |
| read or write outside every segment      | `address out of range 0x...`                          |
| read the instructions as data            | `Cannot read directly from text segment!0x...`        |
| an `ecall` number nothing answers        | `invalid or unimplemented syscall service: 99`        |
| `ret` or `jr` to an address with no code | `Instruction load access error`                       |

The first four raise an exception with a code from the table above, so a handler catches them.
Without one they end the program, which for a program you are debugging is usually what you want.

There is one more thing RISC-V does not raise: **arithmetic never faults**. There is no overflow
exception, and a division by zero answers -1 instead of trapping, which "Arithmetic, logic and bits"
went through. MIPS raises an exception for the first and executes a `break` for the second, so a
handler written for that course has two causes to deal with that cannot happen here.

## Your turn

The program below faults on an unaligned load and the handler is empty, so the run stops. Fill the
handler in so the program carries on and `s0` comes out at 5.

```riscv|playground|memory|exercise
.data
odd: .byte 1
     .align 0
w:   .word 0x12345678

.text
.globl main
main:
    la t0, handler
    csrw t0, utvec
    csrsi ustatus, 1
    la t1, w
    lw t2, 0(t1)
    li s0, 5
    li a7, 10
    ecall

handler:
    # your handler here
```

```testcase
{
    "expectedRegisters": { "s0": 5 }
}
```

<details>
<summary>Show solution</summary>

```riscv|playground|memory|solution
.data
odd: .byte 1
     .align 0
w:   .word 0x12345678

.text
.globl main
main:
    la t0, handler
    csrw t0, utvec
    csrsi ustatus, 1
    la t1, w
    lw t2, 0(t1)
    li s0, 5
    li a7, 10
    ecall

handler:
    csrr t3, uepc               # the instruction that faulted
    addi t3, t3, 4              # the one after it
    csrw t3, uepc
    uret
```

</details>

The second one faults on the same unaligned load, and this time the handler has to say what happened.
Store the cause from `ucause` into `code` and the faulting address from `utval` into `bad`, then step
past the instruction. The code for a misaligned load is 4, and `w` lands at `0x10010009`.

```riscv|playground|memory|exercise
.data
code: .word 0
bad:  .word 0
odd:  .byte 1
      .align 0
w:    .word 0x12345678

.text
.globl main
main:
    la t0, handler
    csrw t0, utvec
    csrsi ustatus, 1
    la t1, w
    lw t2, 0(t1)
    li s0, 5
    li a7, 10
    ecall

handler:
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

```riscv|playground|memory|solution
.data
code: .word 0
bad:  .word 0
odd:  .byte 1
      .align 0
w:    .word 0x12345678

.text
.globl main
main:
    la t0, handler
    csrw t0, utvec
    csrsi ustatus, 1
    la t1, w
    lw t2, 0(t1)
    li s0, 5
    li a7, 10
    ecall

handler:
    csrr t3, ucause
    la t4, code
    sw t3, 0(t4)
    csrr t3, utval
    sw t3, 4(t4)
    csrr t5, uepc
    addi t5, t5, 4
    csrw t5, uepc
    uret
```

</details>
