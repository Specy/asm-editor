## Calling trap #15

The 68000 instruction set includes `trap #n`, which transfers control to an exception handler. This editor uses `trap #15` for the tasks on this page: put the task number in `D0.B`, put its arguments in the listed input registers, then read any answer from the output registers. Other trap numbers are not implemented here.

The simulator supplies these tasks for the console, screen, keyboard, mouse, clock, and project files. Undo reverses a task's changes along with the instruction's register and memory changes, the text it printed included; a read that is undone asks for its input again when you step it. Testcases use scripted input and their own copy of the project's files.

## Input routing {#differences}

Interactive reads (tasks 2, 4, 5, and 18) start in the console. Any of these operations switches them to the focused screen panel for the rest of the run:

- Setting or reading the text cursor, or clearing the screen (task 11).
- Resizing or querying the screen (task 33).
- Drawing, configuring, or querying graphics (tasks 80–96).
- Polling the keyboard or reading key or mouse state (tasks 7, 19, and 61).

There is no task to switch back. Click the screen panel before typing. Its focus ring indicates that editor keyboard shortcuts are paused while the program receives keys. Printing text alone leaves input in the console. Testcases continue to read scripted input.

## Colors

A color is a long written `$00BBGGRR`: blue in bits 23-16, green in bits 15-8 and red in bits 7-0. The color names shown here are also available as equates to use in assembly programs.

## Key codes

{keyCodeRules}

{keyCodes}

## Unsupported tasks {#unsupported}

Each task listed here stops the program with an error naming the task and the unsupported operation. Supported task entries identify any invalid arguments that stop execution; recoverable errors are reported through their output registers.

{unsupportedTasks}
