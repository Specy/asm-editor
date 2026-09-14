The last lecture asked the kernel to print. This one is about what the kernel is standing in front of:
the two ways x86 reaches a device, why your program is not allowed to use either, and what it gets
instead.

## Ports, which x86 has and almost nothing else does

The 8086 was given a second address space beside memory, 65536 **ports**, reached by two instructions
of their own:

```
    in al, dx               ; read a byte from the port numbered in dx
    out dx, al              ; write a byte to it
```

A port number is not a memory address and `[0x60]` has nothing to do with port `0x60`. The PC assigned
them by convention and the assignments have barely moved in forty years: `0x60` and `0x64` are the
keyboard controller, `0x3F8` is the first serial port, `0x1F0` to `0x1F7` were the hard disk, `0x70`
and `0x71` the real time clock.

The Z80 works the same way and for the same reason, which is why that course teaches its screen and
keyboard through `in` and `out`. The 68000 has no ports at all.

## Memory mapped, which everything has

The other way is to put a device's registers at addresses. A read of that address returns what the
device has to say and a write to it tells the device something, and no special instruction is
involved: `mov` reaches a device exactly as it reaches memory.

This is what a graphics card does. A **framebuffer** is a block of addresses where each group of
bytes is one pixel, and drawing is writing to memory. It is also what MIPS and RISC-V do for
everything, since neither has ports.

x86 has both, and ports are the older half. Anything fast is memory mapped, because a port access is
narrow and slow and there are only 65536 of them.

## Neither one is yours

The 80286 added **privilege levels**, four rings numbered 0 to 3. The kernel runs in ring 0 and your
program runs in ring 3, and `in` and `out` are among the instructions ring 3 is not allowed to
execute. Try one and the processor raises a general protection fault, which on Linux ends the program
with a `SIGSEGV`.

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

Press Run. `r8` is 1, `r9` is 0, and `rip` is parked on the `in`. The program stopped there and
nothing said why, which is what a fault looks like in this emulator.

Memory mapped devices are out of reach for the same reason from the other direction: the addresses a
device lives at are not in your program's page tables, so a `mov` to one is a read of memory that
does not exist, and that ends the program too.

An operating system exists precisely so that this is true. One program getting `out` to the disk
controller would be one program able to overwrite every file on the machine.

## What a user program gets instead

A Linux program reaches a device through a **file descriptor**, which is what the last lecture's
`open` and `write` were. The kernel owns the port or the mapping and your program owns a number.

Three shapes of that, in increasing directness:

1. **Ordinary `read` and `write`** on a descriptor. `write` to descriptor 1 ends up as bytes on a
   serial port or in a terminal emulator's window, with the kernel doing the `out` instructions.
2. **`ioctl`**, for the requests that are not reading or writing bytes: setting a terminal's mode,
   asking a screen how big it is.
3. **`mmap` of a device file**, which is as close as it gets. `mmap` on `/dev/fb0` maps the graphics
   card's framebuffer into your address space, and after that a `mov` really does write a pixel. That
   is how a program draws without a windowing system, and it needs permission to open the device.

## mmap

`mmap` is worth meeting on its own, because it is also how a program asks for plain memory. Called
with no file it hands back a block of zeroed pages.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov rax, 9              ; call 9: mmap
    xor rdi, rdi            ; no preferred address, so the kernel chooses
    mov rsi, 4096           ; one page
    mov rdx, 3              ; PROT_READ | PROT_WRITE
    mov r10, 0x22           ; MAP_PRIVATE | MAP_ANONYMOUS
    mov r8, -1              ; no file behind it
    xor r9, r9              ; and so no offset into one
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

`r12` comes out at `80000000`, an address that was not part of the program a moment earlier, and
`r13` reads back what was written to it. `munmap` returns 0 and the block is gone; a `mov` to `[r12]`
after that line would end the program.

This is what `malloc` is built on. A C library asks for pages with `mmap`, hands out pieces of them,
and asks for more when it runs out.

## What this editor has

blink emulates a Linux **program**, not a machine. There are no devices behind it at all: no
framebuffer, no keyboard controller, no disk. So:

- `in` and `out` end the run, as they would under Linux.
- There is **no screen panel** for x86. The M68K, Z80, MIPS and RISC-V courses all have one, drawn on
  through traps, ports or a memory mapped bitmap; here there is nothing to map. The Examples of those
  courses that draw have no x86 version.
- `mmap` of anonymous memory works, as above. `mmap` of a device file has no device to open.
- The console is a real pair of descriptors, so `write` to 1 and 2 both reach it.

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

`r13` comes out at the number of seconds since the first of January 1970, which is what every Unix
means by the time. Run it twice and the value changes, because it is the only thing in any of these
programs that is not the same every run.

## Your turn

Ask for two pages of memory with `mmap`, write `0xAA` into the first byte of the second page, read it
back into `r13`, and leave the address `mmap` returned in `r12`. A page is 4096 bytes, so the second
one starts 4096 bytes in.

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
    "expectedRegisters": { "r12": "0x80000000", "r13": "0xAA" }
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
    mov rsi, 8192           ; two pages
    mov rdx, 3              ; readable and writable
    mov r10, 0x22           ; private and anonymous
    mov r8, -1
    xor r9, r9
    syscall
    mov r12, rax

    mov byte [r12 + 4096], 0xAA     ; the first byte of the second page
    movzx r13, byte [r12 + 4096]

    mov rax, 60
    xor rdi, rdi
    syscall
```

</details>
