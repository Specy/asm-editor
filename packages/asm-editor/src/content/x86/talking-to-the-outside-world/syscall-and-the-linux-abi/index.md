# `syscall` and the Linux x86-64 ABI

This lesson is specifically about the **Linux x86-64 system-call ABI**, also called the Linux AMD64
system-call ABI. Its call numbers and register assignments belong to this operating system and this
64-bit ABI. Old 32-bit x86 examples use a different ABI; do not combine their call numbers or
register rules with the table below.

An **application binary interface**, or **ABI**, is the binary-level agreement about details such as
call numbers, argument registers, and results.

A user program does not have permission to perform every operation that the kernel can perform. To
send bytes to an open file, request memory, or ask the kernel for another service, the program puts a
request in registers and executes `syscall`. The kernel validates the request, performs it when
allowed, and returns a result.

## Registers for a system call

`syscall` has no written operands. Linux reads the system-call number and as many as six arguments
from these registers:

| value              | register |
| ------------------ | -------- |
| system-call number | `rax`    |
| argument 1         | `rdi`    |
| argument 2         | `rsi`    |
| argument 3         | `rdx`    |
| argument 4         | `r10`    |
| argument 5         | `r8`     |
| argument 6         | `r9`     |
| result or error    | `rax`    |

After `syscall`, treat **`rax`, `rcx`, and `r11` as changed**. Linux places the result in `rax`.
The processor uses `rcx` and `r11` while entering and returning from the kernel, so their previous
values are lost. Keep every value needed after a system call in memory or in another register.

The register order resembles the System V function-call convention, but it is a separate
convention. In particular, a System V function receives its fourth integer argument in `rcx`, while
a Linux system call receives its fourth argument in `r10`. `rcx` cannot carry that argument because
the `syscall` instruction overwrites it.

## Results and errors

A successful call returns a call-specific result in `rax`. Linux reports errors as negative values
from `-1` through `-4095`. There is no separate error flag to read after `syscall`; test the value in
`rax`.

This unsigned comparison recognizes the complete reserved error range:

```x86
    syscall
    cmp rax, -4095
    jae syscall_error       ; syscall_error is your error-handling label
```

In two's-complement form, those negative values occupy the top 4095 unsigned 64-bit values. That is
why the unsigned `jae` condition catches them. The useful general pattern is
`cmp rax, -4095` followed by `jae` to the error path.

Some calls, including `write`, can only have nonnegative successful results. For such a call, a
signed-negative test is a simpler local check:

```x86
    syscall
    test rax, rax
    js syscall_error        ; syscall_error is your error-handling label
```

The error path handles the failure and finishes with a nonzero status in this lesson's `write`
examples.

## `write`: descriptor, address, requested count

Linux system-call number 1 is `write`. Its three arguments are:

| register | `write` value             |
| -------- | ------------------------- |
| `rdi`    | file descriptor           |
| `rsi`    | address of the first byte |
| `rdx`    | number of bytes requested |

`write` sends bytes to the object named by the descriptor. With descriptor 1 connected to a
terminal, sending text bytes there makes text appear on that terminal.

The call requests **up to** `rdx` bytes. A nonnegative result in `rax` is the number actually
written, which may be smaller than the requested count. `write` does not search for a zero
terminator and does not add a newline. The program supplies both the address and the exact byte
count it wants to send.

This program keeps writing until the complete greeting has been sent. `rsi` advances past bytes
already written, `rdx` decreases by the same amount, and `r12` accumulates the total. These
registers survive each system call, so they hold the loop state across every request.

```x86|playground|console
default rel
global _start

section .rodata
greeting:   db "Hello, world!", 10
GLEN        equ $ - greeting

section .text
_start:
    lea rsi, [rel greeting] ; next byte to write
    mov rdx, GLEN           ; bytes still requested
    xor r12, r12            ; total bytes written

write_more:
    test rdx, rdx
    jz write_done

    mov eax, 1              ; Linux x86-64 write
    mov edi, 1              ; standard output
    syscall

    test rax, rax
    js write_failed         ; negative result
    jz write_stalled        ; nonempty request made no progress

    add rsi, rax            ; advance by the bytes actually written
    sub rdx, rax            ; that many fewer remain
    add r12, rax            ; preserve the running total
    jmp write_more

write_done:
    mov eax, 60             ; Linux x86-64 exit
    xor edi, edi            ; status 0: success
    syscall

write_failed:
    mov eax, 60
    mov edi, 1              ; nonzero status: failure
    syscall

write_stalled:
    mov eax, 60
    mov edi, 2              ; avoid repeating forever without progress
    syscall
```

On the normal path, the console shows the greeting and `r12` remains `14`, the number of bytes
written in total. The loop also handles a short successful write: it requests only the remaining
suffix on the next pass. A zero result for a nonempty request would leave both the pointer and
remaining count unchanged, so the separate zero branch prevents an endless retry.

## File descriptors in this playground

A **file descriptor** is a small integer that names an open I/O object in one process. Linux
programs normally inherit these three descriptors from the process that starts them:

| descriptor | conventional name | usual connection              |
| ---------: | ----------------- | ----------------------------- |
|          0 | standard input    | input source                  |
|          1 | standard output   | ordinary output destination   |
|          2 | standard error    | diagnostic output destination |

Each descriptor names its current connection and may be redirected. Descriptor 1 can name a file,
and descriptor 2 reaches a console only when standard error is connected there.

In this playground, standard output is connected to the console panel, and standard input is what
you type there: a read of descriptor 0 waits for a line ended with Enter.
The precise system calls implemented by the playground, with their numbers and arguments, are on
the [x86 syscall reference](/documentation/x86/syscall).

## Ending the program with `exit`

Linux system-call number 60 is `exit`. Put the status in `rdi`:

```x86
    mov eax, 60
    xor edi, edi            ; zero conventionally means success
    syscall                 ; does not return when successful
```

A nonzero status conventionally reports failure. An `_start` program should explicitly request an
exit when its work is complete. A successful `exit` has no return value for the program to use
because execution does not resume after its `syscall`.

## Devices are files

Linux gives a program its hardware the way it gives it files: as paths, opened with `open`. The
**Screen** is `/dev/fb0`, the keyboard and the pointer are under `/dev/input`, and sound goes
through `/dev/dsp`, a MIDI port and the PC speaker. Opening one returns a descriptor, and four
system calls do the rest:

| call    | number | what it does with a device                                      |
| ------- | -----: | --------------------------------------------------------------- |
| `read`  |      0 | takes what the device has to give, such as a key that went down |
| `write` |      1 | gives the device bytes, such as sound samples                   |
| `ioctl` |     16 | asks a device-specific question, or changes a setting           |
| `mmap`  |      9 | maps the device's memory into the program, as for the Screen    |

`open` is call 2: `rdi` holds the address of the path, a string ended by a zero byte, and `rsi` the
flags, `O_RDWR` (2) to read and write. An `ioctl` takes the descriptor in `rdi`, a **request
number** in `rsi`, and in `rdx` the address of a structure the device fills in or reads.

Nobody remembers request numbers. NASM's `%include` brings in files of names for them, the names
Linux's own C headers use: `%include "sys/syscall.inc"` names every call (`mov eax, SYS_open`), and
`linux/fb.inc`, `linux/input.inc` and `linux/soundcard.inc` name each device's requests, constants
and structures. A structure's fields become offsets, so `[var + fb_var_screeninfo.xres]` reads the
`xres` field of a structure at `var`.

## Drawing on the Screen

`/dev/fb0` is the **framebuffer**: memory in which each 32-bit word is one pixel of the Screen, its
color as `0x00RRGGBB`. A program opens it, asks with the `FBIOGET_FSCREENINFO` ioctl how many bytes
it has (`smem_len`) and how many bytes one line of pixels takes (`line_length`), and maps it with
`mmap`. From then on, a `mov` into that memory changes a pixel.

This program draws a red line across the Screen, 120 lines down. The `@screen` comment asks for a
Screen 320 pixels wide and 240 high.

```x86|playground|open-screen|no-flags
; @screen width=320 height=240
default rel
%include "sys/syscall.inc"
%include "fcntl.inc"
%include "sys/mman.inc"
%include "linux/fb.inc"

section .rodata
fb_path: db "/dev/fb0", 0

section .bss
fix: resb fb_fix_screeninfo_size

section .text
global _start
_start:
    mov eax, SYS_open
    lea rdi, [fb_path]
    mov esi, O_RDWR
    syscall
    mov r12, rax                    ; the framebuffer's descriptor

    mov eax, SYS_ioctl
    mov rdi, r12
    mov esi, FBIOGET_FSCREENINFO
    lea rdx, [fix]
    syscall                         ; fills in smem_len and line_length

    mov eax, SYS_mmap
    xor edi, edi                    ; any address
    mov esi, [fix + fb_fix_screeninfo.smem_len]
    mov edx, PROT_READ | PROT_WRITE
    mov r10d, MAP_SHARED            ; stores reach the Screen
    mov r8, r12
    xor r9d, r9d
    syscall                         ; rax: the top-left pixel

    mov edi, [fix + fb_fix_screeninfo.line_length]
    imul rdi, rdi, 120              ; 120 lines down
    add rdi, rax
    mov eax, 0x00ff0000             ; red
    mov ecx, 320                    ; pixels in the line
    rep stosd

    mov eax, SYS_exit
    xor edi, edi
    syscall
```

The pixel at column x of line y is `y × line_length + x × 4` bytes past the address `mmap`
returned. The framebuffer has room for a second page below the first, so a program can draw a frame
where it cannot be seen and then show it all at once: the [Screen chapter](/documentation/x86/screen)
explains this double buffering, the `@screen` comment and every request.

## Reading keys and the pointer

Clicking the Screen sends the keys and the pointer to the program's **input devices**, not to its
standard input. **Shift+Tab** gives the keyboard back to the page. The keyboard is the file
`/dev/input/by-path/platform-i8042-serio-0-event-kbd`, and a read of it gives **events** of 24
bytes:

| offset | size | field   | meaning                                                         |
| -----: | ---: | ------- | --------------------------------------------------------------- |
|      0 |   16 | `time`  | when it happened                                                |
|     16 |    2 | `type`  | `EV_KEY` (1) for a key; other types mark scan codes and reports |
|     18 |    2 | `code`  | which key: `KEY_ESC` is 1, `KEY_SPACE` 57, `KEY_LEFT` 105       |
|     20 |    4 | `value` | 1 when the key goes down, 0 when it goes up, 2 while it repeats |

A game opens the keyboard with `O_NONBLOCK`, so that a read with no event waiting returns `-EAGAIN`
(-11) at once instead of waiting, and the game can draw its next frame:

```x86
read_key:
    mov eax, SYS_read
    mov rdi, r12                    ; the keyboard's descriptor
    lea rsi, [event]                ; event: resb input_event_size
    mov edx, input_event_size
    syscall
    cmp rax, input_event_size
    jne no_more_events              ; -EAGAIN: nothing waiting
    cmp word [event + input_event.type], EV_KEY
    jne read_key
    cmp word [event + input_event.code], KEY_SPACE
    jne read_key
    cmp dword [event + input_event.value], 1
    je space_went_down
    jmp read_key
```

The pointer is another input device. It reports its position as `EV_ABS` events from 0 to 32767
across the whole Screen, whatever its size, so a program turns a position into a pixel with
`(value × xres + 32766) ÷ 32767`. The [Keys and the pointer](/documentation/x86/input) chapter shows
how to find it, how to wait for several devices at once with `poll`, and how to read the keys typed
into the Terminal one at a time.

## Making sound

`/dev/dsp` plays **samples**: the height of a sound wave, measured thousands of times a second. It
starts at 8000 samples a second, one byte each, where 128 is silence. A square wave that is high for
8 samples and low for 8 repeats 8000 ÷ 16 = 500 times a second, a 500 Hz tone.

A `write` puts samples in the device's buffer and waits while the buffer is full, so the program
runs at the speed of its own sound. The buffer is large unless the program asks otherwise: several
seconds of sound, which would make every sound late. The `SNDCTL_DSP_SETFRAGMENT` ioctl, made right
after `open`, asks for a small one. Its value `0x0004000A` asks for 4 **fragments** of 2¹⁰, 1024,
bytes, a fraction of a second.

```x86|playground|no-flags
default rel
%include "sys/syscall.inc"
%include "fcntl.inc"
%include "linux/soundcard.inc"

section .rodata
dsp_path:  db "/dev/dsp", 0

section .data
fragments: dd 0x0004000a            ; ask for 4 fragments of 1024 bytes

section .bss
wave:      resb 4000                ; half a second at 8000 samples a second

section .text
global _start
_start:
    mov eax, SYS_open
    lea rdi, [dsp_path]
    mov esi, O_WRONLY
    syscall
    mov r12, rax
    mov eax, SYS_ioctl
    mov rdi, r12
    mov esi, SNDCTL_DSP_SETFRAGMENT
    lea rdx, [fragments]
    syscall

    lea rdi, [wave]
    xor ecx, ecx
fill:
    mov al, 192                     ; high
    test cl, 8                      ; samples 8 to 15 of every 16
    jz store
    mov al, 64                      ; low
store:
    mov [rdi + rcx], al
    inc ecx
    cmp ecx, 4000
    jb fill

    mov eax, SYS_write
    mov rdi, r12
    lea rsi, [wave]
    mov edx, 4000
    syscall                         ; waits while the buffer is full
    mov eax, SYS_ioctl
    mov rdi, r12
    mov esi, SNDCTL_DSP_SYNC
    xor edx, edx
    syscall                         ; waits until the last sample has played

    mov eax, SYS_exit
    xor edi, edi
    syscall
```

Samples reach the speakers a whole fragment at a time, so `SNDCTL_DSP_SYNC` matters for a short
sound: it sends the last, unfinished fragment and waits until everything has played.

Two simpler devices need no samples. The PC speaker plays a tone from a single `write` of an event
that names its frequency, and the MIDI port `/dev/snd/midiC1D0` plays notes on 128 instruments from
three-byte messages. The [Sound chapter](/documentation/x86/sound) shows both, with the formats,
rates and the volume of `/dev/dsp`.

## Your turn

Make one `write` request for all nine bytes of `assembly` followed by a newline. Immediately after
the system call, preserve its result in `r12`, before using `rax` for another call. For this output
in the playground, the successful result is 9. Check for a negative result and exit with a nonzero
status on that path; otherwise exit with status 0.

```x86|playground|console|exercise
default rel
global _start

section .rodata
phrase: db "assembly", 10
PLEN    equ $ - phrase

section .text
_start:
    ; your code here
```

```testcase
{
    "expectedOutput": "assembly\n",
    "expectedRegisters": { "r12": 9 }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|console|solution
default rel
global _start

section .rodata
phrase: db "assembly", 10
PLEN    equ $ - phrase

section .text
_start:
    mov eax, 1
    mov edi, 1
    lea rsi, [rel phrase]
    mov edx, PLEN
    syscall

    mov r12, rax            ; preserve the returned byte count or error
    test rax, rax
    js phrase_error

phrase_done:
    mov eax, 60
    xor edi, edi
    syscall

phrase_error:
    mov eax, 60
    mov edi, 1
    syscall
```

</details>

The next exercise receives a descriptor in `r14`. Make a one-byte `write` request to that
descriptor and preserve its result in `r12`. Use the general `-4095` comparison and leave `r13`
equal to 1 when the result is in Linux's error range, or 0 otherwise.

Use the classification to select a visible one-byte report: write `E` to standard output for an
error and `S` for a success. Preserve `r12` and `r13` while making this second system call. Finish
with a nonzero status after reporting an error and status 0 after reporting a success. The supplied
descriptor is `-1`, so the expected path reports `E` and preserves the bad-file-descriptor result
`-9`.

```x86|playground|exercise
default rel
global _start

section .rodata
one_byte:       db "X"
error_mark:     db "E"
success_mark:   db "S"

section .text
_start:
    ; your code here
```

```testcase
{
    "startingRegisters": { "r14": "0xFFFFFFFFFFFFFFFF" },
    "expectedOutput": "E",
    "expectedRegisters": {
        "r12": "0xFFFFFFFFFFFFFFF7",
        "r13": 1
    }
}
```

<details>
<summary>Show solution</summary>

```x86|playground|solution
default rel
global _start

section .rodata
one_byte:       db "X"
error_mark:     db "E"
success_mark:   db "S"

section .text
_start:
    mov eax, 1
    mov rdi, r14            ; descriptor supplied at run time
    lea rsi, [rel one_byte]
    mov edx, 1
    syscall

    mov r12, rax            ; -9: bad file descriptor
    xor r13d, r13d
    cmp rax, -4095
    jae error_result

success_result:
    lea rsi, [rel success_mark]
    xor r15d, r15d          ; final status 0
    jmp report_result

error_result:
    mov r13, 1
    lea rsi, [rel error_mark]
    mov r15d, 1             ; final status 1

report_result:
    mov eax, 1
    mov edi, 1
    mov edx, 1
    syscall

    test rax, rax
    js report_failed
    jz report_failed

    mov eax, 60
    mov edi, r15d
    syscall

report_failed:
    mov eax, 60
    mov edi, 2
    syscall
```

</details>
