# Workbench: the full-screen editor redesign

Design record of the interview held on 2026-09-30 from a redesign brief and mockup, which are not kept in the repository. Terms are the glossary's ([CONTEXT.md](../../CONTEXT.md)): **Workbench**, **Interactive editor**, **Debug tools**, **Log**, **Project**, **Debug session**, **Settings**, **Preferences**. The brief was written without knowledge of this codebase. It is followed for layout and behaviour only, and everything visual keeps the current design system: theme tokens, `Button`, `Card`, `SegmentedControl`, Rubik and FiraCode, and the unplugin-icons sets. Visual tweaks come after the first implementation. The owner confirmed the whole record at the end of the interview; the one decision that is hard to reverse is an ADR, and the rest can change. Implemented on 2026-09-30; see the [plan's status](./workbench-plan.md#status-2026-09-30).

## Scope

- Replace the project editor (`packages/asm-editor/src/routes/projects/[project]/Project.svelte`) with the **Workbench**, laid out like an IDE. It has an icon rail and side panel, an editor with file tabs, a bottom panel for program output, the Log and Diagnostics, and a debug column while a Debug session exists.
- Make the Workbench a component that any page can host, not a part of the projects route.
- Leave the **Interactive editor** (`packages/asm-editor/src/components/shared/InteractiveInstructionEditor.svelte`) as it is, for inline use.
- Offer the brief's two explored variants as Preferences: card or line surfaces, and floating or sectioned **Debug tools**.
- Move the themes page and the shortcut editor into sections of the Workbench's settings.

## Agreed decisions

### Hosts

The Workbench replaces `ProjectEditor` in both of its hosts, `/projects/[id]` (including share links) and `/exam/session`. `Project.svelte` is deleted rather than kept as a "classic layout" option. The Workbench lives under `packages/asm-editor/src/components`, not in a route folder; today the exam session imports the editor by relative path out of the projects route.

The Interactive editor keeps every host it has:

- `/embed`, and so every Playground;
- the documentation's instruction pages;
- the exam builder;
- the lecture agent;
- `/chat`, with its `fullscreen` layout.

`/chat` is a chat page with a scratch editor and no Project, and the agent can change its language underneath it. Moving it to the Workbench is separate work.

### The boundary ([ADR 0024](../adr/0024-workbench-is-a-host-agnostic-shell.md))

- The Workbench edits exactly one Project, its FileSystem included. The single-`code` source mode goes away. The exam session builds a temporary one-file Project per assembly section and copies the Entry file's text back into its answer.
- It never persists or navigates. The host passes the actions it supports: back, save (which autosave also calls), and share. A control appears only for an action that was passed.
- Built-in rail panels are Explorer, Testcases, Documentation, AI and Settings. A host can switch any of them off or make it read only.
- A host can add rail entries of its own: panels, such as the exam prompt and the teacher's review agent in review mode, and links, such as Donate. The brief's "Like" is today's Donate heart, a link to `/donate`.
- The Workbench fills its container, never the viewport; the exam session places it under its own chrome.

### Settings, Shortcuts and Theme

- **Settings opens in the side panel** like every other rail entry, as collapsible sections in this order: Project (the Project's **Settings**), Display (MIPS and RISC-V only, see below), Preferences, Layout (the layout Preferences below), Shortcuts, Theme. This replaces the floating panel behind the cog ([project-format.md](./project-format.md), The settings panel).
- **The Display configuration gets a Display section of its own**, holding today's popover content (`ScreenDisplayConfiguration`).
    - In the brief the Screen, and so its Display popover, exists only during a Debug session. But `applyDisplay` refuses every change during one: rewriting the `@screen` comment is a host edit to a File, and Files are locked. Following the brief literally would leave no place to change the Display configuration.
    - The section is editable only without a Debug session, as the popover is today. During a Debug session the Screen header keeps its `W × H` summary and a Display button that opens the section read-only.
    - It is listed in the Settings panel but stays its own Project field and is not a Setting ([ADR 0014](../adr/0014-settings-split-by-effect.md), The exception). The section is titled "Display", never "display settings".
- **Shortcuts and Theme are new sections.** Today `ShortcutEditor` is a floating panel of its own behind the keyboard icon, and the theme editor is the `/themes` route, whose only link is the settings panel's "Change theme" row. The rail has no Shortcuts entry.
- **`/themes` and its sitemap entry are deleted.** Its preset list, "Create new theme" and colour rows become the Theme section, which repaints the Workbench live beside it.
- **The projects page switches to `ThemeScope`.** Today it selects the language's built-in theme into the theme store and, on unmount, restores the theme it saw at load. That restore would undo a theme picked in the Theme section. It wraps the Workbench in `ThemeScope` instead, as the documentation, course and embed layouts already do.

### Layout Preferences

Two new **Preferences** in Settings › Layout, from the two variants the brief explored:

| Preference  | Default                                                                                                                                                                                                                      | Alternative                                                                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Panel style | **Cards**: today's look, panels as rounded `--secondary` cards with small gaps on the page background                                                                                                                        | **Lines**: panels edge to edge, separated by 1px dividers                                                                                                        |
| Debug tools | **Floating**: the **Debug tools** are today's draggable windows, floating over the top of the Workbench and opened, folded and dragged exactly as before; the Screen is open and fills the column below registers and memory | **Sections**: collapsible sections at the bottom of the debug column, in a row that wraps them side by side when the column is wide; the Screen starts collapsed |

- The owner chose Floating as the default, which keeps today's behaviour; the brief preferred Sections.
- Phones and tablets always use Sections, whatever the Preference. Floating windows are desktop only. Today they are hidden on touch devices (`@media (hover: none)`), so mobile users cannot open them at all.
- The `showMemory` and `showScreen` Preferences are deleted. Memory always sits beside the registers behind a draggable split, and the Screen's section remembers whether it is collapsed.
- Collapsed sections, panel sizes, and the floating windows' positions and visibility are remembered per person, like other Preferences, not per Project. Per-project workspace layout stays deferred ([project-format.md](./project-format.md), Scope).

### Bottom panel

Below the editor, present whether or not a Debug session exists, with a resizable height. Today's single console box (`StdOutRenderer`) holds the Diagnostics list, then runtime errors and program output, and pins "Ran in …" to the viewport's corner. It is split into three tabs:

- **Terminal**: exactly the **Terminal** Peripheral's text, the program's output with its echoed input, plus the Emulator's runtime errors, as the console shows them today.
- **Log**: the **Log**. It records each Build with its result, each test run with every Testcase's outcome and a summary, and each program exit with "Ran in …" and how it ended: "exited with code N", a signal such as "Segmentation fault (signal 11)", or the runtime error. Test results also stay in the Testcases panel.
- **Problems**: the **Diagnostics**, clickable to reveal their source location, with a count badge coloured by the worst severity. They move here out of the console.

A Build with errors switches to Problems, a successful Build to Terminal, and Test to Log.

Input does not change in this pass. It still comes through the prompt dialog or the focused Screen's Keyboard; typing into the Terminal tab is later work. Done on 2026-10-06 ([ADR 0036](../adr/0036-programs-read-input-typed-in-the-terminal.md)): a read is typed at a caret in the Terminal tab (`TerminalConsole`), and a read that starts while the tab is hidden or the compact panel folded picks the tab and unfolds the panel.

Two alternatives were rejected. The brief's single tab mixed build and test lines into the program's output, so that tab would no longer be the Terminal. The Log is not called "Output" because program output is the Terminal's.

### File tabs

- **The tab row is always shown on desktop,** even when only one tab is open. This departs from the brief, which showed it only with two or more tabs.
    - The row takes over what today's badge floats over the code at the editor's bottom-right (`.source-identity`), and the badge is removed.
    - The version label sits at the row's right end: `Build snapshot`, or `Live file` for a File the program created.
    - A File that is not analyzed from the Entry file shows as a dimmed tab with a tooltip.
    - The live analysis error count and spinner move to the Problems tab's badge.
    - Opening a second File causes no layout jump.
- **Being on the Build snapshot is a state of the whole Debug session, not of one tab.** Every File that exists in the Build shows its snapshot, and Explorer navigation keeps that version (`selectProjectFile`). A single label therefore describes the session, and only runtime-created Files differ from it.
- **Opening a File opens or focuses its tab,** whether it comes from the Explorer or from debugger navigation: Step, instruction Undo, execution stops, Call stack, History, a Problem. There are no preview tabs, and the last tab cannot be closed.
- **Open tabs are not remembered.** A Project opens on its Entry file, as today.
- **Phones and tablets have no tab row,** as in the brief; Files are opened from the Explorer.

### Save

The brief moved "save" out of the top bar but gave it no place in the rail. Save sits in the top bar right after the title and is shown only while the host reports unsaved changes.

- The host passes an `unsaved` flag with its save action. A host with no save action, such as the exam session, never shows the button.
- Under autosave, which is on by default, the button is almost never visible. It appears when autosave is off, and for a Project opened from a share link, which is never saved silently.
- Shift+S works as today.
- Autosave stays a Preference that the Workbench reads. On a change it calls the host's save action silently, debounced for code, following the one save rule in [project-format.md](./project-format.md) (Saving).
- The host hears of a change to the Files at once, before the debounce, so leaving asks about it. A save the debounce is still waiting on starts at once when the page is hidden or closed, together with what the Hex editor holds typed, and Save includes both, so nothing typed before it is left unsaved.
- Update 2026-11-04: autosave waits for 3 seconds without changes, for every change rather than for code alone, and the Workbench's session starts the waiting save at once (`saveNow`) as the page is hidden or closed, as the Workbench goes, and when the host asks before it reads the stored Project, as Back, Home and a link do ([ADR 0076](../adr/0076-a-project-holds-64-mib-of-files.md)). While a save waits, the Workbench shows nothing: under autosave the changes are kept on their own, so Save stays hidden and leaving does not ask. Save shows, as before, when autosave is off or the last save failed. The exceptions: closing the tab asks, through the browser's own question, while the save of a Project of more than 16 MiB is still being written, since that write was measured to be lost when the tab went at once, and while a Project's linked file is still to be written.

### Maximized panels

Added by the owner at the end of the interview.

- The Documentation and Testcases panels have a maximize button in their header.
- A maximized panel is drawn on top of the editor, the bottom panel and the debug column, filling the Workbench's whole width beside the icon rail, so that it can be read without the rest of the UI around it. The layout underneath is not changed.
- The same button, or Escape, restores the panel.
- On phones the drawer is already nearly the whole screen, so the button is not offered there.
- It is called maximizing, not "fullscreen", which already names the Interactive editor's `fullscreen` layout and the browser's Fullscreen API.

### Layout and behaviour

These follow the brief, today's behaviour, or the decisions above. The owner confirmed them together at the end of the interview.

- **Every device in one pass.** Phones and tablets get the brief's layouts in the same pass as desktop, because the old editor is deleted and the Workbench has to serve every device.
    - A drawer holds the rail and its panels.
    - A controls bar sits between the editor and the bottom panel.
    - The editor has a fixed height that does not move on Build.
    - Debug sections are collapsible, and there is no tab row.
- **Top bar.**
    - Left: back, the title, and Save while there are unsaved changes.
    - Right: Test and Build, or Undo, Step, Run and Stop during a Debug session.
    - Run still turns into Pause while running, which the brief left out. Test stays hidden when the Project has no Testcases.
- **Rail.**
    - Top group: Explorer, Testcases, Documentation (the brief's "Reference", today's `FloatingLanguageDocumentation`), then any host panels.
    - Bottom group: AI, Share, Donate, Settings.
    - Share stays a one-click action that copies the link, as today; the mockup's "allow others to edit" does not exist.
    - The side panel is closed by default, and each panel remembers its own width.
- **Panels move into the side panel.**
    - The Explorer's contents (`FileSidebar`) move into the side panel. The overlay inside the editor and its toggle button over the code go.
    - Testcases, Documentation and AI stop being floating or overlay panels (`TestcasesEditor`'s `FloatingContainer`, `FloatingLanguageDocumentation`, `FloatingAgentSidebar`) and become side panels.
    - The keyboard icon goes. Shift+D and Shift+P toggle the Documentation and Settings panels.
- **Debug column.**
    - The Status flags and PC rows stay above the Register file tabs, as today, with one register per row.
    - Memory sits to the right behind a draggable split. Below them come the Screen, then the Debug tools as the Preference places them.
    - A Build at narrow desktop widths closes the side panel to make room.
- **Visual cues stay until the visual pass:** the animated border during a Debug session, and the red border when there are errors.
- **The exam session keeps today's access.**
    - Explorer, AI and Settings are off; today they are unreachable because the exam hides the editor's header.
    - Documentation stays available with its links disabled. Today it comes from a button in the exam page's own header (`FloatingLanguageDocumentation` with `disableLinks`); it becomes the Workbench's Documentation panel, and the header button goes. Corrected on 2026-09-30: the recap said Documentation was off, which is not today's behaviour.
    - Testcases are view-only.
    - The exam prompt is a host panel, open by default. _Superseded on 2026-11-08 by the exam session's redesign: the prompt is a full-height panel at the Workbench's left (above it at 900px and narrower), which the student can fold away, and the host panel is gone._
    - In review mode, the teacher's review agent is a host panel for assembly sections. The exam header's existing AI button opens it through the Workbench's bindable active panel. For other section types, where there is no Workbench, it stays the overlay it is today.
- **Resizing** uses a small splitter component of our own; the codebase has none, and no library is needed.
- **Donate** is a host link that goes through the projects page's unsaved-changes prompt; today's link to `/donate` bypasses it.

## Deferred

- Typing the program's input into the Terminal tab, in place of the prompt dialog. Done on 2026-10-06, see Bottom panel.
- Moving `/chat` to the Workbench.
- Per-project layout: open tabs, panel sizes, collapsed sections.
- The visual pass over the first implementation.

## Follow-ups outside the Workbench

- The "Using the editor" Lecture (`packages/asm-editor/src/content/assembly-basics/introduction/using-the-editor/index.md`, around lines 73-77) describes today's Call stack, History, Stack pointer and Testcases panels. It has to be rewritten when the Workbench ships.
- The changelog (`packages/asm-editor/src/routes/changelog/versions.ts`) should announce the new layout and the removal of `/themes`.

## Revision after the first review, 2026-09-30

The owner reviewed the first implementation against the mockup's screenshots and asked for:

- **Spacing:** the mockup's spacing: 4px between cards and around them, the rail a card of its own.
- **Top bar:** a top bar without a background of its own.
- **Tabs:** the mockup's tabs above the editor and in the bottom panel.
- **Sections:** section headers a band lighter than the section. Lines draws a rule between sections, and the Settings sections are outlined in their header's colour with a transparent body.
- **Side panels:** each side panel has a minimum width and scrolls sideways below it.
- **Memory buttons:** memory's buttons take the card's colour.
- **Registers and memory:** memory shows a whole page without scrolling, and the registers fill the same height. Rules separate the Status flags, the PC and the Register files, and the PC's value starts beside its name.
- **Floating Debug tools:** as they were in the editor, three bars floating over the top of the Workbench that open, fold and drag as before, in both Write and Debug, rather than pills in the top bar. This supersedes the pills described in the first version of this record.

## Revision after the second review, 2026-09-30

The owner's second review asked for:

- **Editor border:** no animated border once built, so the editor fills its panel edge to edge. The Interactive editor keeps it. A program stopped on an error still gets its red frame, now drawn over the editor's edge rather than around it. This supersedes "Visual cues stay until the visual pass" above.
- **Stop:** Stop's icon takes the button's text colour rather than red.
- **Top bar:** the execution controls sit as far from the bar's right end as from its top.
- **Debug column height:** the column scrolls instead of squeezing what is under registers and memory into the height left. With the Debug tools as sections it is 170vh tall from the start, so sections open into room without the split being dragged. With floating Debug tools, only the Screen is under registers and memory, and it is as tall as it needs to fill the column's width, because 170vh would only leave it floating in empty space.
- **Register rules:** the rules between the Status flags, the PC and the Register files run from edge to edge of the card.
- **Screen section:** the Screen's size and controls (Display, the drawing buffer, the zoom and the floating window) are in its folding section's header, which replaces the Screen's own header there. A handle under the Screen drags its height, from the section's 26 rem (22 rem on tablets and phones), kept per person with the panel sizes; a double click gives the section its default height back. Added on 2026-11-05 at the user's request.
- **Scrollbar room:** side panels, the bottom panel's tabs and the debug column keep room for their scrollbar, so content that starts to scroll does not shift sideways.

A request to limit how tall registers and memory can be dragged was withdrawn.

## Revision after the third review, 2026-09-30

The owner's third review asked for:

- **Lines corners:** Lines squares the panels inside the cards as well: the memory grid, the Register files and the Screen.
- **Registers and memory:** there is no split between registers and memory, and the registers never give up any width. They are as wide as the CPU file asks at the grouping picked, or as their content for a language with one Register file. When the column is narrower, memory gives up the width and scrolls sideways. This supersedes "Memory sits to the right behind a draggable split" in Layout and behaviour and the Debug tools table.
- **Debug tools as sections:**
    - History and Call stack fill their sections, rounded 0.2rem on every corner.
    - The debug column's default width comes from registers and memory alone, and the three sections share one row at that width. The Stack pointer is never narrower than its memory grid, and History and Call stack are never narrower than 10rem.
    - They wrap only when the column is dragged narrower than that.

## Revision after the fourth review, 2026-09-30

The owner's fourth review asked for:

- **Registers:** the Register files reach the edges and the bottom of their card, square, with no padding around them. The flags stay inset. The PC has no padding of its own and lines up with the register rows, and no rule separates it from them: the rule is only between the flags and the PC. This supersedes the rule under the PC from the first review.
- **Settings sections:** their bodies take the page's background, under the lighter header.
- **Section headers:** no padding on the right, so a header's toggle runs to its end. Only a header with its own controls, like the Screen's, keeps a little room after them.
- **Testcases:** in the Workbench's panel the titles are a step above the text rather than a page's headings. The Interactive editor's Testcases window keeps its sizes.
- **Rail:** 3rem wide, with 0.3rem above and below its buttons and none on the sides; the buttons are centred and rounded 0.2rem.

## Revision after the fifth review, 2026-09-30

The owner's fifth review asked for, the last point as an experiment:

- **Card edges:** every card in Cards has a 1px edge in the line colour.
- **Bottom panel:** it is 96px tall by default, half what it was.
- **Nothing hidden is rebuilt:**
    - Everything built once stays built and is only hidden: a section's body once opened, the bottom panel's three tabs, the debug column after a Stop, and a floating Debug tool once unfolded. Side panels already stayed built after they were first opened.
    - A folded Screen keeps its controls out of its section's header.
- **No top bar on a desktop (experiment):**
    - The execution controls float over the bottom of the editor. Build is at the left and Test at the right; once built, Stop, Run, Undo and Step are at the left, with Test still at the right.
    - Test during a Debug session ends it first, since the Testcases run on the same Emulator.
    - Too narrow for their labels, the controls keep only their icons.
    - Back heads the rail, and Save heads its bottom group while the Project has unsaved changes, in Build's colour.
    - The title is gone for now. The compact layouts keep their top bar, with the same order in their controls bar.
    - This supersedes the top bar and the controls' order described above.

## Revision after the later reviews, 2026-09-30

The owner's reviews after the fifth, the same day, asked for:

- **Controls:**
    - A disabled control is muted but opaque, where see-through would show the code under it.
    - The controls run along the editor's bottom edge over a fade from the editor's colour, 0.35rem from its edges and clear of its scrollbar.
- **Floating Debug tools:**
    - They start at their old places across, centred on the file tabs: 9px down in Cards, 5px in Lines.
    - They show only during a Debug session, which supersedes "in both Write and Debug" from the first review.
- **Card edges:**
    - A real 1px border, so a card's content is clipped inside it, corners included, and nothing it holds paints over it. This supersedes the outline of the fifth review.
    - The rail and its open panel are one card, the panel ruled off from the rail from top to bottom; a maximized panel stays joined to the rail.
- **File tabs:** ruled as the bottom panel's tabs are. "Build snapshot" is gone, and "Live file" remains for a File's current contents during a Debug session.
- **Rail:** its gaps are 0.15rem. Every icon fills its box, since the AI's sparkles were smaller than the rest, and Back is centred.
- **Registers:** the rule between the flags and the PC is a border, which rounds to one screen pixel like the card edges.
- **Memory:** its bottom corners are 0.2rem in Cards.
- **Editor:** in the Workbench, Monaco's corners are square and its scroll shadow is hidden. The Interactive editor keeps both.
- **Bottom panel tabs:** each part of the strip draws its own rule, so no stretch of it is drawn twice.
- **Compact layouts:**
    - The controls are the desktop's: normal-sized, in the same order, with no card of their own. They still stick in reach as the column scrolls.
    - A narrow bar tightens the buttons first, and drops their labels only when even tight they do not fit.
    - A phone's drawer is one card of the rail and the panel, the panel ruled off from the rail; beside a tablet's rail, an open panel carries on from it as one card. This supersedes the 44px touch controls of the phone and tablet layouts.

## Testcases panel, 2026-10-01

The owner supplied two mockups of the Testcases panel, one after a test run and one writing a memory value, and asked for them with three changes: the input stays one box per input request, the expected output gets a row of its own, and Start and Expect get an icon each. Numbers are still typed in hex or decimal. This supersedes the Testcases titles of the fourth review: the panel has no headings left.

- **Edited in place.** Each Testcase is a row with a dot, its name and its outcome, unfolding into Name, Registers, Memory, Input and Expected output. The "New Testcase" form and its Add buttons are gone: **+ New testcase** adds an empty one, open with the cursor in its name, and each has **Delete testcase** and **Duplicate** at its foot. A read-only list shows the same rows with nothing to edit.
- **A name.** A Testcase has an optional `name`, shown on its row and in the Log and accepted by a lecture's `testcase` fence. Without one it is "Testcase N", by its place.
- **Results belong to what was run.** The last run's result shows on the Testcase it was run on: the dot and count on the row, the register's Actual, a memory row's "got …", the output's verdict with the actual output and where it first differs. A Testcase edited since, its name aside, reads "not run" until the next run. Results are matched by content rather than position, which also survives deleting and reordering.
- **Run all** sits in the panel's header beside "N/M passing", as in the mockup, and like Test it ends a Debug session first. The Interactive editor's Testcases window has the same header. A test run no longer closes the side panel at narrow desktop widths: building each Testcase on the Emulator is not a Build of the person's, and the panel is where Run all's results are read.
- **Registers** are one table of Start, Expected and Actual. A row can exist before it has a value, its register is picked in its first column, and a register the Core cannot set before the run (MIPS's `pc`, `hi` and `lo`) has its Start disabled.
- **Memory** is one table, the Start rows then the Expect rows. A row opens in place into the second mockup's form (Start or Expect; Number, Chunks or String; address, size, value), and a new value's form opens under the table. A string takes `\n`-style escapes.
- **Start and Expect** are marked by a play mark and a target wherever they appear: the register headers, the memory rows and the form's switch.
- **Numbers** are typed as `$1F` or `0x1F`, `%101` or `0b101`, or decimal, with a sign. Hex digits without a prefix are refused, since `10` reads differently in the two bases, and so is a value too wide for its register or memory width. They are shown in the Target's hex, `$` for the 68000 and `0x` for the others, and the form echoes a value in the other base.
- **Checks compare bits.** An expected register or memory number is compared at its width, so `-1` and `$FFFFFFFF` are one expectation however a Core reads a register back (MARS reads them signed). A string expectation reads as many bytes as its UTF-8 takes.

### Revision after the owner's review, 2026-10-01

- **Titles:** Name, Registers, Memory, Input, Expected output and Actual output are titles as the Settings panel's forms have them, a step above the text, rather than the mockup's small capitals. This brings back the Testcases titles of the fourth review, which the first version had dropped.
- **Registers:** the register column is titled Name, and Actual is a column only once the Testcase has run.
- **Clear** sits beside Run all and forgets the last run's results, so every Testcase reads as not run again.
- **Start** is marked by a flag, which supersedes the play mark: a play mark is Run's.
- **The memory form** has Number, Chunks and String at the right end of its first line.
- **Choices are one control everywhere:** the form's switches, the choices in Settings and the strips of the Register file panel's header are `SegmentedControl`, now drawn after genshin-music's `MultipleOptionSlider`: a pill whose highlight slides to the picked option and resizes to it. The Register file panel's tabs keep their look.
- **Folding** a Testcase slides its body open and shut, as a section of the debug column or Settings does.
- **Deleting** a Testcase asks first, through the app's own prompt.
- **Wording:** the empty list says "You have not added any testcases yet.", and an empty expected output "The program prints nothing". **+ New testcase** is centred and outlined in its own colour.
- **Execution controls:** the floating controls sit 0.35rem from the editor's sides and bottom with 1.4rem of fade above, over its scrollbar. This supersedes "clear of its scrollbar" in the later reviews of 2026-09-30.
- **Execution controls as trays (2026-10-03):** from the user's mockup, each end of the bar is one opaque tray with a hairline edge and the old shadow, 2.6rem tall (`--wb-control-height`): `--primary` over the editor on a desktop, the cards' `--wb-surface` in the compact layouts, where the bar sits among the cards with 0.2rem above and below. No button has a minimum width. Inside it only Build, or Run/Pause once built, is filled with the accent; Stop, Undo and Test are bare labels that take a tint on hover, and Step is its label in the accent. A divider separates Stop and Run from Undo and Step. A disabled control dims its text, and a disabled Run its fill, into the tray. On a phone the whole bar is one tray, with Test behind a second divider.
- **The dock in every Playground (2026-10-03):** the trays are `ExecutionDock` (`packages/asm-editor/src/components/specific/project/`), which only draws the controls; the Workbench's `ExecutionControls` and `InteractiveInstructionEditor` both drive it, and the Playground's old row of buttons (`Controls.svelte`) is gone. Every Playground (documentation pages, lectures, exams, the chat, embeds), in both its layouts, puts the dock over the bottom of its code, so the editor takes the full height of what sits beside it: `attached`, edge to edge in the code's bottom corners with each tray rounded only at the corner facing the code, raised a little (a shade lighter than the code, between `--secondary` and `--tertiary`, with a soft shadow over it), and on a phone one tray across the bottom edge. The Playground's editor is the Workbench editor's card too: `--secondary`, `--wb-radius`, the hairline card edge, square Monaco corners inside, no animated outline while a program is built or runs, and only the red frame over the edge for a program stopped on an error. A caller's own buttons ("Try in the editor", the embed's "Open in editor") and the Testcases toggle are actions in the far tray, where Test is; the toggle keeps its red and green. A narrow dock drops the far tray's labels before the Debug session's four.
- **Tablet (2026-10-03):** a tablet has no top bar: Back and Save are in its rail, as on a desktop, and its execution controls are a single tray across the bar under the editor. The top bar is a phone's alone, and a phone's controls are inside the editor, one attached tray along its bottom edge, so its column has no controls bar. A desktop's controls are `attached` in the editor's bottom corners as well.
- **The Playground's panels as the Workbench's cards (2026-10-03):** the Cards surface style's custom properties (`--wb-gap`, `--wb-radius`, `--wb-card-edge`, `--wb-surface`, `--wb-section-header` and the rest) live in `workbench.css` on `.workbench` and `.playground`, so a Playground reads the same ones and the Workbench's Lines still overrides them. The Playground's registers are the debug column's registers card: the flags inset on top with a rule from edge to edge under them, then the PC, then the Register files square against the card's edges. Memory is a card of its own with its address controls in `secondary`, and the panels are `--wb-gap` apart. The small layout's Screen folds away in a `CollapsibleSection` with the Screen's size and controls in its header, in place of the old Show screen bar; a section without an `id` keeps its fold only as long as it lives, so one documentation page's Screen does not open or close every other's.

## Phone fixes, 2026-10-11

From the owner's phone screenshots:

- **Registers and memory:** in the compact layouts the registers are as wide as the CPU file asks at the grouping picked, as in the desktop's column, and never give up any of it, so the PC and every group show. Memory sits beside them when both fit and under them when not: beside it the registers fill the height of its page and scroll inside, above it they are as tall as their list, up to a page. This supersedes the row that scrolled sideways under the registers squeezed to 11rem.
- **One scroll:** the Debug session's sections no longer scroll inside themselves past a screen's height; the column scrolls, on tablets too.
- **Run info:** a phone's bottom panel leaves "Ran in …, exited with code N" out of its tab strip, where it had no room; the Log still records it. Elsewhere it stays on one line and is cut short rather than wrapped.
- **Settings on a phone:** a switch or choice that wraps under its name stays at the right, where the others are.

## No Build beside a document, 2026-10-18

From the owner, after a grilling on the Entry path, which stays as it is: "Set file as entry" and the Explorer's controls are unchanged.

- **A pane showing a document or data offers no Build.** Outside a Debug session, a pane whose File is text with a known non-code format (`.txt`, `.md`, `.json`, `.py`: whatever `textFileLanguage` names), Markdown, a Preview (an image, a PDF) or other bytes has neither Build, "Build entry" nor Test. It keeps its view switch when it has one, and has no dock otherwise. Code keeps them: the Target's assembly, a text File whose extension names no known format (an include File's extension is anyone's guess), C and C++ as before, and an Executable. A path that names nothing still offers Build, which says what is missing. The rule is `offersBuild` in `editorFileRouting.ts`.
- **The session's controls stay.** Once a Debug session is on, Stop, Run, Undo, Step and Test are on whatever pane holds the controls, a document's too: a program can write a File, and its output is worth opening while stepping.
- **The controls prefer a pane that offers Build.** After a pane showing assembly or a Listing, `controlsGroup` takes one showing an Executable's bytes or a C File before one showing a document, so a split with a README never hides Build. The tablet's shared bar follows the same rule, and Shift+B builds from any File.
- **The Interactive editor is unchanged** for now; its dock still reads "Build entry" on any File but the Entry file.

Superseded on 2026-10-21 by [programs.md](./programs.md): a Project holds Programs, a pane has Build and Test only while it shows an Entry file and they run that Program (`offersBuild` gave way to `EditorGroup.displayedProgram`), "Set file as entry" and "Build entry" are gone, and the Interactive editor's Build is "Build" on every assembly tab.

## Preview tabs, 2026-10-18

At the owner's request, the tabs work as in VS Code. This supersedes "There are no preview tabs" under File tabs.

- **A single click on a File in the Explorer opens it in the pane's preview tab,** named in italics. The next File opened that way takes its place in the row, so looking through Files does not fill it. A File already open, kept or in preview, is only focused. Each pane has its own preview tab (`FileTabs.preview`, `previewTab` in `fileTabs.ts`, `WorkbenchSession.previewFile`).
- **A preview tab is kept open** by a second click on its File in the Explorer, which makes a double click open a File for good, by a double click on the tab, or by an edit that changes the File, typed as text or as bytes in the Hex editor (`keepOpen`). Its italics then go. A File not analyzed from the Entry file keeps its dimmed name but loses its italics, which are the preview's now.
- **Every other way of opening a File keeps its tab open,** as before: the Explorer menu's Open, a File made, renamed, uploaded or dropped, a tab moved to the other pane, the debugger's navigation, Problems, Go to Definition, Compile and Decompile.
- **The preview tab is saved as an ordinary open tab:** a reopened Project shows it kept open. The Project format is unchanged.

## Reverse-engineering changes, 2026-10-21

From [the reverse-engineering UX design](./reverse-engineering-ux.md), decisions 2, 10, 12 and 17 to 19, implemented on 2026-10-21 and 22:

- **The debug column collapses to a strip** (decision 19). A » button at the end of memory's controls, or a drag of the column's splitter below half its 320px minimum, collapses the column to a 32px strip at the Workbench's right edge, labelled "Registers · Memory" from top to bottom. The strip, Enter on the splitter or the arrow key that widens the column opens it again at the width it had, and a double click on the splitter opens it at the automatic width. Collapsed, the column is hidden rather than rebuilt, and the choice is kept with the layout (`debugCollapsed`), per person like the sizes. This adds to "Memory sits to the right" in Layout and behaviour, as the third review revised it.
- **Symbols in the rail** (decision 18). The top group is Explorer, Symbols, Testcases, Documentation, then the host's panels. Symbols is offered only in an x86 Project that has an Executable File, and an open Symbols panel closes when the Project's last Executable goes. Its tooltip is "Symbols: the functions and strings of the program" (`RailEntry.tooltip`), its default width 320px and its minimum 16rem, and a host can switch it off like the other built-in panels (`symbols` in `BuiltinPanelId`). This supersedes the top group listed under Rail in Layout and behaviour.
- **Build says what it waits for** (decision 2). While a Build is under way, an Executable's run to `main` included, the dock shows Build busy, with a spinner and the phase in place of its label, then Cancel, instead of the Debug session's Stop, Run, Undo and Step. x86 names its phases ("Downloading libc.so.6…", "Downloading the assembler…", "Assembling…", "Downloading the linker…", "Linking…", "Loading the program…", "Starting the program…"), and other languages say "Building…". Cancel ends the Build at once, discards its result and returns to editing, as Stop would; Stop's shortcut during a Build is its Cancel. A Build pressed while the cancelled one's assembly still runs in the Core waits for it and says "Finishing the cancelled Build…"; it never waits on what only the editor waited for, such as a chunk import or an Executable's load. In a phone's single tray beside an Executable's views, only the spinner shows, and the tooltip has the phase. The Interactive editor's dock keeps its clock, with no phase and no Cancel.
- **Debug for an Executable** (decision 10). When the Program a pane's dock builds, or the Debug session's, has an Executable as its Entry file, Build reads "Debug", with the tooltip "Load the program and start debugging it", since nothing is assembled. While it builds, the phase and the spinner replace the label and tooltip as for Build, with Cancel beside. Shift+B starts it too, and the Shortcuts section still calls that shortcut "Build the selected program".
- **Program input comes forward** (decision 12). While the program waits for a line typed in the Terminal, the console is ringed in the accent and its question at the caret is marked in the accent, and the console takes the keyboard from the code editor, a Listing or a Pseudocode. It never takes the keyboard from a text field, from Monaco's own boxes (Find, Go to Symbol, rename) or from a dialog. On a desktop, the bottom panel grows to 232px (about eight lines of the Terminal, and never so far that the editor keeps less than 160px) once a Debug session's program writes to the Terminal or waits to read from it, and it never shrinks back by itself. Once the person resizes the panel during the session, it stops growing until the next session. A test run never grows it, and the compact layouts keep their fixed 12rem. The grown height is the layout's `bottomHeight`, so it is kept for later sessions like a dragged one. This revises the 96px default of the fifth review, which now holds until a program first talks.
- **A failed Build the Problems cannot explain** (decision 2). A failed Build with no Diagnostics, such as one whose download failed or stalled, switches the Bottom panel to Terminal, where its reason is written, rather than to Problems. Its Log entry carries the reason on a line under it, and a toast says it too. This revises "A Build with errors switches to Problems" in Bottom panel.
- **Leaving the page** (decision 17). The project page asks before leaving only while the host's `unsaved` flag, which shows Save, is set: always for a Project opened from a share link, and otherwise for changes not yet saved because autosave is off or the last save failed. It asks on localhost too, where it never asked before, and no longer asks elsewhere when everything is saved. It asks, with the browser's own confirm, before a link or the browser's Back takes it to another page of the site too; the page's own Back and Home buttons ask with their save prompt instead.

## Renames, comments and search, 2026-10-23

From [the renames, comments and search design](./annotations-and-search.md), decisions 18 and 23, implemented on 2026-10-22 and 23:

- **Search in the rail** (decision 23). The top group is Explorer, Symbols, Search, Testcases, Documentation, then the host's panels, built by `workbenchRail` (`workbenchRail.ts`). Search is offered in every Target, with the tooltip "Search: find text in the Project", a default width of 352px, a minimum of 18rem, and Maximize like Testcases and Documentation; a host can switch it off (`search` in `BuiltinPanelId`), and an Exam does, as it switches off the Explorer. This supersedes the top group of Reverse-engineering changes above.
- **"Search the Project"** (decision 23). A command-key shortcut, `Mod+Shift+KeyF` (Ctrl+Shift+F, written ⌘⇧F on a Mac), listed and rebindable in Settings' Shortcuts section with the others. It opens the Search panel, the drawer on a phone, and never closes it; it focuses and selects the query and fills it with the selection of the editor that has text focus, when that is on one line.
- **The annotation prompt** (decision 18). Rename…, Comment… and Function comment… open a modal prompt drawn as the Patch prompt's tray, at the top centre of the pane over its Listing or Pseudocode, or of the Symbols panel. It holds a title, a note where one applies, a field (one line for a name, four rows for a comment) with the reason it cannot be saved under it, Cancel and Save, and for a comment already there Delete, which deletes it. Enter saves, Shift+Enter starts a comment's next line, Escape closes it, Tab goes round its own controls, and closing it gives the keyboard back to the editor or the Symbols panel's row. Opening one in a pane closes that pane's Patch prompt.

## Files dropped on the editor, 2026-10-23

At the owner's request, files dragged in from the computer can be dropped on an editor pane as well as on the Explorer.

- **A drop on a pane adds the files to the Project's root** and opens each as a kept tab in that pane, the last one shown. Over the right third of the only pane, they open in a new pane on the right instead, as a File dragged from the Explorer does. The folder is always the root: the Explorer is where a folder is chosen.
- **While files are over a pane, a dashed frame covers it** and says "Drop to add to the Project", over the right half when the drop would split. Once up, the frame alone takes the drag, so neither Monaco nor a PDF's frame does. It is refused, in grey and with the reason, during a Debug session ("Stop the Debug session to add files"), a test run, in a read-only Workbench, and where the host has the Explorer off or read-only, which is the rule the empty editor's New file follows.
- **The same upload everywhere.** The Explorer's upload and drops, a drop on a pane and the empty editor's "Upload an ELF file" all write through `writeUploads` (`lib/workbench/fileUploads.ts`): it asks before replacing a File, warns about an ELF that cannot run on x86, and offers an Executable a Program of its own, as the Explorer did before. `lib/fileDrops.ts` holds what the Explorer, the panes and the Projects page's drop zone share: whether a drag carries files from the computer (an image dragged off the page does not count) and the files a drop brings, refusing a folder with a toast.
- **A drop nowhere is refused.** Files dropped where nothing takes them in the Workbench, such as the bottom panel or a locked Explorer, are refused, rather than opened by the browser in place of the Workbench.
- **Known gap:** a drag that enters the window straight over a PDF's frame reaches the frame, not the pane, until it crosses something else of the pane.

## Symbols, the debug strip and program input, 2026-10-23

At the owner's request, nothing in the Workbench moves when Symbols comes or goes or when the program writes, and the collapsed debug column says what it hides.

- **Symbols closes the rail's top group.** The top group is Explorer, Search, Testcases, Documentation, the host's panels, then Symbols, which comes and goes with the Project's Executables: appearing, it moves no other icon. This supersedes the top group of Renames, comments and search above.
- **The debug strip names everything collapsing hides**: "Registers · Memory", then "Screen" in a Target that has one (every Target but x86; x86 gains one, decided on 2026-10-31 in [x86-devices.md](./x86-devices.md)), then the Debug tools ("Stack pointer · History · Call stack") while they are sections of the column; as floating windows, which collapsing leaves where they are, they are not named. A label longer than the strip ends in an ellipsis. This revises the strip's label under Reverse-engineering changes above.
- **The bottom panel grows only for input, and only back to its default.** While a Debug session's program waits to read from the Terminal, a bottom panel dragged below its default 96px (`DEFAULT_BOTTOM_HEIGHT`) grows back to it, as far as the editor's 160px allow, so the line being typed shows; one at 96px or taller is left as it is. What the program writes no longer moves it. It still never shrinks back by itself, a resize during the session still stops it until the next, and test runs and the compact layouts still never grow it (`growForProgramIo`). This revises "Program input comes forward" under Reverse-engineering changes above, whose growth to 232px on the first write or read moved the editor up mid-step.

## Restart and two-digit bytes, 2026-10-31

At the owner's request, an ended program can be started again without Stop and Build, and the Memory view writes every byte in two hex digits.

- **Restart takes Run's place once the program has ended**: at its end, at an exit, or at an error, where Run is disabled with nothing left to run. It is not offered while the program can still go on, stopped at a Breakpoint or waiting for input. It is a plain button like Stop and Undo, not filled with the accent as Run is, with `fast-backward` (⏮) as its icon (`redo` would read as the mirror of Undo beside it), and the tooltip "Go back to the start". The owner chose the name over Reset (what MARS and RARS call it, but which reads as throwing changes away), Rerun and Run again (which promise a run it does not make) and Rebuild (how it works, not what it does).
- **It is Stop and then Build of the Debug session's Program** (`WorkbenchSession.restart`), and like any Build it waits at the program's start, with Run back in its place. Breakpoints and the Command line it started with stay; registers, memory, the Terminal, the Screen, Pokes and the undo history start again. The Files are read-only during a Debug session, so the Build reads what the ended one read. Files the program wrote stay written, as Stop leaves them.
- **The debug column stays while it rebuilds.** Stop would hide it and the Build bring it back, moving the editor twice, so the layouts keep it while `session.restarting` lasts, and a narrow desktop does not close the side panel again. A failed Build ends the Debug session as any failed Build does. The Playground's dock offers Restart too, and keeps its panels while it rebuilds.
- **Run, Pause and Restart are one button that keeps its width** (owner, the same day): it holds all three faces, icon and word, in one grid cell, the ones not shown hidden but keeping their room, so it is as wide as Restart and Undo and Step never move (101.6px on a desktop dock in every state). The face shown is centred, and pressing Run keeps the focus on the same button through Pause and Restart. A dock too narrow for that room drops it before it drops any session label (`fitLabels`' `run` step, after `end`); the Debug session's four still fit with it down to the 22rem container step that leaves them icons, so that step is a safety net for docks holding more. In the compact layouts every button already had an equal share.
- **Memory panel size "0 bytes (hidden)"** (owner, the same day): a fourth option of the Preference hides the memory panel, in the desktop's debug column and the compact layouts' Registers & memory alike. A strip 32px wide (`MemoryStrip`), as tall as the registers, stands in its place, the debug column's own strip's look: the memory icon and "Memory" read top to bottom, and a click sets the Preference back to its default, 128 bytes. On a desktop the column's Collapse, which memory's controls held, sits at the top of the strip, and the column's own collapsed strip no longer names Memory. The registers take the width memory leaves (the column's 20rem minimum keeps it from narrowing further), and in the compact layouts they are as tall as their list, with the strip never wrapping under them. Show in memory brings the panel back at its default size, since a hidden panel would make it do nothing. While hidden, the Emulator keeps reading a default page, so that page is in place the moment the panel returns.
- **The History's CCR row**: its flags go under `CCR`, all together and from the row's left edge, when they do not fit beside it, and end in an ellipsis when the row is narrower still. A flag is never split.
- **A byte in the Memory view is two hex digits**: `0F`, not `F`, as the Hex editor and the selection's popup already wrote it, so bytes read side by side make the word (`12 03` is `0x1203`). Character mode is unchanged.

## Symbols in every Target, 2026-11-01

At the owner's request, the Symbols panel x86 Executables had (`reverse-engineering-ux.md`, decision 18) lists the labels and strings of any program the editor builds, in every Target, so a Debug session can jump through them. The owner chose, from the options put to them, the panel always offered, every label in one list, and a click that goes to the source.

- **Offered in every Target, always.** The rail entry no longer comes and goes with the Project's Executables (`symbolsOffered` is gone). It keeps its place closing the top group, so nothing moves, and its tooltip is "Symbols: the labels and strings of the program". Outside a Debug session the panel says "Build the program to see its labels and strings.", adding ", or open an Executable to see its functions and strings." in x86. An Exam switches it off (`EXAM_PANEL_ACCESS`), as the old editor it keeps to never had it. This supersedes the top group of Symbols, the debug strip and program input above.
- **What it lists.** An Executable shown in the focused pane, or a Selected program whose Entry is one, is listed from its Listing as before. Otherwise, during a Debug session of a program the editor built, its switch reads Labels · Strings, and the band names the Entry with its ENTRY mark. They are read once, right after a Build loads the program and before any of it runs (`GenericEmulator.readProgramSymbols`, from each Emulator's `_getProgramLabels`), so its strings are the ones it was built with, and Stop drops them. A Testcase's run reads none.
- **Labels: every one of the program's own, code and data.** A row gives the name, `code` or `data`, the address and the size up to the next label listed, a library's label or the end of its run, padding included (a 17-byte `.asciiz` followed by an aligned `.word` reads 20 B), and 0 B outside every run. Code means inside a run of instructions in the Build's memory layout. Left out: the labels the Core marks as a library's, the Runtime library members' included; and in Generated assembly a compiler's own `.L…` and `$L…` labels. A C++ name is listed demangled, with its raw name in the tooltip. The tooltip reads "prompt at 0x10010000, 8 bytes" then "Data, defined in data.s at line 2", or "not found in the source".
- **Strings: the text a data label starts with**, read up to a NUL, or up to the next label for one written without a NUL (`.ascii`), at most 4096 bytes. It counts as text when it is UTF-8 of at least two characters with one that shows, holding no control character but tab, the line breaks, bell, backspace and escape (for terminal sequences). That leaves out a small number stored there, `count: .word 10` being "\n". A compiler's `.LC0` is listed by its text even though its label is not. A string is listed once, under a label a person gave it when one shares the address.
- **Where a label is defined.** s68k, the Z80 assembler, MARS and RARS say so themselves. For x86 a code label is placed by the instruction at its address, then moved up to the label's own line above it; a data label is looked for in the source by its name, in the File the Core names and the Files that File includes, else in the Entry's unit, then the other Files. NASM labels without a colon before data (`msg db "Hi", 0`) are found, and a local label NASM names `main.loop` is found as `.loop` below `main`.
- **A row** reveals that line in the Build's version of the File, in the pane a reveal of the program would use (`WorkbenchSession.revealBuildLine`), keeping the keyboard in the panel. It shows the label in memory when no line was found. Its menu, from a right click, the Menu key or a touch screen's button, has Show in memory and Copy address. The label the cursor of a pane showing a File as text is under, the last its File defines at or above the cursor, is marked, the focused pane first. In the Strings list the string at that label is marked. Addresses are written with the Target's prefix, `$` on the M68K, and the filter takes `0x` or `$` before hex digits. A string is also found by its label's name.
- **x86 Core**: its memory layout now reports the symbols of executable sections too, for code labels. The memory view already kept to data runs, so it is unchanged.
- **MARS and RARS Cores** (owner, the same day), the same change in both:
    - Each symbol's tuple from `getSymbolValues` gains a fourth field, the 0-based line of its definition (-1 when unknown), and `getSymbolFiles` names the File that defines it. An included File is named as itself, where the MARS-dialect assembler named the including one, and a `.globl` label keeps its definition's line rather than the `.globl`'s. A breaking change to the tuple's width.
    - The GNU assembler no longer exports the names it makes for itself (`__gnu_anchor_…` for each `la` or `call` it expands into an `auipc` pair, `__gnu_numeric_…`, `__gnu_relax_…`). They stay in its own symbol tables, which resolve them.
    - A library member whose far branches the GNU assembler relaxes stays a library's. The relaxation pass made each unit again without its library flag: on RISC-V only the units it relaxed lost it (`vfprintf.s` of the Runtime library, 457 labels, in any C program that prints), on MIPS every unit as soon as any branch needed relaxing.
    - So the editor no longer filters these itself, and it searches the source only for x86.
- **Follow-up**: a C function's row reveals its line in the Generated assembly, beside the C File, rather than in the C File.

## Phone fixes, 2026-11-01

From the owner's phone and tablet screenshots:

- **The rule between registers and memory runs from edge to edge** of the Registers & memory section in the compact layouts, in either style: across the section once memory has wrapped under the registers, from the section's header to its foot while memory sits beside them. The registers and memory are as far from the rule as from the section's edges (0.3rem), Lines included, where memory's address field had touched it. The row's room around them is padding the rule runs through, and the row knows memory has wrapped by memory being as wide as it.
- **A phone's rail closes its drawer** when the panel tapped is the one shown, so the rail toggles the drawer as a desktop's toggles a panel. The drawer opens on that panel again.
- **The compact layouts' bottom panel is a desktop's**, on tablets too: 96px by default, the layout's `bottomHeight`, resized with a handle in the gap above it (the rule in Lines) and grown back for the program's input the same way. It never takes the 14rem the editor keeps, so before a Build the column still fits without scrolling. This supersedes their fixed 12rem in "Program input comes forward" above.
- **A splitter is easier to take hold of with a finger:** on a coarse pointer it reaches 0.5rem past each side, rather than 0.2rem.
- **The Documentation panel's search field lines up with the list under it**, at the same inset and with the same room kept for a scrollbar, where it had stood 2.4px further in on the left and 1.6px further out on the right.

## Loading, 2026-11-10

From the [loading plan](./workbench-loading-plan.md), with the owner's answers of the same day ([ADR 0080](../adr/0080-the-workbench-appears-before-its-emulator.md)):

- **The Workbench appears before its Emulator.** It is on screen as soon as its host has the Project, while the Core downloads: the rail and every panel, the Files and tabs, the editor (its code before Monaco, see below), the bottom panel with an empty Terminal and the Command line. Only what needs the Core waits for it. The live Diagnostics, completion and hovers come with the language worker, which starts once Monaco has loaded, or the Core has settled if that comes first: started with the page's first downloads, it slowed the editor's own.
- **Build waits for the Core and says so:** pressed while the Core loads, Build is busy with "Loading the MIPS emulator…" and Cancel, as for any wait of a Build (decision 2 above), then builds. A test run waits the same way, shown in Build's place with the same words and Cancel; Stop, Cancel or leaving the Project ends the wait, and the run never starts. The coding agent's tools answer that the emulator is still loading. Breakpoints set, Files edited and Settings chosen while the Core loads reach it as it arrives.
- **The Display configuration appears when the Core has loaded,** which says whether the Target has one. The Testcases panel shows a spinner until then, since the Core names the registers a Testcase checks.
- **A Core that does not load leaves the Workbench open:** Build becomes Reload, whose tooltip says the emulator did not load, and the code can still be read, copied and saved. Build and Test do nothing more; a Build pressed while the Core loaded says in the Log that the emulator did not load.
- **The code shows before Monaco:** each editor shows its File's text, coloured as the editor colours it, with its line numbers, gutter and indentation guides, read only, with "Loading editor…" in its corner, until Monaco takes its place without moving it. It scrolls and its text can be selected, and it shows the first 200 lines. A Listing and a Pseudocode keep the spinner.
- **The Workbench's outline while the Project is read:** the project page draws its cards empty, at the sizes the person left them and in their surface style, with the top bar inert, and "Opening the project…" if the read takes over a second, as an example fetched over the network can.
