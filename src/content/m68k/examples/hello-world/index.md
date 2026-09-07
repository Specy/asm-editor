The first program of the ladder that anybody outside the editor could see the result of. It prints a
line, then prints a second line with a number at the end of it, and ends itself. The answer is in the
console panel under the program instead of in a register.

Everything up to here left its result in the registers or in memory, because printing is a request to
the environment and the M68K has one instruction for making requests. This is that instruction.

**You need to know:** the "trap #15 and its tasks" lecture. What is new here is the whole shape of a
request, the task number in `d0.b` says what you want, the other registers carry the arguments, and
`trap #15` hands it over.

```m68k|playground|console|no-registers|no-flags|allow-open
    lea greeting, a1    ; the address of the string
    move.b #13, d0      ; task 13: print it and go to a new line
    trap #15

    lea question, a1
    move.l #42, d1      ; the number
    move.b #17, d0      ; task 17: print the string, then the number
    trap #15

    move.b #9, d0       ; task 9: end the program
    trap #15

    org $2000
greeting: dc.b 'Hello, world!', 0
question: dc.b 'The answer is ', 0
```

`dc.b 'Hello, world!', 0` writes fourteen bytes: thirteen character codes and the zero you wrote
yourself. Task 13 and task 14 both find the end of a string by looking for that zero, and both stop
with an error after 16 kilobytes, so a string you forgot to terminate ends the run instead of
printing forever.

The task number goes in `d0.b` and not `d0.l`, which is why `move.b` is what every one of these
lines uses: the task is a byte and the rest of `d0` is left alone. Some tasks answer in `d0`, so it
is not a register you can leave a task number sitting in and expect to find it later.

Task 17 is task 14 and then task 3 in one request: it prints the string at `a1` and then the signed
number in `d1`, which is how a line with a value in it is written without printing the two halves
separately. `move.b #9, d0` and `trap #15` is task 9, terminate, and it is how you stop before your
data rather than falling off the end of the program.

Try changing the first `move.b #13, d0` to `move.b #14, d0`. Task 14 prints without the new line, so
the console reads `Hello, world!The answer is 42` all on one line.
