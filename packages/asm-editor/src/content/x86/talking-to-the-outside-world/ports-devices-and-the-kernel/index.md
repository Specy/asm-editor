# Ports, memory-mapped devices, and kernel access

An x86 processor has two ways to communicate with hardware: a separate space of **I/O ports**, and
device registers placed at memory addresses. A normal Linux program usually uses neither one
directly. It asks the kernel for a service, and a device driver handles the hardware-specific work.

This boundary lets the kernel decide which program may use each device. Raw hardware access is an
exception granted to suitably privileged software.

## Ports: a separate address space

x86 has an I/O address space containing 65,536 numbered **ports**. The `in` and `out` instructions
read and write them:

```x86
    in al, dx               ; read one byte from the port numbered by dx
    out dx, al              ; write one byte to that port
```

A port number and a memory address name different spaces. For example, `in al, dx` with `dx` equal
to `0x60` accesses port `0x60`; `mov al, [0x60]` accesses memory address `0x60`.

Older PC designs assigned ports `0x60` and `0x64` to the legacy keyboard-controller interface and
`0x3F8` to the first serial-port interface. These are historical PC conventions; current machines
may expose different hardware or emulate the old interfaces.

Ports are an older, distinct I/O mechanism that x86 has kept. A hardware design may expose control,
status, and data registers through ports, through memory addresses, or through both. Performance
depends on the device and platform, so the separate address space is the useful distinction here.

## Memory-mapped devices

With **memory-mapped I/O**, some physical address ranges lead to device registers. A load reads a
device register, and a store writes one. The assembly can therefore use familiar instructions such
as `mov`.

A simple **framebuffer** illustrates the idea. It is a memory-like range containing pixel data, so a
program can draw by storing colour values. Real framebuffers also specify details such as the pixel
format and the number of bytes from one row to the next. Modern graphics systems usually add more
layers between an application and the display hardware.

Despite the familiar `mov` syntax, a device range behaves according to the device's rules. Device
mappings commonly use special memory types, such as uncached or write-combining memory, and reads or
writes can have effects defined by the device.

## The normal user-process boundary

Linux runs an ordinary x86-64 user process at **privilege level 3**, often called ring 3, while the
kernel runs at privilege level 0. For `in` and `out`, the processor checks the current privilege
level together with the I/O privilege level and an I/O-permission bitmap. Linux normally leaves
port access disabled for a user process. With sufficient privilege, a program can ask Linux to
grant access to selected ports.

When permission is absent, attempting `in` or `out` raises an x86 general-protection exception.
Linux normally turns that exception into a signal for the process; if the signal is not handled,
the process terminates.

The following program is specifically an experiment for this playground. `r9` starts with a known
sentinel value, so we can see whether execution passed the `in` instruction.

```x86|playground|no-flags
default rel
global _start

section .text
_start:
    mov r9, 1               ; known value before the attempted port read
    mov dx, 0x60            ; a legacy PC keyboard-controller port
    in al, dx               ; denied by the playground's user-process environment
    mov r9, 2               ; reached only if the port read completes

    mov eax, 60
    xor edi, edi
    syscall
```

Here the playground stops on `in` and leaves `r9` equal to 1. That is how this emulator presents the
failed instruction. On Linux, the CPU exception and the signal chosen by the kernel are separate
steps between the instruction and an unhandled signal terminating a process.

Memory-mapped device access is controlled through **page tables**. A page table records which
virtual addresses a process may access and what physical memory or device range lies behind them.
Linux commonly manages memory in 4096-byte units called **pages**.

Device ranges are normally absent from an application's mappings. Accessing an unmapped virtual
address raises an x86 page-fault exception; Linux normally delivers a signal, and an unhandled
signal terminates the process. A driver can also map an allowed device range into a process after
checking permissions. The kernel's chosen mappings enforce the protection while still allowing
approved device mappings.

## Asking the kernel

A **file descriptor** is a small integer that names an open object in one process. It gives a user
program a controlled route to files, terminals, and many devices:

- `read` and `write` transfer bytes through a descriptor. The kernel and its drivers deliver those
  bytes to the descriptor's destination, possibly through several driver or software layers.
- `ioctl` makes device-specific requests that do not fit a plain stream of bytes, such as changing
  a terminal setting.
- `mmap` on some device files asks a driver to place an approved device range in the process's
  virtual address space. A simple framebuffer device is one possible example.

All three routes let the kernel validate the request first. Their availability and required
permissions depend on the particular file or device.

## Anonymous `mmap`: a page-mapping experiment

`mmap` can also create memory with no file or device behind it. Such an **anonymous mapping** gives
the process a range of zero-filled bytes. This is the form we can explore safely in the playground.

The previous lesson's system-call rules apply: `rax` selects the call, the arguments begin in
`rdi`, `rsi`, and `rdx`, and Linux returns a result in `rax`. The fourth argument uses `r10` because
the `syscall` instruction itself overwrites `rcx`. A result from `-1` through `-4095` reports an
error, so the program must check the result before treating it as an address.

For this call, the protection value `3` combines `PROT_READ` (`1`) with `PROT_WRITE` (`2`). The flags
value `0x22` combines `MAP_PRIVATE` (`2`) with `MAP_ANONYMOUS` (`0x20`). `MAP_PRIVATE` gives this
process a private mapping, and `MAP_ANONYMOUS` says that no file supplies its contents.

```x86|playground|no-flags
default rel
global _start

PAGE_SIZE       equ 4096
PROT_READ       equ 1
PROT_WRITE      equ 2
MAP_PRIVATE     equ 2
MAP_ANONYMOUS   equ 0x20
SYS_MMAP        equ 9
SYS_MUNMAP      equ 11
SYS_EXIT        equ 60

section .text
_start:
    mov eax, SYS_MMAP
    xor edi, edi                            ; let the kernel choose an address
    mov esi, PAGE_SIZE                      ; length: one page
    mov edx, PROT_READ | PROT_WRITE         ; loads and stores are allowed
    mov r10d, MAP_PRIVATE | MAP_ANONYMOUS   ; private, with no backing file
    mov r8, -1                              ; no file descriptor
    xor r9d, r9d                            ; no file offset
    syscall

    mov r12, rax                            ; preserve the address or error
    cmp rax, -4095
    jae mmap_failed                         ; check before using rax as an address

    mov qword [r12], 0x1234
    mov r13, [r12]

    mov rdi, r12                            ; address returned by mmap
    mov esi, PAGE_SIZE                      ; same requested length
    mov eax, SYS_MUNMAP
    syscall
    mov r14, rax                            ; 0 on success, negative on error
    cmp rax, -4095
    jae munmap_failed

    mov eax, SYS_EXIT
    xor edi, edi
    syscall

mmap_failed:
    mov eax, SYS_EXIT
    mov edi, 1
    syscall

munmap_failed:
    mov eax, SYS_EXIT
    mov edi, 2
    syscall
```

On the successful path, `r13` becomes `0x1234` and `r14` becomes 0. `munmap` removes the mapping, so
the program does not access that address again.

This playground currently chooses `0x80000000` for this first anonymous mapping. That deterministic
address is a playground guarantee used by the exercise test. Normal Linux may choose a different
address each time; programs must use the address returned in `rax`.

Anonymous mappings are one source from which a memory allocator can obtain pages. The allocator can
then divide a large mapping into smaller pieces for the rest of the program.

## Your turn

Ask `mmap` for one readable, writable anonymous page. Check its result before using it and preserve
the returned address in `r12`. Write `0xAA` into the requested page's final byte, then load that byte
into `r13`. Finally, call `munmap`, preserve its result in `r14`, and check it before exiting.

The first byte is at offset 0, so the final byte of a 4096-byte page is at offset 4095. Successfully
reading back that byte checks that the final byte of the requested page is mapped.

```x86|playground|exercise
default rel
global _start

PAGE_SIZE       equ 4096
PROT_READ       equ 1
PROT_WRITE      equ 2
MAP_PRIVATE     equ 2
MAP_ANONYMOUS   equ 0x20
SYS_MMAP        equ 9
SYS_MUNMAP      equ 11
SYS_EXIT        equ 60

section .text
_start:
    ; your code here
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

PAGE_SIZE       equ 4096
PROT_READ       equ 1
PROT_WRITE      equ 2
MAP_PRIVATE     equ 2
MAP_ANONYMOUS   equ 0x20
SYS_MMAP        equ 9
SYS_MUNMAP      equ 11
SYS_EXIT        equ 60

section .text
_start:
    mov eax, SYS_MMAP
    xor edi, edi
    mov esi, PAGE_SIZE
    mov edx, PROT_READ | PROT_WRITE
    mov r10d, MAP_PRIVATE | MAP_ANONYMOUS
    mov r8, -1
    xor r9d, r9d
    syscall

    mov r12, rax
    cmp rax, -4095
    jae mmap_failed

    mov byte [r12 + PAGE_SIZE - 1], 0xAA
    movzx r13, byte [r12 + PAGE_SIZE - 1]

    mov rdi, r12
    mov esi, PAGE_SIZE
    mov eax, SYS_MUNMAP
    syscall
    mov r14, rax
    cmp rax, -4095
    jae munmap_failed

    mov eax, SYS_EXIT
    xor edi, edi
    syscall

mmap_failed:
    mov eax, SYS_EXIT
    mov edi, 1
    syscall

munmap_failed:
    mov eax, SYS_EXIT
    mov edi, 2
    syscall
```

</details>
