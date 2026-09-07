Every program so far has left its answer in a register or in memory. To print a line, read what you
typed or draw a circle, an M68K program asks the environment, and the instruction it asks with is
`trap`.

## trap #15, and no other trap

A real 68000 has sixteen trap vectors, `trap #0` to `trap #15`, and each one jumps somewhere the
operating system filled in. This editor imitates **EASy68K**, whose whole input and output lives
behind one of them, so `trap #15` is the only one it assembles. Write `trap #14` and the build fails
with "Only implemented TRAP is 15 for IO, received 14".

The request is always three steps:

1. put the **task number** in `d0.b`, which says which service you want,
2. put the **arguments** in the registers that task reads, usually `d1`, `d2` or `a1`,
3. run `trap #15`.

Anything the task answers with comes back in `d1`, or in `d0` for two of them. The task number is a
byte, so `move.b #14, d0` is the usual way to set it, and the rest of `d0` is left alone.

## Printing a string

```m68k|playground|console|no-registers|no-flags
    lea message, a1     ; the address of the string
    move.b #14, d0      ; task 14: print a null terminated string
    trap #15

    lea message, a1
    move.b #13, d0      ; task 13: the same, with a new line after it
    trap #15

    move.b #9, d0       ; task 9: end the program
    trap #15

    org $2000
message: dc.b 'Hello, world!', 0
```

The console panel below the editor shows `Hello, world!Hello, world!` and then a new line. Task 14
prints and stops; task 13 prints and adds a carriage return, which is the difference between the two
all the way through this table: the even and odd pairs are the same job with and without a new line.

Both of them find the end of the string by looking for the zero byte, and both stop after 16
kilobytes with an error, so a string you forgot to terminate ends the run instead of printing
forever. Tasks 0 and 1 are the counted forms, which take the length in `d1.w` and never look for a
terminator.

`move.b #9, d0` and `trap #15` is task 9, **terminate**. On this simulator a program also ends when
there is no next instruction, so you have been ending programs without it; task 9 is how you end one
from the middle, and how you stop before your data.

## Printing numbers

```m68k|playground|console|no-flags
    move.l #-42, d1
    move.b #3, d0       ; task 3: print a signed number
    trap #15

    move.b #6, d0       ; task 6: print one character
    move.b #' ', d1
    trap #15

    move.l #255, d1
    move.b #2, d2       ; the base
    move.b #15, d0      ; task 15: print an unsigned number in a base
    trap #15

    move.b #6, d0
    move.b #' ', d1
    trap #15

    move.l #7, d1
    move.b #5, d2       ; the field width
    move.b #20, d0      ; task 20: print a signed number, right justified
    trap #15

    move.b #9, d0
    trap #15
```

The console shows `-42 11111111     7`. Task 3 reads `d1` as a **signed** long, task 15 reads it as
an **unsigned** one and takes the base in `d2.b`, anything from 2 to 36, so `#2` prints binary and
`#16` prints hexadecimal. Task 20 is task 3 padded on the left to `d2.b` columns, which is how you
line numbers up in a table.

Try changing `move.b #2, d2` to `move.b #16, d2` and running again: the same `d1` prints as `FF`.

## Reading

```m68k|playground|console|no-flags
    lea prompt, a1
    move.b #18, d0      ; task 18: print a string, then read a number
    trap #15
    add.l d1, d1        ; double what was typed
    lea answer, a1
    move.b #17, d0      ; task 17: print a string, then a signed number
    trap #15
    move.b #9, d0
    trap #15

    org $2000
prompt: dc.b 'Give me a number: ', 0
answer: dc.b 'Twice that is ', 0
```

```testcase
{ "input": ["21"] }
```

Press Run and the program stops at the `trap #15` with the prompt in the console and waits: type a
number in the box under it and press Enter, and the run carries on inside that one instruction.
The reading tasks are:

- **task 4** reads a line and parses it as a decimal number into `d1.l`.
- **task 5** reads one character into `d1.b`, without waiting for Enter.
- **task 2** reads a whole line into the buffer at `a1`, terminates it with a zero and puts its
  length in `d1.w`. The buffer is yours, and `ds.b` is how you reserve it.
- **task 7** answers `d1.b` = 1 when a character is waiting and 0 when none is, and takes nothing.
  It is how a program checks without stopping, since tasks 5 and 2 wait.
- **task 18** is task 14 and then task 4, a prompt and a number in one request, and **task 17** is
  task 14 and then task 3.

## Asking about the environment

```m68k|playground|console|no-flags
    move.b #7, d0       ; task 7: is a character waiting?
    trap #15
    lea waiting, a1
    move.b #17, d0
    trap #15

    move.b #8, d0       ; task 8: hundredths of a second since the run started
    trap #15
    lea elapsed, a1
    move.b #17, d0
    trap #15

    move.b #9, d0
    trap #15

    org $2000
waiting: dc.b 'characters waiting: ', 0
elapsed: dc.b 10, 'hundredths elapsed: ', 0
```

Both answers come out at 0: nobody has typed anything, and the program is fast. Task 8 counts
hundredths of a second **since the run started**, which is where this editor differs from EASy68K,
where the same task counts from midnight. Programs measure how long something took by subtracting
two reads of it, and that works the same either way.

Task 23 is the clock's other operation. It lets `d1.l` hundredths of a second of program time pass
before the next instruction runs. The editor stays responsive while it waits, so Stop still answers, and
it is what paces an animation. Both of them are on a virtual clock inside a testcase, where a delay
finishes at once.

The `10` at the front of `elapsed` is a newline written as its ASCII code, which is how you put one
inside a string that a task prints in the middle.

## The full table

Every task this editor answers, with what it reads and what it leaves behind. The drawing ones and
the ones that read the keyboard and the mouse are the next lecture.

|  task | what it does                                 | reads                          | answers                                   |
| ----: | -------------------------------------------- | ------------------------------ | ----------------------------------------- |
|     0 | print a counted string and a new line        | `a1` = string, `d1.w` = length |                                           |
|     1 | print a counted string                       | `a1` = string, `d1.w` = length |                                           |
|     2 | read a line into a buffer                    | `a1` = buffer                  | the string at `(a1)`, `d1.w` = its length |
|     3 | print a signed number                        | `d1.l`                         |                                           |
|     4 | read a number                                |                                | `d1.l`                                    |
|     5 | read one character                           |                                | `d1.b`                                    |
|     6 | print one character                          | `d1.b`                         |                                           |
|     7 | is a character waiting                       |                                | `d1.b` = 1 or 0                           |
|     8 | hundredths of a second since the run started |                                | `d1.l`                                    |
|     9 | end the program                              |                                |                                           |
|    11 | move the text cursor, or clear the screen    | `d1.w`                         | `d1.w` when asked                         |
|    13 | print a string and a new line                | `a1` = string                  |                                           |
|    14 | print a string                               | `a1` = string                  |                                           |
|    15 | print an unsigned number in a base           | `d1.l`, `d2.b` = base, 2 to 36 |                                           |
|    17 | print a string, then a signed number         | `a1` = string, `d1.l`          |                                           |
|    18 | print a string, then read a number           | `a1` = string                  | `d1.l`                                    |
|    19 | read the state of up to four keys            | `d1.l` = four key codes        | `d1.l`                                    |
|    20 | print a signed number in a field             | `d1.l`, `d2.b` = width         |                                           |
|    23 | let that many hundredths of a second pass    | `d1.l`                         |                                           |
|    24 | turn the simulator's shortcut keys on or off | `d1.l`                         | accepted and ignored                      |
|    33 | set or read the screen size                  | `d1.l`                         | `d1.l` when asked                         |
|    61 | read the mouse                               | `d1.b` = which state           | `d0.b` = buttons, `d1.l` = position       |
| 80-96 | drawing                                      | see the next lecture           |                                           |

The same table, with a paragraph on each task, is on the
[trap tasks documentation page](/documentation/m68k/traps).

## The tasks that are refused

EASy68K has more tasks than this, and eleven of them stop the run here with a message saying which
one and why. Refusing them out loud is deliberate: a program that asks for one finds out, instead of
running to the end having quietly done nothing.

|   task | what it was for                      | why it is refused                                        |
| -----: | ------------------------------------ | -------------------------------------------------------- |
|     10 | print to the printer                 | the editor has no printer                                |
|     12 | turn keyboard echo off               | typed input is always echoed, the way a terminal does it |
|     16 | display properties                   | the editor's input prompt is not a program setting       |
|     21 | font properties                      | the screen draws text in one fixed cell font             |
|     22 | read a character off the text screen | the screen holds pixels, not a grid of characters        |
|     25 | scroll a rectangle of text           | the screen holds pixels, not a grid of characters        |
| 30, 31 | clear and read the cycle counter     | no cycle counting is emulated                            |
|     32 | hardware and simulator control       | there is no hardware window and no automatic IRQ         |
|     60 | turn the mouse interrupt on          | mouse input is polled with task 61                       |
|     62 | turn the keyboard interrupt on       | keyboard input is polled with tasks 7 and 19             |

The last two come back in the interrupts lecture, which is where the reason they cannot work is
explained.

## Your turn

Print `The answer is 42` and end the program. The string is written for you at `$2000`, and the
number is not part of it: print the string and the number 42 with one task.

```m68k|playground|console|exercise
* your code here

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
    lea message, a1     ; the string
    move.l #42, d1      ; the number
    move.b #17, d0      ; task 17: both, in that order
    trap #15
    move.b #9, d0       ; task 9: end
    trap #15

    org $2000
message: dc.b 'The answer is ', 0
```

</details>

The second one reads a number and prints its square, with nothing else in the output. The test types
9, so the console reads `81`.

```m68k|playground|console|exercise
* your code here
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
    move.b #4, d0       ; task 4: read a number into d1
    trap #15
    move.l d1, d2
    mulu d2, d1         ; d1 = n * n
    move.b #3, d0       ; task 3: print it
    trap #15
    move.b #9, d0
    trap #15
```

```testcase
{ "input": ["9"] }
```

</details>
