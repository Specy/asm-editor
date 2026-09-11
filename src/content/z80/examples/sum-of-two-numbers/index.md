The program asks for two numbers, waits while you type them, and prints their sum. Press Run and the
console stops at the first prompt: type a number into the box under it, press Enter, and the run
carries on inside that one `in` instruction.

Print a string only talked. This one listens, which means the program stops in the middle of an
instruction until somebody answers it, and what comes back is a number in a register rather than
text you have to make sense of.

**You need to know:** the "Print a string" Example and the "Ports: in and out" lecture. What is new
here is a port that is read, `in a, (0x11)` asks for a whole line and parses it as a decimal number, so
the register the program reads next is the one the environment wrote.

```z80|playground|console|no-flags|allow-open
P_CHAR  equ 0x10
P_NUM   equ 0x11        ; reading it asks for a line and parses it as decimal
P_WORD  equ 0x14        ; writing it prints a 16 bit number, high byte in b

    .org 0x8000
    ld hl, first
    call print
    in a, (P_NUM)       ; x = readNumber()
    ld e, a
    ld d, 0             ; de = x, widened, since two bytes can add up to more

    ld hl, second
    call print
    in a, (P_NUM)       ; y = readNumber()
    ld l, a
    ld h, 0             ; hl = y
    add hl, de          ; x + y, in sixteen bits

    push hl
    ld hl, answer
    call print
    pop hl
    ld b, h             ; the high byte goes on the address bus
    ld c, P_WORD
    out (c), l          ; and the low byte is the payload
    ld a, 10
    out (P_CHAR), a
    halt

; print(p): the zero terminated string at hl, one character at a time
print:
    ld a, (hl)
    or a
    ret z
    out (P_CHAR), a
    inc hl
    jr print

    .org 0x9000
first:  .asciz "First number: "
second: .db 10, "Second number: ", 0
answer: .db 10, "The sum is ", 0
```

```testcase
{ "input": ["17", "25"] }
```

Type 17 and 25 and the console reads `The sum is 42`. A line that is not a number stops the program
with an error, and a number over 255 comes back as its low byte, because `a` is one byte and that is
all the port can hand back.

Two bytes add up to as much as 510, which no byte holds, so the sum is worked out in sixteen bits:
each number is widened with an `ld h, 0` or an `ld d, 0` as it arrives, and `add hl, de` adds the
two pairs. Printing it takes the last port of the console set. Port `0x14` prints a 16 bit number
whose low byte is what the `out` writes and whose **high byte is the high byte of the address bus**,
and in the `out (c), r` form the address bus carries `b`, so `ld b, h` and `ld c, 4` and
`out (c), l` print the whole of `hl`.

The `push hl` and `pop hl` around the third `call print` are there because `print` walks `hl` to the
end of the string it is printing. The sum has nowhere else to sit while that happens, and the stack
is where a value waits for a call to finish.

The `10` at the front of `second` and `answer` is a newline written as its character code, which is
how a line break goes inside a string. `.db 10, "Second number: ", 0` is one string of seventeen
bytes and the first of them is that break.

Try changing `ld c, P_WORD` to `ld c, P_NUM`. With 17 and 25 the console still reads
`The sum is 42`, because 42 fits in the low byte the `out` writes. Type 200 and 100 instead: the 16
bit port prints `300` and the byte port prints `44`, which is 300 with everything above eight bits
thrown away.
