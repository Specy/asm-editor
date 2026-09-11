# Asm editor

A webapp to write, run and learn M68K, MIPS, RISC-V, X86 and Z80 assembly code with a focus on teaching and learning assembly.

It includes many debugging and inspection tools aimed to help you understand assembly more easily.

> **Published research** ASM Editor is described in [_ASM Editor: Understanding Language Abstractions Through Assembly Programming_](https://doi.org/10.1109/EDUCON67543.2026.11574463), presented at the 2026 IEEE Global Engineering Education Conference (EDUCON), Cairo.
> If you use it in teaching or research, please [cite the paper](#citing-asm-editor).

[![localImage](https://asm-editor.specy.app/images/ASM-editor.webp)](https://asm-editor.specy.app/)

## App features

- Code completion and syntax highlighting
- Run the program or step through it
- Undo execution and breakpoints
- Built in devices like terminal with input/output interrupts, screen, keyboard and mouse
- Inspect the value of each register and memory address to see which was changed with each instruction
- Create new projects and manage them all in the webapp then share it with others through links or project files
- IDE with useful errors and warnings to help you learn better
- Built-in documentation and intellisense with addressing modes, descriptions and examples
- Customisable settings and shortcuts, including theme customization

## Editor Tools

Once running the program there are many tools to help you understand what instructions did and debug the code.

- Values which changed between each instructions are highlighted and the old value is also visible. registers and memory have tooltips to show the decimal/hexadecimal value.
- Follow the stack pointer with the dedicated tab, it's split in rows of 4 bytes to make it easier to see the changes
- Whenever a jump with link instruction is executed, the callstack is saved so that it can be seen
- A view of the changes to the state of the interpreter is visible to see what each instruction did, like register / memory writes and changes to the ccr, it is also possible to jump back to a previous state
- step/undo the code, add breakpoints, and jump to a specific execution step
- Testcase runner, with IO and initial memory/register setup to create "exercises" and test your code
- Full memory viewer to inspect a memory region, string conversion, hex/dec conversion, signed/unsigned conversion, and more
- The editor suggests you with the available instructions and the valid addressing modes for each operand, while also giving a simple description and example.

## Documentation

The webapp comes with a [built-in documentation](https://asm-editor.specy.app/documentation), both available inside the editor and as a separate page. It explains brefly how each instruction works and the addressing modes, together with interactive examples.

## Projects

Projects are stored locally on your browser, and with the app also working offline, you can create and manage them all in the webapp.

## Embed the editor

You can embed the editor in your website [here](https://asm-editor.specy.app/embed), you can set the initial code and additional settings.

# Tech stack

The webapp is made with [sveltekit](https://kit.svelte.dev/), [rust](https://www.rust-lang.org/it) webassembly and [java TEAVM](https://teavm.org/).

Uses the same editor as vs-code, and the emulators:

- [WASM M68K interpreter](https://github.com/Specy/s68k) to run the code
- [MIPS Simulator (mars)](https://github.com/Specy/mars) compiled from java to javascript
- [RISC-V Simulator (rars)](https://github.com/Specy/rars) compiled from java to javascript
- [Z80 assembler and machine](https://github.com/Specy/trs80)
- [X86 assembler and machine](https://github.com/Specy/x86-js) compiled from C to javascript

# Citing ASM Editor

If ASM Editor supports your course or your research, please cite the paper:

> E. Menichelli and L. Forlizzi, "ASM Editor: Understanding Language Abstractions Through
> Assembly Programming," _2026 IEEE Global Engineering Education Conference (EDUCON)_,
> Cairo, Egypt, 2026. doi: [10.1109/EDUCON67543.2026.11574463](https://doi.org/10.1109/EDUCON67543.2026.11574463)

```bibtex
@inproceedings{menichelli2026asmeditor,
    author    = {Menichelli, Enrico and Forlizzi, Luca},
    title     = {{ASM} {Editor}: {Understanding} {Language} {Abstractions} {Through} {Assembly} {Programming}},
    booktitle = {2026 IEEE Global Engineering Education Conference (EDUCON)},
    address   = {Cairo, Egypt},
    publisher = {IEEE},
    year      = {2026},
    month     = apr,
    doi       = {10.1109/EDUCON67543.2026.11574463}
}
```

# Local setup

You must have node.js 24+ installed, then you can clone the repository and run:

```bash
npm install
npm run dev # to run the dev server
# npm run build # to build the app
```

The emulator sources are available as Git submodules for local development. Normal installs and
deployments continue to use the npm packages. See [Working on the emulators](docs/local-emulators.md)
to opt into local builds.

# Contributing

If you wish to contribute, make a new issue to discuss the changes you want to make (or comment on an existing one).

We are looking for people to help with documentation and courses, you can look at more info [here](https://github.com/Specy/asm-editor/issues/27)
