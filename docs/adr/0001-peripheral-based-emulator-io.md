# Peripheral-based emulator I/O

All emulator I/O goes through **Peripherals** owned by the Emulator — starting with a single `Terminal` peripheral that owns stdout and input requests — instead of per-core ad-hoc handlers (s68k interrupt switch, MARS/RARS sync handler maps, x86 stdout callbacks) or a bare "waiting for input" flag on the emulator. We chose this because the same abstraction has to serve four different core input models (async pausing, sync-only callbacks, scripted testcase input) and future devices (screen, keyboard), and a Terminal with swappable **input sources** covers all of them without the unified `GenericEmulator` class knowing any core's dialect.

## Consequences

- The Terminal exposes a single async input path (in-app Prompt store). It originally also had a sync path (blocking `window.prompt`) because the MARS/RARS-derived cores required their handlers to return synchronously, guarded by an exam mode: a blocking prompt freezes the event loop, so exam monitoring dies and a student can leave the screen unmonitored and resume later. `@specy/mips` / `@specy/risc-v` v2 accept promise-returning handlers and suspend the pending `step`/`simulate*` until they settle, so the sync path and the exam-mode guard on it were both removed. The one blocking call left is `Terminal.alertSync`'s `window.alert`, backing the output-only `outputDialog` syscall; it takes no input, so nothing waits on the user to type.
- Testcase input is not a special case: running a testcase swaps the Terminal's input source from interactive to a scripted list.
- Interactive answers are echoed into the Terminal's output (the typed text plus the Enter that submitted it), like a tty; scripted input is not echoed, like piped stdin — which also keeps testcase expected-output assertions independent of the input list.
- Peripherals are emulator-owned for now (no injection API). A future caller-injected setup — e.g. a terminal widget replacing the modal-based async input — plugs in as a new interactive input source, which is why that seam exists.

## Considered options

- Per-core handler wiring in each adapter (status quo): four divergent I/O paths, exam-mode enforcement duplicated per emulator, testcase input duplicated per emulator.
- A generic `waitingForInput` flag + stdout string on the emulator: enough for today's UI, but every future device would grow another one-off field.
