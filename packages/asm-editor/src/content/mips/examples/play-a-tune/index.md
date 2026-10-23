This program plays the first phrase of Beethoven's "Ode to Joy". The tune is a table in memory
with two words per note: its pitch, then its duration in milliseconds. Each word occupies four
bytes, so the duration is four bytes after the pitch, and the next note starts eight bytes later.
A final pitch of `0` marks the end of this table. The loop checks for that marker before loading
a duration, so the marker needs only one word.

The loop gives each pitch and duration to service 33, which plays the note and waits for it to
end. Choose **Build**, then **Run**, with your sound on.

```mips|playground|allow-open
.data
tune:                       # pitch, milliseconds; a pitch of 0 ends the tune
    .word 64, 400,  64, 400,  65, 400,  67, 400
    .word 67, 400,  65, 400,  64, 400,  62, 400
    .word 60, 400,  60, 400,  62, 400,  64, 400
    .word 64, 600,  62, 200,  62, 800
    .word 0

.text
.globl main
main:
    la $t0, tune            # address of the next note's pitch
    li $a2, 0               # instrument 0, the acoustic grand piano
    li $a3, 100             # volume, 0 to 127

next:
    lw $a0, 0($t0)          # pitch
    beq $a0, $zero, done
    lw $a1, 4($t0)          # duration in milliseconds
    li $v0, 33              # service 33: play the note, then wait for it to end
    syscall
    addi $t0, $t0, 8        # the next pair of words
    j next

done:
    li $v0, 10
    syscall
```

Pitch 60 is middle C, and each step up is a semitone: 62 is D, 64 is E, 65 is F and 67 is G. Here,
one beat lasts 400 milliseconds; a note lasting one beat is called a quarter note. Near the end,
the E lasts one and a half beats (600 milliseconds), called a dotted quarter note. The next D
lasts half a beat (200 milliseconds), and the final D lasts two beats (800 milliseconds), called
a half note. These names describe the durations; the program only needs the numbers.

The instrument in `$a2` and the volume in `$a3` are the same for every note, so they are set once
before the loop. Service 33 preserves the registers, including the table address in `$t0`. After
each note ends, adding 8 to `$t0` advances to the next pair of words.

The whole phrase takes 6.4 seconds, the sum of the durations, because service 33 waits for each
note's duration before continuing. In a testcase nothing is heard, and each wait completes at
once and advances the virtual clock instead.

## Try it

Change `li $a2, 0` to `li $a2, 73` and run the program again: the same tune on a flute. 40 is a
violin and 56 a trumpet.

Then change service 33 to 31. Service 31 starts a note and continues at once, so all fifteen notes
start almost together and overlap.

To play the tune in sequence again, keep service 31 and add a wait with service 32 after each
note, before advancing `$t0`. Service 31 leaves the pitch in `$a0`, but service 32 expects a
duration there. Reload the current duration with `lw $a0, 4($t0)`, select service 32 with
`li $v0, 32`, then issue another `syscall`. The next loop iteration loads the next pitch into
`$a0`. Starting a note and then waiting for its duration gives the same timing as service 33.
