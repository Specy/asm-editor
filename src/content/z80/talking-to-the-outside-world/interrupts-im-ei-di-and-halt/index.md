The keyboard and the mouse in the previous lecture were **polled**: the program went and looked, over
and over, and burned the whole CPU doing it. The other way round is an **interrupt**, where the device
says something and the program that was running is stopped in the middle to deal with it.

The Z80 has two wires for that, and no others. It has no exception mechanism at all: no illegal
instruction trap, no division by zero (there is no division), no alignment fault, no privileged mode
and no supervisor bit. Every undefined opcode does something, and nothing a program can do to itself
takes the program counter away from it.

## The two lines

- **INT**, the maskable interrupt. A device pulls it low, and the CPU takes notice at the end of the
  current instruction, but only if interrupts are enabled.
- **NMI**, the non-maskable interrupt. The same thing, except that no program can turn it off: the
  CPU pushes the program counter and calls address `0x0066`, always. It is for the things a machine
  cannot afford to miss, like the power supply saying it is about to fail.

Two flip-flops inside the CPU hold the state. **IFF1** says whether INT is listened to, and **IFF2**
is a place to keep a copy of IFF1 while an NMI is being handled, so that the NMI handler can put it
back.

- **`di`** clears both: interrupts off.
- **`ei`** sets both: interrupts on.

`ei` has a detail that catches everyone. It takes effect **after the instruction that follows it**,
not immediately, so `ei` / `ret` returns before any interrupt can arrive and the handler's own return
is never interrupted. That one instruction of delay is deliberate hardware behaviour.

## The three modes

When INT is taken, what happens next depends on which of three modes the program selected with the
`im` instruction.

| written | what the CPU does when INT is taken                                               |
| ------- | --------------------------------------------------------------------------------- |
| `im 0`  | reads one instruction off the data bus and executes it, usually an `rst n`        |
| `im 1`  | calls address `0x0038`, always, whatever the device is                            |
| `im 2`  | reads a byte from the device, joins it to `i`, and calls the address stored there |

**Mode 0** is the 8080's way: the device puts a whole instruction on the bus, and since `rst n` is one
byte and calls one of the eight low addresses, that is what a device usually supplies. Mode 0 is why
those eight addresses are reserved.

**Mode 1** is what most home computers used, because it needs no hardware on the device's side: one
handler at `0x0038`, and if there is more than one device it works out which by asking each of them.

**Mode 2** goes through a table. The `i` register holds a byte, the device supplies another, and the
CPU reads a **16 bit address** from the table at `i` times 256 plus the device's byte, then calls that
address. So `i` picks a 256 byte page of memory to be a table of handler addresses, and every device
gets its own handler with no asking around.

```z80|playground|memory|no-flags
    .org 0x8000
    di              ; interrupts off while the table is being set up
    ld a, 0x90
    ld i, a         ; the vector table lives in page 0x90
    im 2            ; mode 2: the device supplies the low byte
    ei              ; and interrupts back on

    call tick       ; nothing here will ever call it, so call it by hand
    halt

; the handler a device's byte would send the CPU to
tick:
    ld a, (counter)
    inc a
    ld (counter), a
    ei
    reti

    .org 0x9000
vectors: .dw tick, tick, tick, tick
counter: .db 0
```

Type `9000` into the memory panel. The four vectors read `0C 80` four times, which is the address of
`tick` written little endian, and after the run `counter` holds 1 because the `call` ran the handler.

`i` is not in the registers panel, and `ld a, i` is how a program reads it back.

## Returning from a handler

- **`reti`** returns from a maskable interrupt. It pops the address the way `ret` does, and it also
  puts a pattern on the bus that lets a Zilog peripheral chip know its interrupt has been dealt with.
- **`retn`** returns from an NMI, and copies IFF2 back into IFF1, so interrupts go back to whatever
  they were before the NMI arrived.

A handler runs between two instructions of a program that knows nothing about it, so it has to give
back every register it touches. Pushing four pairs and popping them again is over eighty clock cycles,
and this is the reason the **shadow set** from the registers lecture exists: `ex af, af'` and `exx`
together are eight cycles and hand the handler a whole private set.

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

`a` comes out at `44`, `bc` at `1111`, `de` at `2222` and `hl` at `3333`, exactly as the program left
them, while `af'` reads `8800` and `hl'` reads `9999`, which is what the handler was working on. Eight
clock cycles of saving, in two instructions.

## halt

On a real Z80, `halt` does not stop the CPU. It executes `nop` over and over, keeping the memory
refresh going, until an interrupt arrives; the handler runs and the `ret` from it lands on the
instruction after the `halt`. So `ei` and then `halt` is the idle loop of a program waiting for a
device, and it is exactly how a machine sat there doing nothing while you were not typing.

`di` and then `halt` is the other case: no interrupt can arrive, so the CPU sits there until somebody
pulls the power. That is the closest a Z80 comes to an instruction that means "the program is over".

The `r` register is a side effect of that refresh. Its low seven bits count up on every instruction
fetch, and reading it is the classic cheap random number on this machine.

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

`b` comes out at `02` and `c` at `08`, six fetches apart. `r` is not in the registers panel either,
and `ld a, r` is the only way to see it.

## What this editor does

**Nothing in this editor ever raises an interrupt.** No key, no mouse button, no timer and no port
pulls INT or NMI. So:

- `di`, `ei` and all three `im` forms assemble and execute, and change nothing you can observe.
- `i` and `r` are real registers here, written by `ld i, a` and read by `ld a, i`, and no interrupt
  ever reads the table `i` points at.
- `reti` and `retn` behave exactly like `ret`: they pop an address off the stack and jump to it.
- `halt` ends the run and the editor reports the program as terminated, whether interrupts are
  enabled or not, because a Z80 waiting for an interrupt that will never come is a program that has
  finished.

That was decided on purpose
([ADR 0002](https://github.com/Specy/asm-editor/blob/main/docs/adr/0002-z80-console-ports.md)): the
peripherals here are polled, the port map is the whole I/O contract, and a run stays a plain sequence
of instructions you can step through and undo. The other courses say the same thing in their own
words, since none of the simulators in this editor delivers a device interrupt.

So the code on this page is the shape a real handler takes, and you can build it, step it and read
what it leaves behind, which is what the `call` in each program is standing in for.

## Your turn

Set up interrupt mode 2 with its vector table in page `0x90`: turn interrupts off, put `0x90` in the
`i` register, select the mode, turn interrupts back on, and finally read `i` back into `b` so the test
can see it.

```z80|playground|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "expectedRegisters": { "bc": "0x9000" }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    di              ; off while the table is being set up
    ld a, 0x90
    ld i, a         ; the page the vector table is in
    im 2
    ei              ; and back on
    ld a, i         ; read it back
    ld b, a
    halt
```

</details>

The second one hands you three handlers and a mode 2 vector table at `0x9000`. The test starts `a` at
2, the byte a device would have put on the bus, and wants the handler at that index reached, so `bc`
comes back at 300. Scale the index, add the table's address, load the 16 bit address stored there and
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
