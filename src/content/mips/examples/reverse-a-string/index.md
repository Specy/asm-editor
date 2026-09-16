This program reverses a zero-terminated string in the same memory that already holds it. The work
has two phases:

1. Scan forward to find the zero terminator.
2. Put one pointer on each end of the text and swap bytes while the left pointer is below the right
   pointer.

```mips|playground|memory|tests|allow-open
.data
text: .asciiz "Assembly"

.text
main:
    la $t0, text             # left: first character
    addu $t1, $t0, $zero    # right: scan from the same address

find_end:
    lbu $t2, 0($t1)
    beq $t2, $zero, found_end
    addiu $t1, $t1, 1
    j find_end

found_end:
    beq $t1, $t0, done      # an empty string has no last character
    addiu $t1, $t1, -1      # move from the terminator to the last character

swap_loop:
    sltu $t4, $t0, $t1      # t4 = 1 exactly while left < right
    beq $t4, $zero, done
    lbu $t2, 0($t0)         # save both original bytes
    lbu $t3, 0($t1)
    sb $t3, 0($t0)
    sb $t2, 0($t1)
    addiu $t0, $t0, 1
    addiu $t1, $t1, -1
    j swap_loop

done:
    addiu $v0, $zero, 10
    syscall
```

```testcase
{
    "expectedRegisters": {
        "v0": 10,
        "t0": "0x10010004",
        "t1": "0x10010003"
    },
    "expectedMemory": [
        {
            "type": "number-chunk",
            "address": "0x10010000",
            "bytes": 1,
            "expected": [121, 108, 98, 109, 101, 115, 115, 65, 0]
        }
    ]
}
```

The scan leaves `$t1` pointing **at** the terminator. If that address is also the start address in
`$t0`, the string is empty, so the program goes directly to `done`. Otherwise, subtracting one puts
`$t1` on the last character. The terminator itself is never used as an end pointer and is never
overwritten.

`lbu` reads one byte and zero-extends it to a 32-bit register. That makes the loaded value an
unsigned number from 0 to 255, so the terminator is exactly zero regardless of the other bytes in
the string. `addu` copies the starting address by adding zero, and `addiu` changes each pointer by
the signed immediate `1` or `-1` without an arithmetic-overflow trap.

The swap loop first uses `sltu` to compare the pointers as unsigned 32-bit address patterns. This
matters for addresses whose top bit is set: interpreting the same pattern as a signed integer would
call it negative. When left is no longer below right, `$t4` becomes zero and the program finishes.
For an odd-length string, that condition leaves the middle byte where it is.

Both bytes are loaded before either store. If the program stored the left byte first, it would
overwrite the right byte before saving it. After the two loads, the two `sb` instructions can write
the saved values in the opposite positions safely.

This Playground executes a branch or jump and then continues at its destination immediately; it
has no branch delay slots, so no `nop` instructions are needed. `la` is the familiar assembler
shortcut that places the address of `text` in `$t0`.

The memory panel starts at the data segment's default address, `0x10010000`. After running the
program, the nine bytes there are `79 6C 62 6D 65 73 73 41 00`: `ylbmessA` followed by the unchanged
zero terminator. The attached test also checks those exact bytes, the exit service in `$v0`, and the
final pointer positions.

Before changing the string in the Playground, predict which bytes move and then check the memory
panel:

| Input   | Text after the run | What the pointers do                        | Zero terminator |
| ------- | ------------------ | ------------------------------------------- | --------------- |
| empty   | empty              | stop before moving right back               | preserved       |
| `A`     | `A`                | meet on the only character; perform no swap | preserved       |
| `race`  | `ecar`             | perform two swaps                           | preserved       |
| `Level` | `leveL`            | perform two swaps; leave `v` in the middle  | preserved       |
