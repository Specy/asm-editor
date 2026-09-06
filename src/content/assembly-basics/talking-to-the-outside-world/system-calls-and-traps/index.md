Every program so far has left its answer in a register or in memory, and you read it in a panel. A
program that is any use has to do more than that: print something, read what you typed, draw, open a
file. None of those is an instruction, because none of them is arithmetic. A CPU does not know how to
print a line. It asks somebody else to do it.

## Asking the environment

On a real computer the somebody else is the **operating system**. The program puts a number
somewhere that says what it wants, puts the arguments in agreed registers, and runs one instruction
that hands control over. The CPU jumps to a handler the operating system installed, switches to a
mode where that handler is allowed to touch the hardware, does the work and comes back to the
instruction after. That instruction is called a **trap** on some machines and a **system call**
instruction on others, and the numbered thing you asked for is a **system call** or a **service** or
a **task**, depending on whose manual you are reading.

In this editor there is no operating system, there is a simulator, and it answers the trap itself:
the text you print goes to the console panel, the line you type comes from the box under it. Each
language imitates a simulator that already existed, and the numbers come from those: **EASy68K** for
the M68K, **MARS** for MIPS and **RARS** for RISC-V. A Z80 has no system call instruction at all, so
this editor gives it a convention of its own, which the last section of this lecture uses.

## The M68K: `trap #15`

`trap #15` hands control to the environment. The number of the task goes in `d0` and the arguments
go where that task expects them. Task 14 prints the string at the address in `a1`, up to the byte of
0 that ends it, which is the terminator we saw in the previous lecture.

```m68k|playground|console|no-flags
    lea message, a1     ; a1 = &message
    move.b #14, d0      ; task 14: print the string at a1
    trap #15

message: dc.b 'Hello from a trap!', 0
```

Build it and press Run, and the console panel under the code shows the line. Three instructions:
load the argument, load the task number, execute the trap. That shape does not change, only the
numbers do.

Reading is the same in reverse. Task 4 reads a line, parses it as a decimal number and leaves it in
`d1`, and task 3 prints the number in `d1`.

```m68k|playground|console|no-flags
    lea prompt, a1
    move.b #14, d0      ; task 14: print the string at a1
    trap #15
    move.b #4, d0       ; task 4: read a number into d1
    trap #15
    add.l #1, d1        ; n = n + 1
    move.b #3, d0       ; task 3: print the number in d1
    trap #15

prompt: dc.b 'Type a number: ', 0
```

```testcase
{
    "input": ["41"]
}
```

Type 41 in the console panel and press enter and the program answers 42. While it is waiting for you
the program is stopped in the middle of the `trap #15`, which is exactly what happens on a real
machine: a program that reads input spends most of its life inside a system call.

## RISC-V and MIPS: `ecall` and `syscall`

The same program in RISC-V. The instruction is `ecall`, the service number goes in `a7`, and the
argument goes in `a0`, which is also where the answer comes back.

```riscv|playground|console
.data
prompt: .string "Type a number: "

.text
main:
    li a7, 4            # service 4: print the string at a0
    la a0, prompt
    ecall
    li a7, 5            # service 5: read an integer, into a0
    ecall
    addi a0, a0, 1      # n = n + 1
    li a7, 1            # service 1: print the integer in a0
    ecall
    li a7, 10           # service 10: end the program
    ecall
```

```testcase
{
    "input": ["41"]
}
```

MIPS is the same again with different names: the instruction is `syscall`, the service number goes
in `$v0`, arguments go in `$a0` and up, and a service that answers a number leaves it in `$v0`.

| language | instruction | the number goes in | the arguments go in |
| -------- | ----------- | ------------------ | ------------------- |
| M68K     | `trap #15`  | `d0`               | `d1` and `a1`       |
| MIPS     | `syscall`   | `$v0`              | `$a0`, `$a1`, `$a2` |
| RISC-V   | `ecall`     | `a7`               | `a0`, `a1`, `a2`    |

MARS and RARS use the same service numbers as each other, and EASy68K's task numbers are its own:

| what you want       | M68K task in `d0` | MIPS service in `$v0` | RISC-V service in `a7` |
| ------------------- | ----------------: | --------------------: | ---------------------: |
| print a string      |                14 |                     4 |                      4 |
| print a number      |                 3 |                     1 |                      1 |
| read a number       |                 4 |                     5 |                      5 |
| print one character |                 6 |                    11 |                     11 |
| end the program     |                 9 |                    10 |                     10 |

An M68K program does not have to ask to be ended, the simulator stops it when it runs out of
instructions, which is why none of the programs in the earlier lectures said anything about ending.
A MIPS or RISC-V program does ask, with service 10, because its text segment holds whatever comes
after `main` and running into that is not what you want.

## The Z80: ports instead

The Z80 has no trap and no system call at all. It reaches the outside world through **I/O ports**,
256 numbers in an address space of their own that has nothing to do with memory: `out (n), a` sends
the byte in `a` to port `n`, and `in a, (n)` reads a byte back from it. There is no service number,
the port number _is_ the choice of what happens.

This editor gives the console five of them: port `0` writes a byte as a character, port `1` as an
unsigned number, port `2` as a signed number, port `3` as two hexadecimal digits, and port `4` as a
16 bit number. Reading from the same ports asks you for a line.

```z80|playground|console
        .org 0x8000
start:
        ld a, 'H'
        out (0), a      ; port 0: print a as a character
        ld a, 'i'
        out (0), a
        ld a, 42
        out (1), a      ; port 1: print a as a number
        halt
```

One byte at a time, and there is no "print a string" to ask for: a Z80 program that prints a string
writes a loop that walks the bytes and sends each one to port 0. The same wish comes out as a task
number, a service number or a port number, depending on who built the environment the program talks
to.

Try changing `move.b #3, d0` in the second program to `move.b #15, d0` and putting `move.b #2, d2`
on the line before it. Task 15 prints an unsigned number in the base in `d2`, so 42 comes out as
`101010`.
