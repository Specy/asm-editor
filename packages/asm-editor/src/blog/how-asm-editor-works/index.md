ASM Editor assembles and executes programs in the browser, then displays their simulated registers and memory. This article explains the editor, engines, execution scheduling, and network requests using one MIPS instruction.

## Source text and machine state

To follow the example, [create a project](/projects/create), choose MIPS, and replace its assembly text with:

```mips
.text
main:
    li $t0, 42
```

The instruction places 42 in `$t0`, a **register**: a small, named storage location in the processor. **Memory** is a larger collection of bytes accessed by numbered addresses. Typing changes neither yet. Monaco manages the text and editor interactions; Svelte displays the project files and execution panels.

The **emulator**, software implementing another machine's behavior, holds **machine state**: registers, memory, and the program counter identifying the next instruction.

An **engine** implements the processor and program loading, including assembly. An **adapter** connects it to the Workbench: it turns Build and Step into engine calls and returns state in the interface's expected form. The selected architecture determines which modules load.

## Build and Step

**Build** passes the files and entry file to the engine. Its assembler translates instructions and directives into an executable representation. Diagnostics connect errors to source locations in the editor and Problems panel.

The engine initializes machine state, and the Workbench retains the source snapshot for that build. Execution locations refer to that snapshot. Saved source describes the program; registers and memory describe its current execution.

Choose **Build** beneath the code. `$t0` has not received 42 yet. Find it in **Registers**, to the right on a wide screen or below Terminal on a narrow screen. **Step** asks the engine to execute the instruction. The adapter reads its state, and the interface shows 42 in `$t0`, or hexadecimal `2A`. In an active program with more instructions, the highlight moves to the next one. The [first tour](/blog/posts/getting-started) shows the controls with a larger example.

For an [imported x86 executable](/blog/posts/first-x86-reverse-engineering), Build loads the existing instruction bytes directly. A decoded Listing displays them as assembly.

## Execution scheduling

Execution runs on the browser's **main thread**, which also handles the interface. The Workbench calls the emulator. Its execution layer asks the adapter to run an instruction batch through the engine, then yields so the browser can render and handle input.

The scheduler adjusts batch size using observed speed and stops or waits for a breakpoint, exit, input request, or pause. Returning between batches lets the interface respond during a long loop; one uninterrupted call would block it until execution returned.

Editing analysis uses **Web Workers**, separate browser contexts exchanging project changes and results through messages. Run executes on the main thread, separately from those analysis workers.

## Input, output, and Undo

To print `$t0`'s 42, a MIPS program selects service 1 in `$v0`, copies the value to `$a0`, and executes `syscall`. The engine calls the output handler, which writes `42` to Terminal.

An input request can suspend execution until Terminal supplies an answer. Supported screen and input devices similarly connect engine requests and state to browser components.

File operations use project files, not arbitrary host-computer paths. Each adapter handles its architecture's service conventions.

**Undo** restores recorded execution state, separately from text Undo. History depth and reversible operations depend on the engine and configured limits; not every external effect can be reversed.

## C/C++ compilation and engine builds

Building emulator software during app development produces the engines downloaded by browsers. The app's Build action uses an existing engine to prepare the user's assembly program.

For C/C++, **Compile** sends the selected source and local headers to Compiler Explorer. It receives assembly and source locations, saves the assembly as a project file, and maps source lines to assembly blocks. x86 compiler output is translated to the NASM syntax used by Build.

The program uses the supplied runtime for functions such as `printf`. Compilation returns assembly; it does not execute the program remotely. Build and execution happen afterward in the browser. See [the C/C++ guide](/blog/posts/c-cpp-to-assembly) for the workflow.

## Network requests

Opening the app downloads the interface and required engines. C/C++ Compile contacts the compiler service. Imported executables can download supported bundled libraries they need. With those assets present, instruction execution and state inspection happen in the browser.
