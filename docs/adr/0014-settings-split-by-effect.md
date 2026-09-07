---
status: accepted
date: 2026-09-07
---

# Settings are split by effect and stored as decisions

Settings were one global localStorage store, and [#72](https://github.com/Specy/asm-editor/issues/72) asked to scope every setting per project. We decided on a rule instead of a wholesale move: a setting that changes what the Emulator or the program does (the undo history size, the Screen undo budget, later things like a stack address or the initial memory value) is a **Setting** and belongs to one Project; a setting that only changes what the person sees or how the editor behaves for them (register number base, panel visibility, autosave, visible history steps, theme, shortcuts) is a **Preference** and stays global. A Project records only the Settings decided for it, and everything undecided follows the app's default for its language, so a changed default reaches every project nobody touched and the panel can tell a decision from a default.

## The exception

The **Display configuration** (MARS's bitmap display parameters) changes what the Emulator does and is still not a Setting. The program itself states it in the `@screen` comment, so it is not only the Project's to decide: it stays its own project field, kept in sync with the directive, a choice beside the Screen rewriting the directive when the program has one. Folding it into Settings would have made the directive a second, competing source. Do not "fix" this by moving it.

## Considered options

- **Every setting per project**, as the issue was worded: rejected because view settings would then have to be re-chosen project by project, for no gain to the program.
- **Two layers**, user defaults plus project overrides: rejected for the permanent "which layer am I editing" question in the UI.
- **Inheriting Settings from the last edited project of the same language**: dropped from scope for now; new and migrated Projects start from the defaults.
