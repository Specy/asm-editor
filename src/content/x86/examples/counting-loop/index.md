Ten slots of memory, filled with the numbers 1 to 10. The loop has a counter, the counter is also the
index into the array, and the whole of the indexing is in one memory operand.

**You need to know:** the "Loops" lecture and the "Effective addresses" lecture. What is new here is
`resq`, which reserves slots without writing anything into the program file, and the scale of 8 in
`[numbers + rcx*8]` that turns an index into an address.

```x86|playground|memory|allow-open
default rel
global _start

section .bss
numbers: resq 10            ; ten 64 bit slots, not yet written

section .text
_start:
    xor rcx, rcx            ; the index, counting 0 to 9
.fill:
    mov rax, rcx
    inc rax                 ; the value to store, 1 to 10
    mov [numbers + rcx*8], rax
    inc rcx
    cmp rcx, 10
    jb .fill                ; keep going while the index is below 10

    mov rax, 60             ; syscall 60: exit
    xor rdi, rdi
    syscall
```

Type `402000` into the memory panel. The eighty bytes read `01` then seven zeroes, `02` then seven
zeroes, and so on to `0A`: ten qwords, little endian, holding 1 to 10.

`[numbers + rcx*8]` is a displacement, an index and a scale. The processor multiplies `rcx` by 8 and
adds it to the address of `numbers` as part of working out where to write, so the whole of `&numbers[i]`
is inside one operand. The 8 is the size of one element and nothing else.

`jb` and not `jl`, because an index is never negative and unsigned is the right question to ask about
it.

`inc rcx` and not `add rcx, 1` is the habit to pick up. It is one byte shorter, and it leaves `CF`
alone, which matters in a loop that is adding numbers up with a carry between passes.

A loop that writes the **same** value into every slot does not need a loop. `rep stosq` stores `rax`
into `[rdi]` and steps it, `rcx` times, so filling ten qwords with 7 is

```
    lea rdi, [numbers]
    mov rax, 7
    mov rcx, 10
    cld
    rep stosq
```

That is five instructions whatever the length, and it is what `memset` compiles to. It cannot help
here because every slot gets a different number.

Try changing `resq 10` to `resd 10`, the store to `mov [numbers + rcx*4], eax`, and the scale to 4.
The same loop fills ten dwords instead, and the memory panel shows `01 00 00 00` where it showed
eight bytes.
