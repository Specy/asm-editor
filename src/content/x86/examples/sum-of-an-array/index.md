Six numbers added up, and the loop that does it has no counter in it anywhere. There is no `i`, no
comparison against 6, and nothing to update if the array grows. Two registers hold two addresses, and
the loop runs until one of them catches the other up.

```x86|playground|memory|allow-open
default rel
global _start

section .data
numbers:    dq 4, 8, 15, 16, 23, 42
numbers_end:

section .text
_start:
    lea rsi, [numbers]      ; the address of the first element
    lea rdi, [numbers_end]  ; and of one past the last
    xor rax, rax            ; the running total
.next:
    add rax, [rsi]          ; add whatever rsi is pointing at
    add rsi, 8              ; and step it on by one element
    cmp rsi, rdi
    jb .next                ; until it reaches the end
    mov r8, rax

    mov rax, 60
    xor rdi, rdi
    syscall
```

Run it and look at `rsi` and `rdi` when it stops. Both hold `0x402030`, which is forty eight bytes
past `0x402000`: six elements of eight bytes each. The loop stopped because the moving address
arrived at the fixed one, and neither register ever held a count.

`numbers_end:` is where that fixed address comes from. It is a label with nothing underneath it, so it
names the address the next item would have gone at had there been one. It is an address to compare
against and never to read from, and it costs nothing, because the assembler works it out while it lays
the data down.

Add a seventh number to the `dq` line, say `100`. The total becomes 208 and not one instruction in the
program changes, because `numbers_end:` moved along with the array. Now do the same to a version of
this loop written with a counter and a `cmp rcx, 6`, and you have two places to keep in step instead
of none.

The body is two instructions. `add rax, [rsi]` takes its second operand out of memory, so there is no
separate load, and `add rsi, 8` moves on by exactly one element. The 8 is the size of a qword, and if
the array were dwords it would be 4.
