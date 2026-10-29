# Exceptions and the vector table

Some instructions cannot do what they ask. There is no answer to a division by zero, and a word
cannot be read at an odd address. Other instructions, the traps, are a program asking for help on
purpose. In every one of these cases the 68000 stops the program where it is and runs a piece of
code written for that situation. That code is a **handler**, and the interruption is an
**exception**. When the handler is done, the program carries on.

This lecture writes handlers of your own: one for a division by zero, a `trap` service, one that
reports an address error, and one for a program that has given up its own privileges.

## The vector table

The processor finds each handler through a table at the very bottom of memory. The first 1024
bytes, `$000000` to `$0003FF`, are 256 **vectors** of four bytes each. A vector holds the address
of one handler, and every cause has its own vector number. The processor multiplies that number
by 4 and reads the long there, so the handler for a division by zero, vector 5, is found at
5 × 4 = 20, which is `$14`.

| vector | address         | cause                                                 |
| -----: | --------------- | ----------------------------------------------------- |
|      3 | `$00C`          | address error: a word or long at an odd address       |
|      4 | `$010`          | illegal instruction: a word that is no instruction    |
|      5 | `$014`          | division by zero                                      |
|      8 | `$020`          | privilege violation, in user mode below               |
|  32-46 | `$080` - `$0B8` | `trap #0` to `trap #14`: `trap #n` uses vector 32 + n |

The [Exceptions documentation](/documentation/m68k/exceptions#the-vector-table) lists the rest.

Memory starts filled with `$FF`, so a vector nobody wrote reads `$FFFFFFFF`. That is an odd
address, and an instruction never starts at an odd address, so the processor has nowhere to go.
A real 68000 would end up halting. This editor ends the program and names the empty vector:

```
Division by zero at line 3: vector 5 at $000014 holds no handler
```

So whenever a division by zero or an odd address ended one of your programs, the reason was that
it had installed no handler.

`trap #15` is different. In EASy68K, and here, the simulator answers it itself, which is how every
task of the previous lectures ran.

## Fill a vector

To handle a division by zero, put the handler's address in vector 5 before the division can
happen. The handler's last instruction is `rte`, _return from exception_, which the next section
explains.

```m68k|playground|memory|no-flags|allow-open
    move.l #div_zero, $14   ; vector 5: the handler for a division by zero
    move.l #1000, d0
    moveq #0, d1            ; a divisor of zero
    divu d1, d0             ; cannot be done, so div_zero runs instead
    move.l d0, d2           ; rte comes back here
    move.b #9, d0
    trap #15

div_zero:
    moveq #-1, d0           ; the answer the program gets instead
    rte                     ; return from the exception
```

Select **Build** and **Step** through it. The first `move.l` writes `$0000101A`, the address of
`div_zero`, into the four bytes at `$14`; enter `14` in the memory panel's address box to see
them. After the `divu`, the next step is the first line of `div_zero`. The handler puts -1 in
`d0`, and `rte` returns to the `move.l` after the `divu`, so `d2` ends at `FFFFFFFF`.

Select **Open in editor** to follow it in the full editor's History: the row of the `divu` reads
`Divide by zero → vector 5, div_zero at $101A`.

Delete the first line and run it again. The same division now ends the program with the message
above, at line 3.

A handler is one way to deal with a zero divisor. Testing it first, with `tst.w d1` and `beq`
before the `divu`, is the other, and the simpler one when the program already knows what to do
instead.

## What the processor does

The flags you know, X, N, Z, V and C, are the low byte of a 16-bit register, the **status
register** or `sr`. Its high byte holds the processor's own settings. One of them, bit 13, is the
**S** bit: when it is set, the processor is in **supervisor mode**, where every instruction is
allowed. A program starts with `sr` at `$2000`, which is bit 13 alone, so every program so far has
run in supervisor mode. A later section of this lecture leaves it.

| bit  | 15  | 14  | 13  | 12-11 | 10-8  | 7-5 | 4-0       |
| ---- | --- | --- | --- | ----- | ----- | --- | --------- |
| name | T   |     | S   |       | I2-I0 |     | X N Z V C |

When the `divu` meets its zero divisor, the processor:

1. keeps a copy of `sr`, and sets S, in case it was clear;
2. pushes the address of the instruction after the `divu`, then that copy of `sr`, on the stack.
   These six bytes, a long and a word, are the **exception frame**;
3. reads vector 5 and jumps to the address it holds.

`rte` undoes the last two steps. It pops `sr` and then the address, and the program carries on at
the instruction after the `divu`, with its own flags. A handler that returns always does so with
`rte`. `rts` would pop only four of the six bytes, and return to an address made of the wrong ones.

A handler runs between two instructions of a program that did not ask for it. So unless changing
a register is its job, as it is here, a handler saves every register it uses with `movem` and puts
them back before its `rte`.

## A trap of your own

`trap #0` to `trap #14` let a program call code without knowing its address. On a real machine the
operating system installs its services in their vectors when it starts, and a program only needs
the number: `trap #3` reaches whatever is in vector 35 that day. Here the program plays both
parts. It installs a service on `trap #3`, whose vector, 32 + 3 = 35, is at 35 × 4 = 140, or
`$8C`, and then calls it.

```m68k|playground|memory|console|no-flags|allow-open
    move.l #square, $8C     ; vector 35: the handler for trap #3
    moveq #12, d1
    trap #3                 ; the service squares d1
after:
    move.b #3, d0           ; task 3: print d1
    trap #15
    move.b #9, d0
    trap #15

square:
    muls d1, d1             ; d1 = d1 * d1
    rte
```

```testcase
{ "expectedOutput": "144" }
```

The console shows `144`. Build it again and Step three times, to the `muls`. `a7` has gone down
from `01000000` to `00FFFFFA`. Click `a7` in the registers panel, and the memory panel shows the
exception frame the `trap` pushed:

| address   | bytes         | what                                                   |
| --------- | ------------- | ------------------------------------------------------ |
| `$FFFFFA` | `20 00`       | `sr` before the trap, `$2000`: S set, every flag clear |
| `$FFFFFC` | `00 00 10 0C` | where `rte` returns: `$100C`, the address of `after`   |

The handler reaches the frame through `a7`: the saved `sr` is at `(sp)` and the return address at
`2(sp)`. Step once more and `rte` takes the six bytes back: `a7` is `01000000` again, and the
program counter is at `after`. In the full editor, the Call stack lists the exception, as
`TRAP #3 → square`, from the `trap` until that `rte`.

## Where `rte` goes back to

After a `trap` or a division by zero, the frame holds the address of the next instruction, so
`rte` carries on after the one that raised the exception. After an illegal instruction or a
privilege violation it holds the address of that instruction itself, so a handler can see which
one it was. Returning there runs it again, and raises the same exception again, forever. A handler
that wants the program to carry on first adds the instruction's size to the address in the frame,
at `2(sp)`. After a Build, hovering an instruction shows its machine code, and so its size.

The 68000 has an instruction made only to raise an illegal instruction exception: `illegal`, two
bytes long. Programs put it where the code must never get to. The second exercise below steps past
it.

An address error stops an instruction halfway through a memory access, so the processor pushes
eight more bytes that describe the access, on top of the usual six. The long at `2(sp)` is now the
address the instruction tried, and the saved `sr` and return address sit below it, at `8(sp)` and
`10(sp)`. The return address is only near the instruction, so it cannot simply be resumed. This
handler does what an operating system does with a program that crashes: it reports what happened
and ends the program, instead of returning.

```m68k|playground|console|no-flags
    move.l #odd_address, $0C ; vector 3: address error
    lea $2001, a0
    move.w (a0), d0         ; a word at an odd address
    move.b #9, d0
    trap #15

odd_address:
    lea report, a1
    move.b #14, d0          ; print the report
    trap #15
    move.l 2(sp), d1        ; the address the move.w tried to read
    move.b #16, d2
    move.b #15, d0          ; print d1 in base 16
    trap #15
    move.b #9, d0           ; and end the program
    trap #15

report: dc.b 'Address error at $', 0
```

```testcase
{ "expectedOutput": "Address error at $2001" }
```

The [Exceptions documentation](/documentation/m68k/exceptions#frames) lays out every byte of the
larger frame.

## User mode and its own stack

An operating system runs in supervisor mode, and starts the programs it loads in **user mode**,
with S clear. There, the instructions that could take the machine over are refused: writing `sr`
with `move`, `andi`, `ori` or `eori`, `rte`, and `move` to or from the user stack pointer below.
Each raises a **privilege violation**, vector 8, instead of running. Everything else still works,
the flags included: `add`, `cmp` and branches change and read them as before, and so does writing
the condition codes alone, with `move` to `ccr`.

Each mode has its own stack pointer. In supervisor mode `a7` is the **supervisor stack pointer**
(SSP), which starts at `$1000000`. In user mode it is the **user stack pointer** (USP), which
starts at `$FF0000`. The other one is kept aside, and the **System** register file shows both,
beside `sr`. Supervisor code sets up the user stack before it enters user mode, with
`move.l a0, usp`; `usp` is written only from an address register, so the address goes into `a0`
first. Then it enters user mode by clearing S: `$DFFF` is every bit but bit 13, so
`andi.w #$dfff, sr` clears S and keeps the rest.

```m68k|playground|system|memory|no-flags|allow-open
    move.l #refused, $20    ; vector 8: privilege violation
    lea $8000, a0
    move.l a0, usp          ; the user stack starts at $8000
    andi.w #$dfff, sr       ; clear S: user mode from here on
    move.l #$1234, -(sp)    ; a7 is the USP now: this lands at $7FFC
    move.w #$2000, sr       ; trying to get supervisor mode back
    move.l (sp)+, d2        ; rte comes back here
    move.b #9, d0
    trap #15                ; trap #15 works in user mode too

refused:
    addq.l #1, d7           ; count the refusal
    addq.l #4, 2(sp)        ; step past the four bytes of the move to sr
    rte                     ; back to user mode
```

The registers panel opens on the System file. Build it and Step, switching to the CPU file to see
`a7`. After the `andi`, S is 0, `sr` is `0000`, and `a7` holds the same value as the USP,
`00008000`, while the SSP waits at `01000000`. The push lands on the user stack, at `$7FFC`. The
`move.w #$2000, sr` is refused: the processor switches to supervisor mode, `a7` becomes the SSP,
and the frame goes on the supervisor stack, at `$FFFFFA`, not on the user one. The `sr` it saved
is `$0000`, user mode, and the address is `$101A`, the refused `move` itself, whose machine code,
`46 fc 20 00`, is four bytes. The handler counts the refusal in `d7` and steps past those four
bytes. Its `rte` restores the saved `sr`, with S clear, so the program is back in user mode on its
own stack, and the `move.l (sp)+, d2` pops the `$1234` it pushed.

So the only way back to supervisor mode is an exception, and a `trap` is the one a program raises
on purpose. That is what a **system call** is on a real machine: user code asks with `trap`, the
operating system's handler does the work in supervisor mode, and its `rte` returns to user mode.

## Interrupts

An **interrupt** is an exception a device raises between two instructions, when a key is pressed
or a timer runs out. It goes through the same vectors, frames and `rte`, and the bits I2 to I0 of
`sr` tell the processor which requests to hold back for now. The
[next lecture](/learn/courses/m68k/talking-to-the-outside-world/interrupts-and-cycles) sets up a
timer and a key press, and writes their handlers.

## Your turn

### 1. Catch a division by zero

`d0` holds 1000 and `d1` a divisor. Install `div_zero` in vector 5, and write it so that it
leaves `$FFFFFFFF` in `d0` and returns. When the divisor is zero, `d2` must end at `$FFFFFFFF`;
otherwise it gets what the `divu` left in `d0`, as before.

```m68k|playground|exercise
* put the address of div_zero in vector 5 here

    divu d1, d0
    move.l d0, d2
    bra done

div_zero:
* leave $FFFFFFFF in d0, then return

done:
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
    move.l #div_zero, $14

    divu d1, d0
    move.l d0, d2
    bra done

div_zero:
    moveq #-1, d0
    rte

done:
```

</details>

### 2. Step past an illegal instruction

The program below has two `illegal` instructions in it. Install `skip` in vector 4, at `$10`,
and write it so that it counts each illegal instruction in `d7` and returns to the instruction
after it. `d0`, `d1` and `d2` must end at 1, 2 and 3, and `d7` at 2.

```m68k|playground|exercise
* put the address of skip in vector 4 here

    moveq #1, d0
    illegal
    moveq #2, d1
    illegal
    moveq #3, d2
    bra done

skip:
* count it in d7, step past it, then return

done:
```

```testcase
{ "expectedRegisters": { "d0": 1, "d1": 2, "d2": 3, "d7": 2 } }
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    move.l #skip, $10

    moveq #1, d0
    illegal
    moveq #2, d1
    illegal
    moveq #3, d2
    bra done

skip:
    addq.l #1, d7
    addq.l #2, 2(sp)    ; the frame holds the illegal's own address
    rte

done:
```

</details>

### 3. A stack for user mode

The skeleton pushes `d0`. Before it, give user mode a stack that starts at `$4000` and enter user
mode, so that the push lands on that stack. `a7` must end at `$3FFC`, with the value of `d0`
stored there.

```m68k|playground|exercise
* set the user stack pointer to $4000 and enter user mode here

    move.l d0, -(sp)
```

```testcase
{
    "startingRegisters": { "d0": "0x12345678" },
    "expectedRegisters": { "a7": "0x3FFC" },
    "expectedMemory": [
        { "type": "number-chunk", "address": "0x3FFC", "bytes": 4, "expected": [305419896] }
    ]
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    lea $4000, a0
    move.l a0, usp
    andi.w #$dfff, sr

    move.l d0, -(sp)
```

</details>
