`ecall` is a deliberate trap: your program runs it to ask the Playground to do something. This
lesson handles a different kind of event, a **synchronous fault**: an instruction cannot be carried
out, so the processor transfers control to a handler.

For example, `lw` needs a word-aligned address. An address ending in binary `...01` is not a
multiple of four, so a word load from it faults.

## What happens on a fault

Before the handler's first instruction, the hardware does these things in order:

1. It abandons the instruction that cannot run.
2. It writes that instruction's address to **`uepc`**.
3. It writes a cause code to **`ucause`**, and the related address or value to **`utval`**.
4. It jumps to the address in **`utvec`**, if user exceptions are enabled in **`ustatus`**.

The handler finishes with **`uret`**. `uret` resumes execution at the address currently in `uepc`.
That is why a handler can either retry a faulting instruction or arrange to skip it.

`utvec`, `ustatus`, `uepc`, `ucause`, and `utval` are control and status registers (CSRs), separate
from the 32 general-purpose registers. These are the CSR instruction forms used here:

| instruction       | meaning                                        |
| ----------------- | ---------------------------------------------- |
| `csrr rd, csr`    | read a CSR into general-purpose register `rd`  |
| `csrw rs, csr`    | write general-purpose register `rs` into a CSR |
| `csrsi csr, mask` | OR the immediate mask into a CSR               |

So `csrsi ustatus, 1` ORs in the mask `1` (`...0001` in binary), setting bit 0. Without enabling
bit 0, writing a handler address to `utvec` alone has no effect. When user exceptions are disabled,
this Playground reports the fault and ends the run.

## Installing a handler

This program deliberately places `w` at a misaligned address. The byte `odd` occupies one byte;
`.align 0` prevents the usual padding before the word, so `w`'s address ends in `...01`. A normal
word alignment directive would insert padding before `w`.

The handler uses `t0` and `t1`, so it saves and restores both. It makes two word-sized stack slots,
saves those registers, does its work, restores them, then restores `sp`. The Playground provides a
valid stack for this program, and every stack access below is word-aligned.

```riscv|playground|memory
.data
odd:        .byte 1
            .align 0
w:          .word 0x12345678
            .align 2
last_cause: .word 0
last_value: .word 0

.text
.globl main
main:
    la t0, handler
    csrw t0, utvec              # source register first, CSR second
    csrsi ustatus, 1            # OR in mask 1: enable bit 0

    la t1, w                    # w ends in ...01 because padding was disabled
    lw t2, 0(t1)                # misaligned load: enter handler
    li s0, 5                    # runs after the handler returns
    j end                       # do not fall through into handler

handler:
    addi sp, sp, -8             # make two aligned words on the stack
    sw t0, 0(sp)
    sw t1, 4(sp)                # preserve both registers this handler will use

    csrr t0, ucause
    la t1, last_cause
    sw t0, 0(t1)                # record why the fault happened
    csrr t0, utval
    la t1, last_value
    sw t0, 0(t1)                # record the address involved

    csrr t0, uepc               # address of the faulting lw
    addi t0, t0, 4              # all instructions assembled here are 32-bit (4 bytes)
    csrw t0, uepc               # resume at the following instruction

    lw t1, 4(sp)
    lw t0, 0(sp)
    addi sp, sp, 8              # restore both registers and the original stack pointer
    uret

end:
```

Here `j end` is ordinary control flow. `end` names the address after the last assembled instruction,
so reaching it completes this Playground run.

After the run, `s0` is 5. `last_cause` holds 4, the code for a misaligned load, and `last_value`
holds the misaligned address of `w`.

## Choosing where to return

`uepc` contains the address of the `lw` that faulted, not the address after it. If the handler
executes `uret` without changing `uepc`, the processor retries that same `lw`; it faults again and
the program repeats the handler forever.

This handler chooses not to perform the load, so it adds 4 to `uepc`. Four is correct for the
32-bit, four-byte instructions this Playground assembles. A handler that repaired the problem
instead would leave `uepc` unchanged and let the instruction run again.

For these memory faults, `ucause` and `utval` help identify the problem:

| code | what happened            | `utval`                  |
| ---: | ------------------------ | ------------------------ |
|    4 | load address misaligned  | the load address         |
|    5 | load access fault        | the inaccessible address |
|    6 | store address misaligned | the store address        |
|    7 | store access fault       | the inaccessible address |

Arithmetic instructions do not raise these faults. That includes `div`: as in the earlier arithmetic
work, this Playground produces `-1` for division by zero.

## Polling still handles input

An interrupt is a device asking for attention between instructions; it is different from the
instruction-caused faults above. This Playground does not deliver device interrupts. Its keyboard
model remains polling: read the ready status, then read a character when it is ready.

## Your turn

The `lw` below faults. Fill the handler so it advances `uepc` past that `lw` and returns with
`uret`. Preserve `t0` and restore `sp` before returning.

```riscv|playground|memory|exercise
.data
odd: .byte 1
     .align 0
w:   .word 0x12345678

.text
.globl main
main:
    li sp, 0x7FFFEFFC
    la t0, handler
    csrw t0, utvec
    li t0, 0x13579BDF
    csrsi ustatus, 1
    la t1, w
    li t2, 0x2468ACE0
    lw t2, 0(t1)
    li s0, 5
    j end

handler:
    # your handler here

end:
```

```testcase
{
    "startingRegisters": { "sp": "0x7FFFEFFC" },
    "expectedRegisters": {
        "s0": 5,
        "t0": "0x13579BDF",
        "t2": "0x2468ACE0",
        "sp": "0x7FFFEFFC"
    }
}
```

Automated state checks cover reaching post-fault main, preserved `t0`, unchanged `t2`, and restored
`sp`; stepping verifies the `uepc` update and `uret` control path.

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
    li sp, 0x7FFFEFFC
    la t0, handler
    csrw t0, utvec
    li t0, 0x13579BDF
    csrsi ustatus, 1
    la t1, w
    li t2, 0x2468ACE0
    lw t2, 0(t1)
    li s0, 5
    j end

handler:
    addi sp, sp, -4
    sw t0, 0(sp)
    csrr t0, uepc
    addi t0, t0, 4              # skip this four-byte lw
    csrw t0, uepc
    lw t0, 0(sp)
    addi sp, sp, 4
    uret

end:
```

</details>
