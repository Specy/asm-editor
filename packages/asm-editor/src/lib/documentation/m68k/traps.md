## Calling trap #15

The 68000 instruction set includes `trap #n`, which transfers control to an exception handler. This editor uses `trap #15` for the tasks on this page: put the task number in `D0.B`, put its arguments in the listed input registers, then read any answer from the output registers. Other trap numbers are not implemented here.

The simulator supplies these tasks for the console, screen, keyboard, mouse, clock, project files, and sound. Undo reverses a task's changes along with the instruction's register and memory changes, the text it printed included; a read that is undone asks for its input again when you step it. Testcases use scripted input and their own copy of the project's files.

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

## Sound in this editor {#sound-differences}

After a program requests sound, the **Sound** button appears in the execution dock as a mute/unmute control. It sets **Play sound** in **Preferences**, where **Sound volume** is also available. Both settings apply across projects. Muting leaves program-visible timing and results unchanged.

The DirectX player is the name of an EASy68K-compatible interface in this editor; it does not require Windows or a DirectX installation. It mixes WAV audio files and MIDI files, which describe notes and instruments to play.

For programmable waveforms and sample playback, this editor adds the [Synth](/documentation/m68k/synth), a sound chip whose registers are memory at `$E00100`. EASy68K does not have it.

Sound differs from EASy68K in these ways:

- At most 64 sounds play at once, including at most 4 MIDI files. Starting another stops the oldest sound that is not looping, or the oldest loop if every sound loops. A fifth MIDI file stops the oldest MIDI file using the same rule. These limits do not change the task results.
- MIDI files use the editor's General MIDI sound bank, its collection of instrument sounds. They can sound different from EASy68K, which uses the Windows synthesizer. The browser loads the bank automatically on the first note or MIDI-file request after opening or reloading the editor page; that request waits for loading. Later runs and projects share the loaded bank.
- Loops stop when the program ends; EASy68K keeps them playing until another program is loaded. Sounds played once finish even after the program ends.
- Task 77 with control 3 stops every DirectX sound even if its supplied slot is empty. EASy68K stops nothing in that case. Both return 0 in D0.W for the empty slot.
- DirectMusic segment files are unsupported: tasks 73 and 74 return 0, and the **Log** explains why.

## Unsupported tasks {#unsupported}

Each task listed here stops the program with an error naming the task and the unsupported operation. Supported task entries identify any invalid arguments that stop execution; recoverable errors are reported through their output registers.

{unsupportedTasks}
