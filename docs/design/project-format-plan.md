# Project format: implementation plan

Companion to [project-format.md](./project-format.md), whose decisions this plan implements. Written on 2026-09-07. Every phase ends with `npm run check`, `npm run lint` and `npm test` clean.

## Phase 0: pure modules

- `src/lib/projectSettings.ts`: the declarations of the two Settings (undo history size, Screen undo budget) with display name, type, per-language default and applicability; `resolveProjectSettings(language, decisions)` for the effective values, `cleanProjectSettings(raw)` for tolerant loading. Tests.
- `src/lib/Project.svelte.ts`: `files`, `entry` and `settings` replace `code` in `ProjectData`; `normalizeProjectData` turns any stored or shared shape (version 1 with `code`, version 2, a partial of either) into the current one and is the single migration path; `makeProject` keeps `code` as a convenience for the Entry file's content; `toExternal` writes metadata version 2; `makeProjectFromExternal` reads version 1, version 2 and raw sources, and reports a notice for a newer version; `projectContentEquals` for the unsaved-changes prompt. Tests.
- `src/lib/Config.ts`: the M68K extension becomes `m68k`.

## Phase 1: storage and links

- `src/lib/storage/db.ts`: Dexie version 2 with an upgrade rewriting every stored project through the normalizer; reads normalize too. Tested under `fake-indexeddb`.
- Share links, the legacy exam link and the import page go through the normalizer; the import page toasts the notice.

## Phase 2: Preferences and the Emulator

- `src/stores/settingsStore.svelte.ts` becomes `src/stores/preferencesStore.svelte.ts`: the seven view Preferences, same localStorage key, tolerant loading without a version reset. Every consumer renamed.
- `EmulatorSettings.screenHistoryBudgetMb` at creation and `setScreenHistoryBudgetMb` on the Emulator, applied on the next clear, so a Build picks it up. The undo size is passed to `compile` from the resolved Settings. Tests and measurements follow.

## Phase 3: the editor

- `Settings.svelte` grows a Project section listing the Settings that apply to the language, each marked as a decision or the default, with a reset. `ProjectSetting.svelte` is the row.
- `Project.svelte` takes `settings` as a bindable prop, resolves the effective values for Build and Test, and applies the one save rule: any change to code, Settings, Testcases or Display configuration saves at once under autosave, otherwise waits for Save. `+page.svelte` compares the whole project before leaving.
- `screenDirective.ts` gains `rewriteScreenDirective`: a popover change rewrites the parameters that changed in an existing `@screen` line and never inserts one. Used by the project editor and the Playground.

## Phase 4: records

- Changelog entry, manual verification rows, and the status of this plan.

## Status, 2026-09-07

All four phases are implemented and checked in one session: `npm run check` (one pre-existing error in `src/routes/sitemap.xml/+server.ts`, untouched here), `npm run lint` and `npm test` clean, and the browser rows of `docs/manual-verification.md` driven through headless Chromium over the DevTools protocol, seeding a version 1 database on the static `robots.txt` page of the same origin before the app opened it. Deferred, as the design record says: multi-file editing and export, binary encodings, the drive, inheritance of Settings. Two small follow-ups noticed on the way: the display popover shows the saved display until the first Build reads a program's `@screen` comment (unchanged behaviour), and `fake-indexeddb` is now a dev dependency for the Dexie upgrade test.
