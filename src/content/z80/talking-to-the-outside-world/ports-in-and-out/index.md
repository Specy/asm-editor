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
`a`. Press Run, type a number in the input box under the console, and press Enter. If no input is
ready, the instruction pauses until a line arrives.

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
