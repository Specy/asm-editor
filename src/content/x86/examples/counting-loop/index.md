Ten slots of memory, filled with the numbers 1 to 10. The thing to watch here is not the loop, which
you have seen, but what it leaves behind in the memory panel: eighty bytes that a program elsewhere
would call an array of ten numbers, and that memory itself has no opinion about at all.

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

Type `402000` into the memory panel. Eighty bytes: `01` then seven zeroes, `02` then seven zeroes, on
to `0A`. Seven eighths of what the program wrote is zero, because a qword is eight bytes wide whether
or not the number in it needs them.

That is what `resq 10` asked for. `resq` reserves units and not bytes, so the 10 means ten qwords and
the program gets eighty bytes. Writing `resb 10` by mistake gives you ten bytes, the loop writes past
the end of them on its second pass, and nothing warns you, because there is nothing there to warn:
`numbers` is an address and the loop is arithmetic on it.

The `8` in `[numbers + rcx*8]` is the same number for the same reason, and it has to match. Change
the array to `resd 10`, the store to `mov [numbers + rcx*4], eax` and the scale to 4, and the loop
fills ten dwords correctly. Change only two of the three and it writes the right values into the
wrong places.

A loop that put the **same** value in every slot would not need to be a loop at all:

```
    lea rdi, [numbers]
    mov rax, 7
    mov rcx, 10
    cld
    rep stosq
```

Five instructions no matter how long the array is. That cannot help here, because every slot gets a
different number, but it is the shape to reach for when they do not.
