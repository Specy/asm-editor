This program asks for two numbers and prints their sum. Each prompt uses task 18 of `trap #15`:
the task prints the zero-terminated string at `a1`, waits for you to enter a number, and returns that
number in `d1.l`.

```m68k|playground|console|no-flags|allow-open
    lea first, a1
    move.b #18, d0      ; print the first prompt and read a number
    trap #15
    move.l d1, d2       ; save the first number in d2

    lea second, a1
    move.b #18, d0      ; print the second prompt and read a number
    trap #15
    add.l d1, d2        ; add the second number to the saved first number

    lea answer, a1
    move.l d2, d1       ; task 17 prints the number in d1
    move.b #17, d0      ; print the answer string and the sum
    trap #15

    move.b #9, d0       ; end the program
    trap #15

    org $2000
first:  dc.b 'First number: ', 0
second: dc.b 10, 'Second number: ', 0
answer: dc.b 10, 'The sum is ', 0
```

```testcase
{ "input": ["17", "25"] }
```

Select **Build**, then **Run**. At `First number: `, type `17` in the console, where the caret
waits, and press Enter. The program continues to `Second number: ` and waits again. Type `25` and
press Enter; it prints `The sum is 42`.

The first task 18 returns `17` in `d1.l`. `move.l d1, d2` keeps a copy because the next task 18
puts its answer, `25`, in `d1.l`. Then `add.l d1, d2` adds that second answer directly to the
saved first number: `d2.l` becomes `42`. Task 17 needs its number in `d1.l`, so `move.l d2, d1`
puts the sum there for printing.

The `10` before `Second number: ` and `The sum is ` is the ASCII code for a newline. Each string
starts on a new line when its task prints it. The final `0` marks the end of each string.

Use small whole numbers for this example. The arithmetic uses 32-bit registers, so a sum that
does not fit in 32 bits will wrap around instead of showing the mathematical result.

## Predict the result

Build and run again with `8` as the first input and `-3` as the second. What will `d2.l` hold
after `add.l`, and what will the program print?

<details>
<summary>Show answer</summary>

`d2.l` holds `5`, and the program prints `The sum is 5`. The first input is saved in `d2.l`;
adding the second input from `d1.l` gives `8 + (-3) = 5`.

</details>
