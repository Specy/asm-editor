The program asks for two numbers, waits while you type them, and prints their sum. Press Run and the
console stops at the first prompt: type a number into the box under it, press Enter, and the run
carries on inside that one `trap #15`.

Print a string only talked. This one listens, which means the program stops in the middle of an
instruction until somebody answers it, and what comes back is a number in a register rather than
text you have to make sense of.

**You need to know:** the "Print a string" Example and the "trap #15 and its tasks" lecture. What is
new here is a task that answers, task 18 leaves the number that was typed in `d1.l`, so the register
the program reads next is the one the environment wrote.

```m68k|playground|console|no-flags
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

Type 17 and 25 and the console reads `The sum is 42`. Task 4 reads a **decimal** number and nothing
else, and a line that is not one ends the run with `Expected a number, got "NaN"` under the editor.
A program that wants to survive what people type reads the line with task 2 and looks at it itself.

Try changing `add.l d1, d2` to `sub.l d1, d2`. With 17 and 25 the console reads `The sum is -8`,
because task 17 prints `d1` as a **signed** long: the bits `FFFFFFF8` are -8 to it and 4294967288 to
task 15.
