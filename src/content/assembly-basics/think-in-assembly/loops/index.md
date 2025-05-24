Now that we saw how to implement `if` statements using `goto`, and then converting it to assembly, let's now see how to implement loops.

When we think of loops we imagine `while`, `do while` and `for` statements. Assembly does not have any of those, we need to manage the logic ourselves by using branching and control flow.

Like we saw before, we test for a condition to decide if we want to jump to a specific point in code. The cool thing is that 
we can't only go _forward_ in code, we can also jump _backwards_ in code, as in, jump to an instruction that is before the current instruction.

Imagine what loops do, specifically let's think of `while` loops.

A while loop tests a condition, if it's true, then it executes the code inside of the loop. Once the code inside the loop is executed,
it goes back to testing the condition, if it's still true, it executes again the code inside the loop, and so on, until the condition is false.

Once the condition is false, the program skips the code inside the loop, and executes the code after the loop.

What we'd like to do is to run this code:
```c 
while(condition) {
    /* doSomething */
}
/* restOfCode */
```
As we saw in the previous lecture, we can only execute "flat" code, so let's first try to flatten it out using `goto` and labels.

We can see the while loop as a "continue executing the code inside the loop as long as the condition is true", or also as 
"if the condition is not true, then skip the code inside the loop". Let's write it like the second one, it will be easier to understand.
```c
while_start:
    if(!condition) goto while_end;
    /* doSomething */
    goto while_start;
while_end:
    /* restOfCode */
```

Let's now try a more concrete example, and also convert it to assembly.
For loops can be converted to while loops, so let's take a simple for loop:
```c
for(int i = 0; i < 10; i++) {
    /* doSomething */
}
```
We can convert it to a while loop like this:
```c 
int i = 0;
while(i < 10) {
    i++;
}
i = i + 20;
```

We then flatten it out:
```c
int i = 0;
while_start:
    if(f >= 10) goto while_end;
    i++;
    goto while_start;
while_end:
    i = i + 20;
```

Now let's convert it to M68K assembly:
```m68k|playground
    move.l #0, d0   ; i = 0
while_start:
    cmp.l #10, d0   ; compare i with 10
    bge while_end   ; if i >= 10, jump to while_end
    addq.l #1, d0   ; i++
    bra while_start ; jump back to while_start
while_end:
    add.l #20, d0   ; i = i + 20
```
And let's also try to convert it to RISC-V assembly:
```riscv|playground
    li t0, 0         # i = 0
    li t6, 10        # t6 = 10
while_start:
    bge t0, t6, while_end # if i >= 10, jump to while_end
    addi t0, t0, 1   # i++
    j while_start    # jump back to while_start
while_end:
    addi t0, t0, 20  # i = i + 20
```


