Create a MIPS project, run an addition program, inspect its registers, and use Step, Undo, and a breakpoint. You need a browser; no previous MIPS knowledge is required.

## Create your first project

Open [Create new project](/projects/create). Give the project a name such as `My first calculation`, choose **MIPS** under **Language**, then choose **Create**. The project opens in the editor, also called the Workbench.

Replace the assembly file's starting text with the program below. Alternatively, try the embedded example and choose **Open in editor** to open it as a project. Use the full editor for the remaining steps.

```mips|playground|console|allow-open
.text
.globl main
main:
    li $t0, 17
    li $t1, 25
    add $t2, $t0, $t1

    li $v0, 1
    move $a0, $t2
    syscall

    li $v0, 11
    li $a0, '\n'
    syscall

    li $v0, 10
    syscall
```

`li`, `add`, `move`, and `syscall` are instructions. `.text` and `.globl main` tell the assembler how to organize the program; `main:` names its starting location. Step does not execute those setup lines.

The first two `li` instructions put 17 in `$t0` and 25 in `$t1`. `add` puts their sum in `$t2`. A **register** is a small storage location in the simulated processor.

Each `syscall` requests the service selected in `$v0`, with an input in `$a0` when needed. Service 1 prints the sum, service 11 prints the newline, and service 10 ends the program. Keep this section unchanged during the tour.

![The MIPS project open in the Workbench, with its assembly file and Build control visible.](/images/blog/getting-started/workbench.webp)

## Build, then run

Choose **Build** beneath the code. It translates the assembly into executable instructions and prepares the simulator; the calculation has not run yet.

Choose **Run**, then open **Terminal** below the code if needed. The output is:

```text
42
```

Find `$t2` in **Registers**. It holds 42, which may appear as hexadecimal `0000002A`. Hover over the value to inspect its numeric representations.

If Build fails, open **Problems** and select a message to reach its source line. Check the language and copied program, including the `$` characters. Choose **Stop** to return to editing, then Build after any change.

## Step through the calculation

Choose **Stop**, then **Build** to reset execution. Choose **Step** three times:

1. `$t0` receives 17.
2. `$t1` receives 25.
3. `$t2` receives their sum, 42.

While the program is paused with instructions left, the highlight marks the **next** instruction. Registers show the result of the previous step. Step executes one machine instruction; an assembly form that expands into several instructions can take several clicks.

After the addition, choose **Undo** beside Run and Step. It restores the state before that instruction. Step again to repeat the addition. Execution Undo uses a finite history and is separate from undoing text edits.

## Set a breakpoint

A **breakpoint** pauses Run before an instruction. Choose Stop, then click the margin to the left of this line:

```mips
    add $t2, $t0, $t1
```

When the marker appears, Build and Run. Execution pauses **before** the addition, with 17 in `$t0` and 25 in `$t1`. Step performs the addition; Run continues to the end. Click the marker to remove it.

![A breakpoint pauses the program before the addition, so the two input registers can be inspected.](/images/blog/getting-started/breakpoint.webp)

In the screenshot, hexadecimal `0011` and `0019` mean decimal 17 and 25.

For another run, choose Stop, change 25 to 8, then Build and Run. Compare `$t2` and Terminal with the sum you expect.

## Share the project

Return to [Projects](/projects), find the project, and choose **Share this project**. This copies a link to your clipboard. The link contains a snapshot of the project; create a new link to share later changes.

The [MIPS course](/learn/courses/mips) covers the language. The [MIPS browser guide](/blog/posts/mips-mars-browser) adds keyboard input and a breakpoint after reading it.
