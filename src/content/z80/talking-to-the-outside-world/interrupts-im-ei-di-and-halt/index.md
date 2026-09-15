Every program on the previous page **polled**: it went and looked at the keyboard, over and over,
thousands of times a second, and most of the looks found nothing. That works, and it burns the whole
CPU doing it.

The other arrangement is an **interrupt**. The device makes a noise on a wire, the CPU finishes
whatever instruction it is in the middle of, puts the program counter on the stack and jumps to a
handler. The program that was running is stopped without being asked and never knows it happened. A
machine built this way can sit doing nothing at all until a key is pressed.

**Nothing here will ever raise one.** No key, no mouse button, no timer and no port pulls either of
the Z80's interrupt wires, and that is deliberate: the peripherals in this editor are polled, the
port map is the whole agreement between your program and the outside world, and a run stays a plain
sequence of instructions you can step through and undo
([ADR 0002](https://github.com/Specy/asm-editor/blob/main/docs/adr/0002-z80-console-ports.md)).

So this lecture is short. A few of the things on it you will actually use, and the rest is here
because you will meet it in Z80 code written for real machines and should not have to guess what it
is doing.

## halt, which you have been writing since the first lecture

`halt` does not stop a real Z80. It parks the CPU: the chip keeps fetching, doing nothing, until an
interrupt arrives, and then the handler runs and control returns to the instruction after the
`halt`. That is the idle loop of a machine waiting for you to type something, and it is what a home
computer was doing for almost all of the time it was switched on.

With no interrupts to wait for, a `halt` is a program that has finished, and that is exactly how the
editor treats it: the run stops and the program is reported as terminated. It is the reason every
program in this course ends with one.

## di and ei

Interrupts can be switched off. `di` turns them off, `ei` turns them back on, and a program does the
first before touching anything a handler also touches, because a handler arriving halfway through an
update leaves the update half done.

`ei` has one detail that catches everybody: it takes effect **after the instruction that follows
it**, not immediately. So `ei` then `ret` gets the return done before any interrupt can arrive,
which means a handler's own exit can never be interrupted. That delay is in the hardware, not the
assembler.

Here, `di` and `ei` assemble and run and change nothing you can observe, because there is nothing to
enable.

## A handler has to leave no trace

This part is worth your attention even with no interrupts in sight, because it is the clearest
example of a rule that applies to any subroutine called from somewhere unexpected.

A handler runs between two instructions of a program that knows nothing about it. If the handler
uses `hl`, the interrupted program comes back to find `hl` holding something it never put there, and
whatever it was in the middle of is now wrong. So the handler has to give back every register it
touches.

The obvious way is to push each pair and pop it again, and on this machine that is slow: four pairs
in and out is over eighty **clock cycles**, which are the ticks of the CPU's clock that every
instruction is measured in. This is what the shadow set from the registers lecture is for.

```z80|playground|no-flags
    .org 0x8000
    ld bc, 0x1111
    ld de, 0x2222
    ld hl, 0x3333
    ld a, 0x44

    call handler    ; standing in for the interrupt nothing here will raise
    halt

; a handler in the shape a real one takes: it gives back every register it uses
handler:
    ex af, af'      ; the accumulator and the flags, put away
    exx             ; and the three pairs
    ld hl, 0x9999   ; the handler's own work, on its own registers
    ld a, 0x88
    exx             ; and everything comes back
    ex af, af'
    ei
    reti
```

The handler does real work on `hl` and `a` in the middle, and the caller's `bc`, `de`, `hl` and `a`
still come out as `1111`, `2222`, `3333` and `44`. Look at `af'` and `hl'` in the panel and the
handler's own values are sitting there, `8800` and `9999`, where they will stay until the next
`exx`. Two instructions of saving, eight clock cycles, instead of eighty.

`reti` is the return an interrupt handler uses. Here it pops an address off the stack and jumps to
it, which is to say it behaves exactly like `ret`; on real hardware it also signals Zilog's own
peripheral chips that their interrupt has been dealt with. `retn`, the one an unmaskable handler
uses, is the same story.

## The r register, and free random numbers

A real Z80 spends part of every instruction refreshing the memory chips, and it keeps the counter
for that in a register called `r`, whose low seven bits step on with every instruction fetched. It
was never meant to be useful to a program. It became the standard cheap source of randomness on this
machine anyway, because its value depends on how long the program has been running, which is
something nobody can predict.

```z80|playground|no-flags
    .org 0x8000
    ld a, r         ; a fetch counter, incrementing as the program runs
    ld b, a
    nop
    nop
    nop
    ld a, r         ; and again, a few fetches later
    ld c, a
    halt
```

`b` and `c` come out six apart, which is how many instructions were fetched between the two reads.
`r` is not in the registers panel, and `ld a, r` is the only way to look at it.

## The parts you will see in other people's code

Three things belong to interrupts and do nothing here, and they are listed so you recognise them
rather than so you use them.

`im 0`, `im 1` and `im 2` pick what the CPU does when an interrupt arrives. The one you will see
most is `im 1`, which jumps to the fixed address `0x0038`; `im 2` instead reads a 16 bit address out
of a table, using the `i` register to say which 256 byte stretch of memory that table is in, so each
device can have a handler of its own. That is a **vector table**, and dispatching through one is a
useful trick in its own right, interrupts or not, which is what the exercise below is about.

`i` and `r` are real registers here and hold whatever you put in them. `ld i, a` writes `i` and `ld
a, i` reads it back, but no interrupt will ever come along to read the table it points at.

The [instruction reference](/documentation/z80/instruction) has the exact behaviour of each of
these.

## One to write

Three handlers sit in memory with a table of their addresses at `0x9000`. The test starts `a` at 2,
which is the byte a device would have supplied, and wants the handler at that index reached, so `bc`
comes back at 300.

The index has to be doubled first, because each entry in the table is two bytes and `a` counts
entries rather than bytes. Then add the table's address, load the 16 bit address stored there, and
jump to it.

```z80|playground|memory|exercise
    .org 0x8000
    ; work out the address and jump to it here

zero:
    ld bc, 100
    jp done
one:
    ld bc, 200
    jp done
two:
    ld bc, 300
    jp done
done:
    halt

    .org 0x9000
vectors: .dw zero, one, two
```

```testcase
{
    "startingRegisters": { "a": 2 },
    "expectedRegisters": { "bc": 300 }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|memory|solution
    .org 0x8000
    ld l, a
    ld h, 0
    add hl, hl      ; two bytes per entry
    ld de, vectors
    add hl, de      ; hl points at the entry
    ld e, (hl)
    inc hl
    ld d, (hl)      ; de = the handler's address
    ex de, hl
    jp (hl)

zero:
    ld bc, 100
    jp done
one:
    ld bc, 200
    jp done
two:
    ld bc, 300
    jp done
done:
    halt

    .org 0x9000
vectors: .dw zero, one, two
```

</details>
