Every program in this course so far has stopped dead when it did something impossible. Load a word
from an odd address and the run ends with a message under the editor. That message is not the
machine's only option: the processor's actual response to an impossible instruction is to stop what
it is doing and jump somewhere else, and you get to say where.

That jump is an **exception**: the processor refusing to carry out the instruction it is on, and
handing control to a piece of code called a **handler**.

## Installing a handler

A handler is ordinary code in `.text`. Nothing is reserved for it and there is no table anywhere.
Two things have to happen before a fault will reach it:

- the address of your handler goes into **`utvec`**,
- and **bit 0 of `ustatus`** gets set, which is what switches the whole mechanism on.

Those two are **control registers**, which are a separate set from the 32 you have been using. They
have names rather than numbers and their own instructions to reach them: `csrw` writes one, `csrr`
reads one, and `csrsi` sets individual bits in one.

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
    csrsi ustatus, 1            # and switch it on
    la t1, w                    # an odd address: .align 0 turned the padding off
    lw t2, 0(t1)                # so this load cannot work
    li s0, 5                    # and yet the program gets here
    li a7, 10
    ecall

handler:
    csrr s1, ucause             # why we are here
    csrr s2, uepc               # the address of the load that failed
    addi s2, s2, 4              # move past it
    csrw s2, uepc
    uret                        # and back to the program
```

`s0` comes out at 5, so the program survived. `t2` is 0: a load that faults writes nothing. `s1` is
4, which is the cause code for a misaligned load.

Delete the `csrsi ustatus, 1` line and run it again. The handler is still installed, and it is never
entered: the run stops with `Load address not aligned to word boundary`. That one line is what
people leave out.

## uepc, and the loop you will write by accident

`uepc` holds the address of the instruction that **faulted**, not the one after it. `uret` returns
to whatever `uepc` holds.

So a handler that returns without touching `uepc` sends the program straight back to the instruction
that failed, which fails again, which enters the handler again, for ever. Delete the `addi` and the
`csrw` under it and watch: the program runs until the Playground's two million instructions are gone,
with `pc` parked on that `lw`.

Adding 4 is right here because this handler decided to give up on the instruction and skip it. A
handler that had actually fixed the problem would leave `uepc` alone, so the instruction gets another
go.

## What went wrong

`ucause` holds a number, and `utval` holds the address the fault was about.

| code | what happened                               |
| ---: | ------------------------------------------- |
|    4 | load address misaligned                     |
|    5 | load access fault, an address in no segment |
|    6 | store address misaligned                    |
|    7 | store access fault                          |

Those four are what a program you write here can raise. Arithmetic never faults at all: nothing
overflows into an exception, and a division by zero answers -1.

## Nothing here interrupts you

An **interrupt** is the other way a handler gets entered: a device asking for attention between two
instructions, with no connection to what the program was doing. No device in this editor does that.
The display never interrupts, and setting the keyboard's interrupt enable bit stops the run with a
message telling you to poll instead.

So everything above is about exceptions your own program caused, and polling, from the previous
lecture, is what stands in for an interrupt here.

## Your turn

The program below faults on an unaligned load and its handler is empty, so the run stops. Fill the
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
