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
