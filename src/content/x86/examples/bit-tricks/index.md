Three things done with bits instead of arithmetic: telling odd from even, counting the set bits in a
number, and multiplying by ten with shifts. None of them needs `div` or `mul`.

A number in a register is a pattern of bits, and `and`, `or`, `xor`, the shifts and `bt` work on that
pattern directly. When the question you are asking is about the bits, they are both shorter and much
faster than the arithmetic that would answer it.

**You need to know:** the "Arithmetic, logic and bits" lecture. What is new here is `bt`, which puts
one bit of a register into `CF`, and the loop that clears the lowest set bit.

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

`r8` is 0, because 37 is odd. `r9` is 3, the number of set bits in `100101`. `r10` is `172`, which is 370. `r12` is `25`, which is 37, since the whole number already fits in a byte. `r13` is 1, because
bit 5 of `100101` is the leading one.

`and rbx, rbx - 1` clears the **lowest set bit** and nothing else, which is the trick the counting
loop is built on: the loop runs once per set bit and not once per bit, so counting the bits of a
number with two of them takes two passes and not sixty four. It is called Kernighan's algorithm, and
x86 has an instruction that does the whole count, `popcnt`, on processors that have the extension.

`test rax, 1` and `and rax, 1` compute the same thing; `test` throws the answer away and keeps only
the flags, so `rax` survives.

Try changing `mov rax, 37` to `mov rax, 40`. `r8` becomes 1, `r9` becomes 2, and `r13` becomes 1 as
well, since 40 is `101000` and bit 5 is still set.
