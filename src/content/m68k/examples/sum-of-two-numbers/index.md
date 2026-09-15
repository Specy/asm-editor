The program asks for two numbers, waits while you type them, and prints their sum. Press Run and the
console stops at the first prompt: type a number into the box under it, press Enter, and the run
carries on inside that one `trap #15`.

Printing only talks. Reading listens, which means the program stops dead in the middle of an
instruction until somebody answers, and what comes back is a number already in a register rather
than text you have to make sense of yourself.

```m68k|playground|console|no-flags|allow-open
    lea first, a1
    move.b #18, d0      ; task 18: print the prompt, then read a number
    trap #15
    move.l d1, d2       ; a = what was typed

    lea second, a1
    move.b #18, d0
    trap #15
    add.l d1, d2        ; a = a + b

    lea answer, a1
    move.l d2, d1       ; task 17 prints the number in d1
    move.b #17, d0      ; task 17: the string, then the number
    trap #15

    move.b #9, d0
    trap #15

    org $2000
first:  dc.b 'First number: ', 0
second: dc.b 10, 'Second number: ', 0
answer: dc.b 10, 'The sum is ', 0
```

```testcase
{ "input": ["17", "25"] }
```

Task 18 is two tasks in one request: it prints the string at `a1` the way task 14 does and then reads
a line and parses it as a decimal number, the way task 4 does. The answer is in `d1`, which is also
the register task 17 prints from, so the first thing the program does after each read is get the
number out of `d1` before the next task overwrites it.

The `10` at the front of `second` and `answer` is a newline written as its ASCII code, which is how
you put one inside a string that a task prints. `dc.b 10, 'Second number: ', 0` is one string of
seventeen bytes and the first of them is the line break.

Task 4 reads a **decimal** number and nothing else. Type anything that is not one and the run ends
with `Expected a number, got "NaN"` under the editor, so a program that has to survive whatever
people type reads the line with task 2 and picks it apart itself.

Change `add.l d1, d2` to `sub.l d1, d2` and type 17 and 25 again. The console reads `The sum is -8`.
The same bits, `FFFFFFF8`, would have printed as 4294967288 through task 15, which reads them as
unsigned. The register did not change; the task that printed it did.
