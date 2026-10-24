# Audio

Decision record for the **Audio** Peripheral that [ADR 0035](../adr/0035-environments-match-their-reference.md) promised: sound for the services each **Reference environment** offers. Settled one question at a time in a grill session on 2026-10-23, with [ADR 0058](../adr/0058-notes-play-on-the-bank-mars-plays-on-jdk-21.md) for the synthesizer and its bank, [ADR 0059](../adr/0059-undo-takes-back-the-sounds-an-instruction-made.md) for Undo and an update to [ADR 0011](../adr/0011-z80-peripherals-through-the-port-map.md) for the Z80 ports. Nothing is implemented yet.

## Scope

Decided on 2026-10-23.

| Target       | Covered                                                                                                                                                                                                            | Not covered                                                                                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MIPS, RISC-V | MARS's and RARS's MIDI services 31 (play and return) and 33 (play and wait), with their ranges and defaults; `<sim.h>` gains their functions through the Environment library's one-function-per-service rule       | —                                                                                                                                                                                                                                                      |
| M68K         | EASy68K's trap #15 tasks 70 to 77, both the standard player (70 to 72, 76) and the DirectX player (73 to 75, 77), on WAV Files; the DirectX tasks also take MIDI Files, which EASy68K's DirectMusic loader accepts | DirectMusic segment files (`.sgt`): a proprietary Windows format no browser can play, rejected with a stated reason                                                                                                                                    |
| Z80          | An audio group in the **Port map** that plays the same kind of note MARS does                                                                                                                                      | Sound Files, because the Port map has no file ports; the TRS-80's cassette-port and Orchestra-card sound, whose pitch comes from cycle-timed loops and so needs the clock pacing [ADR 0010](../adr/0010-program-time-without-clock-pacing.md) rejected |
| x86          | —                                                                                                                                                                                                                  | Everything, the terminal bell included: a Linux process has no audio convention to match                                                                                                                                                               |

Why: rule 4 of ADR 0035 implements every reference service that can work faithfully in a browser page, which takes in all eight EASy68K tasks and the MIDI Files their DirectX half accepts; once a synthesizer plays MARS's notes, a MIDI File costs little more. The Z80 has no Reference environment beyond the Port map, so it gets the smallest useful service, and MARS's note fits it exactly: pitch, instrument and volume are all 0 to 127, one byte each, the way the Screen ports reuse EASy68K's drawing commands.

### The Z80 audio ports start at 0x60

The group takes 0x60 to 0x6F, the block after the time ports. Checked on 2026-10-23: the editor's own map ends at 0x52, and upstream's TRS-80 machine (`Trs80.ts` in the z80 submodule) decodes only port 0x00, the Orchestra-90 at 0x75 and 0x79, the Orchestra-85 at 0xB5 and 0xB9, and 0xE0 to 0xFF, so nothing a TRS-80 program addresses answers at 0x60. The group must stay inside 0x60 to 0x6F: 0x75 and 0x79 belong to the Orchestra card, should a paced TRS-80 mode ever emulate it, and later groups of the editor's own go to 0x80 to 0xDF, free apart from 0xB5 and 0xB9. Machines that decode the whole port space, such as a ZX Spectrum's ULA or a Master System, whose sound chip answers 0x40 to 0x7F, collide with the existing groups already; [ADR 0011](../adr/0011-z80-peripherals-through-the-port-map.md) leaves such a mode to claim what it needs.

## How long a Note or Sound plays

Decided on 2026-10-23.

- **Interactively**, a **Note** or **Sound** is playing from its start until its length has passed in **Program time**: the Note's duration, the Sound's decoded length, or, for a looping Sound, until it is stopped. EASy68K's standard player is busy while one of its Sounds is playing, which is what tasks 70, 72 and 76 answer with D0.W = 0.
- **Muting never changes an answer.** Mute and volume are Preferences, which never change what a program does: a muted run gets the same D0 values, at the same moments, in silence.
- **In a Testcase, Audio plays nothing and nothing is ever playing.** The services answer as they would for a Sound that ended the moment it started, so the standard player is never busy, and a play-and-wait (MARS and RARS 33, the Z80's) waits on the Testcase's virtual clock like any other wait.

Why: the program calls these services in a Testcase too and branches on what they answer. `graphicSound.X68` loops on D0 until the player is free, and a Testcase can assert on D0 or on output that depends on it, so the services cannot be skipped, answer something arbitrary, or be rejected, which would fail every Testcase of any program that beeps. Keeping each Sound's length on the virtual clock was rejected: that clock advances only through waits, so the busy loop EASy68K's own example teaches would never see its Sound end and would run into the instruction limit, the trap [ADR 0010](../adr/0010-program-time-without-clock-pacing.md) accepted for clock polling. A play-and-wait advancing the virtual clock is not extra behaviour: it is the `sleep` path, which already runs on that clock, and it keeps 33 equal to 31 followed by a 32 of the same duration. A Testcase's Audio is the same silent output the node tests need, with every length zero.

## The synthesizer and its bank

Decided on 2026-10-23: [ADR 0058](../adr/0058-notes-play-on-the-bank-mars-plays-on-jdk-21.md). spessasynth_lib plays every Note and MIDI File on Gervill's generated Emergency GM sound set, the bank MARS and RARS play on JDK 21, shipped as a separate data file with its notice and loaded on first use. EASy68K's MIDI Files sound different from Windows' GS synthesizer, which the owner accepted.

## Loading on first use

Decided on 2026-10-23.

- The engine and the bank load when a program first plays a Note or a MIDI File, never at Build: most programs make no sound and should not pay 1.4 MB for it.
- That first service holds the program until they are ready, by the same suspension a `sleep` uses, so Stop and Pause keep working and the speaker button in the execution dock shows "Loading sounds…"; then the Note plays. (The Screen panel was named here first; amended while planning, on 2026-10-23: the button appears at that first sound anyway, a MARS Note can come from a program that never draws, and the panel can be hidden until Build.) Program time passes meanwhile as during any wait. Decoding a WAV File holds the program the same way, for milliseconds.
- If loading fails, offline on a browser that never fetched the bank for instance, the program runs on in silence and the **Log** notes that sounds could not be played because the sound bank did not load. Nothing a program observes depends on the sound being heard, so failing the run would be worse than silence.
- A Testcase never loads anything.
- The bank is imported as a content-hashed asset, which the service worker caches on its first fetch and copies forward across deploys, as it does the search model: a browser waits once, and every later session starts at once.

Rejected: dropping Notes until the bank is ready (a melody loses its first bars, more on a slower network), queueing and playing them late (the music falls out of step with the Screen, worse for a game than a single pause), preloading at every Build (a cost for every program that never plays a sound).

## Pause, Step, the end of a program, Stop and Build

Decided on 2026-10-23.

| Moment                                                                      | Audio                                                                                                                                                                  |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A **Pause**, a stop at a **Breakpoint**                                     | Nothing changes: Notes and Sounds already started play to their end, and loops keep looping                                                                            |
| Step                                                                        | The services run as in a Run: stepping over a 31 plays its Note, and stepping over a 33 or the Z80's play-and-wait takes its duration, as stepping over a `sleep` does |
| The program ends on its own: an exit, `SIMHALT`, a runtime error            | Loops stop; Notes and one-shot Sounds play out                                                                                                                         |
| Stop (Clear execution), Build, leaving the page, the start of each Testcase | Silence at once, and every slot is emptied, as EASy68K's `ResetSounds` does when a program is loaded                                                                   |

Why: **Program time** is host time since the run started and keeps running through a Pause and a Breakpoint (`ProgramClock`), and both references play on while their simulator is paused: MARS's sequencer thread and Windows' `PlaySound` run on their own. Suspending the audio instead would have made what the program observes disagree with what is heard, a Sound with 1.5 s left at a Breakpoint being over for the program after a 10 s stop and still audible after Resume, unless a second clock were invented. Mute is the way out of a loop that gets in the way while debugging.

Stopping loops when a program ends is a deviation from EASy68K, whose looping Sound plays on after the program halts until it is loaded again; here that would be a loop with no program left to stop it, which helps nobody learn anything (rule 2 of [ADR 0035](../adr/0035-environments-match-their-reference.md)). MARS's own behaviour, a last Note heard after the program has exited, is kept.

## Undo

Decided on 2026-10-23: [ADR 0059](../adr/0059-undo-takes-back-the-sounds-an-instruction-made.md). Undoing an instruction stops the Notes and Sounds it started and puts the slots back as it found them; Undo never starts a sound, so an undone stop does not restart what it stopped. A journal keyed by instruction identity, like the Terminal's.

## Autoplay, mute and volume

Decided on 2026-10-23.

- **Autoplay.** Audio's output starts, or resumes, on the click or key press that starts a Build, Run or Step, which every interactive run begins with, so the browser always allows it; Chrome allows it inside the same-origin playground frames too, the gesture being in the frame. A run that starts without one leaves the output suspended until the person's next click or key press anywhere on the page, and the program notices nothing.
- **Mute and volume are Preferences**: per person, across every Project, never a Setting. The Settings panel's Preferences section gets Sound, on or off, and a volume slider, on and at about half by default, because MARS's default volume of 100 out of 127 plays loud.
- **A speaker button in the execution dock** (`ExecutionDock`, so every surface that runs a program has it) mutes and unmutes. It appears the first time a program makes a sound in the session and stays until the page is left, crossed out while muted and briefly lit while something plays, so a person can tell where a sound comes from. It never appears for x86 or for a program that stays silent.

Rejected: a button shown for every Target but x86 from the start (more discoverable, but it crowds the dock of every program that never makes a sound, which is nearly all of them; silence before a noisy run is what the Preference is for), the Screen panel's header (MARS Notes play from programs that draw nothing, and the panel can be hidden until Build), Preferences alone (too slow to reach while a loop is playing).

## At most 64 at once

Decided on 2026-10-23.

- At most 64 Notes and Sounds sound at once, across everything a program plays. One more cuts the oldest one-shot first and loops last, so a flood of Notes does not silence the background music.
- A Note or Sound started and cut within the same execution slice is never sent to the audio thread, so a runaway loop costs a message per surviving sound per slice rather than one per syscall.
- The cap changes what is heard and never an answer: MARS's 31 answers nothing, EASy68K's DirectX tasks answer 1 whether or not an older Sound is cut, and the standard player plays one Sound at a time anyway.
- At most 4 of them are MIDI Files, each of which plays live on a synthesizer of its own holding its own copy of the bank; a fifth cuts the oldest one-shot MIDI File first, loops last. Like the cap, it changes only what is heard: the DirectX tasks answer 1 either way. Added on 2026-10-23 after the spike ([the plan](./audio-plan.md), decision 3), confirmed by the owner.
- A documented deviation from MARS, which starts a thread and a synthesizer for every Note and has no limit.

Why 64: General MIDI asks for 24 simultaneous voices and GM2 for 32, so 64 is twice what any MIDI piece is written for, and it stays under spessasynth's own cap of 350 voices with two or three voices a Note. A loop such as `loop: li $v0,31; syscall; j loop` at a few million instructions a second would otherwise post hundreds of thousands of Notes a second and freeze the page; spessasynth's cap alone does not stop that, since every Note would still be a message. Ending the program at the 65th was rejected: it turns a harmless mistake into a crash where the reference never fails.

## The Z80 audio ports

Decided on 2026-10-23, and added to [ADR 0011](../adr/0011-z80-peripherals-through-the-port-map.md) as an update. Only an `in` can wait, because a wait is the port answering no data so that the Core stops and runs the `in` again, so the play-and-wait is a read, like `TIME_WAIT`.

| Port | Name              | Use                                                                                                           |
| ---- | ----------------- | ------------------------------------------------------------------------------------------------------------- |
| 0x60 | `NOTE_PLAY`       | `out`: plays a Note at the written pitch and returns at once, MARS's 31                                       |
| 0x61 | `NOTE_PLAY_WAIT`  | `in r,(c)` with the pitch in B: plays the Note, waits its duration and answers 0, MARS's 33                   |
| 0x62 | `NOTE_INSTRUMENT` | `out`: the General MIDI instrument of the next Notes                                                          |
| 0x63 | `NOTE_VOLUME`     | `out`: the volume of the next Notes                                                                           |
| 0x64 | `NOTE_DURATION`   | `out (c),r`: the duration of the next Notes in milliseconds, B the high byte and r the low byte, up to 65,535 |

- MARS's rules apply: a pitch, instrument or volume of 128 to 255 becomes 60, 0 or 100. A run starts at instrument 0, volume 100 and 1000 ms, MARS's defaults, so `ld a,60 / out (0x60),a` alone plays MARS's default Note.
- The pitch is the play port's value, so a melody on one instrument costs one `out` a note.
- Instrument, volume and duration are restored on Undo like the Screen's pen and coordinates.
- The ports work in both Screen modes, the drawing ports and the TRS-80 character display of [ADR 0020](../adr/0020-mirror-the-trs80-display-in-guest-memory.md).

Why milliseconds rather than `TIME_WAIT`'s hundredths: they are MARS's unit, so a MARS melody ports number for number, and one byte of hundredths would cap a Note at 2.55 s. No port reports how many Notes are playing: MARS has no such service and a program never needs one. Rejected: a pitch port and a command port as the Screen has (an extra `out` a note), hundredths.

## EASy68K's Files and answers

Decided on 2026-10-23. What EASy68K 5.16.1 answers in D0.W, read from `simIOu.cpp` (`playSound` to `controlSoundDX`), which rule 1 of [ADR 0035](../adr/0035-environments-match-their-reference.md) makes the answer here too:

| Task                                                  | Done | Standard player busy | File missing or slot empty                   | File unplayable                  |
| ----------------------------------------------------- | ---- | -------------------- | -------------------------------------------- | -------------------------------- |
| 70 play a File, 72 play a slot                        | 1    | 0                    | D0 left unchanged, and a "not found" message | 0                                |
| 71 load a slot                                        | —    | —                    | nothing loaded, and the message              | loaded anyway; 72 then answers 0 |
| 73 DirectX play a File, 75 DirectX play a slot        | 1    | —, it mixes          | 0                                            | 0                                |
| 74 DirectX load a slot                                | 1    | —                    | 0                                            | 0                                |
| 76 and 77 control: 0 once, 1 loop, 2 stop, 3 stop all | 1    | 0                    | 0                                            | 0                                |

- **The editor reports what happened and the Core writes D0.** The adapter answers each task with an outcome, done, busy, missing or unplayable (done meaning the task did what it asked: a play started, a load loaded, a stop stopped), and s68k encodes it as EASy68K does, D0 left alone for a missing File on 70 and 72 included: rule 3 of ADR 0035, the Core owning the meaning and the editor the transport. s68k writes D0 for every sound task today, so this is a Core change.
- **Paths** resolve against the Project root through the **FileSystem**, as tasks 50 to 59 do.
- **Playable is decided by parsing, never by the browser.** A WAV is playable when it is RIFF/WAVE holding integer PCM of 8, 16, 24 or 32 bits or 32-bit float, what every browser decodes; a MIDI File when it is a Standard MIDI File (`MThd`). The check reads headers only, so a Testcase, which decodes nothing, answers exactly as an interactive run does. Anything else, an ADPCM WAV or an MP3, answers as Windows failing to play it does, 0, and the **Log** names the format.
- **EASy68K's messages go to the Log**, once per path and run, "Sound File 'roger.wav' not found": the Log is what stands in for EASy68K's Message window.
- **One quirk fixed:** EASy68K's 77 with control 3, stop all, stops nothing when the slot number it is given is empty. Here it stops every DirectX Sound and still answers EASy68K's 0, which helps a learner and changes nothing a program observes (rule 2 of ADR 0035).
- **One quirk kept:** 71 loads a corrupt File without complaint, and 72 is where it fails, which needs nothing special.
- **Two details of control, read from the source while documenting:** task 76 with control 3 purges the standard player before EASy68K looks at the slot, so it answers 1 even for an empty one, where 77 with control 3 answers 0 for an empty slot (the stop-all fix above keeps that answer). Control 2 on the standard player stops the Sound only when the slot named is the one task 72 or 76 last played, EASy68K's `currentWave`, and answers 0 otherwise.

## Documentation, Lectures and Examples

Decided on 2026-10-23.

- **Reference documentation.** The services join the tables every surface already reads: `mipsSyscalls.ts` and `riscvSyscalls.ts` for MIPS and RISC-V, `M68K-traps.ts` for the M68K and `Z80-model.ts` for the Z80 ports, which feed the Documentation, the hovers, completion, the coding agent's prompt and `<sim.h>`'s functions for 31 and 33. Each language's Documentation lists its deviations: the cap of 64, silence in a Testcase, loops stopping when the program ends, EASy68K's MIDI Files sounding unlike Windows', the stop-all fix. The sentences saying the services are unavailable go (`syscalls.md` for MIPS and RISC-V, the M68K trap lecture).
- **Lectures.** No new Lecture: [ADR 0012](../adr/0012-language-courses-mirror-the-general-course.md) keeps a language's peculiarities inside the mirrored Lectures. A short section on making sound goes into each language's system-call Lecture: M68K's trap #15 and its tasks, MIPS's syscall, RISC-V's ecall, the Z80's ports in and out. x86 gets none.
- **Examples.** A "Play a tune" Example in MIPS, RISC-V and Z80 with the same melody, so the Examples link across languages. For the M68K, an Example playing a WAV and a MIDI File, and the sound half of `graphics-tour.x68`, the runnable port of `graphicSound.X68`, all on audio Files authored here, so EASy68K's sample WAVs never raise a licence question.

## What the Cores need

Not asked as questions: these follow from the decisions above and from rule 3 of [ADR 0035](../adr/0035-environments-match-their-reference.md), the Core owning a service's meaning and the editor its transport.

- **MARS and RARS** get services 31 and 33 back, with MARS's range checks and defaults in Java, calling one new required host handler, `midiOut(pitch, duration, instrument, volume)`; 33 calls it and then the existing `sleep` handler for the duration, so it suspends the run and ends the slice exactly as a 32 does. Major releases of `@specy/mips` and `@specy/risc-v`, 5.0.0 ([the plan](./audio-plan.md), decision 1).
- **s68k** answers tasks 70 to 77 with an outcome, done, busy, missing or unplayable, and encodes D0.W as EASy68K does, leaving it unchanged for a missing File on 70 and 72. A release of `@specy/s68k`.
- **The Z80** needs nothing: the audio group is the editor's port device, as the other groups are.

## Open decisions

None. Everything above was settled on 2026-10-23.
