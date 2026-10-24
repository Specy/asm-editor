This program plays the first phrase of Beethoven's "Ode to Joy". A loop reads each note's pitch
and duration from a table in memory. Service 33 plays the note and waits until it has ended, so
the notes play one after another. Choose **Build**, then **Run**, with your sound on.

```riscv|playground|allow-open
.data
tune:                       # pitch, milliseconds; 0 marks the end of this table
    .word 64, 400,  64, 400,  65, 400,  67, 400
    .word 67, 400,  65, 400,  64, 400,  62, 400
    .word 60, 400,  60, 400,  62, 400,  64, 400
    .word 64, 600,  62, 200,  62, 800
    .word 0

.text
.globl main
main:
    la t0, tune             # address of the next note's pitch
    li a2, 0                # instrument 0, the acoustic grand piano
    li a3, 100              # volume, 0 to 127

next:
    lw a0, 0(t0)            # pitch
    beq a0, zero, done      # stop before reading a duration for the end marker
    lw a1, 4(t0)            # duration in milliseconds
    li a7, 33               # service 33: play the note, then wait for it to end
    ecall
    addi t0, t0, 8          # the next pair of words
    j next

done:
    li a7, 10
    ecall
```

Each note uses two words: its pitch followed by its duration in milliseconds. A word occupies
4 bytes, so `lw a0, 0(t0)` reads the pitch and `lw a1, 4(t0)` reads the duration. Adding 8 to `t0`
moves past both words to the next note.

The final `.word 0` is an end marker chosen for this program. When the loop reads it, `beq a0,
zero, done` branches to `done` before loading a duration or calling the sound service. That is why
the marker needs no duration after it: the program stops without trying to play it.

Larger pitch numbers produce higher sounds. Most notes here last 400 milliseconds; the last
three last 600, 200 and 800 milliseconds. The instrument in `a2` and the volume in `a3` stay the
same for every note, so they are set once before the loop. Service 33 preserves the registers,
including these settings and the table address in `t0`.

The whole phrase takes 6.4 seconds, the sum of the durations, because service 33 waits for each
note to end before the loop continues. In a testcase nothing is heard, and each wait completes
at once and advances the virtual clock instead.

## Try it

Change `li a2, 0` to `li a2, 73` and run the program again: the same tune on a flute. 40 is a
violin and 56 a trumpet.

Then change service 33 to 31. Service 31 starts the note and goes on at once, so all fifteen notes
start within a few instructions of each other and overlap.

To make the notes play one after another again, add a call to service 32 after each call to service
31, before `addi t0, t0, 8` advances to the next note. The sound call needs the pitch in `a0`, but
the wait call needs the duration there. Reload that duration with `lw a0, 4(t0)`, select the wait
service with `li a7, 32`, then use `ecall` again. Each note will then play for its duration before
the loop starts the next one.
