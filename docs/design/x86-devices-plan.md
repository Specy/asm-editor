# x86 devices: implementation plan

Written on 2026-10-31 after the design interview, and revised the same day after an independent review of the design and this plan, which checked the facts against the Linux 6.12 and QEMU 10.0 sources Debian 13 ships and the plan against the code. M0 booted the pinned guest later the same day, QEMU 10.2.1 with Linux 7.2.11, and the Implementation record's "M0" says what that corrected. The decisions are in [x86-devices.md](./x86-devices.md), with [ADR 0067](../adr/0067-x86-devices-follow-a-qemu-guest.md) (the pinned QEMU guest), [ADR 0068](../adr/0068-x86-programs-run-on-a-serial-console.md) (the serial console), [ADR 0069](../adr/0069-x86-journals-the-input-its-reads-take.md) (the input journal) and [ADR 0070](../adr/0070-the-x86-runtime-library-offers-the-linux-device-interfaces.md) (headers and POSIX calls).

## Starting point

Checked on 2026-10-31 in this checkout. Blink paths are under `packages/x86/libblink/blink/`, wrapper paths under `packages/x86/blink-js/src/`, editor paths under `packages/asm-editor/src/lib/`.

| Area             | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Device files     | `/dev` is Emscripten's MEMFS (`DISABLE_VFS`, `vfs.h:375-434`): `null`, `tty`, `tty1`, `random`, `urandom`, `shm/` and the std links, no `/dev/input` or `/dev/snd`. `SysOpenat` gives a descriptor its own `struct FdCb` by matching `st_rdev` against the terminal's numbers or the path against `/dev/urandom` (`open.c:152-164`, `terminal.c:320-351`). New nodes need `FS.registerDevice` and `FS.mkdev` and must exist before `captureFileSystemSkeleton` (`blink-runtime.ts:256`) or `resetFileSystem` deletes them; symlinks are captured and restored. `struct Fd` has no per-open data; browser pipes keep a table keyed by descriptor (`browserpipe.c:29-74`).                                     |
| ioctl            | `struct FdCb` has no ioctl hook (`fds.h:20-29`). `SysIoctl` (`ioctl.c:417-563`) handles the terminal's termios and FIO* requests and falls through a switch whose default is `EINVAL`, not Linux's `ENOTTY`. Sized requests such as `EVIOCGNAME(len)` carry their size in the request number.                                                                                                                                                                                                                                                                                                                                                                                                                |
| termios          | `GetTerminalAttributes` reports fixed canonical values; `SetTerminalAttributes` ignores everything (`terminal.c:233-280`) yet `TCSETS*` mark the step irreversible (`syscall.c:6526-6533`). The editor's **Line discipline** hands Blink a whole line only while Blink waits (`languages/X86/X86Emulator.svelte.ts:1621-1660`), and `ReadTerminal` stops at a newline. No `ISIG`, no way to queue a signal from the host. `TerminalConsole` keeps arrows, Escape and Ctrl+keys from the program.                                                                                                                                                                                                             |
| mmap             | Every non-regular-file mapping fails with `ENODEV` in the fork's own Emscripten branch (`memorymalloc.c:941-952`; `HAVE_MAP_SHARED` is off). Guest page entries point at host pages (`PAGE_HOST`, `PAGE_TA`, `machine.h:92-106`), 4 KiB each from a free list, installed on first touch, and installing one inside a syscall marks the step irreversible (`memorymalloc.c:476-507, 748, 1143`). `spyMemoryBytes` is one wasm call per page plus a copy.                                                                                                                                                                                                                                                      |
| Waits            | No Asyncify: a blocking call halts the machine and the whole instruction runs again once the host resumes it (`blinkenlib.c:538-571, 781-793`). `X86WaitRequest` carries a clock, a deadline and `acceptsInput`, which only Terminal descriptors set (`types.ts:191-207`, `syscall.c:5261, 5478`). poll and select ask each descriptor's `FdCb.poll`. A Testcase wait with no deadline and no input throws a generic error (`X86Emulator.svelte.ts:1694-1695`). Blink has no clock of its own; every read goes to the editor's **ProgramClock**. `TearDown` closes every descriptor and must not block (`blinkenlib.c:622-624`). `epoll` answers `ENOSYS` (`syscall.c:6305`).                                |
| History          | Packets (`debughistory.c:273-370`, version 2) restore registers, memory, FPU, flags, exit state, call stack and count; nothing else, and no callback per undone step. Stdin consumption, pipes, Project File reads and timers mark steps irreversible. An instruction keeps at most 64 KiB of old bytes and 16 records (`machine.h:369-370`, `memory.c:158-187`), and a `rep stos` or `rep movs` runs whole in one instruction (`string.c:195-208, 331-345`), except where the trap flag stops it between iterations, so clearing a 320×240 page in one instruction would be an Undo barrier. The editor restores Random and the Terminal by serial after `core.undo()` (`X86Emulator.svelte.ts:1571-1581`). |
| Release          | `@specy/x86` 7.0.0, a submodule (Specy/x86-js) used through `workspace:*`; the wasm is rebuilt reproducibly with emsdk 6.0.9 by `compile_blink.sh` and committed (CI never rebuilds it).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Editor gates     | `languageHasScreen = language !== 'X86'` (`languages/peripherals/peripheralSet.ts:63-70`) gates the Workbench, the compact layout, the embed, the Interactive editor and the `screenHistoryBudgetMb` Setting. x86 gets no browser audio output (`EmulatorLoader.svelte:48-51`) and no `wakeAudio`. X86Emulator uses only the Terminal, clock, Random and FileSystem.                                                                                                                                                                                                                                                                                                                                         |
| Screen           | MARS's devices re-read dirty 1 KB blocks found by a write observer and call `screen.syncFramebuffer`, at slice ends and before waits, and resync after Undo (`languages/mars/MarsDevices.ts`). `@specy/x86` has no write observer. `Screen.ts` has no pan; memory-backed images journal nothing. `readInto` already treats a little-endian word as `0x00RRGGBB`.                                                                                                                                                                                                                                                                                                                                             |
| Display          | `ProjectDisplay` is MARS's five fields (`languages/mars/marsDisplay.ts:27-36`); the `@screen` parser reads `#` comments with `name=value` entries only (`screenDirective.ts:70-74`). x86 has no `setDisplay`, so the Workbench offers no Display section.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Input            | `ScreenRenderer.svelte` floors the pointer to whole pixels, has no wheel handler, and its focus hint is fixed text. `keyCodes.ts` gives EASy68K codes and merges left and right modifiers; `Keyboard` uses the browser's repeats. Keyboard and Mouse stay live in a Testcase; the adapter has to gate delivery itself.                                                                                                                                                                                                                                                                                                                                                                                       |
| Audio            | `Audio.ts` journals by serial (`track`, `record`, `undoAfter`), flushes at slice ends and waits, has silent mode and `reset`. The chip worklet is mono and switches on `ChipCommand`. The Note engine (`synthesizerEngine.ts`) offers `playNote` and MIDI Files only and forces every channel melodic, so channel 10 has no drums. Nothing streams PCM.                                                                                                                                                                                                                                                                                                                                                      |
| Runtime library  | Hand-written headers in a flat `packages/runtime/include/`, shared by every Target and part of the ABI; members compiled through Compiler Explorer for every Target; every documented function needs a member on every Target and a corpus run on glibc and every Core (`scripts/build.mjs:224-284`, `test-native.mjs:370-378`). `errno` exists but lacks `ENOTTY`, `EINTR`, `EFAULT`, `ENODEV`, and the arch layer returns a bare -1. `<time.h>` has no `clock_gettime`, `nanosleep` or `struct timespec`. `source-language-help/generate.mjs` reads `include/` non-recursively.                                                                                                                            |
| `<sim.h>`        | Generated in the editor (`scripts/sim-header/`), x86-only, header-only, exposed read-only at the one path `@runtime/include/sim.h`; compile errors in any other runtime header map to no line (`compilerExplorer.ts:126-145`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| NASM `%include`  | NASM runs with no `-I` from the including file's directory (`wasm-assembler.ts:57`, `project.ts:42-85`); `X86Project` has no include-path field, so a runtime `.inc` needs a `@specy/x86` change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@screen` from C | MIPS's `SIM_SCREEN` emits an `asm` comment kept in the Generated assembly; the x86 translator rejects comments in `#APP` blocks (`analyze.ts:774-790`), and C comments do not survive compilation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Content          | x86 has no drawing, input or sound Examples; the system-call Lecture is `x86/talking-to-the-outside-world/syscall-and-the-linux-abi`; the coding agent prompt says x86 has no Screen and calls x86 freestanding (`prompts.ts:477, 511, 543`). Content tests run Examples on a virtual clock with a 2M instruction limit; a per-pixel 320×240 frame costs about 300k instructions.                                                                                                                                                                                                                                                                                                                            |

## Decisions taken while planning

Confirmed by the owner on 2026-10-31, with the review's changes.

1. **Device semantics live in Blink, in C.** Each device is a `struct FdCb` with a new `ioctl` member, matched by its real Linux device number (`st_rdev`, the exact numbers from the pinned guest), so `stat` answers as on Linux and a path through a udev link opens the same device. Per-open state belongs to the **open file description**, not the descriptor: after `dup` both descriptors share one queue and one `O_NONBLOCK`, and the device's release runs on the last close. The editor delivers key and pointer events in and receives sound and Screen changes out; it never parses an ioctl ([ADR 0035](../adr/0035-environments-match-their-reference.md) rule 3).
2. **The device nodes are made by the wrapper before the skeleton is captured**: `/dev/fb0`, `/dev/tty0`, `/dev/input/event*`, `/dev/dsp`, `/dev/mixer`, `/dev/midi1`, `/dev/snd/midiC1D0`, the udev links under `/dev/input/by-path/` and `by-id/`, a generated `/proc/bus/input/devices`, and the guest's nodes this design does not cover (`/dev/dri/card0`, ALSA's PCM and control nodes, `/dev/input/mice`, `/dev/audio`), whose `open` fails with `ENODEV`, a documented deviation, while the Log names the device and what to use instead. No `/dev/sequencer` or `/dev/music`: the guest has none.
3. **Unknown ioctls answer `ENOTTY`** on every descriptor, Linux's answer, replacing `SysIoctl`'s `EINVAL` default. Sized requests are matched on type and number, with the size taken from the request.
4. **The framebuffer is one contiguous host allocation.** A new device-mapping path in `SysMmapImpl` maps `/dev/fb0` onto guest page entries that point into a single buffer of `yres_virtual × line_length` bytes, allocated at open with every page present and marked so that `munmap` and the free list never take them back. A mapping never faults pages in, two mappings share the buffer (`MAP_SHARED`), and the editor reads the visible page through one view of the wasm heap. `read`, `write`, `pread`, `pwrite` and `lseek` reach the same buffer. Pixel writes go through the ordinary write journal, so Undo restores them ([ADR 0005](../adr/0005-restore-screen-state-on-undo.md)).
5. **The Screen catches up by re-reading the visible page**, at the end of every slice, before every wait, at every pan, at `fsync` and after Undo, converting `0x00RRGGBB` into the Screen's RGBA in one pass. No dirty tracking unless M2's measurement asks for it: at 320×240 it is 300 KB a catch-up, and MARS's cost came from reading word by word through TeaVM.
6. **A `rep` string instruction is split for the history, and shown whole.** When the iterations of `rep stos`, `rep movs` and the rest would write more than the history keeps for one instruction, Blink stops between iterations, with `rcx`, `rsi` and `rdi` updated and `rip` on the instruction, through the path the trap flag already uses (`string.c:195-203`), and resumes at once. The parts are one Step, one History row and one instruction in the count; Undo takes the row back by restoring every part. Clearing a page stays reversible, and a C `memset` too.
7. **Waits name what can end them.** `X86WaitRequest` carries wake sources instead of `acceptsInput`: Terminal input, events on given input-device readers, and a deadline. Every timed device folds into the deadline: room in the dsp buffer, a free byte on the MIDI port, the next vsync. A Testcase wait whose only sources are input devices stops with the design's message.
8. **Devices keep time lazily.** Blink has no tick: the dsp's played position and the MIDI port's sent bytes are computed from the device's last change and **Program time** whenever a call asks, and a wait gets its deadline from the same computation. Testcases get the virtual clock for free. (Key repeats need none: they are the browser's.)
9. **A blocking write keeps its progress across restarts.** Blink re-runs a blocked instruction from the start, so a `write` to `/dev/dsp` or the MIDI port larger than the free space records, in the open file description and owned by the instruction's serial, how much it has already queued; the restarted call goes on from there, and Undo of that serial forgets it.
10. **Sound leaves Blink as a timeline.** A dsp write hands the editor its samples with the Program time they start playing; a MIDI write hands its bytes with their times on the port; a speaker event or `KIOCSOUND` hands the new tone. Undo, `RESET` and Stop hand the editor a cut: everything scheduled after a time is dropped. The editor schedules, never decides.
11. **History packet version 3 holds the journal**: for each read of standard input or an evdev reader, which queue it took from, what it took, and whether it waited, so Undo follows [ADR 0069](../adr/0069-x86-journals-the-input-its-reads-take.md) (waited-for typed input asks again, the rest goes back); the events `EVIOCGKEY` and `EVIOCSCLOCKID` threw away; and the device settings Undo restores (termios, dsp format, rate, channels and fragments, the mixer, `yoffset`, the MIDI synthesizer's channel state, the speaker's tone). `TCSETS` stops being a barrier.
12. **Raw mode keeps type-ahead in Blink.** Blink stores the program's termios and reports it to the editor; while `ICANON` is off, the Terminal sends each key to Blink's queue as it is typed, running or not, with arrows and other special keys as their escape sequences, and echoes only under `ECHO`. `VMIN` and `VTIME` are Blink's, on Program time. `OPOST` and `ONLCR` shape output in Blink. Under `ISIG`, Ctrl+C and Ctrl+\ in the focused Terminal during a run queue `SIGINT` and `SIGQUIT` through a new host export; copying stays on Ctrl+Shift+C and the context menu; Ctrl+Z and `IXON` do nothing. Canonical mode keeps today's line reads. Raw mode ends with the program.
13. **x86's Display configuration is `{ width, height }`**, a per-Target shape beside MARS's five fields, default 320×240, widths a multiple of 8, stored in the Program's `display` as MIPS's is. The directive keeps the existing grammar, `@screen width=320 height=240`, in a `;` comment of a NASM Entry file and a `//` or `/* */` comment of a C or C++ Entry file, read from the Entry file's source, since C comments do not reach the Generated assembly.
14. **The x86 device headers and POSIX calls are header-only and x86-only**, like `<sim.h>` ([ADR 0070](../adr/0070-the-x86-runtime-library-offers-the-linux-device-interfaces.md)): generated in the editor from one device table plus the syscall table, uploaded only with x86 compiles in an x86 include directory searched before the shared one, exposed read-only under `@runtime/include/`. The POSIX calls are `static inline` wrappers over the system call that set `errno` from the kernel's negative result. x86's `<time.h>` additions (`struct timespec`, `clock_gettime`, `nanosleep`) come through an x86 `<time.h>` that includes the shared one with `#include_next`. The shared `errno.h` gains Linux's values for the codes the devices return.
15. **The layout test runs natively**: a probe compiled by the host's GCC against our headers and against the kernel's own UAPI headers prints sizes, offsets and values, and the test compares the two (the runtime's native test already needs a host GCC; this machine has the kernel's `linux/fb.h`, `input.h`, `soundcard.h` and `sound/asound.h`).
16. **NASM finds the include files through a new `includePaths` field of `X86Project`**, passed as `-I` to NASM by `@specy/x86`; the editor stages the generated `.inc` files there. Reachability and diagnostics treat `@runtime/include/` paths as read-only Files.
17. **Sound reuses what exists where it fits.** PCM gets a new streaming worklet (stereo, resampling the device rate to the context's, channels beyond two mixed down, a gain for the mixer). The GM synthesizer is a second spessasynth synthesizer of its own, sixteen channels with drums on channel 10, fed raw messages and SysEx. The PC speaker is a new `ChipCommand` in the chip worklet.
18. **`@specy/x86` 8.0.0.** The wait request, the environment and the history format change shape; a major release.
19. **Examples stay inside the content tests.** Drawing Examples stop after a fixed number of frames when no key is pressed, input Examples poll with a timeout rather than block, and sound Examples generate at 22 kHz or less (44.1 kHz stereo at about 20 instructions a sample takes about 90% of Blink's speed).

## The Core's contract

What `@specy/x86` 8.0.0 offers the editor, fixed before the work splits so that the Core and the editor are built against one shape. Names may change in review; meanings may not without changing this section. Until M5, the Core only adds: today's fields and calls (`acceptsInput` among them) keep working, so the editor stays green while both sides are built.

```ts
/** The machine's `video=`: set before a program starts, and kept until it is set again. */
type X86DisplayMode = { width: number; height: number } // width a multiple of 8, both 8..1024
setDisplayMode(mode: X86DisplayMode): void

/** What can end a wait besides its deadline (replaces `acceptsInput` in 8.0.0). */
type X86WakeSources = { terminal: boolean; inputDevices: X86InputDeviceId[] }
type X86WaitRequest = {
    clock: number
    deadlineNanoseconds: bigint | null
    remainingMilliseconds: number | null
    wakeSources: X86WakeSources
    instructionSerial: string
}

/** The devices the host delivers events to; the others never receive any. */
type X86InputDeviceId = 'keyboard' | 'tablet'
/** One input event as Linux's `struct input_event` has it, without its time. */
type X86InputEvent = { type: number; code: number; value: number }
/**
 * One report: the events of one host event (a key down, a move, a button, a wheel notch). The Core
 * adds what the guest's drivers add (`MSC_SCAN` before keys and buttons, `REL_WHEEL_HI_RES` beside
 * `REL_WHEEL`, `EV_LED` from the lock keys), closes it with `SYN_REPORT`, stamps it with Program
 * time and queues it for every reader of the device. Never called in a Testcase.
 */
sendInputReport(device: X86InputDeviceId, events: X86InputEvent[]): void

/** The termios the program set on its terminal, reported at start and at every change. */
type X86TerminalMode = {
    canonical: boolean // ICANON
    echo: boolean // ECHO
    signals: boolean // ISIG
    crToNl: boolean // ICRNL
    outputProcessing: boolean // OPOST
    nlToCrNl: boolean // ONLCR
}
getTerminalMode(): X86TerminalMode
// event 'terminalMode': X86TerminalMode
// provideInput(): also accepted while no read waits (type-ahead), and in raw mode one key at a time
sendSignal(signal: number): void // SIGINT 2 and SIGQUIT 3, typed in the Terminal under ISIG
/** ICRNL on input and OPOST/ONLCR on output apply only when the host asks: interactive runs do, Testcases (pipe-like) do not. */
setTerminalProcessing(processing: { input?: boolean; output?: boolean }): void
// event 'unsupportedDevice': { path } — the program opened a node the guest has but this design does not cover

/** The framebuffer, once the program has opened /dev/fb0; black until then. */
type X86Framebuffer = {
    width: number
    height: number
    lineLength: number // bytes
    yoffset: number // the visible page's first line
    visible(): Uint8Array // the visible page, `height × lineLength` bytes of 0x00RRGGBB words, a view
}
getFramebuffer(): X86Framebuffer | null
// event 'framebufferPresent': { yoffset } — a pan or an fsync: the editor catches up now

/** Sound, as a timeline on Program time's monotonic clock, in nanoseconds. */
// event 'pcm': { start: bigint; rate: number; frames: Float32Array } — stereo, interleaved, at the device's rate
// event 'midi': { at: bigint; message: Uint8Array } — one complete message, at the time its last byte leaves the port
// event 'tone': { at: bigint; hz: number } — the PC speaker; 0 is silence; the timer's quantisation applied
// event 'mixer': { volume: [number, number]; pcm: [number, number] } — 0..100, at start and at every change
// event 'soundCut': { after: bigint; device?: 'dsp' | 'midi' | 'speaker' } — drop what is scheduled after this time, on one device or all (Undo, RESET, Stop)
// After Undo the Core also emits what puts the output back: the tone, the mixer, and the MIDI
// messages that restore each channel's program, controllers and pitch bend.
```

## Milestones

M0 gates the identities in M3 and M4 but not their mechanisms. M1 gates M2 to M4. M5 needs M1 to M4. M6 to M8 need M5; M9 is independent of M1 to M8 except for the `-I` field of M5. M10 needs everything; M11 closes.

### M0: The reference guest

On a machine with QEMU, outside the repository except for the recorded results:

- The pinned configuration of [x86-devices.md](./x86-devices.md) booted: QEMU 10.0 with `pc-q35-10.0`, Debian 13's generic image with a 6.19 or later backports kernel if one exists, `vmport=off`, a USB controller at a fixed address, `usb-tablet`, `pcspk-audiodev`, HDA with `hda-duplex`; the kernel command line with `console=ttyS0`, `fbcon=map:1`, `video=320x240`, `drm_kms_helper.drm_fbdev_overalloc=200` and the ALSA card indices; `snd-pcm-oss`, `snd-mixer-oss` and `snd-virmidi` loaded, `snd-pcsp` blacklisted; FluidSynth connected to the virtual MIDI port; root on `ttyS0`. Corrections go into the design record first.
- A probe, a static x86-64 binary built with the host's GCC and musl against the kernel's UAPI headers (this editor's headers come in M9), that prints what the design leaves to the guest: `/dev/input` in order with every discovery ioctl's answer, the udev links and `/proc/bus/input/devices`; the tablet's events, axes, buttons and its value before any movement; what `FBIO_WAITFORVSYNC` and `FBIOPAN_DISPLAY` do and how long they take; `FBIOPUT_VSCREENINFO`'s answers; the smallest `video=` size; `/dev/dsp`'s defaults and `GETOSPACE`; the mixer's channels and defaults; the MIDI card's paths and `INFO`; every node's `st_rdev`. Its output is kept as a fixture for M11's differential runs.

### M1: Blink's device groundwork

- `struct FdCb.ioctl`, per-open state on the open file description with dup and last-close release, matching by `st_rdev`, the `ENOTTY` default and sized-request matching (decisions 1 and 3).
- The wrapper's device nodes, links, `/proc/bus/input/devices` and uncovered nodes (decision 2), made before the skeleton capture and surviving `resetFileSystem`.
- Wake sources in the wait request (decision 7), lazy device time (decision 8), partial progress for blocking writes (decision 9).
- termios stored and reported, raw-mode reads, type-ahead, `VMIN` and `VTIME`, `OPOST` and `ONLCR`, and a host export that queues `SIGINT` and `SIGQUIT` (decision 12).
- History packet version 3 with the input journal, standard input first: a read of it stops being irreversible and follows ADR 0057's rule; termios in the journal (decision 11).
- `rep` string splitting, shown as one Step and row (decision 6).
- Tests in the Core's suite for each: Undo across a waited-for read (asks again), across type-ahead (goes back), across a split `rep stos`, and a `dup`ed descriptor's shared state.

### M2: Blink's framebuffer

- `/dev/fb0`'s fixed and variable screen information from the Display configuration, `id` `bochs-drmdrmfb`, XRGB8888, two pages; `FBIOPUT_VSCREENINFO` answering as the kernel's check does (a smaller size accepted and read back, a larger size, depth or explicit layout `EINVAL`); panning by `FBIOPAN_DISPLAY` and by `yoffset`; `FBIO_WAITFORVSYNC` on the 1/60 s boundary; `fsync`; `yoffset` in the journal.
- The contiguous mapping path and `read`, `write`, `pread`, `pwrite`, `lseek` (decision 4); a view of the visible page for the wrapper.
- Measured: a catch-up's cost at 320×240 and 1024×1024 in Chrome (decision 5).

### M3: Blink's input devices

- The guest's devices at M0's numbers, each with its identity and capabilities; the keyboard's, the tablet's and the speaker's reader queues of 4,096 events with Linux's `SYN_DROPPED` past that; whole 24-byte reads and `EINVAL` for a smaller buffer; `MSC_SCAN` before key and button events; `EV_LED` from the lock keys; `SYN_REPORT` framing.
- `EVIOCGKEY` (flushing that reader's queued key events), `EVIOCGABS`, `EVIOCGLED`, `EVIOCGREP` (250 and 33 ms) and `EVIOCSREP` (the AT driver's rounded values, no effect), `EVIOCSCLOCKID` (REALTIME, MONOTONIC, BOOTTIME, with its flush and `SYN_DROPPED`), `EVIOCGRAB` (exclusive, `EBUSY` for a second grab).
- A host export taking an event for a device and its time; the journal entries for evdev reads and flushes.

### M4: Blink's sound devices

- `/dev/dsp`: `snd-pcm-oss`'s fixed `GETFMTS` mask, U8 for a format outside it, rates clamped to 1000 to 192000 Hz, 1 to 128 channels; the default buffer as on the guest's HDA card (32 fragments of 4 KiB at the default format); `SETFRAGMENT` once, before the first write; fragment-at-a-time output; `GETOSPACE`, `GETODELAY`, `GETBLKSIZE`, `SYNC`, `RESET`, `POST`; `O_NONBLOCK` and `POLLOUT`; the mixer ioctls on the dsp descriptor; the timeline out (decision 10); a `close` that pads the last fragment and drains through the halt-and-restart protocol, and a teardown that does not wait.
- `/dev/mixer`: its channels and defaults from M0, `VOLUME` and `PCM` sent out as gains.
- The raw MIDI port at both paths: bytes on the port's timeline at 31,250 baud, a 4 KiB buffer, its ioctls, a draining `close`, reads that never yield.
- The PC speaker: `EV_SND` writes, `SND_TONE` with Linux's range and the timer's quantisation, `SND_BELL` as a continuous 1000 Hz tone; `KIOCSOUND` and `KDMKTONE` on `/dev/tty0`.
- Device settings in the journal; the cut on Undo, `RESET` and Stop.

### M5: `@specy/x86` 8.0.0

- The wrapper API: device events in, the Screen view and pan state, the sound timeline and cuts, termios changes, signals, wake sources, `includePaths` for NASM.
- The wasm rebuilt reproducibly with emsdk 6.0.9 (two clean builds, same bytes), README with a "Migrating to 8.0.0" section, CHANGELOG.

### M6: The editor's Screen and Display

- `languageHasScreen` true for x86; the `screenHistoryBudgetMb` Setting stays hidden where the Screen is memory-backed.
- x86's `{ width, height }` Display configuration with widths a multiple of 8, the Display section's form without unit or base, `setDisplay` and `getDisplay` on X86Emulator, the size reapplied after `clear()`, the directive in `;`, `//` and `/* */` comments (decision 13).
- Catch-up from the Core's view at slice ends, waits, pans, `fsync` and after Undo; `yoffset` choosing the page.
- The focus hint's text per Target: on x86 it says keys and the pointer go to the program's input devices.

### M7: The editor's input

- `linuxKeyCodes.ts`: `KeyboardEvent.code` to `KEY_*` and the AT keyboard's scan codes for `MSC_SCAN`, left and right modifiers apart, keypad codes fixed; `keyCodes.ts`'s header corrected.
- `ScreenRenderer`: an x86 mode that reports physical keys with their times and the browser's repeats, pointer positions mapped as QEMU maps them (⌊x × 32767 ÷ width⌋ of the whole pixel, corrected in M10: first unfloored), and a wheel handler that keeps the page from scrolling; focus and window loss lift keys and buttons.
- The adapter delivers events to the Core and never in a Testcase.
- The Terminal's raw mode: keys sent as typed, special keys as escape sequences, echo only under `ECHO`, Ctrl+C and Ctrl+\ as signals under `ISIG`, Ctrl+Shift+C to copy.
- The Testcase message for a wait only a device could end.

### M8: The editor's sound

- The PCM worklet, its scheduling on Program time with drift absorbed, channels mixed down, the mixer's gain.
- The GM synthesizer with drums, raw messages and SysEx on the port's times, the reset at Build and Run, the release at the end of the program.
- The speaker's `ChipCommand`.
- `Audio`'s journal for the cuts, browser audio output and `wakeAudio` for x86, the speaker button's activity, silent Testcases that keep timing.

### M9: Headers, POSIX calls and NASM includes

- The device table and generator: `<linux/fb.h>`, `<linux/input.h>` with `<linux/input-event-codes.h>`, `<linux/soundcard.h>`, `<sys/soundcard.h>`, the raw MIDI part of `<sound/asound.h>`, `<sys/time.h>`, `<unistd.h>`, `<fcntl.h>`, `<sys/ioctl.h>`, `<sys/mman.h>`, `<poll.h>`, `<termios.h>` and the x86 `<time.h>` (decision 14); the matching `.inc` files.
- `errno.h`'s new codes; the native layout test against the kernel's UAPI headers (decision 15).
- Read-only exposure, upload with x86 compiles in the x86 include directory, diagnostics mapped into these headers, `source-language-help` taught to read subfolders.

### M10: Documentation, Lectures, Examples and the agent prompt

- x86 Documentation chapters: the Screen (`/dev/fb0`), input (`/dev/input`, `/proc/bus/input/devices`, the Terminal's modes), and sound (`/dev/dsp`, `/dev/mixer`, MIDI, the PC speaker), each from the device table where it lists numbers. They state every documented deviation, say where the Screen's keys go, give the pointer's conversion `(value × xres + 32766) ÷ 32767`, explain the dsp's fragments, latency and `SYNC`, and list what is not covered (`epoll`, `O_ASYNC`, recording).
- Sections in the system-call Lecture: devices are files; drawing; reading keys and the pointer; making sound, with `SETFRAGMENT` in the first sound program.
- Examples in the existing topics (drawing, bouncing ball, keyboard control, play a tune, sampled sound) plus a speaker tone and a mouse paint, in NASM and C, within decision 19's limits; content tests on the virtual clock.
- The coding agent prompt's x86 section.

### M11: Verification

- The full editor suite, `svelte-check`, `vp lint`, `vp fmt`, the Core's suite and the runtime's native test.
- Browser checks in Chrome: drawing and panning, keys and the pointer, the Terminal's raw mode and its signals, each sound device, Undo across all of them, Stop, a Testcase.
- Differential runs: the probe and the Examples in the pinned guest against the editor, compared where the design says "as on the guest", the documented deviations excepted.

### Releases

`@specy/x86` 8.0.0 from M5, before the editor's milestones land on `main`; the owner tags and publishes it, as for every Core.

## Implementation risks

- **The guest's facts may still differ**: no 6.19 backports kernel for Debian 13, card numbers in another order, a `video=` minimum above what the menus offer. M0 comes first so that the design record is corrected before the Core is written.
- **Splitting `rep` instructions** must stay invisible: one Step, one row, one count, and the Testcase instruction limit unchanged.
- **History packet version 3** must stay small: an evdev read of many events, a dsp `RESET` dropping seconds of samples or a large SysEx must not hold megabytes per step.
- **Raw-mode type-ahead and the signals** change when and how the Terminal takes keys; canonical reads and copying must behave exactly as today.
- **Blink's speed** (about 2,000 instructions a millisecond with history) keeps per-pixel drawing and PCM generation slow; decision 19 keeps the Examples inside it.
- **Audio drift** between Program time and the output's clock over minutes of PCM.
- **Firefox and Safari** were not checked for the earlier audio work either.

## Implementation record

### First wave (2026-10-31)

Five Opus agents in parallel, in the worktree `.cache/wt/x86-devices` (branch `feat/x86-devices`, from `main` at 7792c5e3) and the Core's branch `feat/devices`. Committed after the full editor suite (350 files, 6,964 tests), `svelte-check`, Oxlint and ESLint passed.

- **M1, the Core's groundwork** (Core d9cd6f7, editor pointer 5d1cd113). One device table (`devices.c`) with the nodes, udev links, `/proc/bus/input/devices` and uncovered nodes; `FdCb.ioctl`; per-open state on the open file description; wake sources, lazy device time and partial progress; termios kept, raw reads, type-ahead, `sendSignal`; history packet version 3 with a generic journal (`DebugHistoryJournal(kind, …)`: terminal 1-3, input 16-31, framebuffer 32-35, sound 36-63); `rep` splitting into one packet. Core suite 3,322 → 3,361 passed; wasm `fe8d9d18…`, reproducible.
- **M9, headers** (638a3127). One device table (`scripts/sim-header/deviceTable.mjs`) generating 20 C headers and 18 NASM include files under `src/lib/sourceRuntime/generated/x86/include/`, uploaded with x86 compiles only (`-isystem sysroot/x86_64/include`); a native layout test compares 1,226 sizes, offsets, values and signatures with the kernel's UAPI headers; every `.inc` assembles with the Core's NASM. `errno.h` gained Linux's device codes, which needs the Runtime library rebuilt through Compiler Explorer (`build.mjs --update-abi`).
- **M7, the Terminal** (23e21d20). A line mode the adapter sets; raw keys as xterm's bytes; `ISIG` signals; Ctrl+Shift+C copies; `SerialTranscript` for x86 output (`\r`, `\b`, staircase) with Undo of the rewritten line.
- **M8, sound** (2672b0d5). `X86Sound` entry points (`audio.x86.pcm/midi/tone/mixer/soundCut`), a PCM worklet on a Program-time timeline (100 ms behind, drift followed at 1 ms a second, jumps past 50 ms), a pooled General MIDI synthesizer with drums, the PC speaker in the chips' worklet. Checked in headless Chrome.
- **M6/M7, Screen, Display and input UI** (8b05cc5c). `languageHasScreen` true for x86; `ProgramDisplay` is MARS's five fields or x86's `{ width, height }`; the x86 `@screen` reader; `linuxKeyCodes.ts`; the `X86Input` module and `ScreenRenderer`'s x86 mode.

Decisions taken while implementing:

1. **ICRNL and OPOST/ONLCR apply only when the host asks** (`setTerminalProcessing`): interactive runs turn them on, Testcases leave them off, so a Testcase's transcript is a pipe's.
2. **Undo of a read that waited puts back only what it found queued before the wait**, and drops what arrived during the wait and is still queued, the state before the instruction ([ADR 0057](../adr/0057-restore-the-terminal-on-undo.md)).
3. **`sendSignal` discards input no read took unless `NOFLSH` is set**, as Linux's `isig()` does, and is an Undo barrier like any signal from outside.
4. **`soundCut` names its device** when one device is cut (a dsp `RESET` must not drop MIDI).
5. **In raw mode Escape goes to the program and Shift+Tab leaves the Terminal**; on the Screen Escape still releases it on every Target, x86 included, so an x86 program could not read `KEY_ESC` from the Screen. The owner settled it the same day: on x86 the Screen hands Escape to the program and Shift+Tab releases it, as in the Terminal; the other Targets keep Escape.
6. **Unknown ioctls answer `ENOTTY` only where no driver claims the request type**: evdev and OSS answer `EINVAL` for unknown requests of their own type, as on Linux (M3, M4).
7. **The MIDI port's buffer belongs to the substream**, shared by every open (M4 moves M1's test vehicle there).
8. The mixer's gain is linear (VOLUME/100 × PCM/100 a side), not checked against the guest's dB curve.

### Second wave

Started 2026-10-31: M2, M3 and M4 in three worktrees of the Core (`.cache/wt/x86-core-fb`, `-input`, `-sound`, branches `feat/devices-fb`, `-input`, `-sound` from d9cd6f7), merged into `feat/devices` when done; the adapter wiring of M1's terminal and wait API in the editor worktree.

- **M2, the framebuffer** (Core edc64a8). `fbdev.c`: the DRM fbdev emulation's answers on QEMU's bochs display, `smem_len` rounded to whole pages, `check_var`'s real rules (a `yres` up to `yres_virtual` accepted, depths up to 32 read back as 32), panning with DRM's `ENOSPC`, `FBIOBLANK`, `MAP_PRIVATE` as a copy at map time, `read`/`write`/`pread`/`pwrite`/`lseek`/`fsync`; one contiguous buffer behind a device-mapping branch of `ReserveVirtual`; journal kinds 32-34; `setDisplayMode`, `getFramebuffer()` (with `blanked`, an addition to the contract) and `framebufferPresent`. 24 tests; suite 3,385.
- **M3, the input devices** (Core 6886f6d). `evdev.c`: keys modelled as the bytes QEMU's translated set 2 keyboard sends through a port of `atkbd_receive_byte`, so `MSC_SCAN` and the 1-or-2 decision are atkbd's; the tablet through hid-input; the console keyboard handler's LEDs; `__pass_event`'s overflow at 4,096; `EVIOCSKEYCODE`; journal kinds 16-22 with an overflow epoch per reader; `/proc/bus/input/devices`; `sendInputReport`. Unknown evdev ioctls answer `EINVAL`, as `evdev_do_ioctl` does. 26 tests; suite 3,387.
- **M4, the sound devices** (Core ca5bab8). `oss.c`, `rawmidi.c`, `speaker.c`, `sound.c`: `snd-pcm-oss`'s defaults, fixed format mask and plugin-chain fragment sizing (the default is 32 × 2 KiB, about 8 s, not the 16 s first estimated), the route plugin keeping two channels, mixer_oss on QEMU's HDA codec (`VOLUME` and `IGAIN` only), the raw MIDI port at 31,250 baud with SysEx over 256 bytes and real-time bytes dropped as FluidSynth would, the speaker with `KDMKTONE` in 4 ms jiffies; journal kinds 36-57; the `pcm`, `midi`, `tone`, `mixer` and `soundCut` events. 27 tests; suite 3,388.
- **The adapter's terminal wiring** (d9ca9c8d). Line mode from `terminalMode`, sinks to `provideInput` and `sendSignal`, processing on for interactive runs only, wake sources, the Testcase message for device-only waits, the `unsupportedDevice` Log line. 14 end-to-end tests.
- **The Runtime library rebuilt** (6e173802) for `errno.h`'s new codes; its corpus passes on the RARS, MARS and x86 Cores (614).

Found while implementing: pnpm 12 checks dependencies before `pnpm run` too, so a `pnpm run build` inside a worktree whose `node_modules` are symlinked re-linked the main checkout's shims and packages into the worktree; repaired with `pnpm install --offline --frozen-lockfile --ignore-scripts --force` in the main checkout. Core packages in a worktree are built with `npx tsdown && node scripts/copy-assets.mjs`.

For 8.0.0: `X86WaitRequest` should say whether a wait is a terminal read; the adapter tells a VTIME read from a poll by the syscall number in `rax` today. (Done in M5: `terminalRead`.)

### Third wave

- **The Core's merge** (Core b3b1472, 3135d0c, 29727f3, c0147f7; editor pointer caadb0e4). M2, M3 and M4 merged into `feat/devices` with six integration fixes and 19 tests: the speaker's strong `SpeakerInputEvent` linked for certain (the weak default removed, so a missing driver fails the link); `KIOCSOUND` and `KDMKTONE` injecting `EV_SND` into the speaker device's readers as `kd_sound_helper` does; one journaling rule (`IsJournaledDeviceFildes`); `midiC1D1` to `midiC1D3`; the resets' order; `_Static_assert`s keeping the journal kinds in their owners' ranges. The MIDI port keeps one substream for every open (Linux gives an ALSA open without `O_APPEND` its own); the Undo model assumes one queue. Core suite 3,457; wasm `6f5d246d…`, reproducible.
- **The adapter's devices** (67fdd06c). `setDisplayMode` before every start; the visible page copied onto the Screen (`Screen.syncFramebufferPage`) at slice ends, waits, pans, `fsync`, Undo and Pokes, marking the Screen drawn only when a pixel changed so x86 slices are not taken for animation; the input sink gated on the current Core, an interactive run and a started program; the sound events forwarded to `audio.x86`; a wait only an input device can end shown as an `InputDevice` interrupt ("Waiting for a key") with a dashed focus ring on the Screen. A catch-up costs 0.3 ms at 320×240 and 3 ms at 1024×768 in headless Chrome, so there is no dirty tracking. Checked in headless Chrome: a square moved by the arrow keys, the speaker on Space, Escape reaching the program, Shift+Tab releasing the Screen, `/dev/dsp` and a MIDI note heard.
- **Documentation** (d94bf21b, 90460c70). Three x86 chapters (the Screen, keys and the pointer, sound) whose tables come from the device table and whose NASM examples run on the Core in a test; four sections of the system-call Lecture; the coding agent's prompt; the stale "no Screen" statements and two Lecture statements on signals and standard input corrected. Found while running the examples: `SETFRAGMENT` gives a size near the one asked for, since the card converts the sound first, so the docs read it back with `GETBLKSIZE`.
- **M5, `@specy/x86` 8.0.0's API** (Core d42e3e3; editor 7bab0682). `acceptsInput` removed for `terminalRead`, true for a raw read `VTIME` times (an untimed read is an input request, not a wait); `X86Project.includePaths`, Project directories passed to NASM as `-I`, with the generated `.inc` files staged at `@runtime/include` only when a File includes something; reachability, links and completion for them. The README's "Migrating to 8.0.0" and the CHANGELOG are complete; the version stays 7.0.0 for the owner to bump, tag and publish. Core suite 3,472; wasm `c1c4fc51…`, reproducible.
- **Examples** (af85541f, 5523f6bd). Drawing on the Screen, keyboard control and mouse paint in NASM and C; a bouncing ball, the PC speaker, a tune on the raw MIDI port with drums and sampled sound in NASM; each finishes by itself inside the content tests (decision 19). The system-call Lecture's drawing and `/dev/dsp` fences became playgrounds. The browser check found the tablet scaling the pointer's unfloored position, so the documented conversion gave the next pixel at any zoom; QEMU passes the tablet whole pixels, and so does the editor now (the design record's correction of the same date).

### Verification (M11)

On 2026-10-31, at 0d26ab10 and Core d42e3e3: the full editor suite 7,040 passed and 5 skipped (the RISC-V "whole frames" test failed once under load and passes alone, as recorded before); `svelte-check` 0 errors in 1,956 files; Oxlint, ESLint and `vp fmt --check` clean; both generators' `--check` clean; the Core suite 3,472 passed and 2 skipped, `tsc` clean; the Runtime library's native test passed; the Runtime corpus on the RARS, MARS and x86 Cores 614 passed (at 6e173802). Headless Chrome 153 checked drawing, panning, keys, the pointer at two zooms, the wheel, Escape and Shift+Tab, Undo across pixels, pans and input, every sound device and Stop. Not checked: Firefox, Safari, phones, a production build's worklets.

### M0: the reference guest (2026-10-31)

Booted after all, once the machine had QEMU 10.2.1: Debian 13's `nocloud` image with Linux 7.2.11 from trixie-backports under TCG, provisioned and probed by `packages/asm-editor/scripts/reference-guest/` (`guest.py`, `probe.c`), its answers the fixture `facts.txt`, compared with the Core in [x86-reference-guest.md](../research/x86-reference-guest.md). The design record's corrections are dated in [x86-devices.md](./x86-devices.md).

- **The reference itself.** `video=320x240M`, since 7.2 refuses the GTF mode a bare size asks for. FluidSynth first held the HDA card's one playback substream, so `/dev/dsp` answered `EBUSY` while it played; the owner settled that it gets a card of its own, QEMU's `usb-audio` on the same xHCI controller (`snd_usb_audio.index=2`), and `/dev/dsp` now opens while FluidSynth plays, both heard together in the recording. The USB card raced the HDA card for ALSA's dynamic minors (two boots in three), so its driver loads once card 0's control exists, and four boots gave the same numbers.
- **The Core, corrected** (Core a3e6f1b): the input devices' order (keyboard, PS/2 mouse, tablet, speaker, Power Button) with the guest's `/proc/bus/input/devices` text and udev's links (`js0` for the tablet's `-mouse` links, `usbv2-`, `platform-LNXPWRBN:00-event`); ALSA's dynamic minors (`midiC1D0` 116:2) and the guest's other nodes, `/dev/ttyS0` and `/dev/console` as the program's terminal (`ttyname(0)` answers `/dev/ttyS0`), `/dev/tty1` as the console, `/dev/dmmidi1`, `/dev/amidi1` and `/dev/admmidi1` as raw MIDI ports, and `js0`, every ALSA control, PCM, hwdep and timer node, the OSS nodes of cards 1 and 2, `/dev/uinput` and `/dev/tty2` to `tty63` uncovered; `/dev/tty0` 0600 with tty1's getty's termios and its `KD*` and `VT_GETSTATE` answers; the tablet's five buttons and hid-input's keymap; lock-key LEDs inside the release packet; 7.2's atkbd keymap (F13 to F24); the serial line's termios as agetty leaves it (no `ECHOCTL` or `IEXTEN`, `IXOFF`, `IMAXBEL`, 9600 baud with `HUPCL` and `CLOCAL`), with `echoControl` in the terminal mode; raw MIDI's `PVERSION` 2.0.5; the mixer's name `QEMU Generic` and its count from 14; `CHANNELS` −1 `EINVAL`; a fragment the plugin buffers cannot take `ENOMEM`; negative `GETOSPACE` fragments; `smem_len` unrounded. Core suite 3,478 passed and 2 skipped, `tsc` clean; wasm `95a6717f…`, reproducible.
- **Panning, decided by the owner**: a pan waits for the next vertical blank on Program time, a pan to the page shown too, and `FBIOPUT_VSCREENINFO` with a change for the second, as 7.2's atomic commits do; the Documentation, the Lecture and the bouncing-ball and keyboard-control Examples teach "draw, then pan".
- **The editor**: `X86Input` sends `BTN_SIDE` and `BTN_EXTRA` for the browser's back and forward buttons, which a focused Screen keeps from navigating; the Terminal's echo follows `ECHOCTL`; the device table follows 7.2's `sound/asound.h` (`SNDRV_RAWMIDI_VERSION` 2.0.5, `tied_device`); the Log names the new uncovered nodes; the tests that named event numbers use the guest's.
- **Compared again**: `core-run.mjs` now runs the events section too, injecting what `guest.py` injects through QMP as `sendInputReport()`, and `guest.py compare` sorts out the documented deviations: 1,458 keys the same, none differing undocumented (it was 401 before), the event stream equal but for QMP's relative motion to the PS/2 mouse.

### Review fixes, the editor's half (2026-10-31)

An independent review of the implementation, its editor findings fixed: a Testcase's output goes through as written again (the adapter switches the Terminal to a pipe's output for a Testcase, beside the Core's own processing); `X86Input` counts only reports a program received, so the first move after a Build carries both axes; `framebufferPresent` only marks the page presented, and the Screen reads it at most once a slice end or wait, when an instruction ran or a page was presented since (a 3,000-pixel `fsync` loop: 621 ms and 3,002 reads before, 15 ms and 2 after, under Node); the Terminal's escape reader parses a rewritten last line again from its start, not the whole transcript; raw mode hands the line being edited and a line not yet given to the Core over, after the system call or Undo that changed the termios has returned; raw mode's standing read leaves a focused Screen the keyboard; widths round down to a multiple of 8, as CVT does. The Documentation, the Examples and the agent prompt check for two framebuffer pages, give the speaker's range as exclusive, state the fragment sizes the device gives (4 × 512 bytes for `0x0004000A` at the default format, 4 × 4,096 for `0x0004000B` at 22,050 Hz 16-bit mono), and name `REL_WHEEL_HI_RES`, the silent PS/2 mouse and OSS 4's format names.

After M0 and the review's fixes (2026-11-01, at 6584610e and Core 9032401): the full editor suite 7,064 passed and 5 skipped, with three first-in-file DOM tests (`embedLanguage`, `examGuards`) timing out on a cold compile only when the module cache is off (they pass with it, twice); `svelte-check` 0 errors; Oxlint, ESLint, `vp fmt --check` and both generators' `--check` clean; the Core suite 3,481 passed and 2 skipped (one vitest worker RPC timeout under load, no failing test), `tsc` clean; the Runtime library's native test passed and its corpus 614 passed on the RARS, MARS and x86 Cores; against the pinned guest 1,458 values the same and no undocumented difference.

### Left

- **The reference's open questions** (x86-reference-guest.md, "Not checked"): KVM timings, other `video=` sizes, Linux 6.12 itself.
- **The release**: `@specy/x86` 8.0.0 (bump, CHANGELOG heading, tag, publish) from the Core's `feat/devices`, then the editor's pointer and the PR.
- **Undo and type-ahead's echo**: Undo of an instruction that wrote to the Terminal before a key was typed during a poll takes the key's echo off the transcript, which the Terminal restores by length, while the Core keeps the key ([x86-devices.md](./x86-devices.md), "The Terminal's modes", the known limitation of 2026-10-31).
- Small follow-ups found while building: names from the NASM include files get no completion, hover or go-to-definition; the MIDI port shares one substream across opens; a grab of the speaker device during a `KDMKTONE` tone does not hold back the tone's end; `devices.test.ts` still stages the `.inc` files beside the Entry.
