Every program so far has left its result in a register or in memory. To print a character or read
what somebody typed, the CPU has to exchange a byte with a device.

## Ports

The Z80 keeps devices in a separate I/O space. An address in memory and a **port** can have the same
number without overlapping: `ld` reaches memory, while `in` and `out` reach ports.

These are the two forms we will use first:

- **`out (n), a`** sends the byte in `a` to port `n`.
- **`in a, (n)`** receives a byte from port `n` and puts it in `a`.

Here `n` is an 8-bit number written in the instruction, from `0x00` to `0xFF`. The machine decides
what device, if any, responds to each number.

The Z80 actually places a 16-bit value on its address bus during an I/O operation. The port number
is the low byte. With `out (n), a`, the bus and the byte being sent look like this:

```
address bus:  high byte = a  |  low byte = n
data written: a              |  port number = n
```

With `in a, (n)`, the old value of `a` likewise supplies the high address byte before the device's
incoming byte replaces it.

The high byte is part of the bus address, separate from the byte being transferred as data. On real
hardware, a device may inspect it. This playground selects a device by the low byte only. Most of
its ports ignore the high byte; port `0x14` deliberately uses it as an extra value, as shown below.

## The console ports

The playground provides five console ports:

| port   | writing prints                                | reading gives                       |
| ------ | --------------------------------------------- | ----------------------------------- |
| `0x10` | the byte as a character                       | the next character of an input line |
| `0x11` | the byte as an unsigned number, 0 to 255      | a line parsed as a decimal number   |
| `0x12` | the byte as a signed number, -128 to 127      | a line parsed as a decimal number   |
| `0x13` | the byte as two upper-case hexadecimal digits | a line parsed as hexadecimal        |
| `0x14` | an unsigned 16-bit number, assembled below    | a line parsed as a decimal number   |

The complete port map is on the [Z80 I/O documentation page](/documentation/z80/io).

## Printing a string

The character port accepts one byte at a time, so printing a string uses the string loop you already
know with an `out` in the middle.

```z80|playground|console|no-registers|no-flags
    .org 0x8000
    ld hl, message  ; hl = the start of the string
print:
    ld a, (hl)      ; the byte hl points at
    or a            ; is it the zero terminator?
    jr z, done
    out (0x10), a   ; print one character
    inc hl          ; advance to the next byte
    jr print
done:
    halt

    .org 0x9000
message: .asciz "Hello, world!", 10
```

The console shows `Hello, world!` and a newline. The `10` is the character code for the newline.
`.asciz` places the terminating zero after it, so the loop prints the newline and then finishes.

## Printing numbers

The port chooses how the console displays a byte. The bits do not change; only their presentation
does.

```z80|playground|console|no-flags
    .org 0x8000
    ld a, 200
    out (0x11), a   ; unsigned: 200
    ld a, ' '
    out (0x10), a
    ld a, 200
    out (0x12), a   ; signed: -56
    ld a, ' '
    out (0x10), a
    ld a, 200
    out (0x13), a   ; hexadecimal: C8
    ld a, 10
    out (0x10), a   ; newline
    halt
```

The console shows `200 -56 C8`.

One byte cannot hold values above 255, so port `0x14` uses two bytes. This needs another form of
`out`:

- **`out (c), r`** sends the byte in register `r` to the port whose low-byte number is in `c`.
  At the same time, `b` supplies the high byte of the address bus.

For this playground, `c` still selects the port. Port `0x14` treats `b` as the high byte of the
number and the byte sent as data as its low byte:

```z80|playground|console|no-flags
    .org 0x8000
    ld hl, 1000
    ld b, h         ; high byte of the number
    ld c, 0x14      ; port number
    out (c), l      ; low byte of the number
    halt
```

For this `out`, the address bus contains `b:c`, while the data byte is `l`. Port `0x14` combines
`b` and `l` and prints `1000`. Other console output ports ignore `b`.

## Reading

`in a, (0x11)` waits for a line of input, parses it as a decimal number and places its low byte in
`a`. Press Run, type a number in the console, and press Enter. If no input is ready, the
instruction pauses until a line arrives.

```z80|playground|console|no-flags
    .org 0x8000
    in a, (0x11)    ; first decimal number
    ld b, a
    in a, (0x11)    ; second decimal number
    add a, b
    out (0x11), a   ; print the sum as unsigned decimal
    ld a, 10
    out (0x10), a
    halt
```

```testcase
{ "input": ["10", "32"] }
```

Type `10`, Enter, `32`, Enter. The console shows `42`. Invalid decimal input ends the run with an
error. A value outside one byte is reduced to its low byte.

The character port returns an input line one byte at a time. The line ends with a newline character,
`0x0A`, so a program can read until it sees that byte:

```z80|playground|console|no-flags
    .org 0x8000
    ld b, 0         ; character count
read:
    in a, (0x10)    ; next character
    cp 10           ; newline?
    jr z, done
    inc b
    jr read
done:
    ld a, b
    out (0x11), a
    ld a, 10
    out (0x10), a
    halt
```

```testcase
{ "input": ["hi there"] }
```

Type `hi there` and press Enter. The console shows `8`, the number of characters before the
newline.

## Making sound

Ports `0x60` to `0x64` let a program play sounds. Each sound has a **pitch**, which describes how
high or low it sounds. Pitches are numbered from 0 to 127: higher numbers give higher sounds.
For example, 60 is middle C, 64 is E and 67 is G.

Three ports set how later sounds will play:

- Write an instrument number to `0x62`. The numbers run from 0 to 127: 0 is piano, 40 is violin,
  56 is trumpet and 73 is flute. For example, put `40` in `a` and use `out (0x62), a` to select
  the violin.
- Write a volume from 0 to 127 to `0x63`, where 0 is silent and 127 is loudest. To choose volume
  80, put `80` in `a` and use `out (0x63), a`.
- Write a duration in milliseconds to `0x64`. As with the 16-bit number port, use `out (c), a`
  with `c = 0x64`: `b` supplies the high byte and `a` the low byte. This allows durations up to
  65,535 milliseconds.

A run starts with instrument 0 (piano), volume 100 and a duration of 1000 milliseconds, or one
second. Each setting stays in effect until you write a new value to its port. Once the duration
has been written, you can reuse `b` for something else.

Writing a pitch to `0x60` starts a sound and lets the program continue while it plays. Several
writes can therefore start sounds that overlap. If the instrument sounds have not loaded yet,
the program pauses at that request until the browser finishes loading them. Later runs share the
loaded sounds.

To play sounds one after another, use port `0x61`. This needs another form of `in`:

- **`in a, (c)`** reads from the port whose number is in `c` and puts the returned byte in `a`.
  As with `out (c), r`, `b` supplies the high byte of the address bus.

For this playground's port `0x61`, set `c` to `0x61` and put the pitch in `b`. The read starts that
sound, waits for the duration you set, then replaces `a` with `0`. The example can ignore this
returned zero. This play-and-wait behavior belongs to the playground's sound device; it is not a
general rule about `in`.

The example sets a duration of 300 milliseconds, then reuses `b` for each pitch:

```z80|playground|no-flags
    .org 0x8000
    ld b, 0x01      ; duration 0x012C = 300 ms: b is the high byte
    ld a, 0x2c      ; and the byte sent the low byte
    ld c, 0x64
    out (c), a
    ld c, 0x61      ; play the pitch in b, then wait for its duration
    ld b, 60        ; middle C
    in a, (c)
    ld b, 64        ; E
    in a, (c)
    ld b, 67        ; G
    in a, (c)
    ld a, 60        ; C, E and G again, together: a chord
    out (0x60), a
    ld a, 64
    out (0x60), a
    ld a, 67
    out (0x60), a
    halt
```

The three reads of `0x61` play C, E and G one after another, 300 milliseconds each. The three writes
to `0x60` start them within a few instructions of each other, so they sound together as a chord.
The chord keeps playing after `halt` and stops when its duration is over.

Once a program has made a sound, a **Sound** button in the execution dock turns sound off and on.
Testcases are silent, and each read of `0x61` completes immediately while advancing the simulator's
clock by the requested duration.

### A sound chip

The note ports play recorded instruments. The editor also emulates a **sound chip**, the
AY-3-8910 used in the MSX, the ZX Spectrum 128 and the Amstrad CPC. It makes square waves and noise
on three channels, A, B and C. Here its port addresses, register numbers and tone periods match
the MSX interface.

The chip keeps producing sound while the CPU does other work. Its sixteen numbered **registers**
hold the sound settings. These registers belong to the chip; the Z80's registers, such as `a`,
carry bytes to them. To write a chip register, first send its number to port `0xA0`, then send its
value to port `0xA1`.

This example uses four chip registers to play a tone on channel A:

- registers 0 and 1 hold the **period**, a 12-bit number: register 0 holds its low eight bits and
  register 1 holds its upper four bits.
- register 7 is the **mixer**. A 0 bit enables a tone or noise source. The supplied setting `0xBE`
  enables channel A's tone and disables the other tones and all noise.
- register 8 holds channel A's volume: 0 is silent and 15 is loudest.

The period determines the pitch: `frequency = 1,789,772.5 / (16 × period)` Hz, using the chip's
clock of 1,789,772.5 ticks per second. A larger period gives a lower note; doubling it lowers the
pitch by an octave. The example supplies periods 428, 339 and 285 for middle C, E and G.

The `tone` subroutine receives the period as a number in `hl` and sends its two parts to the chip.
For example, 428 is `0x01AC`, so `l = 0xAC` goes to chip register 0 and `h = 0x01` goes to register 1.

To hold each pitch before changing it, the program uses the playground's wait port `0x50`. Set
`c = 0x50` and put a delay from 0 to 255 hundredths of a second in `b`. Then `in a, (c)` waits for
that delay and returns 0 in `a`. The chip keeps playing during the wait. With `b = 40`, each wait
lasts 0.4 seconds.

Run the example and listen for three held tones: C, then E, then G, each lasting about 0.4 seconds.
In this playground, the final `halt` ends the program and silences the chip.

```z80|playground
        .org 0x8000
        ld a, 7         ; register 7, the mixer:
        out (0xa0), a
        ld a, 0xbe      ; only channel A's tone enabled
        out (0xa1), a
        ld a, 8         ; register 8, channel A's volume:
        out (0xa0), a
        ld a, 15        ; loudest fixed volume
        out (0xa1), a
        ld hl, 428      ; middle C
        call tone
        ld hl, 339      ; E
        call tone
        ld hl, 285      ; G
        call tone
        halt            ; the chip falls silent when the program ends

tone:   ld a, 0         ; register 0, the period's low byte
        out (0xa0), a
        ld a, l
        out (0xa1), a
        ld a, 1         ; register 1, the period's upper four bits
        out (0xa0), a
        ld a, h
        out (0xa1), a
        ld c, 0x50      ; wait port
        ld b, 40        ; 40 hundredths = 0.4 seconds
        in a, (c)       ; wait, then a = 0
        ret
```

Each call changes the period of the same channel, so the next pitch replaces the one already
playing. Try changing the volume written to register 8 from 15 to 6 and run it again to hear a
quieter version. The [Sound chip ports](/documentation/z80/io#sound-chip) reference includes more
note periods and the remaining chip settings.

## Unconnected ports

In this playground, writing to an unconnected port has no effect and reading one produces `0xFF`.

```z80|playground|console|no-flags
    .org 0x8000
    in a, (0x77)    ; no playground device uses this port
    out (0x13), a
    halt
```

The console shows `FF`.

## Two to print

Print `The answer is 42` with no newline after it. The string is stored at `0x9000`; print it one
character at a time, then print 42 through the unsigned-number port.

```z80|playground|console|exercise
    .org 0x8000
    ; your code here
    halt

    .org 0x9000
message: .asciz "The answer is "
```

```testcase
{
    "expectedOutput": "The answer is 42"
}
```

<details>
<summary>Show solution</summary>

```z80|playground|console|solution
    .org 0x8000
    ld hl, message
print:
    ld a, (hl)
    or a
    jr z, number
    out (0x10), a
    inc hl
    jr print
number:
    ld a, 42
    out (0x11), a
    halt

    .org 0x9000
message: .asciz "The answer is "
```

</details>

Now read a decimal number and print the same byte as hexadecimal, with nothing else in the output.

```z80|playground|console|exercise
    .org 0x8000
    ; your code here
    halt
```

```testcase
{
    "input": ["255"],
    "expectedOutput": "FF"
}
```

<details>
<summary>Show solution</summary>

```z80|playground|console|solution
    .org 0x8000
    in a, (0x11)
    out (0x13), a
    halt
```

```testcase
{ "input": ["255"] }
```

</details>
