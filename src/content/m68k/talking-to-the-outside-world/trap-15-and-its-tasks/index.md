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

Task 3 prints the **signed decimal** number in `d1.l`. Task 4 waits for a line of input, reads it
as a decimal number, and leaves the result in `d1.l`. The task number in `d0.b` changes between
requests; the value in `d1` is the input or answer for the selected task.

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

In an interactive run, task 4 waits for you to type a number in the input box under the console
and press Enter. In this example, the supplied input line is `21`, so the program receives it
without waiting for typing and prints `42`.

Task 17 is a handy combination: it prints a zero-terminated string from `a1`, then prints the
signed decimal number in `d1.l`, with no newline added. It performs the same output as task 14
followed by task 3.

| task | action | argument or answer |
| ---: | ------ | ------------------ |
| 3 | print a signed decimal number | reads `d1.l` |
| 4 | read a decimal number | answers in `d1.l` |
| 9 | end the program | none |
| 13 | print a zero-terminated string and a newline | reads address in `a1` |
| 14 | print a zero-terminated string | reads address in `a1` |
| 17 | print a string, then a signed decimal number | reads address in `a1` and number in `d1.l` |

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
