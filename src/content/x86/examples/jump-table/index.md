A `switch` with four cases, done without comparing anything. The addresses of the four branches are
written into memory as a table, and the program reads the one it wants and jumps to it.

A chain of `cmp` and `je` costs one comparison per case. A jump table costs one memory read and one
jump whatever the case is, which is why a C compiler turns a dense `switch` into exactly this.

**You need to know:** the "cmp and the conditional jumps" lecture and the "Effective addresses"
lecture. What is new here is a label used as **data**, and `jmp` with a memory operand.

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

`r8` comes out at `1E`, which is 30, the third case.

`dq case0` writes the **address** of `case0` into memory, eight bytes of it. A label is a number, and
nothing stops you storing it the way you would store any other number.

`jmp [rbx + rcx*8]` reads eight bytes from the table and puts them in `rip`. Written without the
brackets, `jmp rbx`, it would jump to the address of the table itself and try to execute the
addresses as instructions.

The `cmp rcx, CASES` and `jae` are not optional. An index past the end reads eight bytes of whatever
follows the table and jumps there, which is a jump to a number that was never an address. That check
is the `default:` of the `switch`.

The labels here are ordinary ones rather than local `.case0` labels, because a local label belongs to
the last ordinary label above it, and the `.done` inside `case0` would then be a different label from
the `.done` inside `case1`.

Try changing `mov rcx, 2` to `mov rcx, 9`. The check catches it and `r8` comes out at
`FFFFFFFFFFFFFFFF`. Then delete the `cmp` and the `jae` and run it again: the program stops
somewhere, and `rip` in the registers panel is the only clue about where it went.
