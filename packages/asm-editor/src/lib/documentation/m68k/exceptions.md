## Exceptions on a real 68000

> **None of this is implemented in this editor.** The 68000's exception machinery is described here because it is part of the processor and you will meet it in real code, but the emulator has no vector table, no supervisor mode and no exception handlers. The bottom of memory is ordinary memory: writing to it changes nothing about how a program runs. Each section below ends with what the editor does instead.

On a real 68000, `trap #15` is one of sixteen trap instructions, and the traps are a few of 256 causes that can take the program counter away from your program. All of them work the same way, through a table at the bottom of memory.

## The vector table

The first 1024 bytes of memory, `$000000` to `$0003FF`, are **256 vectors** of four bytes each. A vector is the address of the code that deals with one cause, and the CPU finds it by multiplying the cause's **vector number** by 4 and reading the long there.

| vector | address | cause                                            |
| -----: | ------- | ------------------------------------------------ |
|      0 | `$0000` | the supervisor stack pointer the CPU starts with |
|      1 | `$0004` | the program counter the CPU starts with          |
|      2 | `$0008` | bus error                                        |
|      3 | `$000C` | address error, a word or long at an odd address  |
|      4 | `$0010` | illegal instruction                              |
|      5 | `$0014` | division by zero                                 |
|      6 | `$0018` | the `chk` instruction, an index out of range     |
|      7 | `$001C` | the `trapv` instruction, on overflow             |
|      8 | `$0020` | privilege violation                              |
|      9 | `$0024` | trace, one vector per instruction for a debugger |
| 10, 11 | `$0028` | an instruction beginning `1010` or `1111`        |
|     24 | `$0060` | spurious interrupt                               |
|  25-31 | `$0064` | the seven interrupt levels, one vector each      |
|  32-47 | `$0080` | `trap #0` to `trap #15`                          |
| 64-255 | `$0100` | interrupt vectors devices supply themselves      |

So `trap #15` is vector 47, at `$0000BC`, and a division by zero is vector 5, at `$000014`. The first two entries are why a 68000 needs no boot code of its own: on reset it loads `a7` from `$0000` and the program counter from `$0004`, and starts running. Filling that table in is the first thing an operating system does, and on a machine without one it is the first thing the program does.

> **In this editor:** there is no vector table. The bottom of memory holds whatever you put there and nothing reads it. A program can write to `$0000` and `$0004` and see the bytes in the memory panel, but the emulator never consults them.

## What the CPU does when an exception happens

The steps are the same for every cause, and this is what handling an exception means in hardware.

1. It finishes, or abandons, the instruction it is on.
2. It makes an internal copy of the status register, then sets the **S** bit to switch into **supervisor mode**, and clears the **T** bit so the handler is not traced.
3. It pushes an **exception frame** onto the supervisor stack: the program counter and that copy of the status register, six bytes for most causes. A bus or address error pushes eight more bytes describing what went wrong, since the instruction has to be abandoned halfway.
4. It reads the vector and loads it into the program counter, and the handler starts.
5. The handler ends with `rte`, return from exception, which pops the status register and the program counter back, and the program carries on where it left off.

> **In this editor:** the three instructions that exist only to serve this machinery are recognised by the assembler but refuse to build, each with its own reason.
>
> - `rte` is not implemented: every program runs in supervisor mode and no exception state is kept.
> - `stop` is not implemented: there are no interrupts to wake a stopped processor.
> - `reset` is not implemented: there is no external hardware to reset.
>
> `chk`, `trapv` and `illegal` do assemble and run. `rtr` works too, because it only restores the condition codes and a return address from the ordinary stack rather than from an exception frame.

## Three words for three causes

All three go through the machinery above, and the difference is where they come from.

- An **exception** is the CPU refusing to carry out the instruction it is on: an address error, a division by zero, an illegal instruction. Your program caused it, at an instruction you can point at.
- An **interrupt** comes from a device, between two instructions. The 68000 has seven levels, and three bits in the status register hold the **interrupt mask**, which says the levels it will listen to right now. A program can raise the mask to keep a piece of code from being stopped halfway. Level 7 is non-maskable and gets through regardless.
- A **trap** is an instruction you ran on purpose to hand control over, which is what [trap #15](/documentation/m68k/traps) does here.

> **In this editor:** only `trap #15` exists. Writing `trap #0` through `trap #14` does not assemble at all, and the build error says so: "simulates one trap, `#15`, which is its input and output". There are no trap vectors for the other fifteen to point at. No device raises an interrupt either, so the interrupt mask never matters.
