# Share Screen keyboard input with Terminal reads

Graphical programs will satisfy ordinary character, string and numeric input requests from the **Keyboard**'s pending typed-input buffer, shared with keyboard availability polls, while the **Terminal** remains the abstraction serving those reads. This preserves the relationship between EASy68K's task 7 availability check and task 5 or 2 reads described in its [input documentation](https://acorn.huininga.nl/pub/projects/CiscOS/_emulators/EASy68Ksource/EASy68K_Help/textio.htm), so a successful poll and the subsequent read refer to the same pending input. Programs without graphical input can retain the existing Terminal prompts.

## Input-source lifetime

The input source is selected through the injected peripheral configuration and remains fixed for the run. Screen focus determines where new keystrokes go; losing focus does not switch a pending or subsequent read to a Terminal prompt. For example, a program waiting for Screen keyboard input continues waiting while the user edits code and can receive the answer after the Screen is focused again.

## Input completion

With the Screen keyboard selected, a character read consumes one typed character as soon as it is available, while string and numeric reads wait for Enter. Reads without enough input suspend program execution without blocking the GUI, and Stop remains available. Availability polls return immediately. In environments with a single output window ([ADR 0003](./0003-preserve-simulator-graphics-conventions.md)), the echo of typed input also appears on the Screen.

## Scripted Testcases

User-authored Testcases retain their existing format and behavior: scripted text input and the existing output, register and memory checks. Automated runs do not consume live Screen input; drawing operations can execute, but scripted keyboard/mouse events and graphical assertions are deferred. This does not exclude implementation tests for the new peripherals.
