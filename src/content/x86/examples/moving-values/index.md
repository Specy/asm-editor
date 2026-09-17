This is the first program of the ladder, and it exists to show where a value can come from. There are
three places: an **immediate**, which is a number written into the instruction itself; another
**register**; and **memory**, named by a label in square brackets. One instruction, `mov`, reaches all
three, which is why most lines of most x86 programs are a `mov`.

```x86|playground|memory|allow-open
default rel
global _start

section .data
value:  dq 7                ; a 64 bit variable in memory

section .text
_start:
    mov rax, 10             ; an immediate into a register
    mov rbx, rax            ; a register into another register
    add rbx, 5              ; rbx is now 15

    mov rcx, [value]        ; memory into a register
    imul rcx, rbx           ; rcx is now 105
    mov [value], rcx        ; and the answer back into memory

    mov rax, 60             ; syscall 60: exit
    xor rdi, rdi            ; with status 0
    syscall
```

Type `402000` into the memory panel and the eight bytes there read `69 00 00 00 00 00 00 00`, which
is the answer stored little endian, lowest byte first.

`rax` is the one register that does not end where the program left it. It holds 10 for two
instructions and then the exit at the bottom takes it for the call number, so what you read in the
panel at the end is `3C`, which is 60. A register belongs to whoever wrote it most recently.

Look down the six working lines and count the square brackets. There is never more than one pair on a
line, and that is not an accident: **two memory operands are not an instruction**, so copying `value`
into a second variable would take two lines and a register in between. One pair is allowed anywhere,
though, so `imul rcx, [value]` would have multiplied straight out of memory and saved a line.

Change `mov rcx, [value]` to `lea rcx, [value]` and the program still runs, still multiplies, and
produces nonsense. `rcx` now holds `402000`, the address the variable lives at rather than the 7
inside it, and the multiplication that follows is arithmetic on an address. The brackets are the whole
difference between the two lines.
