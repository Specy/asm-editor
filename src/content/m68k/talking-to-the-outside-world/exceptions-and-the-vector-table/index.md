# Exceptions and the vector table

If a program divides by zero or reads a word at an odd address, this editor stops the run and shows
an error. This lecture explains why, how a real 68000 would respond, and how to check for a few
faults before they end a run here.

## Where the words in those messages come from

Some things an instruction asks for cannot be done. There is no answer to a division by zero, and a
word or long cannot be read or written at an odd address (instruction fetches must be even-aligned
too). A CPU has to do something when it meets one, and what the
68000 does is stop your program and run a piece of code that somebody else wrote for exactly that
situation. Such a piece of code is a **handler**, and the interruption itself is an **exception**.

The CPU finds the right handler through a table. The first 1024 bytes of a 68000's memory are 256
slots of four bytes each, and each slot holds the address of one handler. Every cause has a slot
number: a division by zero is number 5, an address error is number 3, and `trap #0` to `trap #15` are
numbers 32 to 47, which is why `trap #15`, the last of the sixteen, lives at slot 47.

Two of the slots are not handlers at all. Slot 0 holds the value the CPU puts in `a7` when it is
switched on and slot 1 holds the address it starts running at, which is how a 68000 gets going
without any boot code of its own.

## None of that happens here

The simulator does not use a 68000 vector table or run handlers you write. When a fault occurs, the
run ends and a message appears. Its `trap #15` is a built-in task interface: the simulator handles
it directly, without looking up a handler in the vector table. Three consequences are worth knowing.

**The bottom of memory is ordinary memory.** Writing addresses into it changes nothing.

```m68k|playground|memory|no-flags
    move.l #$12345678, $0000    ; slot 0 on a real 68000
    move.l #$00001000, $0004    ; slot 1
    move.l $0000, d0
    move.l $0004, d1
```

The eight bytes are sitting at `$0000` in the memory panel and the simulator has taken no notice
whatsoever. On a real 68000, those values would be used at the next reset.

**Only `trap #15` is supported here.** The other trap numbers have no built-in tasks in this editor.

**You cannot run your own handler here.** Instructions such as `rte`, which would return from a
handler on a real 68000, are not supported.

## The messages

Here is a reference for messages you may see. `chk` checks whether a value is within bounds,
`trapv` requests an exception when the overflow flag is set, and `illegal` deliberately requests
an illegal-instruction exception.

| what you did                          | the message                                                         |
| ------------------------------------- | ------------------------------------------------------------------- |
| `divu` or `divs` by zero              | `Division by zero`                                                  |
| a word or long at an odd address      | `Address error: Tried to read/write to an odd memory address "..."` |
| read past the end of the 16 megabytes | `Memory read out of bounds: ... maximum: 0x1000000`                 |
| `chk` with a value outside its bounds | `CHK exception: ... is outside 0.....`                              |
| `trapv` while V is set                | `Overflow exception: TRAPV ran while the overflow flag was set`     |
| run `illegal`                         | `Illegal instruction exception`                                     |
| a loop that never ends                | `Execution limit of 2000000 instructions reached`                   |

## Check before the instruction faults

With nothing to catch a fault, the only place left to deal with one is in front of it. A division by
zero ends the run, so a program that did not choose its own divisor tests it first. A quotient too
large for 16 bits does not fault at all, it just sets `V` and leaves the register alone, so that one
gets checked afterwards.

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
    move.l #0, d2
    move.w d0, d2        ; quotient is in the low word
end:
```

`d2` comes out at `FFFFFFFF`, the -1 that means the divisor was zero, and the run ends normally
rather than stopping on an error. Take the `tst.w d1` and its `beq` out and run it again: same
divisor, same division, and this time the program dies on the `divu`. After a successful `divu`,
the quotient is in the low word of `d0` and the remainder is in its high word. Clearing `d2` before
copying the quotient word makes `d2.l` an ordinary nonnegative quotient. For example, 1000 divided
by 3 leaves quotient 333 and remainder 1; copying all of `d0.l` would copy both.

## Poll instead of waiting to be told

On a real machine a keypress would raise an **interrupt**, which is a device stopping the CPU between
two instructions to say that something happened, and a handler would deal with it. Nothing here
interrupts anything. What you get instead are tasks that answer immediately: task 7 says whether a
character is waiting, task 61 says where the mouse is, task 19 says which keys are down.

So the program goes and looks, on its own schedule, in between whatever else it is doing.

```m68k|playground|console|no-flags
    move.w #9, d3           ; look ten times
poll:
    move.b #7, d0           ; task 7: is a character waiting?
    trap #15
    tst.b d1
    bne got_one
    move.b #23, d0          ; task 23: wait one second
    move.l #100, d1         ; 100 hundredths of a second
    trap #15
    dbra d3, poll
    move.l #nothing, a1
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

Press Run, click the console input box, and type a character within about ten seconds: the loop
catches it and prints it back. If you leave the input empty, the ten passes run out and it prints
`nothing was typed`.

```testcase
{ "input": ["k"], "expectedOutput": "k" }
```

Task 23 gives you time to type and lets the editor respond while the program waits. Without it,
the ten polls finish almost immediately.

## Your turn

`d0` holds 1000 and `d1` holds a divisor. Check for zero before dividing. Leave the quotient as a
full long in `d2` when division is possible, and `$FFFFFFFF` in `d2` when the divisor is zero.
Remember that `divu` reads `d1.w` and puts the quotient in `d0.w`, with the remainder in the upper
word. Clear `d2` before copying the quotient word into it.

```m68k|playground|exercise
* your code here
```

```testcase
{
    "startingRegisters": { "d0": 1000, "d1": 0 },
    "expectedRegisters": { "d2": "0xFFFFFFFF" }
}
```

Now write the same guarded division for a nonzero divisor. This time 1000 divided by 3 must leave
333 in all of `d2.l`, without the remainder in its high word.

```m68k|playground|exercise
* your code here
```

```testcase
{
    "startingRegisters": { "d0": 1000, "d1": 3 },
    "expectedRegisters": { "d2": 333 }
}
```

<details>
<summary>Show solution for both cases</summary>

```m68k|playground|solution
    tst.w d1            ; divu reads the divisor as a word
    beq bad
    divu d1, d0
    move.l #0, d2
    move.w d0, d2       ; leave the remainder behind
    bra end
bad:
    move.l #-1, d2
end:
```

</details>
