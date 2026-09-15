This course writes one language, x86, and runs the programs you write as real Linux programs. If you
have never written assembly at all, [Assembly basics](/learn/courses/assembly-basics) covers
registers, memory, branching and the stack quickly and comes first.

## The machine

**x86** started with the Intel 8086 in 1978, a 16 bit chip whose cut down cousin the 8088 went into
the IBM PC in 1981. The 80386 of 1985 widened it to 32 bits, and AMD widened it again to 64 in 2003,
a design Intel then adopted as its own. Every widening kept the older instructions working, which is
why the machine you write for today still has an accumulator called `ax` living inside a register
called `rax`. What you write here is **x86-64**, the 64 bit form, which is what desktop and server
processors run. It gives you:

- **Sixteen general purpose registers**, 64 bits each: `rax`, `rbx`, `rcx`, `rdx`, `rsi`, `rdi`,
  `rbp`, `rsp` and `r8` to `r15`. Any of them can hold a number or an address, and `rsp` is the stack
  pointer.
- **Four names for each register**, one per width. `rax` is all 64 bits, `eax` is the low 32, `ax`
  the low 16, `al` the low 8. They are not four registers, they are four views of one.
- **`rip`**, the instruction pointer, which holds the address of the next instruction. No instruction
  writes it by name, the jumps and calls write it.
- **Memory**, one large array of bytes with a 64 bit address. Your code lands at `0x401000` and your
  data just after it at `0x402000`.
- **The flags**, a register of single bits that arithmetic writes and the conditional jumps read.

An **operand** is one of the things an instruction works on, the parts after the mnemonic. x86 lets
an operand be a register, a number, or a place in memory, and it lets an instruction work on memory
without loading it first: `add rax, [total]` reads eight bytes from `total`, adds them to `rax` and
writes `rax`, all in one instruction. The one restriction is that two operands cannot both be in
memory.

It is **little endian**: the lowest byte of a number goes at the lowest address, so a quadword you
wrote as `0x1122334455667788` reads in memory as `88 77 66 55 44 33 22 11`.

## The assembler and the simulator

Two separate programs stand between what you type and what runs.

The assembler is **NASM**, the Netwide Assembler, and its syntax is what this course writes. There is
a second way of writing x86 down, the AT&T syntax that `gas` and the output of `gcc -S` use, where
the operands are the other way round and every register carries a `%`. Both describe the same
machine, and a line of x86 you find on the internet may be in either, so it is worth being able to
recognise which one you are looking at.

The simulator is **blink**, which emulates a 64 bit Linux program rather than a bare machine. That is
the one thing to hold on to: your program is a Linux process. It starts at a label called `_start`,
and printing, reading and stopping all go through one instruction, `syscall`, which has a lecture of
its own in the "Talking to the outside world" module. Until then, programs show what they did in the
registers and the memory.

## How a program is written down

A line is a label, an instruction, a directive, a comment, or nothing.

- A **comment** starts at a `;` and runs to the end of the line.
- A **label** goes at the start of the line and ends with a colon: `_start:`. It is a name for the
  address of whatever comes next, code or data. NASM lets you leave the colon off, and this course
  always writes it.
- A **directive** is a line addressed to the assembler instead of the CPU. `section` opens a section,
  `global` makes a label visible outside the file, `dq` writes data, `equ` gives a number a name.
  They get a lecture of their own, "Sections, directives and labels", later in this course.
- Everything else is **indented**, one instruction per line. Four spaces is what these courses use.
- **Case does not matter** for instruction and register names. `MOV RAX, 10` and `mov rax, 10` are
  the same instruction. Labels _are_ case sensitive, so `start:` and `Start:` are two different
  labels. We write lower case throughout.

Numbers can be written in four bases, and there is no `#` in front of them: an operand that is a
number is a number, and an operand in square brackets is memory.

| written     | means                 |
| ----------- | --------------------- |
| `100`       | decimal 100           |
| `0x64`      | hex, the same 100     |
| `0b1100100` | binary, still 100     |
| `0o144`     | octal, still 100      |
| `'d'`       | the ASCII code of `d` |

Negative numbers are written with a minus, `-1`. NASM also does arithmetic for you, so `8 * 4` and
`end - start` are both numbers it works out while assembling.

## Your first program

This one puts two numbers in registers and adds them. Press **Build**, then **Run**, and read the
answer in `rbx` in the registers panel.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov rax, 10         ; x = 10
    mov rbx, 32         ; y = 32
    add rbx, rax        ; y = y + x

    mov rax, 60         ; syscall 60: exit
    mov rdi, 0          ; with status 0
    syscall
```

`mov rbx, 32` writes the number 32 into `rbx`, and the line above it does the same with 10 and `rax`.
`add rbx, rax` adds the two registers and leaves the answer in **`rbx`**, because on x86 the operand
on the **left** is the destination, the one that gets written. So `rbx` ends at 42 and `rax` is
untouched by the addition.

That rule is worth saying out loud once, because it decides how every line in this course reads. The
left operand is written, the right one is only read, and an instruction with one operand writes that
one.

**Build** assembles what you wrote and points the simulator at the first instruction, **Run** runs
the program to the end, and **Step** runs one instruction at a time. The `rip` register at the bottom
of the panel is the address of the instruction that runs next, and it starts at `0x401000`.

## The three lines that stop it

```
    mov rax, 60
    mov rdi, 0
    syscall
```

Your program is a Linux process, and a process does not stop by running out of instructions. It has
to ask to be stopped. Those three lines are that request: `rax` says which request it is, 60 meaning
"exit", `rdi` carries the one thing `exit` needs to know, the status the program finishes with, and
`syscall` hands the whole thing to Linux. Zero is the status that means nothing went wrong.

Every program in this course finishes by asking to exit, and the "syscall and the Linux ABI" lecture
is where the rest of the requests are. A program that reaches the end of its code without asking
carries on into whatever bytes come next in memory and tries to run them as instructions, so write
the exit even in a program that does nothing.

`default rel` at the top is the other line you will see in every program. It tells NASM to reach data
by an offset from `rip` rather than by an absolute address, which is what 64 bit code does and what
"Effective addresses" explains. Leave it out and NASM still assembles, with a warning on the first
`[label]` it meets.

## Four names for one register

A size in x86 is not written on the instruction, it is written in the operands: the register you
name says how many bytes the instruction touches. Build this one and press **Step** four times,
keeping an eye on `rax` in the registers panel.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov rax, 0xAABBCCDDEEFF0011     ; fill rax so the sizes are easy to see
    mov al, 0x22                    ; only the lowest byte changes
    mov ax, 0x3333                  ; only the lowest two bytes
    mov eax, 0x44444444             ; and this one clears the top half

    mov rax, 60
    mov rdi, 0
    syscall
```

The first three lines behave the way you would guess. `al` and `ax` reach the low end of `rax` and
leave everything above alone, so after `mov al, 0x22` the register reads `AABBCCDDEEFF0022`.

`eax` does not. **Writing a 32 bit register zeroes the top 32 bits**, so the last line leaves `rax`
at `0000000044444444` and not `AABBCCDD44444444`. The rule is x86-64's own, it applies to every 32
bit destination and to no other width, and it catches everybody once. Put `mov al, 0x22` back at the
end and watch `rax` become `0000000044444422`: the byte write goes into a register whose top half is
already gone.

## The flags panel

The flags sit just above the registers, one bit each, and they are how one instruction tells the next
one what happened. `cmp` subtracts its right operand from its left, throws the answer away and keeps
only what the answer did to the flags. `ZF` goes to 1 when the two were equal.

```x86|playground
default rel
global _start

section .text
_start:
    mov rax, 5          ; x = 5
    cmp rax, 5          ; compare x with 5
    mov rbx, 7          ; y = 7
    cmp rbx, 5          ; compare y with 5

    mov rax, 60
    mov rdi, 0
    syscall
```

Step through it and watch `ZF` go to 1 after the first `cmp` and back to 0 after the second. The two
`mov` lines in between leave it alone, which is the other half of the arrangement: a flag stays as it
was until something writes it.

## The panels

The **registers panel** lists the sixteen general registers with `rip` under them, and the **B**,
**W**, **L** and **D** buttons in its header cut each one into bytes, words, dwords or the whole 64
bits. Two tabs beside it, **SSE** and **x87**, hold the floating point registers.

Registers do not all start at zero. Linux hands a program a stack pointer in `rsp` and leaves a few
others holding whatever the loader left behind, so a fresh `rdx` reads as an address rather than as
nothing. Anything your program depends on, your program has to put there.

The **memory panel** shows the bytes at whatever address you type into it. `0x401000` is your code,
`0x402000` your data, and the stack is at the top, which is where the panel opens because it follows
`rsp`.

The **console** below the editor is where a program prints, which needs `syscall` and waits for the
outside-world module. There is no screen panel: blink emulates a Linux process, and a Linux process
has no pixels of its own to draw on.

## Your turn

Two instructions. Leave `0xFF` in the lowest byte of `rbx` without disturbing the seven bytes above
it, and put 100 in `rcx`. The test starts `rbx` at `0x1122334455667788`, so a correct answer leaves
it at `0x11223344556677FF`.

```x86|playground|exercise
default rel
global _start

section .text
_start:
    ; your code here

    mov rax, 60
    mov rdi, 0
    syscall
```

```testcase
{
    "startingRegisters": { "rbx": "0x1122334455667788" },
    "expectedRegisters": { "rbx": "0x11223344556677FF", "rcx": 100 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    mov bl, 0xFF        ; only the lowest byte of rbx
    mov rcx, 100        ; the whole of rcx

    mov rax, 60
    mov rdi, 0
    syscall
```

</details>
