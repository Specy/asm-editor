---
status: accepted
date: 2026-10-23
---

# Undo takes back the sounds an instruction made

Instruction Undo takes back what an instruction did to the **Audio** Peripheral, as it does for the **Screen** ([ADR 0005](./0005-restore-screen-state-on-undo.md)), the **FileSystem** ([ADR 0015](./0015-restore-file-operations-on-undo.md)) and the **Terminal** ([ADR 0057](./0057-restore-the-terminal-on-undo.md)), and nothing more. Undoing an instruction stops the **Notes** and **Sounds** that instruction started, if they are still playing, and puts EASy68K's slots back as the instruction found it: an undone load empties its slot again or brings back the Sound it replaced. Sounds an earlier instruction started play on, a background loop included, so stepping back through a melody cuts the note just taken back and stepping forward plays it again.

Undo never starts a sound. Undoing a stop, EASy68K's control 2 or 3, does not restart what it stopped: a Sound cannot be resumed convincingly halfway, and a loop restarted from its beginning would be a sound the program never made.

Audio keeps its own journal, keyed by the instruction identity each adapter already hands the Terminal's journal: M68K's step id, the Z80's t-state count, the instruction serial of MARS and RARS. The first time an instruction plays, loads or stops something, the journal records the sounds it started and the previous contents of any slot it changed; a slot record holds a reference to the decoded Sound, never a copy. An instruction that leaves Audio alone costs nothing.

## Considered options

- **Silence everything on any Undo:** no journal at all, but taking back an unrelated `add` would kill the background music.
- **Leave Audio out of Undo:** the slots would disagree with the program after an Undo and a **Poke** that changes the path it takes, and Audio would be the only Peripheral that does not rewind.
- **Make a sound service an Undo barrier**, as x86 does for standard input: it blocks stepping back through any program that beeps.

## Consequences

- Whether EASy68K's standard player is busy can answer differently when an instruction runs again after an Undo, since it depends on how long ago a Sound started; stepping again is a new moment, as a Terminal read that asks again is.
- The journal holds one record per instruction that touched Audio, for as many instructions as the Core's history keeps. A slot overwritten within that history keeps its old decoded Sound alive until the record leaves the history.
- A **Testcase** keeps no history, so Audio journals nothing while one runs.
- A Poke changes nothing in Audio and is undone by the Core alone ([ADR 0022](./0022-core-native-poke-records.md)).

## Update 2026-10-23: chips follow their registers

"Undo never starts a sound" covers **Notes** and **Sounds**, recordings that cannot be resumed halfway. The **Synth** and the **Sound chip** of [ADR 0060](./0060-the-z80-gets-a-real-sound-chip-the-others-a-synth.md) are different: a chip channel's sound is the state of its registers, so after an Undo the chips play whatever their restored registers say, and a gate the Undo turns back on attacks again, as it would on hardware. Uploads into **Sample memory** are journaled like slots. See [waveform-sound.md](../design/waveform-sound.md#undo-pause-the-end-of-a-program-stop-and-testcases).
