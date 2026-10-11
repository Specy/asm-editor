So far, you have read a program's result from a register or memory panel. This program puts its
result in the console: a greeting on one line and a number on the next. The editor's M68K simulator
provides printing through `trap #15`. Before each `trap #15`, the program puts a task number in the
low byte of `d0` and any text or number that task needs in other registers.

```m68k|playground|console|no-flags|allow-open
    lea greeting, a1    ; a1 gets the address of the first character
    move.b #13, d0      ; task 13: print the string and start a new line
    trap #15

    lea question, a1    ; address of the second string
    move.l #42, d1      ; the number to print after it
    move.b #17, d0      ; task 17: print the string, then the number
    trap #15

    move.b #9, d0       ; task 9: end the program
    trap #15

    org $2000
greeting: dc.b 'Hello, world!', 0
question: dc.b 'The answer is ', 0
```

Select **Build**, then **Run**. The console shows:

```text
Hello, world!
The answer is 42
```

The labels `greeting` and `question` name the first byte of each string in memory. `lea greeting,
a1` puts the **address** of `greeting` in `a1`, so task 13 knows where to start reading. Each `dc.b`
line stores the characters followed by a zero byte. The zero marks the end of that string; it is
not printed. Keep it when you change the text.

Task 13 prints from the address in `a1` through the character before the zero, then starts a new
line. The second call uses task 17: it prints the string at `a1`, followed immediately by the
signed decimal value in `d1.l`. The space after `is` is part of the string, which is why the output
reads `is 42`. Task 17 adds no newline. Task 9 then ends the program before the simulator tries to
run the string bytes as instructions.

`move.b #13, d0` writes only `d0`'s low byte, called `d0.b`; the upper bytes of `d0` stay as they
were. This simulator reads that low byte to choose the task. A different task can use the same
`trap #15` instruction because its task number changes.

Select **Build** again to reset, then use **Step**. At the first `trap #15`, check that `a1` points
to `$2000` and `d0.b` is `13` (hexadecimal `0D`); after the step, the greeting appears. The next
`trap #15` adds the second line. The last one ends the run.

## Try a different number

Change `#42` to `#-7` in the `move.l` instruction. Predict the second line, then select **Build**
and **Run** to check it.

<details>
<summary>Show answer</summary>

The second line becomes `The answer is -7`. Task 17 prints the value in `d1.l` as a signed decimal
number. The string and its zero byte are unchanged.

</details>
