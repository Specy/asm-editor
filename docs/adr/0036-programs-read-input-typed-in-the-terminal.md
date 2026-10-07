---
status: accepted
date: 2026-10-05
---

# Programs read input typed in the Terminal

A running program's interactive input is typed in the **Terminal** itself, at a caret after its output, in the Workbench and in the Interactive editor alike, instead of in the app-wide modal prompt. The Terminal's **Line discipline** turns keys into what each read receives: a line read edits a line until Enter, a character read returns on one keystroke with Enter giving the Reference environment's code (10 for MARS and RARS, `$0D` for EASy68K), and Ctrl+D or the End of input button gives End of input to standard input. Echo and the typed line appear in the transcript where they happen. This is what [ADR 0035](./0035-environments-match-their-reference.md) requires of MARS's Run I/O pane, EASy68K's window and a Linux tty, all of which take input in the console. The modal remains only for services that are dialogs in their reference (MARS and RARS 50 to 59). The Screen Keyboard ([ADR 0009](./0009-share-screen-keyboard-input-with-terminal.md)) and a Testcase's scripted input are unchanged. A read in a host whose console is hidden reveals it: the Interactive editor opens its console, the Workbench selects and unfolds the Terminal, and the caret takes focus (decided while planning, 2026-10-05).

The Terminal is our own component, built from today's DOM transcript, not xterm.js. xterm.js has no line discipline, so it would only have replaced the renderer; MARS, RARS and EASy68K are not VT terminals; and the Interactive editor puts many consoles on pages that must work with phone keyboards, xterm.js's weak spot. x86 gets a small escape-sequence parser (SGR colours and clear screen), with cursor addressing a documented deviation. The unused `useXterm` path of `Console.svelte` and the `@battlefieldduck/xterm-svelte` dependency are removed.

## Considered options

- Keeping the modal prompt and approximating: a character read takes a line's first character and an empty line counts as Enter. Every character read would still need Enter, a permanent deviation from every reference.
- xterm.js, already a dependency: full VT100 fidelity for Linux Targets, at about 300 KB, a fixed-grid renderer per console and weak touch input. It stays the candidate renderer for a future Target that runs full-screen terminal programs (cursor addressing), used for those Targets only.
