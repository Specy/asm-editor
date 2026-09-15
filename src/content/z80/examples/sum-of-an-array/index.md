Six numbers are written into memory by the assembler, and the program adds them up and leaves the
total in `a`. There is one loop, it runs a fixed number of times and there is no condition inside
it, so the thing to look at is how the program gets from one number to the next.

An array does not fit in the registers and its elements have no names of their own, so the program
keeps the address of the next element in a pair and increments it as it goes.

```z80|playground|memory|no-flags|allow-open
count equ 6

    .org 0x8000
    ld hl, numbers  ; hl = the start of the array
    ld b, count     ; six of them
    xor a           ; sum = 0
loop:
    add a, (hl)     ; add the byte hl points at
    inc hl          ; on to the next byte
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

These six numbers add up to 108, which fits in a byte, and that is the ceiling. The total lives in
`a`, so the moment an array adds up to more than 255 the sum wraps round and the answer is wrong. A
sum that has to be bigger goes in `hl` instead, one `add hl, de` per element, with each byte widened
into `de` first.

Add a seventh number to the `.db` line, say 100, and run it: `a` still comes out at `6C`. The array
got longer and the loop did not, because `count` is what the loop counts with and it still says 6.
Nothing warns you. `count equ 6` has to become `count equ 7`, and then the total is `D0`, which is 208. A length that lives in two places is a length that will eventually disagree with itself.
