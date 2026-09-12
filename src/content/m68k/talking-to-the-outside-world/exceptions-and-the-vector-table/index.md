`trap #15` is one of sixteen trap instructions, and the trap instructions are a few of 256 causes
that can take the program counter away from your program. On a real 68000 all of them work the same
way, through a table at the bottom of memory.

## The vector table

The first 1024 bytes of a 68000's memory, `$000000` to `$0003FF`, are **256 vectors** of four bytes
each. A vector is the address of the code that deals with one cause, and the CPU finds it by
multiplying the cause's **vector number** by 4 and reading the long there.

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

So `trap #15` is vector 47, at `$0000BC`, and a division by zero is vector 5, at `$000014`. The first
two entries are why a 68000 needs no boot code of its own: on reset it loads `a7` from `$0000` and
the program counter from `$0004` and starts running.

Filling that table in is the first thing an operating system does, and on a machine with no operating
system it is the first thing the program does.

## What the CPU does when one happens

The steps are the same for every cause, and this is what "handling an exception" means in hardware:

1. It finishes, or abandons, the instruction it is on.
2. It makes an internal copy of the status register and then sets the **S** bit, switching to
   **supervisor mode**, and clears the **T** bit so the handler is not traced.
3. It pushes an **exception frame** onto the supervisor stack: the program counter and that copy of
   the status register, six bytes for most causes. A bus or address error pushes eight more bytes
   describing what went wrong, since the instruction has to be abandoned halfway.
4. It reads the vector and loads it into the program counter, and the handler starts.
5. The handler ends with `rte`, return from exception, which pops the status register and the program
   counter back and carries on where the program left off.

Three words for causes that go through this machinery:

- An **exception** is the CPU refusing to carry out the instruction it is on: the address error, the
  division by zero, the illegal instruction. Your program caused it, at an instruction you can point
  at.
- An **interrupt** comes from a device between two instructions. The 68000 has seven levels, and the
  three bits in the status register that hold the **interrupt mask** say which levels it will listen
  to right now, so a program can raise the mask to keep a piece of code from being stopped halfway.
  Level 7 is non-maskable and gets through regardless.
- A **trap** is an instruction you ran on purpose to hand control over, which is the previous two
  lectures.

## What this editor does

None of the above happens here. Five things are different, and each of them changes what you write.

**The only trap with a simulator service is `trap #15`.** All sixteen encodings assemble, but running
`trap #0` through `trap #14` ends the run with an unknown-trap error. There are no trap vectors, so
there is nothing for those fifteen to point at.

**There is no vector table.** The bottom of memory is memory like the rest of it, and writing there
changes nothing about how the simulator behaves.

```m68k|playground|memory|no-flags
    move.l #$12345678, $0000    ; vector 0 on a real 68000
    move.l #$00001000, $0004    ; vector 1
    move.l $0000, d0
    move.l $0004, d1
```

`d0` comes out at `12345678` and `d1` at `00001000`, and the memory panel at `$0000` shows the eight
bytes sitting there. On a 68000 you would have just set the reset stack pointer and the reset program
counter.

**There are no exception handlers here.** `rte`, `stop` and `reset` are recognised but fail to build
with a reason specific to each instruction. `chk`, `trapv` and `illegal` do run, and end the run with
their corresponding exception instead of jumping through a vector. `rtr` is available because it
only restores the condition codes and a return address from the ordinary stack. The status register
starts at `$2700` and can be read and written, but the simulator always runs as supervisor and its
high byte has no effect.

**A fault ends the run and puts a message under the editor.** These are the ones you will meet:

| what you did                          | the message                                                         |
| ------------------------------------- | ------------------------------------------------------------------- |
| `divu` or `divs` by zero              | `Division by zero`                                                  |
| a word or long at an odd address      | `Address error: Tried to read/write to an odd memory address "..."` |
| read past the end of the 16 megabytes | `Memory read out of bounds: ... maximum: 0x1000000`                 |
| `chk` with a value outside its bounds | `CHK exception: ... is outside 0.....`                              |
| `trapv` while V is set                | `Overflow exception: TRAPV ran while the overflow flag was set`     |
| run `illegal`                         | `Illegal instruction exception`                                     |
| a loop that never ends                | `Execution limit of 2000000 instructions reached`                   |

Each of them names the line, and each of them stops the program where a real 68000 would have jumped
to vector 5, vector 3 or vector 2 and carried on inside your handler.

**No device raises an interrupt.** EASy68K has a task to turn the mouse interrupt on (60) and one for
the keyboard (62), and both are refused here with the reason: mouse input is polled with task 61, and
keyboard input with tasks 7 and 19. The screen never interrupts anything either.

## What you write instead of a handler

Two habits replace the two things the vector table would have done for you.

**Check before the instruction faults.** A division by zero ends the run, so a program that did not
choose the divisor tests it first; and `divu` reports a quotient too large for 16 bits in `V` without
faulting, so that gets checked after.

```m68k|playground
    move.l #1000, d0
    move.l #0, d1           ; a divisor that came from somewhere else
    tst.w d1
    beq divide_by_zero      ; test before the instruction, not after
    divu d1, d0
    bvs too_big             ; and the overflow after it
    bra ok
divide_by_zero:
    move.l #-1, d2
    bra end
too_big:
    move.l #-2, d2
    bra end
ok:
    move.l d0, d2
end:
```

`d2` comes out at `FFFFFFFF`, the -1 that says the divisor was zero, and the run ends normally. Try
changing `move.l #0, d1` to `move.l #3, d1` and `d2` becomes the packed answer instead; change it to
`move.l #1, d1` and the quotient does not fit, so `V` is set and `d2` comes out at -2.

**Poll instead of waiting to be told.** A keyboard interrupt would have run a handler the moment a
key went down. Task 7 asks whether a character is waiting and answers at once, so the program goes
and looks between whatever else it is doing.

```m68k|playground|console|no-flags
    move.w #9, d3           ; look ten times
poll:
    move.b #7, d0           ; task 7: is a character waiting?
    trap #15
    tst.b d1
    bne got_one
    move.b #23, d0          ; task 23: let a hundredth of a second pass
    move.l #1, d1
    trap #15
    dbra d3, poll
    lea nothing, a1
    move.b #14, d0
    trap #15
    bra end
got_one:
    move.b #5, d0           ; task 5: take the character
    trap #15
    move.b #6, d0           ; task 6: print it
    trap #15
end:
    move.b #9, d0
    trap #15

    org $2000
nothing: dc.b 'nothing was typed', 0
```

Press Run and then type a character into the input box quickly: the loop catches it and prints it
back. Wait instead and the ten passes run out and it prints `nothing was typed`. The `trap #15` task
23 in the middle is what stops the poll from burning the whole instruction budget, and a game does
the same thing once a frame.

## A vector table of your own

The mechanism the CPU uses is a table of addresses indexed by a number, and nothing stops you from
building one. A cause number scaled by 4 picks a long out of a table, and `jsr (a1)` calls it.

```m68k|playground|memory|no-flags
    move.l #1, d1           ; the cause number
    lea handlers, a0
    move.l d1, d2
    lsl.l #2, d2            ; four bytes per entry
    move.l (a0, d2), a1     ; the handler's address, out of the table
    jsr (a1)                ; and call it
    bra end

zero:
    move.l #100, d0
    rts
one:
    move.l #200, d0
    rts
two:
    move.l #300, d0
    rts
end:

    org $2000
handlers: dc.l zero, one, two
```

`d0` comes out at 200, from the handler at index 1. The memory panel at `$2000` shows the three
addresses the assembler wrote there, which is exactly the shape of the table at `$0000` on a real
68000: `dc.l` of labels, read as addresses, jumped through.

Try changing `move.l #1, d1` to `move.l #2, d1` and watch `d0` come out at 300.

## Your turn

The test starts `d0` at 1000 and `d1` at 0. Divide `d0` by `d1` without ending the run: leave the
quotient in `d2` when the division is possible, and `$FFFFFFFF` in `d2` when the divisor is zero.

```m68k|playground|exercise
* your code here
```

```testcase
{
    "startingRegisters": { "d0": 1000, "d1": 0 },
    "expectedRegisters": { "d2": "0xFFFFFFFF" }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    tst.w d1            ; divu reads the divisor as a word
    beq bad
    divu d1, d0
    move.l d0, d2
    bra end
bad:
    move.l #-1, d2
end:
```

</details>

The second one hands you three handlers and a table of their addresses at `$2000`. The test starts
`d0` at 2, and wants the handler at that index called, so `d1` comes back at 300.

```m68k|playground|memory|exercise
* work out the address and call it here

    bra end

zero:
    move.l #100, d1
    rts
one:
    move.l #200, d1
    rts
two:
    move.l #300, d1
    rts
end:

    org $2000
handlers: dc.l zero, one, two
```

```testcase
{
    "startingRegisters": { "d0": 2 },
    "expectedRegisters": { "d1": 300 }
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|memory|solution
    lea handlers, a0
    move.l d0, d2
    lsl.l #2, d2        ; four bytes per entry
    move.l (a0, d2), a1 ; the handler's address
    jsr (a1)

    bra end

zero:
    move.l #100, d1
    rts
one:
    move.l #200, d1
    rts
two:
    move.l #300, d1
    rts
end:

    org $2000
handlers: dc.l zero, one, two
```

</details>
