Four questions about the number 37, answered without a single `mul` or `div` between them: is it even,
how many of its bits are set, what is it times ten, and is bit 5 one.

37 is `100101` in binary, and every answer below is easier to see in that form than in the decimal.

```x86|playground|allow-open
default rel
global _start

section .text
_start:
    mov rax, 37             ; 100101 in binary

    test rax, 1             ; the lowest bit alone
    setz r8b                ; 1 when it is clear, so 1 when the number is even

    mov rbx, rax            ; count the set bits
    xor r9, r9
.count:
    test rbx, rbx
    jz .counted
    mov rcx, rbx
    dec rcx
    and rbx, rcx            ; clear the lowest set bit
    inc r9
    jmp .count
.counted:

    mov r10, rax
    shl r10, 3              ; times 8
    mov r11, rax
    shl r11, 1              ; times 2
    add r10, r11            ; and so times 10

    mov r12, rax
    and r12, 0xFF           ; keep the low byte and nothing else

    bt rax, 5               ; is bit 5 set?
    setc r13b

    mov rax, 60
    xor rdi, rdi
    syscall
```

The counting loop is the one worth taking apart, because `and rbx, rcx` with `rcx` one less than
`rbx` does something that is not obvious at all: it clears the **lowest set bit** of `rbx` and leaves
every other bit alone.

Watch it on 37. Subtracting one turns the lowest set bit into a zero and every zero below it into a
one:

| `rbx`    | `rbx - 1` | `and`    |
| -------- | --------- | -------- |
| `100101` | `100100`  | `100100` |
| `100100` | `100011`  | `100000` |
| `100000` | `011111`  | `000000` |

Three passes, three set bits, and the loop stops because there is nothing left. The point is that the
loop runs once per **set** bit rather than once per bit, so a sixty four bit register with two bits set
takes two passes and not sixty four. It is known as Kernighan's algorithm, and a processor with the
right extension does the whole count in one instruction, `popcnt`.

`test rax, 1` and `and rax, 1` compute exactly the same bits, and the difference is what happens
afterwards: `test` throws the answer away and keeps only the flags, so `rax` still holds 37 for the
three sections below it to use.

`r12` comes out at `25`, which is 37 again, because masking the low byte of a number that already fits
in a byte changes nothing. That is not a bug, and a mask on a bigger number, `and r12, 0xFF` applied
to 1000, would leave `E8`.
