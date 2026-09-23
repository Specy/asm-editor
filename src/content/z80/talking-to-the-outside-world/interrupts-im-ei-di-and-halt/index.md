On the previous page, the programs kept reading a port to find out whether a key or mouse button was
waiting. That is **polling**: the program asks the device the same question again and again. It is
simple, but the CPU spends time checking even when nothing has happened.

An **interrupt** turns the question around. A device sends the CPU an interrupt request when it needs
attention. The Z80 finishes its current instruction and transfers control according to its interrupt
mode. The usual routes save the address of the next instruction on the stack and jump to an
**interrupt handler**. When the handler returns, the interrupted program can continue as though
nothing happened, provided the handler restored every part of the program's state that it changed.

The playground has no source of Z80 interrupts. Its keyboard and mouse must be polled, and neither a
timer nor a port will call a handler. Interrupt instructions still assemble, so we can examine the
code a real machine uses and call a handler ourselves when we want to test it.

## Waiting with halt

On a real Z80, `halt` puts the processor into its halted state. It stops executing ordinary
instructions while it waits for an interrupt. When an interrupt is accepted, the Z80 leaves that
state, runs the handler and later continues with the instruction after `halt`.

This is useful in an interrupt-driven machine: instead of polling an idle device, the CPU can wait
until the device asks for attention. It matters whether a maskable interrupt is enabled; an ignored
request cannot run its handler. The Z80 also has a separate non-maskable interrupt, or **NMI**, for
events that `di` cannot disable.

In this playground no interrupt can arrive. Rather than wait forever, the playground treats `halt`
as the end of the run. That is why the runnable examples in this course finish with it.

## Choosing when an interrupt may run

The ordinary Z80 interrupt input is **maskable**: a program may temporarily refuse requests from it.
`di` disables their acceptance, and `ei` enables it again. A program uses a short disabled region
when a handler must not see some shared value halfway through an update.

There is one important timing rule. After `ei`, maskable interrupts are still not accepted until the
instruction immediately following it has executed. A handler can therefore finish like this:

```z80
    ei
    reti
```

The `reti` executes before another maskable interrupt can be accepted. `di` has no corresponding
delay: it takes effect when it executes. Here, with no incoming requests, `di` and `ei` produce no
visible event.

## Entering and leaving a handler

When the Z80 accepts a maskable interrupt, it disables further maskable interrupts. In modes 1 and
2, it also pushes the return address on the stack before going to the handler. Mode 0 executes an
instruction supplied by the hardware; the commonly supplied `rst` instruction pushes a return
address too. A handler normally ends with `reti`, which takes that saved address from the stack.
Like `ret`, it continues at the address it popped; it also tells compatible Z80 peripheral hardware
that the interrupt service is complete.

An interrupt may land between any two instructions. The handler must therefore preserve every
register and flag that the interrupted code may still rely on. This example's contract is to
preserve `af`, `bc`, `de` and `hl`, because it uses all four pairs.

`af` is the 16-bit pair made from the accumulator `a` and the flags register `f`. Saving `af` with
`push af` therefore saves both the accumulator and the condition flags. Pairs must be popped in the
reverse order because the stack is last in, first out.

```z80|playground|no-flags
    .org 0x8000
    ld bc, 0x1111
    ld de, 0x2222
    ld hl, 0x3333
    ld a, 0x44
    cp 0x44            ; set the zero flag

    call handler       ; stand in for an interrupt in this playground
    halt

handler:
    push af
    push bc
    push de
    push hl

    ld bc, 0xAAAA      ; the handler may now use these registers
    ld de, 0xBBBB
    ld hl, 0xCCCC
    ld a, 0x88
    or a               ; this changes a and clears the zero flag

    pop hl
    pop de
    pop bc
    pop af
    ret                ; paired with call in this runnable demonstration
```

After the call, the four pairs have their original values and the zero flag set by `cp` is still
set. On hardware, the same save/work/restore body would be entered by the CPU and would end with
`ei` followed by `reti` instead of the demonstration's `ret`.

The Z80 also has a shadow `af'` pair, just as it has the shadow `bc'`, `de'` and `hl'` pairs from the
registers lecture. `ex af, af'` swaps `af` with `af'`; `exx` swaps the other three pairs. Real
handlers often use those fast swaps instead of the stack. The explicit pushes above make the
preservation contract easier to see: flags travel with `a` in `af`, and every saved pair is restored.

An NMI handler returns with `retn`. NMI has slightly different enable-state rules; for ordinary
device handlers, the `ei` and `reti` sequence above is the pattern to recognise.

## The three interrupt modes

The instruction `im 0`, `im 1` or `im 2` selects how a real Z80 finds a handler for a maskable
interrupt. It does not enable interrupts; that is `ei`'s job.

- In **mode 0**, the interrupting hardware supplies an instruction for the Z80 to execute. Hardware
  commonly supplies one of the `rst` instructions, which jumps to a small fixed address.
- In **mode 1**, every maskable interrupt goes to address `0x0038`.
- In **mode 2**, the hardware supplies a byte and the Z80 combines it with the `i` register to locate
  a two-byte handler address in a table. `i` provides the high byte of the table location; the device
  provides the low byte. The Z80 reads the handler address there in little-endian order and jumps to
  it.

Mode 1 is the simplest when one handler can deal with every device. Mode 2 provides a **vector
table**, so different supplied bytes can lead to different handlers. Since the playground never
accepts an interrupt, it never performs any of these three dispatches.

## One to write

Complete the demonstration handler so that it preserves every pair it changes. The caller also
leaves the zero flag set before the call. If that flag survives, `ix` becomes 1; if the handler
damages it, `ix` becomes 0.

Save and restore `af`, `bc`, `de` and `hl`. Remember to pop them in the opposite order from the
pushes.

```z80|playground|exercise
    .org 0x8000
    ld bc, 0x1111
    ld de, 0x2222
    ld hl, 0x3333
    ld a, 0x44
    cp 0x44

    call handler
    ld ix, 1
    jr z, done
    ld ix, 0
done:
    halt

handler:
    ; Save the pairs here.

    ld bc, 0xAAAA
    ld de, 0xBBBB
    ld hl, 0xCCCC
    ld a, 0x88
    or a

    ; Restore the pairs here.
    ret
```

```testcase
{
    "startingRegisters": { "sp": "0xFFFF" },
    "expectedRegisters": {
        "a": "0x44",
        "bc": "0x1111",
        "de": "0x2222",
        "hl": "0x3333",
        "ix": 1,
        "sp": "0xFFFF"
    }
}
```

<details>
<summary>Show solution</summary>

```z80|playground|solution
    .org 0x8000
    ld bc, 0x1111
    ld de, 0x2222
    ld hl, 0x3333
    ld a, 0x44
    cp 0x44

    call handler
    ld ix, 1
    jr z, done
    ld ix, 0
done:
    halt

handler:
    push af
    push bc
    push de
    push hl

    ld bc, 0xAAAA
    ld de, 0xBBBB
    ld hl, 0xCCCC
    ld a, 0x88
    or a

    pop hl
    pop de
    pop bc
    pop af
    ret
```

</details>
