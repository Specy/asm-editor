# Exceptions and the vector table

Division by zero and a word read from an odd address both raise an **exception**. The 68000
responds by running a piece of code called a **handler**. The handler might report an error and
end the program, or it might return control so the program can continue.

A program can also raise an exception deliberately with `trap`. You can install your own
handlers, including services that a program calls through a trap.

## The vector table

The processor finds handlers through a table at the bottom of memory. Its first 1024 bytes,
`$000000` to `$0003FF`, contain 256 **vectors**. Each vector is a four-byte address of a
handler. Each kind of exception has a vector number.

To find a vector, multiply its number by 4. Division by zero uses vector 5, so its handler
address is stored at 5 × 4 = 20, or `$14`.

| vector | address         | cause                                                 |
| -----: | --------------- | ----------------------------------------------------- |
|      3 | `$00C`          | address error: a word or long at an odd address       |
|      4 | `$010`          | illegal instruction: a word that is no instruction    |
|      5 | `$014`          | division by zero                                      |
|      8 | `$020`          | privilege violation, in user mode below               |
|  32-46 | `$080` - `$0B8` | `trap #0` to `trap #14`: `trap #n` uses vector 32 + n |

The [Exceptions documentation](/documentation/m68k/exceptions#the-vector-table) lists the rest.

Memory starts filled with `$FF`. Until a program installs a handler, a vector contains
`$FFFFFFFF`. An instruction cannot start at that odd address. A real 68000 would halt; the
editor ends the program and reports the empty vector:

```
Division by zero at line 3: vector 5 at $000014 holds no handler
```

The simulator handles `trap #15` itself, as EASy68K does. Its numbered tasks provide services
such as printing text and ending the program.

## Fill a vector

To handle division by zero, write the handler’s address to vector 5 before the division. The
handler below ends with `rte`, short for _return from exception_.

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

A program can also test the divisor with `tst.w d1` and `beq` before executing `divu`. That is
often simpler when the program already knows how to handle zero.

## What the processor does

The **status register** (`sr`) is 16 bits wide. Its low byte holds the X, N, Z, V and C flags;
the high byte contains processor settings. Bit 13 is the **S** bit. When S is set, the processor
is in **supervisor mode**, where privileged instructions are allowed. In this simulator, a
program starts with `sr` at `$2000`, so it starts in supervisor mode.

When the `divu` meets its zero divisor, the processor:

1. keeps a copy of `sr` and enters supervisor mode. If it was in user mode, `a7` now selects
   the supervisor stack, leaving the user stack untouched;
2. pushes the address of the instruction after the `divu`, then the saved `sr`, on the
   supervisor stack. These six bytes, a long and a word, are the **exception frame**;
3. reads vector 5 and jumps to the address it holds.

`rte` pops the saved `sr` and address from the frame. The program continues at that address,
with its own flags and mode restored. A handler that returns uses `rte`: `rts` would pop only
four of the six bytes and return to an address made of the wrong ones.

A handler should preserve registers that the interrupted program expects to keep. For an
unexpected exception, save registers the handler uses with `movem` and restore them before
`rte`, except for any register the handler is meant to change. A trap service can also define
registers for inputs and outputs, as `trap #15` does; its caller must follow that convention.

## A trap of your own

`trap #0` to `trap #14` let a program call a handler by number. An operating system can install
services in these vectors, so a program can call a service without knowing its address.

This example installs a service and calls it. `trap #3` uses vector 32 + 3 = 35, whose address
is 35 × 4 = 140, or `$8C`. The service takes a number in `d1` and returns its square in `d1`.

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
`2(sp)`. At this point `muls` is the next instruction to execute. Step once to execute it and reach
`rte`, then step again to execute `rte`. It takes the six bytes back: `a7` is `01000000`
again, and the program counter is at `after`. In the full editor, the Call stack lists the exception, as
`TRAP #3 → square`, from the `trap` until that `rte`.

## Where `rte` goes back to

After a `trap` or a division by zero, the frame holds the address of the next instruction, so
`rte` carries on after the one that raised the exception. After an illegal instruction or a
privilege violation it holds the address of that instruction itself, so a handler can see which
one it was. Returning there runs it again, and raises the same exception again, forever. A handler
that wants the program to carry on first adds the instruction's size to the address in the frame,
at `2(sp)`. After a Build, hovering an instruction shows its machine code, and so its size.

The 68000 has an instruction made only to raise an illegal instruction exception: `illegal`, two
bytes long. Programs put it where the code must never get to.

An address error can stop an instruction during a memory access. On the 68000 its frame is
14 bytes long. From the current `sp`, its fields appear in ascending address order:

| Offset   | Contents                                |
| -------- | --------------------------------------- |
| `0(sp)`  | Access information, 2 bytes             |
| `2(sp)`  | Address involved in the access, 4 bytes |
| `6(sp)`  | Instruction register, 2 bytes           |
| `8(sp)`  | Saved `sr`, 2 bytes                     |
| `10(sp)` | Saved program address, 4 bytes          |

The saved program address does not reliably identify a place from which to resume the interrupted
instruction. This handler reports the address involved and ends the program without returning.

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

An operating system can run programs in **user mode**, with S clear. User mode restricts
instructions that control the processor. Writing `sr` with `move`, `andi`, `ori` or `eori`,
executing `rte`, and moving to or from the user stack pointer are privileged. In user mode they
raise a **privilege violation** through vector 8.

Ordinary arithmetic and branches still work. They can change and read the flags, and a program
can write the condition codes alone using `move` to `ccr`.

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

An exception gives user code a controlled way to enter supervisor mode. A **system call** uses
this mechanism: a program requests a service with `trap`, the operating system’s handler works
in supervisor mode, and `rte` returns to user mode.

## Interrupts

An **interrupt** is an exception requested by a device, for example when a key is pressed or a
timer runs out. It uses a vector, an exception frame and `rte` as well.

## Your turn

### 1. Catch a division by zero

`d0` holds 1000 and `d1` a divisor. Install `div_zero` in vector 5, and write it so that it
leaves `$FFFFFFFF` in `d0` and returns. When the divisor is zero, `d2` must end at `$FFFFFFFF`;
otherwise it gets what the `divu` left in `d0`.

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
