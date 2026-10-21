# Reverse-engineering UX

Status: decided 2026-10-21 by the owner, from [the usability study](../research/ghidra-usability-study.md) in which six testers solved picoCTF challenges with an imported **Executable**. Planned the same day in [the plan](./reverse-engineering-ux-plan.md). This revises [the file views design](./file-views.md)'s decision 1 (an Executable opens in the Hex editor). Terms are in [CONTEXT.md](../../CONTEXT.md).

## Decisions

### When a run goes wrong

1. **AVX.** *(Superseded 2026-10-21: the Core now runs VEX, so this note applies to EVEX, AVX-512, only, and reads "AVX-512 instructions are not currently supported". See docs/research/x86-avx-support.md.)* A program that stops on an illegal instruction whose encoding is AVX (VEX or EVEX) gets the run status "AVX instructions are not currently supported" instead of "Illegal instruction (signal 4)". The Log note names the instruction and its address, then says the same sentence and nothing more. The editor recognises the encoding from the instruction's bytes, so no **Core** change is needed: in 64-bit mode, after any segment or address-size prefixes, a first opcode byte of `C4` or `C5` is VEX and `62` is EVEX. Nothing warns before a run, because a program can carry AVX paths it never takes (glibc picks them by CPUID).
2. **A Build never waits silently.**
   - While a Build runs, the dock says what it is waiting for, such as downloading a Bundled library, loading the program or starting it. Other languages show a plain "Building…".
   - It offers Cancel.
   - A download that fails, or that receives no bytes for 20 s, ends the Build. The error names what could not be loaded and says to Build again, and Build is pressable again. Today a stuck download leaves Build disabled with a clock icon and no message.
3. **Keep the place after exit.** When an Executable's program exits normally, the **Listing** and **Pseudocode** stay where they were and the program-counter highlight goes away. They no longer jump to `_start`'s `call __libc_start_main`. A run that ends on a signal still reveals where it stopped, as today. Assembled programs and other languages are unchanged.
4. **The memory view's address box takes the Listing's names:** **Invented names** (`FUN_…`, `DAT_…`) and `s_` string labels, resolved through the Listing to their run-time address. Its fixed `0x` prefix shows only while the text is a number, so `DAT_singing_perch` no longer reads as `0xsinging_perch`.

### Reading the Listing and the Pseudocode

5. **Numbers on hover in the Pseudocode.**
   - A constant shows the card the Listing already shows: decimal, hexadecimal, binary.
   - Both cards gain a **Text** line when the value's bytes, little-endian at the constant's size, are at least two printable ASCII characters. For example, `0x4c75257240343a41` reads `A:4@r%uL`.
6. **Ghidra's words on hover**, each with a short plain explanation and a link to the Documentation's Pseudocode section:
   - `undefined` and `undefined1`–`undefined8` types;
   - the decompiler's variable names (`uStack_48`, `local_10`, `param_1`, `iVar1`, `in_FS_OFFSET`, `unaff_…`, `extraout_…`);
   - Invented names.
7. **Double-click follows a name**, as in Ghidra and IDA. In the Pseudocode it works on a function or data name; in the Listing on a label or a call or jump target. It does what Go to Definition (F12, Ctrl+click) already does. Such names get a link underline and pointer cursor on hover. A single click still only places the cursor.
8. **Back and forward.**
   - Each editor pane keeps a navigation history of Listing and Pseudocode positions.
   - Every jump adds to it: double-click, Go to Definition, Go to Symbol, Show in Listing, the Symbols panel.
   - Alt+← and Alt+→ (and the mouse's back and forward buttons) move through it. Go Back and Go Forward also appear in the context menu.
   - Esc is not used, because Monaco's widgets already take it.
9. **A "?" in the Listing's and the Pseudocode's notices** opens the Documentation panel at the Executables chapter's Listing or Pseudocode section.

### The dock and debugging

10. **"Debug" for an Executable.** When the **Selected program**'s **Entry file** is an Executable, the Build button reads **Debug**, with the tooltip "Load the program and start debugging it". Nothing is assembled for an Executable, so "Build" misled.
11. **Breakpoints and Run to Cursor in the context menu.**
    - The Listing and the Pseudocode menus gain **Toggle Breakpoint**.
    - During a **Debug session** they also gain **Run to Cursor**: Run until the instruction at the cursor line, or an earlier **Breakpoint**, as a temporary Breakpoint that disappears afterwards.
    - On a Pseudocode line, Run to Cursor uses the line's first mapped instruction, by the rule Pseudocode Breakpoints already follow.
    - Shortcuts are chosen not to clash with the Workbench's existing ones.
12. **Program input.**
    - When the program waits for input, the input row is highlighted and takes focus, even from the Listing or Pseudocode.
    - The Bottom panel grows to show at least about eight lines while a Debug session's program writes output or waits for input.
    - Once the person resizes the panel during the session, it stops growing on its own.
13. **An Executable opens on Disassemble**, its Listing scrolled to `main`, or else to the entry point. Hex and Decompile are one click away. This revises [the file views design](./file-views.md)'s decision 1. A view the Project saved for the File still wins.

### Small fixes

14. **Hex Find:** typing anything but hex digits, spaces and `??` while Find is on Hex switches it to Text, instead of answering "Each byte is two hex digits, or ??".
15. **Hex hover card:** it hides while dragging, when the context menu or Find opens, and on a key press.
16. **Read-only notice:** it moves out of the way while Monaco's find widget is open in the same pane.
17. **Leave-site prompt:** the project page asks before leaving only when there are unsaved changes.

### New views

18. **The Symbols panel**, a sidebar panel like the Explorer.
    - It shows the Functions and Strings of the Executable in the focused pane, or else of the Selected program's Entry, with a **Functions · Strings** `SegmentedControl` and a filter box.
    - A function row shows its name, address and size; a string row its text and address.
    - A click reveals it in the Listing (the Pseudocode follows) and adds to the navigation history.
    - Its rail entry is offered only in a Project that has an Executable.
19. **The debug column collapses to a strip.** The registers and memory column on the right can be dragged or collapsed down to a narrow strip that stays visible with an expand control, and the person's choice is kept with the layout.
20. **Pointer menus.**
    - Right-clicking a register's value or a memory cell gives Show in Memory and Show in Listing (when the value is an address in an Executable's code), plus Copy as Hex and Copy as Decimal.
    - A memory cell also gets Follow Pointer, which reads the 8 bytes there as a little-endian address and shows it in the memory view.
    - One click still edits, as today.

## Deferred, to rediscuss after these

From the study, kept for later at the owner's word:

- **C++ demangling** in the Listing, the Pseudocode and Go to Symbol, and typing `std::string` locals.
- **Rename and comments**, saved in the Project, fed into both the Listing and the decompiler.
- **Cross-references** with address, containing function and kind (call, jump, read).
- **An IDA- or Ghidra-style keymap** (`g`, `n`, `x`, `;`).
- **Search across every function's Pseudocode.**
- **A graph view** of a function.
- **Go to address** in the Listing and the Pseudocode (Ctrl+G and G take an address or a name). Today Ctrl+G goes to a line and Go to exists only in the Hex editor.
- **AVX support in the x86 Core.**

Decided against for now: a home-page entry for opening a program, which every tester missed. The Projects drop zone and the Create page's upload box remain the ways in.

## Implementation

Status on 2026-10-22: all twenty decisions are implemented, one commit per work group of [the plan](./reverse-engineering-ux-plan.md) on `feat/pseudocode`; the closing review and browser check remain. The in-app Documentation, [CONTEXT.md](../../CONTEXT.md) and [workbench.md](./workbench.md) describe the result. Each entry gives the commit, then what was decided while implementing it or differs from the decision above.

- **1. AVX**, `b9f55b97`. Implemented as decided, with VEX and EVEX both labelled. VEX-encoded BMI1 and BMI2 instructions (`andn`, `pdep`, `shlx`), which share the encoding, were labelled AVX too. Superseded the same night by `7d89c2ad` (x86 Core `2308d3f`), with which the Core runs VEX-encoded instructions, AVX2, FMA and BMI included: only an EVEX instruction gets the note, which now reads "The program ran `vaddps zmm0, zmm1, zmm2` at `0x…`. AVX-512 instructions are not currently supported.", and the run's status ends with the same sentence. Any other instruction the Core refuses keeps "…, which the emulator does not support" and "Illegal instruction (signal 4)". The deferred "AVX support in the x86 Core" below is that commit.
- **2. A Build never waits silently**, `e3e09398` and the x86 Core's `4631b16`.
    - The study's stuck Builds most likely had two causes in the Core, both fixed there. A failed `nasm.wasm` download was cached as missing, so every later assembly fell back to Emscripten's own loader, which waited with no limit. A Build that threw part way left the runtime in `Assembling`, so every later Build failed.
    - The Core reads each download as a stream and ends it after 20 s without data. Its `ResourceDownloadError` names the resource, and the editor adds the advice: "Could not download libc.so.6: no data for 20 s. Check the connection and Build again." That text goes to the Terminal, the Log (a line under the failed Build's entry) and a toast. A failed Build with no Diagnostics switches the Bottom panel to Terminal rather than Problems. A library or the assembler that failed is downloaded again by the next Build, and one that arrived is kept for later Builds.
    - The dock's phases are "Downloading libc.so.6…", "Downloading the assembler…", "Assembling…", "Linking…", "Loading the program…" and "Starting the program…" (an Executable's run to `main`), and "Building…" where the Emulator reports nothing. The busy Build and Cancel replace the Debug session's controls until the run to `main` is over, so Cancel takes the place Stop had there. Run was disabled there before, so no Pause was ever offered during startup, and the Chapter no longer says one stops it.
    - Cancel ends the Build at once and discards its result, even while what it waits for never answers. The Core's work for it finishes unseen, and a Build pressed meanwhile waits for it, saying "Waiting for the cancelled Build to end…", which for a stalled download lasts up to 20 s.
- **3. Keep the place after exit**, `b9f55b97`. An exit of a loaded Executable (the Core's stop reason is `exit`) leaves the program on no line, which clears the Listing's highlight and the Pseudocode's. This includes an exit during the Build's run to `main`, such as the dynamic linker's exit 127 for a missing library. Undo brings the line back. Signals, errors, assembled programs and the Build output are unchanged.
- **4. The memory view's address box**, `b9f55b97`. Wider than decided: the box takes every label of the running Executable's Listing except a function's `.LAB_n` blocks. That includes saved symbols, `name@plt`, `name@got` and the detected `main`, besides Invented names and `s_` strings, after the Core's own symbols, with `+offset` as for any label. The `0x` shows only while the text is hex digits.
- **5. Numbers on hover**, `d5f7e0ea`. A Pseudocode constant, a character constant such as `'A'` included, gets the Listing's card at 64 bits, since Ghidra's constants carry no size. The Text line reads as many bytes as the value needs rather than the constant's size. It needs at least two printable ASCII characters that are not all spaces. It is in the card of every assembly language, the Workbench's source editors included, in the Target's byte order: big-endian on the M68K, little-endian elsewhere.
- **6. Ghidra's words on hover**, `d5f7e0ea`. Covered: `undefined`, `undefined1` to `undefined8` and `code`; `param_N`, `local_N`, `<letters>Stack_N` and `StackX_`/`StackY_`, `<letters>Var<N>` with its type letters spelled out, `<letters>Ram<address>`, `stack0x…`, `in_FS_OFFSET`, `in_stack_…`, `in_<register>`, `unaff_retaddr`, `unaff_<register>` and `extraout_<register>`/`extraout_var`. An Invented name's hover adds where the name comes from, and a `_`-widened name (`_DAT_…`) says why it has the `_`. Each ends with a "Reading the Pseudocode" link. Monaco drops a hover link without a scheme, so the link holds the page's own origin, and a link opener (`openDocumentationLink`) sends it to the Documentation panel. The same fault hid the Documentation links of the instruction hovers, which `c452b515` fixed in all five languages (`absoluteDocumentationLinks` in `hoverLine.ts`).
- **7. Double-click follows a name**, `d5f7e0ea`. As decided. A label at its own definition is no link. The study confirmed F12 and the context menu's Go to Definition already worked, which [file-views.md](./file-views.md)'s E10 note had denied.
- **8. Back and forward**, `d5f7e0ea`.
    - It works as a browser's history does. A jump records the place it leaves and clears what was ahead, and Back puts the current place ahead. Each pane keeps 50 places behind and 50 ahead, and drops a place equal to the latest one.
    - Back and Forward skip the current place and dead places, such as a deleted File or a library's Listing after Stop. A rename carries the places with it.
    - A jump records the place it leaves in every pane it moves. A Listing jump also records the Pseudocode beside it, and following a Pseudocode name also records the Listing.
    - Back to a Pseudocode place moves the Listing beside it to that function, unless its cursor is in it already.
    - Recorded: double-click, Go to Definition, Go to Symbol and Go to Line (Monaco's `code.jump`), Show in Listing from the Hex editor, and the Symbols panel. Since `c452b515`, the pointer menu's Show in Listing records too (`revealAddress(address, { jump: true })`); the debugger's own reveals, of the program counter, the Call stack and the History, do not.
    - Alt+←/→ are taken in a Listing or Pseudocode even with nowhere to go, so the browser never leaves the page. On a Mac they no longer move by word there. The mouse's back and forward buttons are caught over the editor.
- **9. "?"**, `d5f7e0ea`. As decided, labelled "What is the Listing?" and "What is the Pseudocode?", and offered where the Workbench has a Documentation panel.
- **10. "Debug" for an Executable**, `c452b515`. As decided, through a `buildButton` prop of `ExecutionDock`. The label follows the Program the pane's dock builds, the one whose Entry file the pane shows, or the Debug session's while there is one. While it builds, the phase and the spinner replace the label and tooltip, and Cancel stays. Shift+B starts it too; the Shortcuts section still calls that shortcut "Build the selected program".
- **11. Breakpoints and Run to Cursor in the context menu**, `c452b515`.
    - The shortcuts are F9 for Toggle Breakpoint and Ctrl+F10 (⌘F10 on a Mac) for Run to Cursor, as Visual Studio has them; neither the Workbench's shortcuts nor Monaco's take them. They work while the editor has the keyboard, and the Shortcuts section does not list them, as it does not list Space for Patch or Alt+←/→. In Edge (Immersive Reader) and in Firefox on Windows the browser may react to F9 too.
    - Toggle Breakpoint is offered wherever a click in the gutter sets a Breakpoint: an instruction of the Executable's own Listing, or a Pseudocode line with instructions. It is not offered on a label, data, a library's Listing or the Build output's.
    - Run to Cursor is a Run with temporary Breakpoints (`GenericEmulator.runTo`), resolved with the person's on every slice and gone when the Run returns, however it ends. It stops at the person's Breakpoints on the way, and runs the instruction it starts on ([ADR 0023](../adr/0023-run-continues-past-the-breakpoint-it-is-parked-on.md)), so from the current instruction it runs until the program comes back to it. From a Pseudocode line it targets the first instruction of each block mapped to the line.
    - Run to Cursor is offered only during a Debug session that is not building, running or compiling, whose program has not ended and does not wait for input, and only in the running Build's own Entry File. A library's Listing and the Build output's never have it.
    - The menu's groups are the navigation (Go Back, Go Forward, Go to Definition, Show in Hex), then Toggle Breakpoint and Run to Cursor, then Patch instruction….
- **12. Program input**, `c452b515`.
    - While the program waits for a line, the Terminal console is ringed in the accent and its question at the caret is marked in the accent. It already took the keyboard from the code editor, a Listing or a Pseudocode when a read began. Now it no longer takes it from Monaco's own boxes (Find, Go to Symbol, rename) or from a dialog, and still never from a text field.
    - On a desktop the bottom panel grows to 232px (`PROGRAM_IO_HEIGHT`, about eight lines; the editor keeps at least 160px) once a Debug session's program writes to the Terminal or waits to read from it. It never shrinks back by itself. A resize by the person during the session stops it until the next session. Test runs never grow it, and the compact layouts keep their fixed 12rem.
    - The grown height is the layout's `bottomHeight`, saved per person like a drag. Later sessions start at it, so in practice the panel grows once until the person makes it smaller again.
- **13. An Executable opens on Disassemble**, `c452b515`. `defaultFileView` gives the Listing for an Executable, the Build output included, and the view switch keeps its order (Hex · Disassemble · Decompile). The first time a pane's editor shows the Listing, its cursor goes to `main`, else the entry point, else the first function (the Pseudocode's rule, `defaultPseudocodeFunction`), with that label near the top. Beside a Pseudocode, it goes to that Pseudocode's function, and a library's Listing opens at its top. A view saved in the Project still wins. Disassemble, now the default, is no longer saved when chosen, and Hex is. A pane keeps its editors' view states across remounts (`EditorGroup.editorViewStates`), so Hex and back returns to the same place. [file-views.md](./file-views.md)'s decision 1 carries the revision note.
- **14. Hex Find**, `b9af4ea8`. Find switches to Text on anything but hex digits, whitespace, commas and `?`, and never switches back by itself. A word made of hex digits, such as `cafe`, stays Hex, and `0x7f` switches to Text.
- **15. Hex hover card**, `b9af4ea8`. As decided. It also hides on any pointer press. It returns when the pointer moves, though not while the context menu is open.
- **16. Read-only notice**, `b9af4ea8`. Changed: the notice fades out rather than moving, while Monaco's find widget is open in its pane. Its actions, the Library member's Show C source and the "?", are out of reach until Find closes.
- **17. Leave-site prompt**, `b9af4ea8`. The prompt follows the page's `unsaved` flag: always for a share-link Project, otherwise for changes that autosave did not or could not save. The old localhost exception is gone, so it asks on localhost too.
- **18. The Symbols panel**, `da8d6091`. The rail entry (`FaTags`) is offered in an x86 Project with an Executable File; the Build output does not count. A function's size runs to the next function or the end of its section. A string row shows up to 160 characters, the tooltip all of it. The filter matches name or text, or the address's hex digits with or without `0x`; Enter reveals the first row, the arrows and Home/End move through the rows, and Escape clears the filter. The row at the Listing's cursor is marked. The panel generates the Listing when no pane shows it, and lists the Debug session's Build version of the File while it has one. When the focused pane shows the File's Pseudocode, a row moves the Listing beside it, as following a name does. Otherwise it reveals the line in a pane showing the Listing, else in one showing the File's bytes, switched to the Listing, else in the focused pane. Not browser-checked.
- **19. The debug column strip**, `f83962ed`. The strip is 32px wide and opens from anywhere along it. The » button sits at the end of memory's controls. A drag below 160px (half the 320px minimum) collapses the column, and the drag's in-between widths are not kept. Enter on the splitter toggles it, and a double click opens it at the automatic width.
- **20. Pointer menus**, `f83962ed`.
    - The labels are in sentence case ("Show in memory", "Show in Listing", "Copy as hex", "Copy as decimal", "Follow pointer"), after the Hex editor's "Copy as hex", rather than the Title Case written above.
    - The menu is offered in every language. Show in Listing appears only while the program is an Executable, and is enabled only for an address in its own code: a library's Listing is not generated for a menu.
    - Follow pointer reads the Target's register width in its byte order, which is 8 bytes little-endian on x86-64.
    - Show in memory rings the target byte with the accent until the view is moved by hand or rebuilt.
    - Inside a selection, the menu uses the selection's number and width. Copy as hex pads to the value's width with the Target's prefix.
    - A register value's menu opens from the keyboard too, with Shift+F10 or the Menu key.

### Follow-ups

- The Generated assembly's notice (`CompilationNotice`) covers Monaco's find widget as the read-only notice did; decision 16 did not cover it.
- Memory bytes take no keyboard focus, so their pointer menu is pointer-only.
- The address box's Tab completion ("Tab completes labels") does not know the Listing's names, though the box takes them.
- A Pseudocode place in the navigation history keeps its function, not its line.
- The Interactive editor's dock (every Playground) keeps the clock, with no phases and no Cancel, and Testcase runs show no phases.
- The editor's own chunk imports during a Build (the Runtime library, the demangler) have no timeout; Cancel ends a Build waiting on them.
- Hex Find could take a `0x` prefix as hex rather than switching to Text.
- Pre-existing, seen while implementing: the first drag of the debug column's splitter shrinks an automatic-width column by about 4px, since `clientWidth` leaves out the scrollbar gutter; hovering the character right after a target name in the Pseudocode still shows the name's hover.
- The M68K's directive and fallback hovers may still hold Documentation links written as paths, which Monaco shows as plain text; `absoluteDocumentationLinks` covers the instruction hovers of all five languages.
- F9 can reach the browser's reader view in Edge and in Firefox on Windows; the context menu's Toggle Breakpoint is the way round it.
- The x86 Core's `4631b16` (download stall timeout, Build phases) and `2308d3f` (AVX) are on its `main`, unreleased: its CHANGELOG has them under "Unreleased".
