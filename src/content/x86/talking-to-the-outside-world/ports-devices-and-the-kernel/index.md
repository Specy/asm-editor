The last lecture asked the kernel to print. This one is about what the kernel is standing in front of:
the two ways x86 reaches a keyboard or a disk or a screen, why your program is allowed to use neither
of them, and what it gets instead.

## Ports, a second address space

The 8086 was given a whole second address space beside memory: 65536 **ports**, reached by two
instructions that exist for nothing else.

```
    in al, dx               ; read a byte from the port numbered in dx
    out dx, al              ; write a byte to it
```

A port number is not a memory address, and `[0x60]` has nothing whatever to do with port `0x60`. The
PC assigned the numbers by convention and the assignments have barely moved in forty years: `0x60` and
`0x64` are the keyboard controller, `0x3F8` is the first serial port, `0x1F0` to `0x1F7` were the hard
disk, `0x70` and `0x71` the real time clock.

## Memory mapped devices

The other way is to put a device's registers at ordinary memory addresses. Reading that address
returns what the device has to say, writing to it tells the device something, and no special
instruction is involved at all: `mov` reaches a device exactly the way it reaches memory.

This is what a graphics card does. A **framebuffer** is a block of addresses where each group of bytes
is one pixel, so drawing a line is writing to memory in a loop.

x86 has both, and ports are the older half. Anything that has to be fast is memory mapped, because a
port access moves one, two or four bytes at a time, cannot be cached, and there are only 65536 port
numbers to go round.

## Neither one is yours

The 80286 added **privilege levels**, four rings numbered 0 to 3. The kernel runs in ring 0 and your
program runs in ring 3, and `in` and `out` are among the instructions ring 3 may not execute. Try one
and the processor raises a general protection fault, which on Linux kills the program.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov r8, 1               ; this one runs
    mov dx, 0x60            ; the keyboard controller's port
    in al, dx               ; and this one does not
    mov r9, 2               ; never reached

    mov rax, 60
    xor rdi, rdi
    syscall
```

Press Run. `r8` is 1, `r9` is 0, and `rip` is parked on the `in`. The program did not exit, it
stopped, and nothing said why. That is what a fault looks like in this emulator, and the next lecture
is about it.

Memory mapped devices are out of reach for the same reason coming from the other direction. The
addresses a device lives at are not in your program's **page tables**, the kernel's record of which
addresses your program is allowed to touch and where in real memory each of them lands, kept in 4096
byte units called **pages**. An address with no page behind it is not slow to reach, it is
unreachable, and a `mov` to one ends the program.

An operating system exists precisely so that this is true. One program able to `out` to the disk
controller would be one program able to overwrite every file on the machine.

## What a user program gets instead

A Linux program reaches a device through a **file descriptor**, which is what the last lecture's
`open` and `write` were. The kernel owns the port or the mapping, and your program owns a number.

Three shapes of that, in increasing directness:

1. **Ordinary `read` and `write`** on a descriptor. Your `write` to descriptor 1 ends up as bytes on a
   serial port or in a terminal window, with the kernel executing the `out` instructions you were not
   allowed to.
2. **`ioctl`**, for the requests that are not reading or writing bytes: setting a terminal's mode,
   asking a screen how big it is.
3. **`mmap` of a device file**, which is as close as it gets. `mmap` on `/dev/fb0` puts the graphics
   card's framebuffer into your own address space, and after that a `mov` really does write a pixel.
   That is how a program draws without a windowing system, and it needs permission to open the device
   first.

## mmap

`mmap` is worth meeting on its own, because it is also how a program asks for plain memory. Called
with no file behind it, it hands back a block of pages full of zeroes.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov rax, 9              ; call 9: mmap
    xor rdi, rdi            ; no preferred address, so the kernel chooses
    mov rsi, 4096           ; one page
    mov rdx, 3              ; readable and writable
    mov r10, 0x22           ; private, and backed by no file
    mov r8, -1              ; so there is no descriptor
    xor r9, r9              ; and no offset into one
    syscall
    mov r12, rax            ; the address of the block

    mov qword [r12], 0x1234 ; memory that did not exist a moment ago
    mov r13, [r12]

    mov rdi, r12            ; call 11: munmap
    mov rsi, 4096
    mov rax, 11
    syscall
    mov r14, rax            ; 0, so it worked

    mov rax, 60
    xor rdi, rdi
    syscall
```

`r12` comes out at `0x80000000`, an address that was not part of your program a moment earlier and is
now. The store to it works. Then `munmap` takes the same address and the same length and the page is
gone again, and a `mov` to `[r12]` written after that line would end the program on the spot.

Everything that hands out memory at run time is built on this. A memory allocator asks the kernel for
pages in large blocks, hands out small pieces of them as a program asks, and goes back for more when
it runs out. The kernel deals in whole pages; the pieces are the library's business.

## What this editor has

blink emulates a Linux **program**, not a machine, and there are no devices behind it at all: no
framebuffer, no keyboard controller, no disk. So:

- `in` and `out` end the run, exactly as they would under Linux.
- There is no screen panel for x86, because there is nothing to map one onto. A Linux process has no
  pixels of its own.
- `mmap` of anonymous memory works, as above. `mmap` of a device file has no device to open.
- The console is a real pair of descriptors, so `write` to 1 and to 2 both reach it.

The one device you can actually reach is the clock.

```x86|playground|no-flags
default rel
global _start

section .bss
ts:     resq 2              ; seconds, then nanoseconds

section .text
_start:
    mov rax, 228            ; call 228: clock_gettime
    xor rdi, rdi            ; clock 0, the wall clock
    lea rsi, [ts]
    syscall
    mov r12, rax            ; 0 when it worked
    mov r13, [ts]           ; the seconds
    mov r14, [ts + 8]       ; the nanoseconds

    mov rax, 60
    xor rdi, rdi
    syscall
```

`r13` is the number of seconds since the first of January 1970, which is what every Unix machine means
by the time. Run it twice and the value changes, and it is the only thing in any program in this
course that is not identical on every run.

## Your turn

Ask `mmap` for **one** page and prove you got the whole of it. Write `0xAA` into the last byte of the
page, read it back into `r13`, then hand the page back with `munmap` and leave that call's answer in
`r14`. Leave the address `mmap` returned in `r12`.

A page is 4096 bytes, and the address `mmap` gives you is the first of them, so the last one is not at
offset 4096.

```x86|playground|exercise
default rel
global _start

section .text
_start:
    ; your code here

    mov rax, 60
    xor rdi, rdi
    syscall
```

```testcase
{
    "expectedRegisters": { "r12": "0x80000000", "r13": "0xAA", "r14": 0 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .text
_start:
    mov rax, 9              ; mmap
    xor rdi, rdi
    mov rsi, 4096           ; one page
    mov rdx, 3              ; readable and writable
    mov r10, 0x22           ; private, backed by no file
    mov r8, -1
    xor r9, r9
    syscall
    mov r12, rax

    mov byte [r12 + 4095], 0xAA     ; the last byte of the page, not the 4096th
    movzx r13, byte [r12 + 4095]

    mov rdi, r12            ; munmap, same address and same length
    mov rsi, 4096
    mov rax, 11
    syscall
    mov r14, rax

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
