Sound changes over time. A **sample** is a number describing one point in that changing signal.
The sound device reads a sequence of samples at a steady rate and turns it into sound.
With signed samples, positive and negative numbers describe opposite directions from the resting
position. A sequence of zeros means silence; larger distances from zero give a stronger signal.
For example, `12000, 12000, -12000, -12000, 12000, 12000, ...` alternates between two levels.
The time between samples determines how quickly that pattern repeats.

This program writes signed 16-bit samples to `/dev/dsp`. Each sample occupies two bytes and can
range from -32768 to 32767. It uses **mono**: one sequence of samples, rather than separate left
and right sequences. `RATE` requests 22,050 samples per second; the device can choose a nearby
rate instead.

The program generates eight fading notes: C, D, E, F, G, A, B, C, a **C major scale**.
The last C has twice the frequency of the first. Each note has `NOTE` samples, or 0.3 seconds
when the chosen rate equals `RATE`. Choose **Build**, then **Run**, with your sound on.

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

The program opens `/dev/dsp`, requests a small playback buffer, then requests the sample format,
channel count and sample rate with `ioctl`. `SNDCTL_DSP_SETFMT` selects the representation:
`AFMT_S16_LE` means signed 16-bit samples with the low byte first. `SNDCTL_DSP_CHANNELS` requests
one channel, and `SNDCTL_DSP_SPEED` requests the rate.

Each of these three configuration calls receives the address of a 32-bit integer. On success,
it writes the chosen value there. The program checks that the format and channel count match
its buffer layout, then uses the returned `rate` to calculate pitches.

These calls can also fail with a negative result in `rax`. This example does not check their
return values: a failed call can leave the requested value in memory, so the comparisons alone
do not prove that configuration succeeded. The calculation also assumes `rate` is nonzero;
zero would cause division by zero. A program that handles device failures must check each
configuration call before using its result.

## Computing the wave

A **square wave** alternates between a positive level and a negative level. Each repetition
of this pattern is a cycle. At 440 Hz, the pattern repeats 440 times per second.

`r15d` tracks the position in that cycle, called its **phase**. Only its low 16 bits matter:
positions 0 through 32767 select the positive half, and 32768 through 65535 select the negative
half. Bit 15 has value 32768 (`0x8000`), so `test r15d, 0x8000` distinguishes the two halves.

Each sample advances the phase by `frequency * 65536 / rate`, rounded down by integer division.
At 440 Hz and a chosen rate of 22,050, the step is 1307. Starting at zero, the phase positions
are 0, 1307, 2614, and so on. After 25 steps the position is 32675, still positive; after 26
it is 33982, negative. After 51 steps the low 16 bits are 1121, back in the positive half of
the next cycle. Thus about 50 samples make a cycle. Higher bits accumulate in `r15d`, but do
not affect bit 15; even its eventual 32-bit overflow preserves this repeating pattern.

`r13d` stores the current positive level multiplied by 65,536. This is **fixed-point** arithmetic:
the low 16 bits hold fractions of one sample unit, and the high 16 bits hold the whole-number
part. For a level of 12000, the stored value is `12000 * 65536 = 786432000`.
`shr eax, 16` discards the fractional bits to produce the sample level, 12000. The phase test
then chooses whether to store that level or its negative.

After storing a sample, the program subtracts `r13d >> 12`, approximately 1/4096 of the stored
level. On the first iteration, it subtracts 192000, leaving 786240000. Shifting that new value
right by 16 gives 11997 for the next sample. The opening samples are therefore 12000, 11997,
11994, ...; later the phase selects negative values whose distance from zero also decreases.
The repeated reduction makes the note fade.

Keeping fractional bits lets the fade continue when the level is below 4096. If the program
stored only a whole-number level, dividing such a level by 4096 would give zero, and subtracting
zero would leave it unchanged. At the original settings, the level falls to about a fifth of
its starting value over one note.

## A buffer that paces the program

A `write` puts samples into the playback buffer. While the buffer is full, the blocking call
waits for space as the device plays earlier samples. Playback consumes samples at the **chosen**
rate. This waiting paces the note loop without a sleep call; writing a note does not mean that
the listener has already heard it.

`SNDCTL_DSP_SETFRAGMENT` requests a small buffer before the other configuration calls. Its
argument packs two numbers: `0x0004000b` requests four chunks, called **fragments**, of 2¹¹
(2048) bytes each. This is a request, not a size the program can rely on. The device chooses
the final buffer arrangement, and this example does not query it.

The last write may leave a partly filled fragment: imagine a 2048-byte chunk with only its
first 940 bytes filled. `SNDCTL_DSP_SYNC` lets the device finish playing the queued data,
including that partial chunk, and waits for playback to finish before the program exits.

`NOTE` is computed from the requested `RATE`, while the phase step uses the returned `rate`.
If the device chooses a different rate, each note still contains `NOTE` samples, so its duration
is `NOTE / chosen rate` seconds. The phase calculation adjusts the pitch to the chosen rate,
subject to integer rounding. The fade also happens once per sample, so its speed in seconds
depends on that rate.

Undoing a `write` removes any of its samples still waiting in the playback buffer.
**Stop** silences the device at once.

## Try it

1. Make the scale softer or louder: change `LOUD` to 4000, then to 24000.
2. Change `shr eax, 12` to `shr eax, 10`: each sample now removes about 1/1024 of the level,
   so the notes fade about four times as fast.
3. Change `RATE` to 11025. This roughly halves `NOTE` as well as requesting half the original sample
   rate. If the device accepts it, note duration stays approximately 0.3 seconds and each cycle uses about
   half as many samples. The phase step still targets the same pitches, with integer rounding.
   The repeating pitch is only part of the sound: the pattern within each cycle also matters.
   With fewer samples to describe that pattern, the sound can change. Listen to both versions
   and compare. If the device chooses another rate, use `NOTE / chosen rate` to work out the duration.
