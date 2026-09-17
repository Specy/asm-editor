Four possible destinations and not one comparison between them. Choosing between four branches with
`cmp` and `je` costs up to four comparisons, and every case you add costs one more. This program costs
one memory read and one jump, and it would still cost one memory read and one jump with two hundred
cases in the table.

```x86|playground|allow-open
default rel
global _start

section .data
table:  dq case0, case1, case2, case3      ; four addresses, eight bytes each
CASES   equ ($ - table) / 8

section .text
_start:
    mov rcx, 2              ; the case to run
    cmp rcx, CASES
    jae out_of_range        ; an index past the end would jump anywhere
    lea rbx, [table]
    jmp [rbx + rcx*8]       ; read the address there and go to it

case0:
    mov r8, 10
    jmp done
case1:
    mov r8, 20
    jmp done
case2:
    mov r8, 30
    jmp done
case3:
    mov r8, 40
    jmp done
out_of_range:
    mov r8, -1
done:

    mov rax, 60
    xor rdi, rdi
    syscall
```

`dq case0` is the line that makes this possible, and it is stranger than it looks. A label is a
number, the address of some code, and nothing stops you storing that number in memory the way you
would store a price or a count. Four labels, four qwords, an ordinary array that happens to be full of
addresses of instructions.

`jmp [rbx + rcx*8]` then reads eight bytes out of that array and puts them in `rip`. The brackets are
load bearing: `jmp rbx` without them would jump to the address of the table itself and start executing
the table, treating a list of addresses as a list of instructions.

The `cmp rcx, CASES` and `jae` above it are not a nicety. An index past the end of the table reads
eight bytes of whatever the assembler put after it and jumps to that, and "whatever was next in memory"
is not an address of anything. Set `mov rcx, 9` and the check catches it and `r8` comes out as -1. Now
delete the check and run it again: the program stops somewhere, with no message, and `rip` in the
registers panel is your only evidence about where it went.

The four labels here are ordinary ones and not local `.case0` labels, and it is not a style choice. A
local label belongs to the last ordinary label above it, so a `.done` written inside `case0` would be a
different label from a `.done` written inside `case1`, and the four `jmp done` lines would go to four
different places.
