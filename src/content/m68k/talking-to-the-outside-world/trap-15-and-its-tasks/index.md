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
decimal number at its start, and leaves the result in `d1.l`. As in EASy68K, the number stops at
the first character that is not a digit, so `12abc` reads as 12, and a line with no number at all
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

Some EASy68K tasks need devices this editor does not offer. Sound tasks 70 to 77 stop with an
Audio Peripheral message, and cycle-counter tasks 30 and 31 need a 68000 timing model. Serial
and network tasks also stop with a reason; the [unsupported task list](/documentation/m68k/traps#unsupported)
names each one. An invalid argument can stop a supported task too, such as base 37 for task 15.

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
