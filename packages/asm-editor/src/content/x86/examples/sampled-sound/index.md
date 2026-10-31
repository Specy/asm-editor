`/dev/dsp` plays **samples**: the height of a sound wave measured many times a second, computed by
the program. This program computes a plucked-sounding note for each step of a C major scale, 22,050
samples a second, and writes them to `/dev/dsp`. Choose **Build**, then **Run**, with your sound
on.

```x86|playground|no-registers|no-flags|allow-open
default rel
%include "sys/syscall.inc"
%include "fcntl.inc"
%include "linux/soundcard.inc"

RATE    equ 22050                   ; samples a second
NOTE    equ RATE * 3 / 10           ; samples in one note: 0.3 seconds
LOUD    equ 12000                   ; the first sample's height; the most is 32767

section .rodata
dsp_path: db "/dev/dsp", 0
scale:    dd 262, 294, 330, 349, 392, 440, 494, 523, 0  ; Hz; 0 ends it

section .data
fragments: dd 0x0004000b            ; ask for 4 fragments of 2 to the 11th bytes
format:    dd AFMT_S16_LE           ; signed 16-bit samples, low byte first
channels:  dd 1                     ; mono
rate:      dd RATE

section .bss
wave:      resw NOTE                ; one note's samples

section .text
global _start
_start:
    mov eax, SYS_open
    lea rdi, [dsp_path]
    mov esi, O_WRONLY
    syscall
    test rax, rax
    js fail
    mov r12, rax                    ; r12: the sound device

    mov eax, SYS_ioctl              ; a small buffer: first, before anything else
    mov rdi, r12
    mov esi, SNDCTL_DSP_SETFRAGMENT
    lea rdx, [fragments]
    syscall
    mov eax, SYS_ioctl              ; then the format, the channels and the rate,
    mov rdi, r12
    mov esi, SNDCTL_DSP_SETFMT
    lea rdx, [format]
    syscall
    cmp dword [format], AFMT_S16_LE ; checking what each one wrote back
    jne fail
    mov eax, SYS_ioctl
    mov rdi, r12
    mov esi, SNDCTL_DSP_CHANNELS
    lea rdx, [channels]
    syscall
    cmp dword [channels], 1
    jne fail
    mov eax, SYS_ioctl
    mov rdi, r12
    mov esi, SNDCTL_DSP_SPEED
    lea rdx, [rate]
    syscall                         ; the rate it chose, near the one asked for

    lea rbx, [scale]                ; rbx: the next note
next_note:
    mov eax, [rbx]                  ; its frequency
    test eax, eax
    jz done
    shl eax, 16                     ; × 65536
    xor edx, edx
    div dword [rate]
    mov r14d, eax                   ; r14: how far through a cycle each sample goes
    xor r15d, r15d                  ; r15: how far it is, 65536 a whole cycle
    mov r13d, LOUD << 16            ; r13: the wave's height now, × 65536

    lea rdi, [wave]
    mov ecx, NOTE
fill:
    mov eax, r13d
    shr eax, 16                     ; the height: up for the first half of each cycle
    test r15d, 0x8000
    jz store
    neg eax                         ; down for the second half
store:
    mov [rdi], ax
    add rdi, 2
    add r15d, r14d                  ; on through the cycle
    mov eax, r13d
    shr eax, 12
    sub r13d, eax                   ; the height falls by 1/4096 a sample
    dec ecx
    jnz fill

    mov eax, SYS_write              ; waits while the buffer is full
    mov rdi, r12
    lea rsi, [wave]
    mov edx, NOTE * 2               ; two bytes a sample
    syscall
    add rbx, 4
    jmp next_note

done:
    mov eax, SYS_ioctl              ; wait until the last sample has played
    mov rdi, r12
    mov esi, SNDCTL_DSP_SYNC
    xor edx, edx
    syscall
    mov eax, SYS_exit
    xor edi, edi
    syscall
fail:
    mov eax, SYS_exit
    mov edi, 1
    syscall
```

## Setting up the device

`/dev/dsp` opens at 8,000 samples a second, one unsigned byte each, mono. The program asks for
something better with three ioctls, in the order OSS wants: `SNDCTL_DSP_SETFMT` for the format,
`SNDCTL_DSP_CHANNELS` for mono or stereo, `SNDCTL_DSP_SPEED` for the rate. Each takes the address
of an `int` and **writes back** what it set, which can differ from what was asked, so the program
checks the format and the channels, and computes its notes from the rate it got.

`AFMT_S16_LE` is a signed 16-bit sample, its low byte first: 0 is silence, and the wave swings
between -32768 and 32767. Here it starts at 12,000, loud enough without being harsh.

## A buffer that paces the program

A `write` copies samples into the device's buffer and **waits while it is full**, and the buffer
empties at the rate, 22,050 samples a second. So the loop computes a note, writes it, and waits
until there is room before computing the next one: the program runs at the speed of its own sound,
with no sleep anywhere.

Unless asked, the buffer holds several seconds of sound, and every note would be heard seconds
after it was written. `SNDCTL_DSP_SETFRAGMENT`, made right after `open`, asks for a small one.
Its value is `0xMMMMSSSS`: `0x0004000B` asks for 4 **fragments** of 2¹¹, 2,048, bytes, about 0.2
seconds here. Samples reach the speakers a whole fragment at a time, so at the end
`SNDCTL_DSP_SYNC` sends the last, unfinished fragment and waits until everything has played.

## Computing the wave

A square wave is high for half of each cycle and low for the other half. `r15` says how far the
wave is through its cycle, with 65,536 for a whole cycle, so bit 15 is set in the second half. Each
sample it goes on by `r14`, the frequency × 65,536 ÷ the rate: 440 Hz gives 1,307, so a cycle takes
65,536 ÷ 1,307, about 50 samples, and repeats about 440 times a second. `r15` wraps round from 2³²
back to 0 by itself, which is a whole number of cycles, so the wave never jumps.

A struck string is loudest at first and fades. `r13`, the height, loses 1/4096 of itself each
sample, so it falls to about a fifth of its first height by the end of the note: `shr eax, 12`
divides it by 4,096 without a `div`. It keeps the height times 65,536, and `shr eax, 16` takes the
height back out for each sample. In whole numbers 1/4096 of a height below 4,096 is 0, so a plain
height would stop fading a third of the way down; times 65,536, it fades on to almost nothing.

Undo takes back the samples the undone `write` put in the buffer that have not been heard yet.
**Stop** silences the device at once.

## Try it

1. Make the scale softer or louder: change `LOUD` to 4000, then to 24000.
2. Change `shr eax, 12` to `shr eax, 10`: the notes fade four times as fast, like a xylophone.
3. Change `RATE` to 11025. The program asks for that rate and computes its steps from it, so the
   scale has the same pitches, a little duller, with half the samples to compute.
