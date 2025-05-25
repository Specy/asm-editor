We saw in previous lectures that instructions are executed sequentially, one after the other. 
As a reminder, to determine which instruction to execute next, the CPU looks at the instruction in memory which that is located at the address written in the **Program couter** (PC).
Once an instruction is executed, the PC is incremented to point to the next instruction in memory.

However, as you might imagine, this does not allow you to implement "conditional" logic, as in, since programs
execute always from top to bottom, you cannot build a program that decides what to execute based on some condition.
This is where **branching** and **control flow** come into play.

## Branching and Control Flow

Branching is the ability of a program to change (or branch) to a different part of code, based on some condition.
Think of branching like an "if" statement. If the condition is true, go somewhere, if it is false, go somewhere else (or continue executing the next instruction).

The terminology we usually use in branching and control flo is that if a condition is true, then we "jump to" a specific point in code (the branch).

If you have experience in C or similar low level languages, this might look like a `goto` statement.
Let's first try to understand the logic behind the structure of how an `if` statement is converted to branching with a `goto` statement.

Let's say we can allow an if statement to only decide if doing a `goto` or not, without any logic inside.

Let's also remember what labels are. Labels allow you to mark a specific point in code (as we know code is in memory so the label is just the address in memory where the label is located),
and when you use a `goto` statement, you need to specify the label you want to jump to, which will change the flow of the program to that specific point in code.

An `if` statement that has logic inside might look like this:
```c
if(condition){
    /* doSomethingIfTrue */
} else {
    /* doSomethingIfFalse */
}
/* restOfCode */
```
Let's now flatten it out using goto statements:
```c
    if(condition) goto true_branch;
    /* doSomethingIfFalse */
    goto end;
true_branch:
    /* doSomethingIfTrue */   
end:
    /* restOfCode */
```
Notice how we had to flip the order of the two branches (first the false branch and then the true branch).

If the condition is true, then the goto statement will cause the program to jump to the `true_branch` label.

If the condition is false, then the program will continue executing the next instruction, which is the `doSomethingIfFalse`,
and to prevent the program from executing also the `doSomethingIfTrue` we added a `goto end;` statement to skip the true branch.
Finally, we have the `end:` label which is where the program will continue executing after either branch.

To make it easier we can flip the condition, this is easier to understand, we can think of it like "if the condition is not true, then go to the false branch, else just execute the true branch".

We can rewrite the code like this:
```c
    if(!condition) goto false_branch;
    /* doSomethingIfTrue */
    goto end;
false_branch:
    /* doSomethingIfFalse */
end:
    /* restOfCode */
```

## Branching in Assembly

Usually assembly languages use two different methods to implement branching, depending on the architecture and the instruction set:
- **Compare then Jump**: In this method there is first an instruction that compares two values, and saves the result of the test internally in the CPU (usually in a flag register).
Afterwards there is a conditional jump instruction, that checks the flags and decides whether to jump to an address or not. 
- **Test and Jump**: This method uses a single instruction that tests a value and jumps to an address in the same instruction.

Let's now explore those two methods by translating this C code into assembly:

```c
int x = 50;
if(x > 10){
    x = 100;
} else {
    x = 200;
}
```

Let's first convert it to the flat `goto` version:
```c
    int x = 50;
    if(x <= 10) goto false_branch;
    x = 100;
    goto end;
false_branch:
    x = 200;
end:
```

## Compare then Jump
Let's try to use M68K assembly to implement the above code using the `compare then jump` method.
```m68k|playground
    move #50, d0    ;x = 50
    cmpi #10, d0     ; compare x with 0
    ble false_branch ; if x <= 0, jump to false_branch
    ; here is where the true branch starts
    move #100, d0   ; x = 100
    bra end          ; jump to end
false_branch:
    move #200, d0   ; x = 200
end:
```

Try to change the `move #50, d0` to `move #0, d0` and see how the code is executed differently.

## Test and Jump
Let's now try to implement the same code using the `test and jump` method, using the RISC-V assembly language:

```riscv|playground
    li t0, 50        # x = 50
    li t4, 10        # t4 = 10 
    ble t0, t4, false_branch # if x <= 10, jump to false_branch
    # here is where the false branch starts
    li t0, 100       # x = 100
    j end            # jump to end
false_branch:
    li t0, 200       # x = 200
end:
```
Try to change the `li t0, 50` to `li t0, 0` and see how the code is executed differently.