# Workbench: the full-screen editor redesign

Design record of the interview held on 2026-09-30 from a redesign brief and mockup, which are not kept in the repository. Terms are the glossary's ([CONTEXT.md](../../CONTEXT.md)): **Workbench**, **Interactive editor**, **Debug tools**, **Log**, **Project**, **Debug session**, **Settings**, **Preferences**. The brief was written without knowledge of this codebase. It is followed for layout and behaviour only, and everything visual keeps the current design system: theme tokens, `Button`, `Card`, `SegmentedControl`, Rubik and FiraCode, and the unplugin-icons sets. Visual tweaks come after the first implementation. The owner confirmed the whole record at the end of the interview; the one decision that is hard to reverse is an ADR, and the rest can change. Implemented on 2026-09-30; see the [plan's status](./workbench-plan.md#status-2026-09-30).

## Scope

- Replace the project editor (`src/routes/projects/[project]/Project.svelte`) with the **Workbench**, laid out like an IDE. It has an icon rail and side panel, an editor with file tabs, a bottom panel for program output, the Log and Diagnostics, and a debug column while a Debug session exists.
- Make the Workbench a component that any page can host, not a part of the projects route.
- Leave the **Interactive editor** (`src/components/shared/InteractiveInstructionEditor.svelte`) as it is, for inline use.
- Offer the brief's two explored variants as Preferences: card or line surfaces, and floating or sectioned **Debug tools**.
- Move the themes page and the shortcut editor into sections of the Workbench's settings.

## Agreed decisions

### Hosts

The Workbench replaces `ProjectEditor` in both of its hosts, `/projects/[id]` (including share links) and `/exam/session`. `Project.svelte` is deleted rather than kept as a "classic layout" option. The Workbench lives under `src/components`, not in a route folder; today the exam session imports the editor by relative path out of the projects route.

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
- **Log**: the **Log**. It records each Build with its result, each test run with every Testcase's outcome and a summary, and each program exit with "Ran in …". Test results also stay in the Testcases panel.
- **Problems**: the **Diagnostics**, clickable to reveal their source location, with a count badge coloured by the worst severity. They move here out of the console.

A Build with errors switches to Problems, a successful Build to Terminal, and Test to Log.

Input does not change in this pass. It still comes through the prompt dialog or the focused Screen's Keyboard; typing into the Terminal tab is later work.

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
    - The exam prompt is a host panel, open by default.
    - In review mode, the teacher's review agent is a host panel for assembly sections. The exam header's existing AI button opens it through the Workbench's bindable active panel. For other section types, where there is no Workbench, it stays the overlay it is today.
- **Resizing** uses a small splitter component of our own; the codebase has none, and no library is needed.
- **Donate** is a host link that goes through the projects page's unsaved-changes prompt; today's link to `/donate` bypasses it.

## Deferred

- Typing the program's input into the Terminal tab, in place of the prompt dialog.
- Moving `/chat` to the Workbench.
- Per-project layout: open tabs, panel sizes, collapsed sections.
- The visual pass over the first implementation.

## Follow-ups outside the Workbench

- The "Using the editor" Lecture (`src/content/assembly-basics/introduction/using-the-editor/index.md`, around lines 73-77) describes today's Call stack, History, Stack pointer and Testcases panels. It has to be rewritten when the Workbench ships.
- The changelog (`src/routes/changelog/versions.ts`) should announce the new layout and the removal of `/themes`.

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
- **Screen section:** the Screen's size and controls (Display, the drawing buffer, the zoom and the floating window) are in its folding section's header, which replaces the Screen's own header there.
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
