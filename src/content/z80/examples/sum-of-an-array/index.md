Six numbers are written into memory by the assembler, and the program adds them up and leaves the
total in `a`. There is one loop, it runs a fixed number of times and there is no condition inside
it, so the thing to look at is how the program gets from one number to the next.

An array does not fit in the registers and its elements have no names of their own, so the program
keeps the address of the next element in a pair and increments it as it goes.

**You need to know:** the "Loops and djnz" lecture and the "Arrays, strings and ix" lecture. What is
new here is walking memory with a pointer, `(hl)` reads the byte `hl` points at and the `inc hl`
under it steps the pointer forward by the size of one element.

```z80|playground|memory|no-flags|allow-open
count equ 6

    .org 0x8000
    ld hl, numbers  ; p = numbers
    ld b, count     ; six of them
    xor a           ; sum = 0
loop:
    add a, (hl)     ; sum = sum + *p
    inc hl          ; p++
    djnz loop
    halt

    .org 0x9000
numbers: .db 4, 8, 15, 16, 23, 42
```

`(hl)` works wherever an 8 bit register works, so `add a, (hl)` is one instruction and the value
never passes through a register of its own. `(bc)` and `(de)` cannot do that, they only work with
`a` and only as `ld a, (bc)` and `ld (bc), a`, which is why a program that walks one array keeps its
pointer in `hl`.

`xor a` is the idiom for `a = 0`. It computes `a ^ a`, which is zero whatever `a` held, in one byte
where `ld a, 0` is two.

The numbers are bytes, one each, so `inc hl` moves on by one every time round and `hl` comes out at
`9006`, one past the last element. `a` comes out at `6C`, which is 108.

Six bytes fit in one byte of total here, and that is the ceiling: the M68K adds words into a long
and has room to spare, while this program wraps round as soon as the array adds up to more than 255.
A sum that has to be bigger goes in `hl`, one `add hl, de` per element, with the byte widened into
`de` first.

Try adding a seventh number to the `.db` line, say 100. `a` still comes out at `6C`, because `count`
is what the loop counts with and you did not touch it. Change `count equ 6` to `count equ 7` and it
adds the new one too, for `D0`, which is 208.
