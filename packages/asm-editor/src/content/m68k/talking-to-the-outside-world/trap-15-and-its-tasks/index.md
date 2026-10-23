# trap #15 and its tasks

So far, a program's answer has stayed in a register or in memory. To print text or read a number,
it needs help from the environment running it. On the 68000, `trap #n` is a real instruction that
enters an **exception handler**: code that takes over when the instruction runs.
The processor provides `trap #0` through `trap #15`. It does not define printing tasks.

This editor supplies its own service agreement for `trap #15`. A number in `d0.b` selects a
**task**, and each task specifies which registers carry its arguments and answer. The editor
implements only `trap #15`, so its assembler rejects the other trap numbers as unsupported here.
They are still valid 68000 instructions elsewhere.

For each request:

1. Put the task number in `d0.b` (the low byte of `d0`).
2. Put any arguments in the registers that task uses.
3. Run `trap #15`, then read any answer from the register the task specifies.

## Print a string

Task 14 prints the string whose address is in `a1`. It reads bytes until the first zero byte and
prints no newline. Task 13 uses the same argument and adds a newline after the string. The zero
byte ends the text being printed; it does not end the program.

The strings below use `dc.b` to place text in memory. For these ASCII characters, the quoted text
emits one byte per character, including each space and punctuation mark. The `, 0` after the quote
appends the zero byte that ends the string. A label names its first byte, and
`move.l #greeting, a1` puts that address in `a1`.

```m68k|playground|console|no-registers|no-flags
    move.l #greeting, a1
    move.b #14, d0      ; print without a newline
    trap #15

    move.l #ending, a1
    move.b #13, d0      ; print, then add a newline
    trap #15

    move.b #9, d0       ; end the program
    trap #15

    org $2000
greeting: dc.b 'Hello, ', 0
ending:   dc.b 'world!', 0
```

The console shows `Hello, world!` on one line. Task 14 leaves the cursor after the space, so task
13 continues there and then moves to the next line. Both strings have a zero terminator. Task 9
ends the program before execution can run into the bytes after `org $2000`.

## Print and read numbers

Task 3 prints the **signed decimal** number in `d1.l`. Task 4 waits for a line of input, reads the
decimal number at its start, and leaves the result in `d1.l`. The number stops at the first
character that is not a digit, so `12abc` reads as 12, and a line with no number at all
reads as 0. The task number in `d0.b` changes between requests; the value in `d1` is the input or
answer for the selected task.

```m68k|playground|console|no-flags
    move.b #4, d0       ; read a decimal number into d1.l
    trap #15
    add.l d1, d1        ; double it
    move.b #3, d0       ; print the signed number in d1.l
    trap #15
    move.b #9, d0
    trap #15
```

```testcase
{ "input": ["21"] }
```

In an interactive run, task 4 waits for you to type a number in the console, after its output,
and press Enter. In this example, the supplied input line is `21`, so the program receives it
without waiting for typing and prints `42`.

Task 17 is a handy combination: it prints a zero-terminated string from `a1`, then prints the
signed decimal number in `d1.l`, with no newline added. It performs the same output as task 14
followed by task 3.

Task 15 prints an **unsigned** number in the base selected by `d2.b`. Hexadecimal digits are
uppercase: 255 in base 16 prints `FF`. Text stored with `dc.b` uses Windows-1252, so `€` occupies
one byte, `$80`, and printing that byte produces `€` in the console. The screen's fixed font has
only ASCII glyphs, so that character occupies a blank cell there.

```m68k|playground|console|no-flags
    move.l #currency, a1
    move.b #14, d0
    trap #15
    move.l #255, d1
    move.b #16, d2
    move.b #15, d0
    trap #15
    move.b #9, d0
    trap #15
currency: dc.b '€ ', 0
```

```testcase
{ "expectedOutput": "€ FF" }
```

| task | action                                       | argument or answer                         |
| ---: | -------------------------------------------- | ------------------------------------------ |
|    3 | print a signed decimal number                | reads `d1.l`                               |
|    4 | read a decimal number                        | answers in `d1.l`                          |
|    9 | end the program                              | none                                       |
|   13 | print a zero-terminated string and a newline | reads address in `a1`                      |
|   14 | print a zero-terminated string               | reads address in `a1`                      |
|   17 | print a string, then a signed decimal number | reads address in `a1` and number in `d1.l` |

## Read a key and control the echo

Task 5 reads one key without waiting for a whole line. It writes the character's byte to `d1.b`;
Enter is `$0D` (13). Tasks 2, 4 and 18 instead read a line ended with Enter. Task 2 stores its
first 79 characters at `a1`, followed by zero, and returns their count in the whole of `d1.l`.

Task 12 controls whether typed input is shown: `d1.b = 0` turns echo off, and another value turns
it on. Task 16 hides the waiting input prompt with 0, shows it with 1, turns the line feed after
a key read of Enter off with 2, and on with 3. These settings start on for each Build, and Undo
restores a setting changed by the program. With echo off, a line read still starts a new line
when Enter finishes it. Scripted Testcase answers are never echoed.

```m68k|playground|console|no-flags
    move.b #0, d1
    move.b #12, d0      ; hide the key's echo
    trap #15
    move.b #5, d0       ; read one key
    trap #15
    andi.l #$FF, d1    ; keep only the character byte
    move.b #3, d0       ; print its decimal code
    trap #15
    move.b #9, d0
    trap #15
```

```testcase
{ "input": ["\n"], "expectedOutput": "13" }
```

Build and Run, then press Enter in the console. The program prints `13`. If a program first
uses the screen, keyboard or mouse, its later reads take input from the focused screen instead;
click that panel before typing.

## Files and unsupported tasks

Tasks 50 to 59 access the Project's Files. File numbers start at 0, with at most eight open at
once. Task 51 opens an existing File, 52 creates or empties one, 53 reads bytes, 54 writes them,
55 changes the position, and 56 closes it. Task 50 closes all of them, 57 deletes a File, and
59 checks whether it exists. Task 58 asks for a Project path in a modal dialog, which can be
cancelled. Read each task's registers and result codes in the [trap Documentation](/documentation/m68k/traps#files):
`d0.w` reports success (0), end of file (1), failure (2), or read-only access (3). Undo restores
file changes and positions with the instruction that made them.

The simulator does not provide every device or hardware feature that a program might request.
Cycle-counter tasks 30 and 31 need a 68000 timing model, so they stop with a reason, as serial and
network tasks do; the [unsupported task list](/documentation/m68k/traps#unsupported) names each one.
An invalid argument can stop a supported task too, such as base 37 for task 15.

## Making sound

Task 70 plays a WAV file from the project. Put the address of its zero-terminated path in `a1`.
The task returns 1 in `d0.w` when playback starts. This standard player plays one sound at a time:
it returns 0 if it is busy, or if an existing file cannot be played as a WAV. If the path does not
exist, the task leaves `d0` unchanged.

A sound file contains **samples**: successive numbers describing the sound level at successive
instants. This example uses one byte per sample. These 8-bit samples are unsigned, with `$80` as
the middle level; repeating `$80` gives silence. The two levels used here, `$C0` and `$40`, are
equally far above and below that middle.

The program writes 10 high samples, then 10 low samples. Those 20 samples make one complete
cycle of a **square wave**. At 8,000 samples per second, the cycle repeats 8,000 / 20 = 400 times
per second: a frequency of **400 Hz**. The array holds 4,000 samples, so the sound lasts
4,000 / 8,000 = half a second.

A playground starts with no WAV file, so the program creates one. It puts a 44-byte **header**
before the samples to tell the player their format, sample rate and length. Treat this header
as reusable setup for the example's one-channel, 8-bit audio. The file tasks write the header
and samples together, then close the file before task 70 plays it.

```m68k|playground|console|no-registers|no-flags
RATE    equ 8000            ; samples a second
LENGTH  equ 4000            ; half a second of them

    lea samples, a0         ; a square wave: 10 samples high, then 10 low
    move.w #LENGTH/20-1, d1
wave:
    moveq #9, d2
high:
    move.b #$C0, (a0)+
    dbra d2, high
    moveq #9, d2
low:
    move.b #$40, (a0)+
    dbra d2, low
    dbra d1, wave

    lea name, a1
    move.b #52, d0          ; create the file; returns its number in d1.l
    trap #15
    lea wav, a1
    move.l #44+LENGTH, d2    ; number of bytes to write
    move.b #54, d0          ; write from a1 to the file numbered in d1.l
    trap #15
    move.b #56, d0          ; close the same file, using d1.l
    trap #15

    lea name, a1
    move.b #70, d0          ; play it
    trap #15
    move.w d0, d1           ; copy the word-sized playback result
    ext.l d1               ; extend it to a signed long for task 3
    move.b #3, d0           ; print the answer
    trap #15
    move.b #9, d0
    trap #15

    org $2000
name:    dc.b 'tone.wav', 0
wav:     dc.b 'RIFF', (36+LENGTH)&$FF, (36+LENGTH)>>8, 0, 0, 'WAVE'
         dc.b 'fmt ', 16, 0, 0, 0       ; a format chunk of 16 bytes:
         dc.b 1, 0, 1, 0                ; integer PCM, one channel,
         dc.b RATE&$FF, RATE>>8, 0, 0   ; samples a second,
         dc.b RATE&$FF, RATE>>8, 0, 0   ; bytes a second,
         dc.b 1, 0, 8, 0                ; one byte a sample, of 8 bits
         dc.b 'data', LENGTH&$FF, LENGTH>>8, 0, 0
samples: ds.b LENGTH
```

```testcase
{ "expectedOutput": "1" }
```

The console shows `1`, and task 9 ends the program while the sound plays on. Task 70's result is
a word, while task 3 prints a signed long. After `move.w` copies the result to `d1.w`, `ext.l`
sets the upper half of `d1` to match its sign, giving task 3 the same value in `d1.l`.

The header writes its numbers low byte first, as WAV requires. In `RATE&$FF`, the assembler's
`&` keeps only the low eight bits, producing the first byte. In `RATE>>8`, `>>` shifts the number
right by eight bits, producing the next byte. For example, 8,000 is `$1F40`, so these expressions
emit `$40`, then `$1F`. The following two zeros complete the four-byte value. The length fields
use the same expressions; all the values in this example fit in two bytes.

Task 71 loads a file into one of 256 numbered slots, and task 72 plays that slot through the
standard player. The editor implements a second player interface named **DirectX**, selected by
tasks 73 to 75, which can mix several sounds and play WAV or MIDI files. Tasks 76 and 77 loop or
stop a slot's sound. The
[Sound tasks reference](/documentation/m68k/traps#sound) gives the arguments for these options.

Once a program has made a sound, the **Sound** button in the execution dock turns sound off and
on. Testcases run silently and never leave a sound playing, so the player is never busy there.

## Your turn

Print `The answer is 42` and end the program. The string at `$2000` stops before the number; task
17 can print both parts in one request.

```m68k|playground|console|exercise
; your code here

    org $2000
message: dc.b 'The answer is ', 0
```

```testcase
{
    "expectedOutput": "The answer is 42"
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|console|solution
    move.l #message, a1
    move.l #42, d1
    move.b #17, d0
    trap #15
    move.b #9, d0
    trap #15

    org $2000
message: dc.b 'The answer is ', 0
```

</details>

Now read a small nonnegative number, print its square, and print nothing else. With the supplied
input `9`, the result should be `81`.

```m68k|playground|console|exercise
; your code here
```

```testcase
{
    "input": ["9"],
    "expectedOutput": "81"
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|console|solution
    move.b #4, d0       ; read a number into d1
    trap #15
    move.l d1, d2
    mulu.w d2, d1       ; d1 = n * n
    move.b #3, d0       ; print the result
    trap #15
    move.b #9, d0
    trap #15
```

```testcase
{ "input": ["9"] }
```

</details>
