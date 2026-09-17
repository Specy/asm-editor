This lesson describes the exception model implemented by this Playground, which follows the MARS
behavior used by its MIPS core. It exposes four coprocessor 0 registers: `BadVAddr` (register 8),
`Status` (12), `Cause` (13), and `EPC` (14). A handler begins at `0x80000180`. The Playground
delivers exceptions caused by the running program; its devices do not deliver interrupts. The fixed
addresses, reset values, data layout, and instruction budget mentioned below are Playground
properties, not rules for every MIPS processor.

## Exceptions and interrupts

A **synchronous exception** belongs to the instruction being executed. An overflowing `add` or an
unaligned `lw` always fails at that instruction, so the CPU can record its address and cause. The
instruction is abandoned before the handler begins: it does not partly update a register or memory.

An **asynchronous interrupt** comes from outside the instruction stream, usually from a device, and
is taken between instructions. MIPS uses related state and handler machinery for both, but the
distinction matters: a device can interrupt a program regardless of the instruction currently
running. This Playground does not deliver those device interrupts, so the examples on this page are
all synchronous exceptions.

A **trap** is not another name for `syscall`. MIPS has conditional trap instructions, such as `teq`,
that raise an exception when their condition is true. In this Playground, a valid, supported
`syscall` service is handled directly by the environment and does not enter your `.ktext` handler.
An invalid or unsupported service number raises a synchronous exception with code 8, which a
handler can receive.

## What happens on overflow

Suppose the program reaches this instruction:

```mips
add $t1, $t0, $t0
```

If `$t0` holds `0x7FFFFFFF`, the signed result does not fit in 32 bits. The Playground then:

1. abandons the `add`, leaving `$t1` unchanged;
2. writes the address of that `add` into `EPC`;
3. records arithmetic-overflow code 12 in the exception-code field of `Cause`;
4. sets the exception-level bit in `Status`; and
5. continues at the handler vector, `0x80000180`.

The handler eventually executes `eret`. That instruction clears the exception-level bit and loads
the program counter from `EPC`. It does not move `EPC` for you.

This leaves the handler with a deliberate choice:

| policy | what the handler does with `EPC`      | what `eret` runs next      |
| ------ | ------------------------------------- | -------------------------- |
| retry  | leaves it at the faulting instruction | the same instruction again |
| skip   | adds 4                                | the following instruction  |

Retrying makes sense only after the handler has changed something that can make the instruction
succeed. Otherwise it raises the same exception again. This Playground has no delay slots, and its
MIPS instructions are four bytes, so copying `EPC` to `$k1` and running `addiu $k1, $k1, 4` skips
exactly one instruction. A final `mtc0` writes that address back to `EPC`.

## The four CP0 registers

Coprocessor 0, or **CP0**, is a control-register bank separate from the 32 general-purpose
registers. Two instructions cross between the banks:

- `mfc0 $k0, $13` copies CP0 register 13 into `$k0`.
- `mtc0 $k0, $14` copies `$k0` into CP0 register 14.

The four registers this Playground exposes are:

| number | name       | purpose in this Playground                      |
| -----: | ---------- | ----------------------------------------------- |
|      8 | `BadVAddr` | the address involved in an address exception    |
|     12 | `Status`   | control bits, including the exception-level bit |
|     13 | `Cause`    | fields describing why the exception occurred    |
|     14 | `EPC`      | the address where execution should resume       |

The Playground resets `Status` to `0x0000FF11`. Taking an exception sets bit 1, so an otherwise
unchanged `Status` reads `0x0000FF13` inside the handler; `eret` clears that bit. These exact values
describe the Playground's reset configuration.

The assembler places a handler at the Playground's vector with:

```mips
.ktext 0x80000180
```

If a program-caused exception has no handler there, the run stops and the Playground reports the
fault.

## Registers a handler can use

The handler must not silently destroy values that the interrupted program expects to keep. If it
uses an ordinary general-purpose register, it must save that register and restore it before `eret`.

The calling convention reserves `$k0` and `$k1` for kernel and exception-handling code. Ordinary
program code should not keep values in them, which gives a small handler two temporary registers
without a save-and-restore step. The examples here use only `$k0` and `$k1` inside `.ktext`.

Instructions are atomic, so an exception never catches `addiu $sp, $sp, -4` halfway through its
update. Even so, the user program's `$sp` may contain an invalid address or point to storage that is
inappropriate for handler state, especially when the exception itself concerns an address.
`.kdata` opens the kernel data segment, where a larger handler can reserve fixed save slots. Simple
fixed slots are not safe for nested or re-entrant handlers: another entry could overwrite the first
entry's saved values.

## Skipping the overflowing instruction

Now the whole path is visible:

```mips|playground|cp0|pc
.text
.globl main
main:
    li $t0, 0x7FFFFFFF
    add $t1, $t0, $t0       # abandoned when it overflows
    li $t2, 5               # the handler returns here
    li $v0, 10
    syscall                  # supported service: handled directly

.ktext 0x80000180
    mfc0 $k1, $14           # copy EPC into a handler temporary
    addiu $k1, $k1, 4       # choose to skip one instruction
    mtc0 $k1, $14           # write the new return address
    eret
```

The `add` never writes `$t1`. The handler advances `EPC`, so `eret` resumes at `li $t2, 5`, and
`$t2` becomes 5. The final, supported exit service does not call the handler.

If the handler leaves `EPC` unchanged, `eret` retries the same `add`, which overflows again. The
cycle continues until the Playground's own instruction budget ends the run.

## Reading Cause and BadVAddr

`Cause` contains several fields. The five-bit exception code occupies bits 6 through 2. A shift and
a mask extract it:

```mips
mfc0 $k0, $13
srl $k0, $k0, 2
andi $k0, $k0, 0x1F
```

The shift moves bit 2 down to bit 0. The mask `0x1F`, five binary ones, clears every bit outside the
five-bit code. The codes used in this lesson are 12 for arithmetic overflow and 4 for an address
error on a load. Code 8 identifies an unsupported `syscall` service in this Playground.

`BadVAddr` needs one extra rule: the Playground updates it when an address exception occurs. For
other exceptions it may retain an older value, so zero after reset does not make it meaningful for
an overflow. Read `BadVAddr` only after `Cause` says the current exception is an address error.

## Write two handlers

The program below overflows on purpose. Fill in the handler so it skips the abandoned `add` and the
program reaches `li $t2, 5`.

```mips|playground|cp0|exercise
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

```mips|playground|cp0|solution
.text
.globl main
main:
    li $t0, 0x7FFFFFFF
    add $t1, $t0, $t0
    li $t2, 5
    li $v0, 10
    syscall

.ktext 0x80000180
    mfc0 $k1, $14
    addiu $k1, $k1, 4
    mtc0 $k1, $14
    eret
```

</details>

The second program performs an unaligned `lw`. Write a handler that extracts the exception code
from `Cause` into `code`, stores `BadVAddr` in `bad`, skips the failed load, and lets `$t2` become 5.
With the Playground's current data layout, `w` is at `0x10010009`, which is not divisible by four.

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
    la $t0, w
    lw $t1, 0($t0)
    li $t2, 5
    li $v0, 10
    syscall

.ktext 0x80000180
    # your handler here
```

```testcase
{
    "expectedRegisters": { "$t2": 5 },
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
    mfc0 $k0, $13
    srl $k0, $k0, 2
    andi $k0, $k0, 0x1F
    la $k1, code
    sw $k0, 0($k1)
    mfc0 $k0, $8
    sw $k0, 4($k1)
    mfc0 $k1, $14
    addiu $k1, $k1, 4
    mtc0 $k1, $14
    eret
```

</details>
