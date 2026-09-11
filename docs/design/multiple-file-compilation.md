# Multiple-file compilation and the FileSystem peripheral

Design interview started on 2026-09-08 using `grill-with-docs`. The owner confirmed shared understanding and the adjacent-Core scope on 2026-09-08. Implementation is authorized; the accepted decisions below are its requirements.

Implementation update on 2026-09-11: the application now uses the common Files/Entry model throughout and supports multi-file assembly for every assembly Target. The x86 package accepts a virtual Project and lets NASM resolve `%include`/`incbin` from the staged text and binary Files. MIPS and RISC-V expose runtime file operations. The editor uses persistent per-file models and a custom overlay sidebar; source locations, diagnostics, highlights, generated instructions, history, stack frames, and navigation retain File identity. Project archives, exact byte storage, the 16 MiB/4,096-File live limits, testcase isolation, Debug-session locking, and coordinated file-operation Undo are implemented as accepted below.

## Requested scope

- Implement the integration described by the root [M68K handoff](../../s68k-2-handoff.md) and [MIPS/RISC-V handoff](../../risc-v_mips-handoff.md).
- Replace the internal single-source model with support for multiple project Files across compilation and its consumers.
- Introduce an injectable `FileSystem` Peripheral that gives Emulators access to the same reactive Files as the editor. The intended environment allows files to be read and changed by a running program as well as used for compilation.
- Include a new, custom filesystem sidebar, following the owner's scope expansion during the interview. It is separate from the existing layout Sidebar and absolutely positioned over the editor rather than reserving horizontal space; a longer-term layout redesign remains for later.
- Include byte access and binary persistence under the hood without treating every File as assembly source. C compilation and binary editing UI remain for later.
- Defer new guest commands that invoke a host compiler or launch/replace programs; builds continue through host callers such as the editor, tests, and existing Emulator APIs.

## Existing decisions to carry forward

[The project format](./project-format.md), [ADR 0013](../adr/0013-project-is-a-record.md), and the [glossary](../../CONTEXT.md) already establish:

- A Project is a record. Only its Files are visible to assembly and the program; Settings and Testcases remain separate.
- The Entry file starts assembly. Other Files are reached through includes or remain outside the build; selecting a displayed file is a separate choice.
- Stored Files contain a string plus an encoding. Only `plain` is currently accepted; `base64` was anticipated for binary storage.
- Stored paths are case-sensitive and root-relative, with `/` separators and no empty, `.` or `..` segments. The original filename-extension requirement is superseded by the accepted filename rule below.
- Project changes follow the autosave preference and whole-project dirty checking. The current UI wires saving through particular editing events; sharing reactive Files alone does not establish runtime-write saving behavior.

## Checked in the current checkout

| Area                     | Finding                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project storage          | `Project.svelte.ts` holds a reactive Files map and Entry file, while its `code` convenience still returns only the Entry file's content.                                                                                                                                                                                                                        |
| Shared emulator boundary | `GenericEmulator` owns `_code`; constructors, `_compile`, `_checkCode`, and compile overrides take strings. Instructions and current execution state identify lines without file paths.                                                                                                                                                                         |
| Editor integration       | The project component binds one `code` string and calls `emulator.setCode(code)`. The generic setter schedules live checking.                                                                                                                                                                                                                                   |
| M68K                     | The editor pins s68k 1.4.2. Its handoff describes 2.0 assembly from `{ files, entry }`, text and byte inputs, and locations throughout diagnostics, instructions, breakpoints, history, and stack frames. The handoff also has a later note changing `simhalt` to pause; current upstream behavior and package availability need verification before migration. |
| MIPS and RISC-V          | The editor depends on 2.1.0. Their v3 handoff requires a text Source Set and explicit Entry file, snapshots sources at construction, and adds file identity to diagnostics and generated statements. Only the Entry file's include closure is assembled.                                                                                                        |
| Z80                      | The installed core accepts a string or a map of text and byte Files, with an `entryPathname` option and file-aware source locations. The adapter currently calls `assemble(code)` and keeps one source-line array.                                                                                                                                              |
| x86                      | The package now exposes `compileProject`/`checkProject`, stages text and binary Files in Emscripten FS, and lets NASM resolve `%include`/`incbin` natively with File-aware diagnostics and DWARF locations.                                                                                                                                                     |
| Runtime file access      | MIPS and RISC-V adapters have `openFile`, `readFile`, `writeFile`, and `closeFile` callbacks wired to unimplemented handlers. Assembly input support and runtime file access are separate capabilities.                                                                                                                                                         |
| Peripheral lifecycle     | Peripherals can be supplied at the Emulator boundary. Screen Undo restores effects alongside CPU instructions; this does not yet decide FileSystem Undo or persistence.                                                                                                                                                                                         |

Evidence: [Project model](../../src/lib/Project.svelte.ts), [base contract](../../src/lib/languages/BaseEmulator.svelte.ts), [generic emulator](../../src/lib/languages/GenericEmulator.svelte.ts), [project component](../../src/routes/projects/[project]/Project.svelte), [peripheral injection](../../src/lib/languages/peripherals/peripheralSet.ts), [Z80 adapter](../../src/lib/languages/Z80/Z80Emulator.svelte.ts), [MIPS adapter](../../src/lib/languages/MIPS/MIPSEmulator.svelte.ts), [RISC-V adapter](../../src/lib/languages/RISC-V/RISC-VEmulator.svelte.ts), and the installed `@specy/z80/dist/index.d.ts`.

## Accepted: source changes during execution

Accepted by the owner on 2026-09-08.

Scenario: Build reads `main.asm` and `lib/helper.asm`. While that program runs, it uses the FileSystem to overwrite `lib/helper.asm`.

The change immediately belongs to the shared project Files, while execution continues using the original Build. The running program and its source locations retain that Build snapshot. A subsequent Build sees the new content. This requires the debugger to distinguish built source from current file content; source navigation using the Build snapshot is accepted below.

File operation Undo, Stop behavior, and saving runtime changes to project storage are decided below.

## Accepted: instruction Undo for file operations

Accepted by the owner on 2026-09-08; recorded in [ADR 0015](../adr/0015-restore-file-operations-on-undo.md).

Scenario: a program appends `hello` to `log.txt`, then the user undoes the append instruction. Should the appended text disappear as part of the same Undo?

Restore file operations alongside their CPU instruction, including file contents and open-file state such as descriptors and positions. Otherwise, undoing and repeating a file operation can duplicate output or use a descriptor or read position from the wrong point in execution. This follows the existing rationale for restoring Screen effects, with additional journal memory and bookkeeping costs.

Byte-diff history, a memory budget, its overflow policy, and exclusive access until Stop are accepted below; the initial resource profile sets the separate FileSystem Undo budget to 64 MiB. Saving restored file content follows the rule accepted below.

## Accepted: exclusive file writes during execution

The owner specified on 2026-09-08 that the editor must be read-only during execution, so only the executing program controls changes to the FileSystem. Its instruction Undo remains responsible for restoring its own file operations, as accepted above. This restriction applies to all host file edits, including future file creation, replacement, rename, and deletion controls, rather than only typing in the source editor.

Pauses and input waits retain an executable program and therefore retain the editing restriction. Live FileSystem changes made by the program still update the reactive Project Files, while debugging continues to use the Build snapshot.

The subsequently accepted Debug session lifetime below extends this restriction through program exit and runtime errors until Stop, preserving safe instruction Undo after termination wherever supported.

The previous proposal to let manual edits establish an instruction Undo boundary was not selected; the owner chose to prevent competing edits during execution.

Current-code clarification: the editor is already read-only while `canExecute && !terminated`, and also when showing compiled-code overrides. After termination, the project passes `executionDisabled` to the controls, which disables the main Undo button as well as Run and Step. However, the History panel's `Undo to here` button still calls the generic emulator's `undo()` method without a termination guard; that method can retain usable history. The current callers therefore do not enforce a consistent boundary between editing and Undo. The new FileSystem lifecycle must enforce the chosen boundary across all callers, not just the main controls.

## Accepted: Stop and file persistence

Accepted by the owner on 2026-09-08.

Scenario: a program creates `output.bin` or overwrites a source File, and the user presses Stop.

Keep the shared Files exactly as the program and any instruction Undo most recently left them. Stop ends execution and discards its open-file state and Undo history; it does not restore the Files from the Build snapshot. This lets generated Files survive to the next Build, in keeping with the intended small-PC environment.

Saving to project storage and Testcase file isolation are decided below.

## Accepted: Testcase file isolation

Accepted by the owner on 2026-09-08.

The current Test action compiles afresh for each Testcase, applies its starting registers and memory, and supplies scripted input and a virtual clock. It has no file-state isolation yet. Reusing the interactive FileSystem would let one Testcase modify the Project and the starting files of later Testcases.

Capture the current Project Files and Entry file once when Test begins. Each Testcase builds and runs with its own writable FileSystem initialized from that same snapshot. Its file operations work normally within the case, but its changes never reach the live Project or another Testcase, including when a case fails or is cancelled.

Adding per-Testcase starting Files or expected file assertions is a separate scope decision.

## Accepted: saving program writes and instruction Undo

Accepted by the owner on 2026-09-08.

The existing project design specifies one save rule for every part of a Project: autosave when enabled, otherwise Save, with unsaved changes determined by comparing the whole Project. The current UI triggers saves from individual editing events; observing reactive Files alone will not make program writes persist.

Interactive program writes and file changes restored by instruction Undo follow that same rule. With autosave on, save the current Files through the ordinary save mechanism, allowing rapid changes to be combined as editor changes are today. With autosave off, the changed Files remain unsaved until Save. Testcase Files are isolated and never participate in Project saving.

In particular, an interactive program overwriting its own source may have that new source saved while it continues to run the original Build snapshot.

## Accepted: binary support in this implementation

Accepted by the owner on 2026-09-08.

The owner described binary Files and C source as future needs. However, the installed MIPS and RISC-V runtime file callbacks already exchange byte buffers, Z80 accepts binary assembly inputs, and the M68K handoff includes `incbin`. A FileSystem restricted to text cannot preserve arbitrary program-written bytes. The project format anticipated `base64` storage, but currently accepts only `plain`.

Include byte reads and writes and lossless binary persistence in this implementation, using the existing `{ encoding, content }` storage shape with `plain` for text and `base64` for binary Files. Keep C compilation and binary editing UI for later. This gives the runtime file callbacks and supported binary includes a usable foundation now.

Text-to-byte encoding, preservation of invalid UTF-8 writes, and recovery after subsequent writes are decided below. The in-memory representation remains a separate decision.

## Accepted: text encoding at the FileSystem boundary

Accepted by the owner on 2026-09-08 after clarifying the behavior of accented Latin letters; recorded in [ADR 0016](../adr/0016-utf8-for-filesystem-text.md).

The stored `plain` encoding currently means a JavaScript text string; it does not yet specify the bytes a program receives when reading that File. `base64` is a storage representation for binary bytes, not a text character encoding.

Checked locally: Z80's installed `InMemoryFileSystem` uses `TextEncoder` to turn text into bytes. The M68K handoff and the adjacent s68k checkout use Latin-1 for character literals and for `incbin` applied to a text File. Binary `incbin` preserves the supplied bytes. These are distinct contracts that cannot be assumed to agree for non-ASCII text.

The shared FileSystem uses UTF-8 for text-to-byte access regardless of the target architecture, while binary Files preserve exact bytes. For example, reading the text `è` yields `C3 A8`. Architecture-specific character literals and terminal conventions remain their own contracts; M68K's literal `è` still yields `E8`, and printing a UTF-8 text File through a Latin-1 terminal would require conversion for non-ASCII characters.

The M68K assembler's current text `incbin` behavior requires a compatibility update to meet the exact-byte rule accepted below. Preservation of invalid UTF-8 writes is also decided below.

UTF-8 and Latin-1 agree on ASCII (unaccented `A-Z`/`a-z`, digits, ordinary punctuation and control characters), but differ for accented Latin letters such as `è` and `ñ`. A local byte-conversion check confirmed that `Hello` has identical bytes, while UTF-8 `è` is `C3 A8` and displays as `Ã¨` if each byte is interpreted as Latin-1. Reading the bytes succeeds; interpreting them as characters or counting one byte per character is where the difference matters. The owner accepted UTF-8 with this distinction understood.

## Accepted: invalid UTF-8 writes to text Files

Accepted by the owner on 2026-09-08.

Scenario: a program writes the byte `FF` into `main.asm`, leaving content that cannot be decoded as UTF-8 text.

Allow the write, preserve every byte, and store the resulting File with `base64` encoding. Its path remains unchanged. The current execution continues against its Build snapshot, but a subsequent Build that requires this File as text reports an unreadable-text diagnostic. A text view must not silently replace invalid bytes or show the base64 storage string as source. Instruction Undo restores the original file contents and storage encoding together.

Storage encoding for newly created Files and recovery when later byte writes produce valid UTF-8 again follow the rule accepted below.

## Accepted: recovering text after byte writes

Accepted by the owner on 2026-09-08.

Scenario: a program writes a UTF-8 character in two operations. A file containing just `C3` is not valid UTF-8 and is stored as `base64`; appending `A8` completes `è`. Generated source Files can likewise pass through temporarily invalid contents before becoming valid source text.

After a byte write, choose `plain` when the complete resulting bytes can be decoded and re-encoded as UTF-8 without changing any byte, and `base64` otherwise. Apply the same rule to newly created Files. This lets repaired and program-generated source become text automatically, without a separate guest operation to convert its file type. A binary data file whose contents happen to be valid UTF-8 may consequently use `plain` storage, but byte reads must still return exactly its original bytes.

Storage encoding is a representation choice, not a declaration of a File's purpose; file consumers must request the text or bytes they need. A representation change must not change embedded bytes; the M68K `incbin` rule is accepted below.

## Accepted: exact bytes for M68K `incbin`

Accepted by the owner on 2026-09-08, including the need to adapt s68k's current text-`incbin` behavior.

Scenario: a data File contains UTF-8 `è` (`C3 A8`). The same bytes can be stored as `plain` text or as `base64`. The current s68k core embeds text `è` as the Latin-1 byte `E8`, while embedding a binary input preserves `C3 A8`. Passing through the storage representation would therefore let automatic encoding changes alter the assembled program.

`incbin` embeds the exact bytes exposed by the FileSystem, independently of storage encoding. Text `è` therefore embeds `C3 A8`; a character literal such as `dc.b 'è'` retains M68K's own `E8` semantics. This makes `incbin` agree with runtime byte reads.

Integration requirement: the current s68k API supplies one text-or-bytes value per path and has no separate `incbin` encoding option. Supplying a path only as bytes prevents using it as an ordinary source include, so a complete solution requires compatible s68k support for the desired distinction between source text and raw file bytes. Account for this dependency requirement when planning the migration, including a File used both as source and raw data.

## Accepted: filenames without extensions

Accepted by the owner on 2026-09-08.

The previous glossary and current project path validator require a filename extension; names such as `README`, `program`, and `.config` are rejected by the current code. The MIPS/RISC-V v3 Source Path rules do not require extensions. A general FileSystem and future C-generated programs can reasonably use these names.

Remove the extension requirement and allow filenames without extensions, including dotfiles. Keep canonical stored paths root-relative, case-sensitive, and `/` separated, with no empty, `.` or `..` segments or control characters. A new Project can still use its existing `main.<ext>` default; the extension is not a prerequisite for a File to exist.

Runtime path resolution and implicit directory semantics are decided below.

## Accepted: runtime path resolution

Accepted by the owner on 2026-09-08.

Scenario: the Entry file is `src/main.mips`, and an instruction opens `data/input.txt`. The FileSystem must define the base used to resolve that path independently of whichever source File contains the executing instruction.

Runtime file access resolves relative paths from the Project's virtual root. `data/input.txt` and `/data/input.txt` refer to the stored key `data/input.txt`; `.` and `..` are normalized without permitting traversal above the virtual root. The runtime directory does not change as execution enters included source Files. Assembly includes retain the language Core's own resolution rules, including paths relative to the including File.

A program-controlled working directory remains a separate scope decision. Implicit directory creation is decided below.

## Accepted: implicit directories for runtime file creation

Accepted by the owner on 2026-09-08.

The existing project format stores only Files. Directories are implicit in their paths, with no empty-directory records. The installed MIPS/RISC-V callback surfaces expose file open, read, write, and close, but no directory-creation operation.

Scenario: a program creates `output/results.bin` when the Project has no Files under `output/`.

Retain implicit directories in this implementation and allow creating the nested File directly. Its parent directories appear through its path, and disappear when no Files remain below them. A path cannot be both a File and a directory: if `output` is already a File, creating `output/results.bin` fails. Listing directories can be derived from the Files map.

Persistent empty directories and explicit directory creation are outside this implementation's scope.

## Accepted: removing the configured Entry file

Accepted by the owner on 2026-09-08; recorded in [ADR 0017](../adr/0017-entry-path-can-name-a-missing-file.md). The glossary distinguishes the configured **Entry path** from the **Entry file** found there when it exists.

The previous project-format invariant said that `entry` always names a File that exists. The current normalizer repairs missing entries by choosing another File and populates an empty Files map with default source. Runtime deletion and rename require revising that behavior.

Scenario: a program deletes `main.asm`, or renames it to `generated.asm`, while `main.asm` is the Project's configured Entry file.

Allow the file operation and retain the configured Entry path. The current execution continues from its Build snapshot, and the next Build reports the missing Entry file until the original path is restored or the user selects a different entry. File operations must not silently choose another build target or recreate a deleted File. Instruction Undo can restore the affected Files.

Loading, saving, export, and the editor's missing-entry presentation must preserve this state rather than repair it away, including an explicitly empty Files map after deletion. This does not remove the default source File from new Project creation or the conversion of legacy code-only projects.

## Accepted: runtime file I/O scope by architecture

Accepted by the owner on 2026-09-08.

Current evidence separates multi-file assembly from program-level file operations:

| Architecture                    | Multi-file assembly                                                                   | Runtime file access in the inspected interface                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MIPS and RISC-V, including RV64 | Supported by the v3 handoff.                                                          | Existing open/read/write/close callbacks are unimplemented in the editor and can be connected to the FileSystem, subject to the descriptor and Undo checks below. |
| M68K                            | Supported by the 2.0 handoff, with the accepted `incbin` compatibility requirement.   | The adjacent s68k Core's Interrupt and InterruptResult types have no file operations; guest access requires additional trap support.                              |
| Z80                             | Supported by the installed Core.                                                      | The adapter's port map has no file commands; guest access requires designing a filesystem port protocol.                                                          |
| x86                             | The public compiler now accepts a virtual Project and NASM resolves its staged Files. | Guest runtime file access is still separate; sharing reactive runtime writes and restoring file operations on Undo requires another integration.                  |

Inject the shared FileSystem into every Emulator and implement multi-file assembly for M68K, MIPS, RISC-V, and Z80. Wire program-level file I/O for MIPS/RISC-V in this change. New M68K file traps and the Z80 filesystem port protocol remain deferred. The later x86 package integration now supplies native multi-file assembly; guest runtime filesystem access remains separate.

The FileSystem's common operations and semantics remain available under the hood independently of which guest instruction interfaces are connected in this first implementation.

## Accepted: file-aware navigation and an overlay sidebar

Accepted by the owner on 2026-09-08, with an explicit scope expansion to include the filesystem sidebar originally excluded from this change.

Current evidence: the project displays one code buffer. Execution highlights, breakpoint clicks, stack-frame navigation, history navigation, decorations, and diagnostics use line numbers without a file identity. The editor uses one Monaco model and applies external text changes with `executeEdits`; swapping file contents through that mechanism alone would mix file edit histories. Diagnostics currently render as console text rather than clickable source links.

Scenario: stepping enters an instruction from `lib/helper.asm`, while the editor is displaying `main.asm`. Highlighting the instruction's line number in the current buffer would identify unrelated source.

Retain one visible editor, display its current file path, and allow source navigation to switch the displayed File. Step, instruction Undo, and execution stops should reveal the appropriate source File; continuous Run need not switch buffers for every instruction. Explicit diagnostic, stack-frame, and execution-history navigation should also select the relevant File. Debugging views use the read-only Build snapshot, while ordinary editing after Stop uses the current Project Files. File identity must accompany selected and highlighted lines, source locations, and breakpoints throughout the codebase, and switching Files must keep their editor models and text Undo histories separate.

Include the filesystem sidebar now. Its initial layout is an absolutely positioned overlay within the editor area, not a permanent column that reduces editor width or a viewport-wide fixed panel. Horizontal space is limited; a more developed layout is deliberately deferred. The owner explicitly requires a new, custom file sidebar: do not reuse or repurpose the existing shared layout Sidebar, which serves page layout.

Choosing the displayed File remains separate from choosing the Entry path. The previously accepted missing-file and unreadable-text rules still apply when showing current Project Files. The sidebar's file-management controls and inspection of live program output alongside snapshot source are accepted below.

## Accepted: initial sidebar file-management controls

Accepted by the owner on 2026-09-08, with the explicit requirement to build a new custom file sidebar rather than reuse the layout Sidebar. Current Project storage contains multiple Files; the existing project editor still binds only the Entry file's text and does not provide a file tree or individual-file management controls.

Include browsing/selecting Files, creating text Files, renaming or moving a File by changing its path, deleting Files, uploading individual text or binary Files, downloading individual Files as exact bytes, and explicitly choosing the Entry path. Directory grouping follows the accepted implicit-directory model; no empty-directory creation or binary editing UI is introduced. All host file mutations and Entry path changes are disabled during execution, including pauses and input waits; browsing and downloading remain available.

Selecting a File to display does not change the Entry path. File mutations made through these controls follow the same Project saving rules as other host edits.

## Accepted: inspecting live Files during debugging

Accepted by the owner on 2026-09-08.

The accepted design preserves original source in the Build snapshot while program writes change the live Project Files. Now that file browsing is in scope, the editor needs to distinguish inspecting the current FileSystem from navigating the source of the running program.

Scenario: a paused program has created `output.txt` and overwritten `lib/helper.asm`. The owner needs to inspect the output and changed source without mistaking them for the original source associated with the next instruction.

The sidebar lists the live Project Files and selecting a File there opens its current contents, read-only during execution. Debugger navigation (Step, instruction Undo, execution stops, stack frames, history, and Build diagnostics) opens the corresponding Build snapshot source instead. Clearly label the displayed version as `Live file` or `Build snapshot`. Do not apply snapshot execution highlights or other snapshot line markers to changed live contents. A snapshot File remains reachable through debugger navigation even if the program deleted or renamed its live counterpart; it is not recreated in the live tree. Runtime-created Files can be inspected immediately through the live sidebar, subject to the accepted binary-view limitation.

This refines the previously accepted snapshot-based debugger navigation without weakening the exclusive execution-write lock. Browsing live contents does not change the Build snapshot, and neither view permits host edits during execution.

## Accepted: byte-diff FileSystem Undo with a memory budget

Accepted by the owner on 2026-09-08: retain diffs instead of whole-file snapshots for ordinary changes, and keep a memory budget for that history. The overflow behavior and initial numerical default were subsequently accepted below.

Current evidence: Project Settings default to 100 Core Undo steps and a separate 64 MiB Screen history budget. Screen history evicts its oldest inverse records when over budget. M68K and Z80 preflight the next complete instruction before rolling back the CPU and Screen, so they stop at a missing peripheral-history boundary while retaining the ability to Undo later unaffected instructions. MIPS/RISC-V currently check only their Core's `canUndo`; FileSystem integration must extend that preflight.

Scenario: a program repeatedly overwrites a large File. A step-count limit alone does not bound the memory retained to restore the overwritten contents. Conversely, changing descriptors or read positions still needs Undo records even when no file bytes change.

Use byte-level inverse patches, suitable for both source text and arbitrary binary data, grouped with the metadata changes belonging to the same CPU instruction. An overwrite retains the old bytes of changed ranges; an append can restore the previous length without retaining appended bytes. Truncation retains the removed tail, and deletion must retain the removed content or an immutable reference that keeps it available. Creation can be undone by removing the created File. Descriptor, cursor, path, length, and original storage-encoding changes are restored alongside the bytes, as required by the existing Undo decisions. No-op writes need no content patch, but may still change a cursor or other metadata.

The journal must not retain a complete prior File or Project snapshot for every small write, nor use text-line diffs for byte operations. Whole-file replacement can compare the affected bytes to avoid retaining unchanged regions. However, an operation that removes or changes all content can require an inverse as large as the previous File; diffs reduce common-case storage without removing the need for a budget.

Apply the budget to retained inverse data and bookkeeping, including backing allocations kept alive by retained references, not merely the visible length of a small buffer view. This budget is for Undo history, not a limit on live Files or the Build snapshot. Use a separate configurable Project Setting with the 64 MiB initial default recorded in the accepted resource profile below; validate accounting with representative workloads during implementation.

Evidence: [Project Settings](../../src/lib/projectSettings.ts), [Screen history](../../src/lib/languages/peripherals/screen/ScreenHistory.ts), [instruction preflight](../../src/lib/languages/peripherals/screen/ScreenInstructionHistory.ts), and each adapter's `_canUndo` implementation.

## Accepted: exceeding the FileSystem Undo budget

Accepted by the owner on 2026-09-08.

Scenario: a program truncates a large File to zero. Even an inverse patch must retain its removed content; that single instruction's undo data may exceed the entire history budget.

File operations still complete when their Undo data cannot be retained. Discard the oldest complete instruction groups to stay within budget, and make an individually oversized instruction a non-undoable boundary. Later instructions can remain undoable, but Undo must stop before crossing that boundary and explain that FileSystem history was exhausted. Preflight the CPU and every affected Peripheral before restoring anything, so no instruction is partially undone. A zero budget similarly disables retaining FileSystem inverses, not runtime file operations.

This preserves the program's file behavior at the cost of a shorter reversible execution history. The configurable budget's numerical default is recorded separately in the accepted resource profile below.

## Accepted: ending the exclusive debugging session

Accepted by the owner on 2026-09-08: keep the editor read-only until Stop and allow instruction Undo after exit wherever the Core supports it and retained history permits it.

Current evidence: a successful Build makes the editor read-only before execution begins. Natural termination can unlock it again, while the main Undo control and History panel disagree about whether Undo is available. Stop already remains available after termination and explicitly clears the run. See the [project component](../../src/routes/projects/[project]/Project.svelte), [main controls](../../src/components/specific/project/Controls.svelte), [History panel](../../src/components/specific/project/user-tools/MutationsRenderer.svelte), [history entry controls](../../src/components/specific/project/user-tools/MutationStep.svelte), and [generic Undo](../../src/lib/languages/GenericEmulator.svelte.ts).

Scenario: a program writes its final output and exits. Releasing host write access while permitting instruction Undo would let the old execution history overwrite subsequent user edits. Discarding Undo immediately on exit avoids that conflict but loses the opportunity to reverse the final instructions.

Keep the Debug session's exclusive write access after program exit or a runtime error until the owner presses Stop. The editor and sidebar mutation controls remain read-only, live Files and final results remain inspectable, and Undo remains available wherever the Core and retained Peripheral history can safely restore an instruction. Termination alone must not irreversibly discard descriptors or Undo state needed for reversal. Run and Step still follow the Core's executable status; keeping a session does not make an irrecoverable error resumable. Stop preserves the latest Files, discards open-file state and Undo history, and returns to ordinary editing as already accepted. Teardown must settle or invalidate outstanding execution work before returning write access, so stale callbacks cannot modify Files after editing resumes.

This extends the write lock beyond forward execution in order to preserve safe post-termination Undo; pauses and input waits already retain the lock.

Checked explanation of the current restriction: the main Undo button inherits `executionDisabled`, which includes `emulator.terminated` and also controls forward execution. The Undo shortcut and coding-agent tool wrapper independently reject termination too, while the History panel and generic Undo method do not. The MIPS and RISC-V adapters already derive termination from the next statement rather than their Core's sticky termination flag, explicitly to permit backing out of a finished program. The blanket UI restriction is therefore not evidence of a universal Core limitation; the inspected commit history does not document an exit-specific requirement for it. Give Undo a separate availability rule and apply it to the button, shortcut, History panel, coding-agent tools, and public Emulator actions, retaining genuine busy-operation, access, and complete-history guards. Verify actual exit, error, and resumed-execution behavior for each upgraded Core rather than promising every terminal state is reversible.

## Accepted: Step and Undo while paused

Accepted by the owner on 2026-09-08.

Current evidence: the Run/Pause change in commit `4b02c363` explicitly keeps Step and Undo disabled while a Run is paused. The paused run still holds `duringCoreOperation`; generic Undo returns while a Core operation is outstanding. The commit explains that enabling these controls requires serializing Core operations, otherwise Step and Resume could overlap. This is a separate, documented safety reason from the blanket post-termination Undo restriction.

Include Step and Undo during a user-requested Pause in this implementation. Park execution at a safe instruction boundary and serialize Step, Undo, and Resume so only one operation owns the Core at a time. The Debug session remains read-only and source navigation uses the Build snapshot. This does not enable rolling back an unfinished input callback or half-completed instruction; input waits remain subject to their existing safety restrictions.

This requires execution-coordination changes, not merely removing disabled flags from the buttons. The same operation-ownership rules apply to all action entry points, including shortcuts, History navigation that requests Undo, and coding-agent tools.

## Accepted: open handles across rename and deletion

Accepted by the owner on 2026-09-08; recorded in [ADR 0018](../adr/0018-open-handles-survive-path-changes.md).

Current evidence: Project Files are stored by path, while MIPS/RISC-V runtime callbacks use numeric descriptors after opening a filename. Those callbacks expose only open, read, write, and close, not rename or deletion. Host sidebar mutations are already prohibited throughout the Debug session. The following choice therefore defines the common FileSystem API and its future guest integrations; it does not add new guest syscalls to this implementation.

Scenario: a FileSystem client opens `data.txt`, and a permitted FileSystem operation later renames it to `archive.txt` or removes its path. Subsequent operations through the already-open handle must have a defined target; they must not accidentally switch to a different File later created at `data.txt`.

An open handle stays attached to the same underlying file contents across rename and deletion. Rename changes the path visible in the Files map without invalidating existing handles. Deletion removes the path from the map and sidebar, but existing handles can still access the detached contents until closed; writes through such a handle do not recreate a path. Creating a new File at the deleted or renamed path creates a separate target, not a replacement for existing handles. Only named Files participate in ordinary Project persistence; detached contents are transient and retained as needed by open handles or instruction Undo. Undo restores path associations and handle state at the same instruction boundary, subject to the accepted history budget.

This requires separating a handle's target from pathname lookup, rather than either rejecting all rename/delete operations on open Files or resolving the pathname again on every read and write. It does not introduce hard links, symbolic links, permissions, or a new guest interface.

## Accepted: `@screen` across source Files

Accepted by the owner on 2026-09-08.

Current evidence: the MIPS/RISC-V adapters read the display configuration from a single source string. The parser uses its first `@screen` comment and warns on subsequent directives. A `base=<label>` is resolved by assembling a throwaway source with a probe appended. The display controls rewrite the directive in the editor's bound `code`, which is currently also the Entry file. See [directive parsing and rewriting](../../src/lib/languages/mars/screenDirective.ts), the MIPS/RISC-V adapters, and the project component's `applyDisplay`.

Scenario: `main.mips` includes `graphics.mips`, and both contain `@screen` comments with different dimensions. The Build needs one predictable display configuration independent of which File is displayed.

Only the Entry file supplies `@screen` configuration. Preserve first-directive-wins behavior and duplicate warnings within that File; directives in included source Files are ignored with file-aware warnings rather than silently configuring the Project. An unused File does not participate in this check. If the Entry file has no directive, retain the existing Project display fallback. Its `base=<label>` may still refer to a symbol defined in an included File, resolved against the complete Build sources. Display controls target the Entry file's directive rather than the displayed File, and must respect the accepted Debug session file-write lock.

This keeps display ownership at the build entry instead of depending on include order or merging competing configurations. Label probes must use an isolated copy of the full Build sources, never mutate live Files, and preserve original source identities.

## Accepted: ZIP project archives and individual-file downloads

The owner chose a ZIP container on 2026-09-08 instead of the proposed standalone JSON project file. The `.asmproj` extension, compatible `.zip` imports, and archive layout were subsequently accepted below; recorded together in [ADR 0019](../adr/0019-zip-project-archives.md).

Current evidence: `Project.toExternal()` already includes non-entry Files in its version 2 metadata, while writing the Entry file's content above that commented metadata. `makeProjectFromExternal()` trims the source body's end and always reconstructs a `plain` Entry file from it. This cannot round-trip an absent or binary Entry file, an explicitly empty Files map, or exact trailing source bytes. The project list downloads this representation with an assembly extension. Share links, in contrast, already serialize the complete Project object. The existing serializer preserves Testcase big integers using SuperJSON when needed.

Whole-project export produces a ZIP Project archive representing all named Files, the configured Entry path, and the rest of the Project record. It must preserve missing entries, empty Files maps, binary contents, exact text, and Testcase numeric values. The sidebar's individual-file download remains the File's exact bytes without project metadata. Continue importing legacy raw source and source-plus-metadata projects, but do not interpret an unsupported or malformed new-format Project archive as assembly source. An archive does not serialize open handles, detached contents, Undo history, or other running Debug session state.

For interoperability with other educational editors, a Project whose sole File is a text-readable Entry also offers that File as a raw UTF-8 source download under its original basename. This is an explicit alternative beside the complete Project archive; it contains no ASM Editor metadata. Multi-file, binary, and missing-Entry Projects do not offer this shortcut because it would silently omit Project contents.

This separates an editor Project from a source file usable directly by an external assembler, while retaining individual-file downloads for the latter purpose. The archive's separation of Files from versioned project metadata and the migration rule for existing linked local sources are accepted below. The current File System Access save path calls `toExternal()` directly, so the implementation must not silently overwrite an existing assembly file with a different format.

Evidence: [Project serialization](../../src/lib/Project.svelte.ts), [project import and download UI](../../src/routes/projects/+page.svelte), [linked-file saves](../../src/stores/projectsStore.svelte.ts), [share payload](../../src/lib/utils.ts), and [serializer](../../src/lib/json.ts).

## Accepted: Project archive extension

Accepted by the owner on 2026-09-08, after considering whether to use a dedicated project extension or simply `.zip`. The downloaded basename continues to derive from the Project name.

Export `<project-name>.asmproj`, using an ordinary ZIP container, and accept the same valid Project archive when named `.zip`. The dedicated extension distinguishes an ASM Editor Project from an arbitrary ZIP and allows a project-specific application association where supported. The tradeoff is that generic file managers may require opening it explicitly with an archive tool or renaming it to `.zip` for manual inspection. Recognize a Project archive by its validated internal format, not merely its extension; accepting `.zip` does not mean inventing project metadata or an Entry path for arbitrary source archives.

Current integration evidence: the PWA manifest declares only text/source file associations, and both the ordinary project import and linked-file import currently read text. The shared FileImporter already supports ArrayBuffer input, so ZIP imports can use its byte-reading mode. Project-format detection, the PWA declaration, and linked binary reads/writes must be adapted consistently once the archive contract is settled.

Evidence: [PWA manifest](../../static/manifest.json), [FileImporter](../../src/components/shared/fileImporter/FileImporter.svelte), and the project import and linked-file save paths above.

## Accepted: Project archive layout

Accepted by the owner on 2026-09-08; recorded with the container and extension decisions in [ADR 0019](../adr/0019-zip-project-archives.md).

Current evidence: the Project model deliberately separates Files from its other fields, including Settings, Testcases, and Display configuration. Project paths do not reserve a metadata filename; `project.json` is a valid user File. Placing archive metadata beside virtual-root Files would introduce a collision or require a new reserved-name rule.

Place a versioned `project.json` manifest at the archive root and store the Project's actual Files under the archive-only `files/` prefix, preserving their relative paths and exact bytes.

```text
example.asmproj
├── project.json
└── files/
    ├── main.asm
    ├── lib/helper.asm
    └── assets/image.bin
```

The manifest holds Project metadata and configuration, the Entry path, and the per-file information needed to reconstruct the storage representation; file contents are ZIP entries rather than duplicate JSON/base64 payloads. For example, the virtual File `project.json` becomes `files/project.json` in the archive and does not conflict with the manifest. The archive-only prefix is stripped on import and never becomes part of emulator paths or include resolution. A Project with no named Files can still be represented by its manifest without inventing an Entry file or persistent empty directories.

This keeps metadata outside the FileSystem without reserving user filenames, at the cost of one extra directory level when inspecting an extracted archive. Import must validate the complete archive before changing a Project, rejecting unsafe paths, duplicate or colliding entries, unsupported non-file objects, and malformed project metadata rather than silently choosing or repairing contents. Archive limits remain follow-up work; the behavior of existing linked local source files is accepted below.

## Accepted: migrating linked local source files

Accepted by the owner on 2026-09-08.

Current evidence: opening a source through the native file picker or PWA launch associates its local file handle with the Project, then immediately saves metadata back to that file. Subsequent Project saves overwrite the linked file using `toExternal()` before updating browser storage. Linked-file failures are currently logged to the console while browser saving continues. A format migration must not turn those existing assembly files into ZIP data without an explicit change of destination.

Retain legacy source-plus-metadata write-back for a linked Project containing exactly one text-readable File at its Entry path. When it becomes multi-file, its entry becomes binary or missing, or its contents otherwise cannot be preserved by that legacy representation, suspend writes to the original local source and clearly offer `Save As .asmproj`. Keep browser persistence following the already accepted autosave/Save preference; make it clear that saving in the browser does not mean the linked disk file was updated. Cancelling migration leaves the original file unchanged and the current Project available in the app. Switch the linked destination only after the chosen archive has been successfully written. Linking an existing valid `.asmproj` or compatible `.zip` Project archive writes back ZIP data to that archive.

Restricting legacy write-back to a single text File is the chosen compatibility boundary, not a claim that the old metadata cannot hold additional Files. It preserves the familiar source-file workflow for simple Projects while making the archive the whole-project representation for multi-file work. It does not automatically rename or overwrite the original source, and ordinary individual-file downloads remain available.

Integration requirement: use a fixed Project snapshot for each save, serialize writes to the same linked destination, and report linked-file failures instead of implying that the disk copy is current. Browser saving and archive generation must not race so that an older write replaces a newer Project state; rapid runtime changes may be coalesced as already accepted.

Evidence: [Project store saves](../../src/stores/projectsStore.svelte.ts), [native picker and PWA launch imports](../../src/routes/projects/+page.svelte), and the existing legacy serializer in [Project](../../src/lib/Project.svelte.ts).

## Accepted: guest-requested compilation and program launch are deferred

Accepted by the owner on 2026-09-08.

Current evidence: the owner described the Emulator as a small PC that can compile, run, read, and change Files. The handoffs add source-set assembly APIs for host callers, while the inspected runtime file callbacks expose open/read/write/close, not a service to invoke the host assembler or launch another program. The checkout has an `AvailableProgrammingLanguages = 'c'` editor type, but the inspected build path selects assembly Emulators by `AvailableLanguages`; no C compiler integration was found there. C compilation is also deferred.

Scenario: a running MIPS program writes `generated.mips`. The accepted FileSystem rules make that File available to a subsequent Build; they do not by themselves define a guest command to compile it, replace the current program, or launch a second one.

Keep Build and program launch initiated by host callers such as the editor, tests, or existing Emulator APIs in this implementation. Use the common FileSystem and Entry path snapshot at that boundary so the same foundation can support future compiler services. Programs can read and write Files through the accepted guest interfaces, including generated source, but new guest requests to invoke a host compiler or launch/replace a program remain for a later change. This does not prohibit computations a program can already perform through ordinary guest instructions; it defers new host-provided compilation and execution services.

This avoids implicitly adding a process model or compiler service to the file-I/O migration. The accepted distinction between target architecture and individual File languages is recorded below, independently of this service scope.

## Accepted: Project Target versus File language

Accepted by the owner on 2026-09-08.

Current evidence: `Project.language` selects the Emulator and its architecture-specific assembler/runtime environment, while the single Editor also receives that same value for syntax support. The glossary previously said a Project has "one language," which is ambiguous once its Files may contain assembly, C, text data, or binary contents. The editor type already distinguishes `c` from the architecture choices, but that does not provide a C build pipeline.

Call the Project-level choice its **Target**, comprising the selected architecture and its supported assembler/runtime environment. Keep it independent of each text File's language or editor syntax mode. A MIPS-targeted Project can therefore contain MIPS assembly, `.c` and `.h` text, notes, and binary data without changing Emulator when a different File is selected. Future C compilation targets that same machine; C is not a new Emulator architecture. File language and storage encoding remain separate concepts, and merely changing a filename or editor syntax mode does not select a different target or install a compiler.

In this implementation, the existing target assembler builds from the Entry path and its include closure; adding a `.c` File does not translate C or automatically add a compilation unit. Architecture selection and file syntax must be separate internal contracts, while preserving the existing persisted `language` field for compatibility rather than forcing a storage-key rename. Source selection, generated artifacts, and C-to-assembly debug mapping can be added by a later build pipeline without replacing the shared FileSystem or file-aware location model.

This clarifies the current project-level architecture choice rather than adding a target-switching UI, C compiler, or multi-target build system.

Evidence: [Project language types](../../src/lib/Project.svelte.ts), [Emulator selection](../../src/lib/languages/Emulator.ts), and [Editor syntax language](../../src/components/specific/project/Editor.svelte).

## Accepted: FileSystem resource limits

Accepted with amendment by the owner on 2026-09-08: "make it 16mb file limit for now." This changes the proposed total live-file capacity from 64 MiB to 16 MiB; the separate 64 MiB Undo budget and 4,096-File limit remain unchanged. The live-data limit is for the whole FileSystem, not a separate 16 MiB allowance for every File.

Current evidence: no explicit total-file-byte or file-count limit was found in the inspected Project model, importer, or Project store. The accepted Undo policy bounds retained inverse operations, not the live FileSystem or the work of extracting a Project archive. A small compressed ZIP can also expand beyond a safe live-file size.

Initial resource profile:

- Limit live FileSystem contents to 16 MiB (16,777,216 bytes) and 4,096 Files. Count actual UTF-8 or binary bytes rather than JavaScript string length or base64 character count. Count detached-but-open Files as well as named Files so deleting an open path does not bypass capacity. Count a File once regardless of its number of handles; data retained only for Undo belongs to the separate history budget.
- Start the FileSystem Undo budget at 64 MiB, independently configurable using the accepted history-budget behavior. The already accepted zero-budget and eviction semantics are unchanged.
- Reject capacity-exceeding mutations before applying any part of them, with a clear host error or the guest interface's supported failure behavior. Unlike Undo-budget exhaustion, live-capacity exhaustion cannot let the operation proceed. Adapter error propagation needs verification because the current Core callbacks do not uniformly return I/O status.
- Enforce import bounds during extraction against actual expanded bytes and entry counts, not just compressed size or declared ZIP lengths. Bound metadata, paths, and archive overhead separately so an archive containing the maximum permitted file contents can still round-trip. Imported settings must not raise the application's import safety ceilings before validation. Validate the complete result before changing a Project.

These limits bound file payloads and retained Undo history separately, not total browser memory: strings, indexes, snapshots, compiled programs, and archive processing also consume memory. Low-level archive safety ceilings and implementation overhead accounting must be tested alongside the selected profile.

## Accepted: sidebar destination collisions

Accepted by the owner on 2026-09-08.

Current evidence: the existing Projects-page importer asks before replacing a different Project with the same ID, but the current editor does not provide individual-file create, rename, or upload controls. A Files-map assignment alone would replace existing contents without defining a user-facing conflict policy. The accepted archive validation already rejects duplicate entries within an archive; that is distinct from importing an individual File into an existing Project.

Creating or renaming a File to an occupied destination fails without modifying either File. Uploading an individual File to an occupied file path asks explicitly whether to replace that File or cancel; do not silently overwrite it or invent a numbered filename. A path colliding with an implicit Directory, or beneath an existing File, remains invalid rather than recursively replacing other Files. All validation and capacity checks happen before a replacement is committed, and cancelling leaves the Files unchanged.

This host-side confirmation policy does not add prompts to executing programs: their explicit write, append, and truncate operations retain their runtime semantics. Host file mutations remain unavailable until Stop as already accepted. Whether the shared rename operation should ever offer an explicit replacement mode is not implied by this sidebar policy.

## Accepted: rename is not source refactoring

Accepted by the owner on 2026-09-08.

Current evidence: the current Project model has no individual-file rename operation, and no file-rename/refactoring provider was found in the inspected source. The handoffs describe target-specific include syntax and resolution, not an editor operation that rewrites references. Renaming or moving a File can break references to it as well as relative includes within the moved File. Runtime filenames may also be assembled dynamically by a program, so finding textual path matches does not establish which references should change.

Scenario: `main.mips` includes `lib/helper.mips`, and the user renames that File to `lib/math.mips` through the sidebar. The configured Entry path remains `main.mips`, but its include still names the old path unless the editor also performs a source refactoring.

The sidebar rename/move changes the File's path without rewriting source contents, including include directives or runtime filename strings. The user updates affected references, and the next live check or Build reports missing includes where applicable. The already accepted Entry-path rule remains unchanged: renaming its File does not silently select another Entry path; the user explicitly chooses the new entry when wanted. File-specific editor state still needs to be handled correctly when a path changes; this decision concerns automatic source rewriting, not abandoning separate editor models or their histories.

This keeps automatic, language-aware path refactoring outside the first multi-file implementation.

## Accepted: generated-instruction presentation

Accepted by the owner on 2026-09-08. The owner also requested that the remaining interview ask only important questions to conserve usage.

Current evidence: MIPS and RISC-V currently group compiled statements solely by `sourceLine`, then show groups of more than one instruction as an inline block below that line. The Project component applies every block to its single editor buffer using the existing pseudo-instruction visibility preference. The v3 handoff supplies original paths and explicitly returns every instruction produced by a source location, including pseudo-instruction/macro expansion and repeated includes, in assembler address order. Grouping only by line would mix unrelated Files after migration.

Scenario: line 12 of `lib/helper.mips` emits two machine instructions and is included twice. There are four generated instructions associated with that one original source location; displaying only the first expansion or deduplicating equal instruction text would hide part of the program.

Retain the existing optional inline expansion view, keyed by File path and source line within the Build snapshot. Show every generated instruction for that location in assembler address order, with its address, and distinguish the current instruction using the program counter rather than source line alone. Repeated include occurrences remain visible even when their instruction text is identical. An ordinary line producing only one machine instruction need not gain an inline expansion block. Do not attach these blocks to a different File or to changed live text; follow the accepted snapshot-view rules.

This adds no new permanent generated-code panel and does not decide breakpoint stop granularity. Keep the source-to-instructions relationship one-to-many under the hood regardless of whether inline expansion display is enabled. Core-supplied source identity and expansion/include details must not be discarded merely to fit the current presentation.

Evidence: [MIPS compiled-code decorations](../../src/lib/languages/MIPS/MIPSEmulator.svelte.ts), [RISC-V compiled-code decorations](../../src/lib/languages/RISC-V/RISC-VEmulator.svelte.ts), [Project editor view zones](../../src/routes/projects/[project]/Project.svelte), and the root [MIPS/RISC-V handoff](../../risc-v_mips-handoff.md#source-location-statement-lookup).

## Integration checks discovered during the interview

- The adjacent MARS/RARS sources forward runtime filenames into their JavaScript I/O callbacks without resolving them against source-file directories. Their `SystemIO.openFile` also allocates a Core-side descriptor and ignores the callback's returned descriptor. Integration must verify descriptor identity, errors, cleanup, and restoration of the Core-side open-file state during Undo, rather than assuming that a peripheral-only descriptor table is sufficient.
- The MIPS `SyscallOpen` source constructs its filename one memory byte at a time through character casts. Verify non-ASCII runtime pathname handling separately from UTF-8 file content; canonical Source Set paths alone do not establish that a program can open those same names correctly.
- The adjacent MARS and RARS simulators call `SystemIO.resetFiles()` on completion, clearing their descriptor tables. Supporting post-exit Undo with file operations must account for that cleanup as well as exit status, restoring or preserving the Core-side state needed for reversal. Keeping only the editor's file bytes or re-enabling the button is not sufficient.
- The adjacent MARS/RARS descriptor tables reject a second open of the same raw filename before invoking the callback. Do not infer that every guest can open multiple handles to one File, or that normalized path aliases are already treated identically by those tables. Verify these Core restrictions separately from the common FileSystem handle model.

## Accepted: adjacent Core fixes and implementation

The owner requested on 2026-09-08 that only important questions remain, then confirmed the overall design and the narrowly scoped adjacent-Core fixes below. Treat ordinary implementation choices and verification of discoverable facts as engineering work, not additional interview branches.

The accepted M68K exact-byte `incbin` contract needs compatible Core behavior, and MARS/RARS descriptor allocation, error propagation, and completion cleanup require verification for reliable FileSystem Undo. The interview inspected the adjacent repositories read-only; implementation may now make the necessary scoped changes.

Include narrowly scoped local code and test fixes in `/home/dev/code/s68k`, `/home/dev/code/mars`, and `/home/dev/code/rars` when necessary to satisfy the accepted contracts, preserving their existing work. Use compatible dependencies or local build artifacts as appropriate. This does not authorize unrelated Core rewrites, publishing packages, pushing changes, or silently weakening the agreed FileSystem behavior.

Implementation note on 2026-09-11: this project pins `@specy/s68k` 2.1.1 and both `@specy/mips` and `@specy/risc-v` 3.2.0. Earlier 3.0.0 bundles needed postinstall patches: the published RISC-V bundle declared `readFile` but omitted its JavaScript bridge and read-syscall branch, and both MARS/RARS-derived bundles kept descriptor tables whose open, close, and completion cleanup conflicted with the shared FileSystem's retained Debug session. Both emulators now carry that behaviour themselves — RARS's `SystemIO.readFromFile` delegates to the IO handler as MARS's always did, and both `SystemIO` implementations treat every descriptor above STDERR as the host's to allocate, validate and close — so the patch scripts and the `postinstall` hook that ran them are gone. `JsMIPSIO.readFile` and `JsRISCVIO.readFile` also read the handler's buffer as the plain numbers its type declares rather than as boxed Java bytes, which is what the adapters' `$byteValue` shim existed to satisfy. For s68k 2.1.1, the adapter keeps ordinary text paths for `include` and rewrites resolved `incbin` operands to private byte aliases so `incbin` embeds shared UTF-8/binary FileSystem bytes exactly without changing M68K character-literal semantics.

## Implementation and verification checklist

These are follow-through on the accepted design, not a new list of questions for the owner:

- Define FileSystem ownership, injection, and disposal so stopping or replacing a Core releases transient state without deleting Project Files. Test cancellation and pending operations against the write-lock lifecycle.
- Use fixed source inputs for Build and live checks; invalidate stale asynchronous results when their Files, Entry path, Target, or owning Emulator changes. Checking and assembler probes must not mutate live Files or an active Debug session.
- Normalize file-aware source locations at adapter boundaries and retain every generated instruction. Verify breakpoints, repeated includes, macro expansion, missing locations, and instruction navigation without introducing a new breakpoint UI or silently dropping occurrences.
- Validate byte round-trips, path collisions, capacity accounting, archive extraction limits, atomic file operations, and coordinated CPU/peripheral Undo, including completion and failure paths.
- Migrate every caller, including Playgrounds, embeds, exams, tests, coding-agent tools, share links, exports, and linked local saves, preserving existing workflows without silently dropping non-entry Files. If a transport cannot represent a complete Project, report that rather than truncate it.
- Keep the accepted Target/File-language separation and byte-oriented FileSystem suitable for future C build inputs, generated artifacts, and source mapping; implementing that C pipeline remains outside scope.
- Verify actual dependency APIs and package availability before migration. Escalate only if a discovered limitation requires new authority or a material change to accepted behavior.

Accepted ADRs: [0015 — Restore file operations on Undo](../adr/0015-restore-file-operations-on-undo.md), [0016 — UTF-8 for FileSystem text](../adr/0016-utf8-for-filesystem-text.md), [0017 — Entry path can name a missing File](../adr/0017-entry-path-can-name-a-missing-file.md), [0018 — Open handles survive path changes](../adr/0018-open-handles-survive-path-changes.md), [0019 — ZIP project archives](../adr/0019-zip-project-archives.md).
