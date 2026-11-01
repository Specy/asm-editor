The PC speaker is the simplest sound a PC makes: one square-wave tone at a time, started and stopped
by the program. This program plays the opening of Beethoven's "Für Elise" on it, from a table of
frequencies and durations. Choose **Build**, then **Run**, with your sound on.

```x86|playground|no-registers|no-flags|allow-open
default rel
%include "sys/syscall.inc"
%include "fcntl.inc"
%include "time.inc"
%include "linux/input.inc"

section .rodata
speaker_path: db "/dev/input/by-path/platform-pcspkr-event-spkr", 0
tune:                               ; Hz and ms for each note; 0 Hz is a rest, 0 ms the end
    dd 659, 150,  622, 150,  659, 150,  622, 150,  659, 150
    dd 494, 150,  587, 150,  523, 150,  440, 450,  0, 150
    dd 262, 150,  330, 150,  440, 150,  494, 450,  0, 150
    dd 330, 150,  415, 150,  494, 150,  523, 450
    dd 0, 0

section .data
tone: istruc input_event
        at input_event.type,  dw EV_SND
        at input_event.code,  dw SND_TONE
        at input_event.value, dd 0      ; the frequency in Hz, 0 for silence
      iend

section .bss
pause: resb timespec_size

section .text
global _start
_start:
    mov eax, SYS_open
    lea rdi, [speaker_path]
    mov esi, O_WRONLY
    syscall
    test rax, rax
    js fail
    mov r12, rax                    ; r12: the speaker
    lea rbx, [tune]                 ; rbx: the next note

next_note:
    mov eax, [rbx]                  ; its frequency
    mov ecx, [rbx + 4]              ; its duration in ms
    test ecx, ecx
    jz done                         ; 0 ms: the end of the tune
    mov [tone + input_event.value], eax
    mov eax, SYS_write
    mov rdi, r12
    lea rsi, [tone]
    mov edx, input_event_size
    syscall                         ; the tone starts, or stops for a rest

    mov eax, [rbx + 4]              ; wait for the note's duration:
    xor edx, edx
    mov ecx, 1000
    div ecx                         ; whole seconds in eax, ms left in edx
    mov [pause + timespec.tv_sec], rax
    imul rdx, rdx, 1000000          ; ms to ns
    mov [pause + timespec.tv_nsec], rdx
    mov eax, SYS_nanosleep
    lea rdi, [pause]
    xor esi, esi
    syscall

    add rbx, 8                      ; the next pair of dwords
    jmp next_note

done:
    mov dword [tone + input_event.value], 0
    mov eax, SYS_write
    mov rdi, r12
    lea rsi, [tone]
    mov edx, input_event_size
    syscall                         ; silence
    mov eax, SYS_exit
    xor edi, edi
    syscall
fail:
    mov eax, SYS_exit
    mov edi, 1
    syscall
```

## A sound is an event

Linux makes the PC speaker an input device, like the keyboard, that a program **writes** to. Its
name, `/dev/input/by-path/platform-pcspkr-event-spkr`, is a link to its `event` number. The program
writes it a `struct input_event`, 24 bytes, whose type is `EV_SND` and whose code is `SND_TONE`; the
value is the frequency in Hz. The speaker plays that tone until another event changes it, and a
value of 0 makes it silent.

`tone` is that event, laid out in `.data` with `istruc`: `at` puts each value at its field's offset,
and the 16 bytes of time before `type` stay 0, which the speaker ignores. Before each write the
program changes only the value.

## Holding a note

The speaker keeps sounding while the program does something else, so a note lasts until the next
write. `nanosleep` waits for the time a `struct timespec` gives, whole seconds in `tv_sec` and
nanoseconds in `tv_nsec`. Dividing the duration by 1000 gives both: the quotient in `eax` is the
seconds, and the remainder in `edx`, the milliseconds left, is multiplied by 1,000,000 to make
nanoseconds.

A rest is a note of 0 Hz: the write silences the speaker and the sleep holds the silence. The rests
here separate the three phrases.

## The frequencies

Each note's frequency is the one a piano's key has, rounded to whole Hz: 440 Hz is the A above
middle C, and each semitone up multiplies the frequency by about 1.06. The speaker cannot play every
frequency exactly: it counts 1,193,182 ticks a second and flips the wave every so many ticks, so it
plays 1193182 ÷ ⌊1193182 ÷ f⌋, 659.2 Hz for 659. Only frequencies above 20 Hz and below 32,767 Hz
sound at all.

When the program ends the speaker goes silent, even if the program forgot to stop it. Undo puts the
tone back as it was before the undone instruction, starting it again if it was sounding.

## Try it

1. Play it twice as fast: halve every duration in the table.
2. Make a siren: replace the tune with `dd 960, 400, 770, 400` repeated four times, then `dd 0, 0`.
3. End on a long note, `dd 440, 1500`, before the `dd 0, 0`: the division makes it 1 second and
   500,000,000 nanoseconds.
