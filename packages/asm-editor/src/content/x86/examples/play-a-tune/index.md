This program plays the first phrase of Beethoven's "Ode to Joy" on a piano, with a drum under every
note. It writes **MIDI** messages, a few bytes each, to the MIDI port `/dev/snd/midiC1D0`, and a
General MIDI synthesizer plays them. Choose **Build**, then **Run**, with your sound on.

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

## MIDI messages

A MIDI message is a **status** byte, which says what to do and on which of the 16 channels, then
one or two data bytes from 0 to 127. The program uses three kinds:

| Message        | Bytes                            | Here                                         |
| -------------- | -------------------------------- | -------------------------------------------- |
| Program change | `0xC0 + channel`, instrument     | `0xC0, 0`: channel 1 plays the piano         |
| Note on        | `0x90 + channel`, note, velocity | `0x90, 64, 100`: the E above middle C starts |
| Note off       | `0x80 + channel`, note, 0        | `0x80, 64, 0`: it ends                       |

Channels are numbered 0 to 15 in the status byte and 1 to 16 by musicians, so `0x90` is channel 1.
Note 60 is middle C and each note up is a semitone higher, so 64 is E, 65 F and 67 G. A note sounds
from its note on until its note off; between the two, `nanosleep` holds it for its duration.

`send` writes one three-byte message. It keeps the bytes in `message` and passes their address to
`write`, as any write passes its bytes.

## Drums on channel 10

On a General MIDI synthesizer channel 10, `0x99` in the status byte, is the drum kit. There the note
number chooses the drum: 36 the bass drum, 38 the snare and 42 the closed hi-hat. A drum fades by
itself, so it needs no note off. The third column of the table gives each note its drum, bass drum
and snare on the first and third beats of each bar and the hi-hat between them.

## The port

The port sends the bytes at MIDI's speed, 31,250 bits a second, about three bytes a millisecond,
behind a buffer of 4,096 bytes. A write returns once its bytes are in the buffer, so they are heard
a moment later. `close` waits until the buffer is empty: without it the program could end with its
last note off still waiting.

The phrase takes 6.4 seconds, the sum of the durations. In a testcase nothing is heard, and each
`nanosleep` moves the testcase's clock on at once.

## Try it

1. Change the instrument, the second byte of `piano`: 73 is a flute, 40 a violin, 56 a trumpet.
2. Play a chord: send note ons for 60, 64 and 67 together, wait, then send their three note offs.
3. Replace the hi-hat, 42, with an open hi-hat, 46, or a ride cymbal, 51.
