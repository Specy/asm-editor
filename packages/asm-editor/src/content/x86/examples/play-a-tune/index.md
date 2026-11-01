This program plays the first phrase of Beethoven's "Ode to Joy" on a piano, with a drum under every
note. **MIDI** messages are instructions to play instruments, rather than recorded sound. The
program writes these messages to `/dev/snd/midiC1D0`, a **port** that receives MIDI bytes. A
**synthesizer** reads the instructions and produces the sound. This one follows General MIDI,
which assigns standard numbers to instruments and drums.

Choose **Build**, then **Run**, with your sound on.

## MIDI messages

Each message starts with a **status byte** that selects an action and one of 16 channels.
One or two data bytes follow, each from 0 to 127. Channels let the synthesizer play different
instruments at the same time. This program uses channel 1 for piano and channel 10 for drums.

The channel value in a status byte starts at **0**, so channel 1 uses 0 and channel 10 uses 9.
That makes a drum note-on status `0x90 + 9 = 0x99`.

| Message        | Bytes                            | Example                                     |
| -------------- | -------------------------------- | ------------------------------------------- |
| Program change | `0xC0 + channel`, instrument     | `0xC0, 0`: select piano on channel 1        |
| Note on        | `0x90 + channel`, note, velocity | `0x90, 64, 100`: start note 64 on channel 1 |
| Note off       | `0x80 + channel`, note, 0        | `0x80, 64, 0`: release that note            |

For the piano, the note number chooses the pitch: a larger number gives a higher sound. Note 60
is called middle C. Each increase of 1 is one **semitone**, the step from one piano key to the
next, including the black keys. Notes 64, 65 and 67 are E, F and G. **Velocity** describes how
hard the key is struck; larger values generally sound louder. The example uses 100 for piano
and 80 for drums.

## The program

The `piano` message selects the instrument once. Each group of three dwords in `tune` then gives
a piano note number, its duration in milliseconds, and a drum number. The loop starts the piano
and drum, sleeps for the duration, then releases the piano note. Adding 12 to `rbx` advances past
those three dwords. A pitch of 0 ends the tune.

```x86|playground|no-registers|no-flags|allow-open
default rel
%include "sys/syscall.inc"
%include "fcntl.inc"
%include "time.inc"

section .rodata
midi_path: db "/dev/snd/midiC1D0", 0
piano:     db 0xc0, 0               ; program change: channel 1 plays instrument 0
tune:                               ; pitch, ms and drum for each note; pitch 0 ends it
    dd 64, 400, 36,  64, 400, 42,  65, 400, 38,  67, 400, 42
    dd 67, 400, 36,  65, 400, 42,  64, 400, 38,  62, 400, 42
    dd 60, 400, 36,  60, 400, 42,  62, 400, 38,  64, 400, 42
    dd 64, 600, 36,  62, 200, 42,  62, 800, 38
    dd 0

section .bss
message: resb 3
pause:   resb timespec_size

section .text
global _start

; send: the three-byte message dil, sil, dl to the MIDI port in r12.
; Changes rax, rcx, rdx, rsi, rdi and r11.
send:
    mov [message], dil
    mov [message + 1], sil
    mov [message + 2], dl
    mov eax, SYS_write
    mov rdi, r12
    lea rsi, [message]
    mov edx, 3
    syscall
    ret

_start:
    mov eax, SYS_open
    lea rdi, [midi_path]
    mov esi, O_WRONLY
    syscall
    test rax, rax
    js fail
    mov r12, rax                    ; r12: the MIDI port

    mov eax, SYS_write              ; choose the piano, two bytes
    mov rdi, r12
    lea rsi, [piano]
    mov edx, 2
    syscall

    lea rbx, [tune]                 ; rbx: the next note
next_note:
    mov r13d, [rbx]                 ; r13: its pitch
    test r13d, r13d
    jz done

    mov edi, 0x90                   ; note on, channel 1
    mov esi, r13d
    mov edx, 100                    ; how hard the key is struck, 1 to 127
    call send
    mov edi, 0x99                   ; note on, channel 10: a drum
    mov esi, [rbx + 8]              ; which drum
    mov edx, 80
    call send

    mov eax, [rbx + 4]              ; wait for the note's duration, under a second
    imul rax, rax, 1000000          ; ms to ns
    mov qword [pause + timespec.tv_sec], 0
    mov [pause + timespec.tv_nsec], rax
    mov eax, SYS_nanosleep
    lea rdi, [pause]
    xor esi, esi
    syscall

    mov edi, 0x80                   ; note off, channel 1
    mov esi, r13d
    xor edx, edx
    call send
    add rbx, 12                     ; the next three dwords
    jmp next_note

done:
    mov eax, SYS_close              ; waits until every byte has gone out
    mov rdi, r12
    syscall
    mov eax, SYS_exit
    xor edi, edi
    syscall
fail:
    mov eax, SYS_exit
    mov edi, 1
    syscall
```

`send` takes the three message bytes in `dil`, `sil` and `dl`. It stores them in consecutive bytes
of `message`, then gives `write` that buffer's address and a length of 3. The program writes the
two-byte program-change message separately.

The sleep works like the PC-speaker example: multiply milliseconds by 1,000,000 to get
nanoseconds, then fill a `timespec`. These durations are all under one second, so `tv_sec` is 0.
The durations add up to 6.4 seconds. In a testcase nothing is heard, and each
`nanosleep` advances the testcase's clock immediately.

## Drums on channel 10

On channel 10, the note number selects a drum rather than a piano pitch: 36 is a bass drum,
38 a snare and 42 a closed hi-hat. The third number in each group in `tune` selects the drum to
start alongside that piano note. Listen for the bass drum, hi-hat, snare, hi-hat pattern.

The synthesizer's drum sounds used here decay after being triggered, so this example sends them
no note-off messages. The piano notes do receive note-offs after their durations.

## Finishing playback

Writing to the port queues MIDI messages. A write can return before those messages reach the
synthesizer. `close` waits for the queued bytes to leave the port. This lets the
final piano note-off reach the synthesizer before the program exits.

## Try it

1. Change the instrument, the second byte of `piano`: 73 is a flute, 40 a violin, 56 a trumpet.
2. Make every entry play a C-major chord, three notes sounding together. Inside `next_note`,
   replace the two note-on sequences, from `mov edi, 0x90` through the drum's `call send`, with
   three calls to `send`. Before **each** call, set `edi` to `0x90`, `edx` to 100, and `esi` to
   one of 60, 64 and 67. Keep the sleep block: each chord uses the current entry's duration.
   Replace the piano note-off sequence after the sleep with three calls too: before each,
   set `edi` to `0x80`, `edx` to 0, and `esi` to one of those same three note numbers. Keep
   `add rbx, 12` and the loop jump. The table still controls the durations and when to stop,
   but this version ignores its pitches and drums and plays no percussion.
3. Replace 42, the third number in some groups, with 46 for an open hi-hat or 51 for a ride cymbal.
