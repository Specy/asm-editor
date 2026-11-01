The PC speaker plays one tone at a time. It produces a **square wave**: a signal that alternates
between two levels. Its **frequency**, measured in hertz (Hz), is the number of complete cycles
per second. A higher frequency makes a higher-pitched tone.

This program plays the opening of Beethoven's "Für Elise" from a table. Each pair of dwords holds
a frequency in Hz and a duration in milliseconds. For example, `659, 150` means “play 659 Hz for
150 ms.” A frequency of 0 makes a rest; a duration of 0 ends the tune. The final `0, 0` pair is
the end marker, so the loop checks the duration before playing anything.

## Sending a tone and waiting

The example environment provides the speaker at
`/dev/input/by-path/platform-pcspkr-event-spkr`. Use this path as written: you do not need to find an
`event` number or create a link. The program opens it for writing and keeps its descriptor in `r12`.

Like the keyboard events, a speaker command is a 24-byte `input_event`. Here the program **writes**
the event to the device. Its type is `EV_SND`, its code is `SND_TONE`, and its value is the frequency
in Hz. A value of 0 stops the tone. `linux/input.inc` provides these constants and field offsets.

`tone` holds the event in `.data`. With `istruc`, each `at` puts a value at the named field's offset.
The first 16 bytes, the timestamp, stay 0 and are ignored for this command. Before each write, the
loop changes only `input_event.value`.

The speaker keeps sounding until another command changes it. To hold each note, the program calls
`nanosleep` with the address of a `timespec`. The include `time.inc` defines this 16-byte structure:
`tv_sec` is an 8-byte count of whole seconds, followed by an 8-byte `tv_nsec` count of the remaining
nanoseconds. `pause: resb timespec_size` reserves space for both fields.

Choose **Build**, then **Run**, with your sound on. Listen for the pauses between phrases and for
the speaker to fall silent at the end.

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

## Following the tune table

`rbx` points to the next pair. The loop reads its frequency and duration, checks for the end marker,
then writes the frequency to the speaker. After sleeping for the duration, it adds 8 to `rbx` to
reach the next pair of dwords.

Dividing the duration by 1000 gives whole seconds in `eax` and the remaining milliseconds in `edx`.
Multiplying that remainder by 1,000,000 converts it to nanoseconds. For a 150 ms note, the quotient
is 0 and the remainder is 150, so `pause` holds 0 seconds and 150,000,000 nanoseconds. A 1500 ms note
would instead use 1 second and 500,000,000 nanoseconds.

A rest follows the same path: writing 0 Hz silences the speaker, and sleeping holds that silence.
At the end marker, `done` writes one last event with value 0 before exiting. The environment also
silences the speaker when the program ends. While stepping, Undo restores the tone from before the
undone instruction, restarting it if it was sounding.

## How close is the frequency?

Only frequencies above 20 Hz and below 32,767 Hz sound at all. Within that range, the speaker's timer
cannot produce every requested frequency exactly. It runs at 1,193,182 ticks per second and uses a
whole number of ticks for each cycle.

For a request of 659 Hz, the timer divides 1,193,182 by 659. The result is about 1810.595, but the
divider keeps only the whole part: 1810 ticks per cycle. Dividing 1,193,182 by 1810 gives the actual
frequency, about 659.2 Hz. Discarding the fractional part of the divider can make the tone slightly
higher than requested. The table still stores the requested frequencies; the program does not need
to calculate this timer divider itself.

## Try it

1. Play it twice as fast: halve every nonzero duration, so 150 ms becomes 75 ms and 450 ms becomes
   225 ms. Keep the frequencies and the `0, 0` end marker unchanged. Run it and listen for the same
   pitches in a shorter tune.
2. Make a siren: replace the tune with `dd 960, 400, 770, 400` repeated four times, then `dd 0, 0`.
   Run it and listen for the two alternating pitches, each held for 400 ms.
3. Add a long final note, `dd 440, 1500`, just before `dd 0, 0`. Step through its duration conversion
   and check that `pause` holds 1 second and 500,000,000 nanoseconds. Run it and listen for the
   longer note before the speaker falls silent.
