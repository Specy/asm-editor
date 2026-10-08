# Editor key bindings research

Research date: 2026-10-03, for [issue #35](https://github.com/Specy/asm-editor/issues/35) ("Vim/Emacs support"). Scope: Vim and Emacs key bindings in the Monaco editor, and mappings a person defines for themselves, such as `kj` for Escape.

Sources:

- the libraries' published packages and upstream repositories;
- the sites that already offer these modes;
- the codebase at `aaac7a1`;
- a spike that ran each library against `monaco-editor` 0.57.0 under Vite 8, in headless Chrome 153, driven over the DevTools protocol with real key events.

This note proposes no production change. The spike lived in a scratch directory and nothing in the app was modified.

## Conclusions

**Vim is feasible, and Monaco can run either of two Vim engines.** Both go through the same Monaco adapter: the one in `monaco-vim` 0.4.4, the library the issue links and that Compiler Explorer, Google Colab and Bitburner use.

- The first engine is `monaco-vim`'s own: CodeMirror 5's Vim keymap from 2018.
- The second is replit's maintained engine, [`@replit/codemirror-vim-core`](https://www.npmjs.com/package/@replit/codemirror-vim-core) 0.1.0. It is published on its own for exactly this use ("use this package if you're building your own editor adapter"). The adapter drives it with about 45 lines of glue.

Both engines passed all 31 checks of the spike on Monaco 0.57, whose typing now reaches the editor through the browser's EditContext API instead of a hidden textarea. The checks covered:

- motions, operators and `.` repeat;
- `:s`, search, and visual line and block selection;
- ex commands and mappings;
- switching models under one editor;
- a read-only editor;
- two editors on one page;
- the suggest widget;
- turning Vim off again.

**`monaco-vim` as published needs work before it fits.**

- It imports two Monaco files by their pre-0.56 paths. Monaco 0.56's new exports map no longer serves those paths, so the build fails outright.
- The build Vite picks for browsers carries its own copy of Monaco 0.33's `ShiftCommand`.
- Its `>>` and `<<` throw on a line whose indentation is not a whole number of indent steps, in both builds, because Monaco 0.57's `ShiftCommand` takes a service that the adapter never passes.
- Upstream is kept alive by a dependency bot. The last human commit was on 2025-11-22, and nobody has reported the Monaco 0.56 break.

**Recommended route: keep `monaco-vim`'s adapter in the repository and run replit's engine on it.** The adapter is about 1,300 lines, MIT. Bringing it into the repository means:

- the adapter's Monaco bugs become ours to fix, and they need fixing under either engine;
- the engine stays a maintained dependency, with a shared suite of more than 700 tests;
- we gain the `noremap` family, `:normal`, `:put` and a `+` clipboard register, which `monaco-vim`'s engine lacks.

The engine's chunk is 94 KB minified (29.3 KB gzipped), loaded only for people who turn Vim on.

**`vim-monaco`, the other published Vim port, is not an option.**

- It declares Monaco below 0.53.
- It reads a global `window.monaco`, which Monaco no longer sets.
- With EditContext, its `:` and `/` prompts never receive focus, so ex commands and searches are typed into the program.

**Emacs is a much weaker case.**

- `monaco-emacs` has not changed since February 2022, and loads only from its TypeScript sources.
- On Windows and Linux the browser keeps C-n, C-w and C-t for itself in an ordinary tab: new window, close tab, new tab. Firefox also keeps C-q and C-S-p.
- On macOS, Monaco already binds the basic Emacs Control keys.

**The hard part is fitting Vim into the Workbench, not the library.**

- The Workbench blurs the editor on any Escape the editor did not handle. In Vim's normal mode that is every plain Escape. After that, `R`, `S`, `C`, `D`, `P` and `B`, all common Vim commands, become the Workbench's Run, Save, Clear, Documentation, Settings and Build shortcuts.
- The status line and the `:` command line need a place that does not collide with the floating execution controls.
- Ctrl+C becomes Escape, so nothing reaches the system clipboard without a bridge.
- In an Exam, Escape leaves fullscreen in Firefox, where the Exam does not lock the key, and leaving fullscreen disables the Exam.

**Custom mappings work through ex commands, which the engine runs line by line.**

- `imap kj <Esc>` works under both engines.
- The `noremap` family works only under replit's.
- Neither engine accepts `let mapleader`, `"` comments or most `set` options.
- A mapping never fires when its first key is already a whole command, as `<Space>` and `,` are, unless that key is unmapped first.

## The request

The issue asks for "a full on Vim mode, with all the regular Vim keybindings, like in Compiler Explorer". It also asks for keys to be remappable, such as `kj` to Escape in insert mode, and mentions Emacs as a second wish. The owner's answer pointed at the settings store, `Editor.svelte` and `Monaco.ts`, and asked for an optional `vimMode` parameter on the editor. The issue's author offered to implement it.

Two things have changed since that answer, which was given in October 2025.

**The settings store became the Preferences store** ([ADR 0014](../adr/0014-settings-split-by-effect.md), [project-format.md](./project-format.md)).

- The issue's advice to bump the settings version no longer applies. [preferencesStore.svelte.ts](../../src/stores/preferencesStore.svelte.ts) has no version.
- It keeps a stored value only while that value is still valid, and gives a missing key its default, so a new Preference needs no migration.
- A `choice` Preference already renders as a segmented control in Settings › Preferences ([Setting.svelte](../../src/components/specific/project/settings/Setting.svelte)).

**The project page became the Workbench** ([workbench.md](./workbench.md), [ADR 0024](../adr/0024-workbench-is-a-host-agnostic-shell.md)).

- It owns the shortcuts, the Escape handling and the layout around the editor.
- `Editor.svelte` is shared by the Workbench, every **Interactive editor** and the Exam's C answer editors. The Interactive editors are the Playgrounds, the documentation's instruction pages, the embed page and the chat page.

## Libraries

### monaco-vim

[brijeshb42/monaco-vim](https://github.com/brijeshb42/monaco-vim), MIT, latest 0.4.4, published 2025-11-22. It is made of three parts:

- `src/cm/keymap_vim.ts`: CodeMirror 5's Vim keymap, copied in 2018 and patched since, about 6,800 lines.
- `src/cm_adapter.ts`: an adapter that presents a Monaco editor through the CodeMirror 5 methods the keymap calls.
- `src/statusbar.ts`: a status bar.

**What 0.4.4 changed.** It moved the build to tsdown and added an exports map. It also renamed the two JavaScript files to `.ts`, adding only `// @ts-nocheck` to each. 0.4.3 was never published.

**Health.**

- The last commit on `master` is a Renovate update (2026-09-03). The last human commits were on 2025-11-22.
- There are 30 open issues and 11 open pull requests, ten of them from Renovate.
- "Is further maintenance planned?" ([#123](https://github.com/brijeshb42/monaco-vim/issues/123), 2024) has no answer.
- The repository still develops against Monaco 0.33.
- Nobody has reported the Monaco 0.56 break.

**Users.**

- Compiler Explorer, Google Colab, Bitburner and LiveCodes, among others; npm counts about 280,000 downloads a month.
- LeetCode very probably uses it too: its organisation keeps a fork, and its mode line and its reported bugs are `monaco-vim`'s.

**API, from `src/index.ts`.**

- `initVimMode(editor, statusbarNode, StatusBarClass?, sanitizer?)` attaches Vim to one editor and returns an adapter with `dispose()`. The third argument replaces the status bar with any class of the same shape, which is how a status line in the app's own design would be supplied. Bitburner passes a React one.
- `VimMode.Vim` is the engine's API: `map`, `unmap`, `noremap`, `mapclear`, `mapCommand`, `defineEx`, `defineAction`, `defineOperator`, `defineMotion`, `defineRegister`, `defineOption`, `setOption` and `handleEx`.
- The adapter emits `vim-mode-change`, `vim-keypress` and `vim-command-done`. It listens to Monaco's `onKeyDown`, `onDidChangeCursorPosition` and `onDidChangeModelContent`.

**How a key is handled.**

- The adapter's `handleKeyDown` runs from Monaco's `onKeyDown`, before Monaco's own keybinding service.
- When the engine takes the key, the adapter calls `preventDefault()` and `stopPropagation()`. When it does not, the event carries on to Monaco and then to the page.
- A listener registered on the editor earlier that calls `preventDefault()` makes the adapter ignore the key. That is the documented way for a host to keep a key of its own.

**State shared across the page.**

- Mappings, registers, ex commands and options live in one module-level object shared by every editor.
- Each editor keeps its own mode, cursor state and marks.
- The spike confirmed both halves. A mapping defined once worked in a second editor, and that editor stayed in normal mode while the first was in insert mode.
- A register yanked into in one editor pastes in another, as it does across Vim's own buffers.

**What its engine covers and does not, from the source.**

- **Ex commands:** `map`, `imap`, `nmap`, `vmap`, `unmap`, `write`, `undo`, `redo`, `set`, `setlocal`, `setglobal`, `sort`, `substitute`, `nohlsearch`, `yank`, `delmarks`, `registers`, `global`, `vglobal` and `colorscheme`. There is no `noremap` family, `omap`, `normal` or `put`. Through the API, `noremap` only re-points a key at a default command.
- **Options:** `filetype`, `pcre` and `insertModeEscKeysTimeout`. Search is always case-insensitive with smart case. There is no `ignorecase`, `hlsearch` or `tabstop` unless the host defines them.
- **Registers:** there is no `+` or `*` register and no clipboard option. `"+y` silently uses the unnamed register. A host can add one with `defineRegister`, whose interface is synchronous (`setText`, `pushText`, `clear`, `toString`).
- **Insert mode** matches only mappings whose context is `insert`. So Ctrl+V pastes natively in insert mode, while Ctrl+C has an insert mapping to Escape.
- **A read-only editor** refuses `i`, `a`, `o` and every other way into insert mode, because `enterInsertMode` returns early on `readOnly`. Monaco blocks the edits operators would make, so only motions remain.

**Open bugs worth knowing about:**

- `:%s/$/,` hangs ([#121](https://github.com/brijeshb42/monaco-vim/issues/121)).
- `:g` throws ([#120](https://github.com/brijeshb42/monaco-vim/issues/120)) because the adapter lacks `getLineHandle`.
- A macro keeps only one letter of the text typed while it was recorded ([#111](https://github.com/brijeshb42/monaco-vim/issues/111)). Bitburner disables `q` and `@` because of this.
- The `:` line has no history ([#23](https://github.com/brijeshb42/monaco-vim/issues/23)).
- Text from an input method lands in the document in normal mode ([#101](https://github.com/brijeshb42/monaco-vim/issues/101)).
- `dispose()` focuses the editor ([#102](https://github.com/brijeshb42/monaco-vim/issues/102)), and it leaves `cursorStyle`, `cursorBlinking` and `cursorWidth` at Vim's values rather than the editor's.

### @replit/codemirror-vim-core

[`@replit/codemirror-vim-core`](https://github.com/replit/codemirror-vim/tree/master/packages/codemirror-vim-core) 0.1.0, MIT, published 2026-07-28. It is the engine behind [`@replit/codemirror-vim`](https://github.com/replit/codemirror-vim), CodeMirror 6's Vim, which is downloaded about 530,000 times a month. The engine package itself is downloaded about 258,000 times a month, through the releases that depend on it.

- It descends from the same CodeMirror keymap as `monaco-vim`'s engine and is maintained.
- It has been split out to be "editor-agnostic": `initVim(CodeMirror)` takes any constructor shaped like CodeMirror 5's, which is exactly what `monaco-vim`'s adapter is.
- It ships its shared test suite of more than 700 tests.

Over `monaco-vim`'s engine it adds:

- the `omap` and `noremap` families, the `mapclear` family, `normal`, `put`, `marks`, `delete`, `join` and `startinsert`;
- the `textwidth` and `langmap` options;
- a `+` register that writes through `navigator.clipboard.writeText` and pastes after an asynchronous `readText()`.

It has no `*` register, no `clipboard=unnamedplus` and no `mapleader`.

Unlike CodeMirror 5's keymap, it leaves the wiring of keys to the adapter: it exports `findKey`, `handleKey`, `enterVimMode` and `leaveVimMode` and registers no keymap of its own. The spike supplied that wiring with the 30 lines CodeMirror 5's keymap used to carry.

It calls 13 editor methods `monaco-vim`'s adapter does not have:

- Five are also missing for the old engine, which is how `:g` breaks.
- Five the engine checks for before calling.
- Three it calls unconditionally, and the spike stubbed those: `replaceSelection`, `isInMultiSelectMode` and `forEachSelection`.

No published Monaco adapter for it exists.

### vim-monaco

[pollrobots/vim-monaco](https://github.com/pollrobots/vim-monaco) 1.0.6, published 2024-11-22, is a TypeScript port of `monaco-vim`. Its API is cleaner than `monaco-vim`'s:

- an `IStatusBar` interface;
- `executeCommand`;
- `setClipboardRegister`, with an event to prefetch the clipboard;
- `open-file` and `save-file` events;
- digraphs, `expandtab` and `tabstop`.

It is still not usable here:

- It declares `monaco-editor` `>=0.50.0 <0.53.0` as its peer.
- It reads `window.monaco` when its module evaluates. Since 0.53 Monaco sets that global only when `MonacoEnvironment.globalAPI` is true, so it must be loaded after the host sets the global by hand.
- In the spike, once that was fixed, normal-mode editing worked. But `:` and `/` opened their input without focusing it: focus stayed in the editor and the command was typed into the document. Twenty of thirty checks passed.

### monaco-emacs

[brijeshb42/monaco-emacs](https://github.com/brijeshb42/monaco-emacs) 0.3.0 is by `monaco-vim`'s author; its last commit was on 2022-02-28, and the owner already judged it inactive in the issue.

**What it provides** ([commands.ts](https://github.com/brijeshb42/monaco-emacs/blob/master/src/emacs/commands.ts)):

- a kill ring (C-k, C-w, M-w, C-y, M-y);
- the mark (C-SPC, C-x C-x);
- C-s and C-r through Monaco's find, and M-f, M-b, M-d, C-v and M-v.

There is no M-x, C-x C-s or C-x C-f. `registerGlobalCommand` adds commands and `unregisterKey` removes them.

**In the spike.** Its published CommonJS build failed to load. It `require`s `monaco-editor`, which resolves to Monaco's AMD build, and crashes with `define is not defined`. Pointed at its TypeScript sources instead, it worked on Monaco 0.57: C-n, C-p, C-f, C-a, C-e, M-f, C-k, C-y and C-SPC … C-w all did what Emacs does. C-x C-s showed its prefix and ran nothing, since saving is for the host to define.

**Users.** LeetCode published its own fork in 2020, and LiveCodes loads 0.3.0. HackerRank, CoderPad and CodeSignal offer an Emacs mode whose implementation is not public.

**Writing a keymap ourselves** is also possible:

- Monaco has a public `monaco.editor.addKeybindingRules`, where a rule whose command starts with `-` removes a default binding.
- The kill ring, the mark and prefix keys would be state of our own.
- On macOS, Monaco already binds Ctrl+A, E, F, B, N, P, O, H, D, K and T the Emacs way. That is also how the macOS text system behaves, so a Mac user gets the basics today.

### Prior art

**Compiler Explorer** uses `monaco-vim` 0.4.4 on Monaco 0.55.1, built with webpack.

- 0.55's exports map still serves the old paths, and it has not moved to 0.56.
- Each editor pane has a Vim toggle in its toolbar. Settings › Keybindings has "Vim editor mode" and "Show relative line numbers (useful for vim motions)".
- The preference is kept in localStorage and deliberately left out of shared links.
- The status line sits above the code ([codeEditor.pug](https://github.com/compiler-explorer/compiler-explorer/blob/main/views/templates/panes/codeEditor.pug)).
- It defines no ex commands.
- A request for user mappings ([#6959](https://github.com/compiler-explorer/compiler-explorer/issues/6959)) is open.

**Bitburner** ([useVimEditor.tsx](https://github.com/bitburner-official/bitburner-src/blob/dev/src/ScriptEditor/ui/useVimEditor.tsx)):

- passes its own React status bar;
- defines `:w`, `:q`, `:wq` and `:x` with `defineEx`;
- maps `gt`/`gT` with `defineAction` and `mapCommand`;
- turns macros off.

**LiveCodes** has an "editor mode" setting with Vim or Emacs ([monaco.ts](https://github.com/live-codes/livecodes/blob/develop/src/livecodes/editor/monaco/monaco.ts)). **LeetCode** offers Standard, Vim or Emacs key bindings, and **HackerRank** and **CoderPad** offer the same choice. An independent comparison ([signmaker.dev](https://signmaker.dev/vim-features)) scored the Vim modes of CodeSignal, LeetCode, CoderPad and HackerRank at 18 to 23 of 28.

**User mappings.** No site on Monaco offers them.

- [Obsidian's vimrc plugin](https://github.com/esm7/obsidian-vimrc-support/blob/master/main.ts) and [marimo](https://github.com/marimo-team/marimo/blob/main/frontend/src/core/codemirror/keymaps/vimrc.ts), both on CodeMirror, read a vimrc line by line. They skip comments and run each line through the engine.
- Obsidian substitutes `<leader>` itself.
- JupyterLab's Vim takes structured mappings instead.

The common shape is a per-person choice of Standard, Vim or Emacs, stored locally. It comes with a one-line status line beside the code, and a few host ex commands such as `:w`.

### VS Code's Vim through monaco-vscode-api

[@codingame/monaco-vscode-api](https://github.com/CodinGame/monaco-vscode-api) runs VS Code's services around Monaco and can load web extensions, including [VSCodeVim](https://github.com/VSCodeVim/Vim), whose web build has been supported since v1.30. The research built it with VSCodeVim 1.32.4 on Monaco 0.57, and `x`, `iAB<Esc>` and `dd` worked. That is the most complete Vim available, but it would mean:

- replacing `monaco-editor` with CodinGame's build;
- initializing VS Code's services once per page, with no way to unload them;
- creating models through `createModelReference`, since models made with `createModel` are invisible to VS Code's services;
- losing Monaco's built-in language contributions, which that build empties.

The cost in bundle size, for a minimal build of the main chunk:

|                                  | Main chunk, minified | Main chunk, gzipped | Also loaded                                                                 |
| -------------------------------- | -------------------- | ------------------- | --------------------------------------------------------------------------- |
| Plain Monaco 0.57                | 4.05 MB              | 1.05 MB             |                                                                             |
| monaco-vscode-api with VSCodeVim | 8.03 MB              | 2.08 MB             | a 1.93 MB extension host worker and VSCodeVim's 2.28 MB, inside that worker |

## Spike results

Setup:

- Two Monaco 0.57 editors on one page, with explicit models, as `Editor.svelte` creates them.
- Keys typed through `Input.dispatchKeyEvent`.
- Monaco used its EditContext input path (`.native-edit-context`, no textarea), which is what every Chromium user gets.
- The engine columns use `monaco-vim`'s adapter in both cases: its ESM build behind the aliases below.

| Check                                                                                 | `monaco-vim`'s engine                                                                                     | replit's engine                                  |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Build without aliases                                                                 | Fails: Rolldown cannot resolve `monaco-editor/esm/vs/editor/editor.api`                                   | (same adapter)                                   |
| `j`, `x`, `u`, Ctrl+R, `dd`, `P`, `yyp`, `ciw`, `.`                                   | Pass                                                                                                      | Pass                                             |
| `>>` and `<<` on a line indented by 0 or 4 spaces or a tab                            | Pass                                                                                                      | Pass                                             |
| `>>` on a line indented by 3 spaces                                                   | Throws (`getLanguageConfiguration` of undefined) and changes nothing                                      | Same                                             |
| `A … <Esc>`: insert, then back to normal                                              | Pass; the Escape never reaches window listeners and the editor keeps focus                                | Pass                                             |
| `<Esc>` in plain normal mode                                                          | Not handled by Vim: it reaches window listeners, so the Workbench would blur the editor                   | Same                                             |
| `:s/move/MOVE/`, `/loop`, `:w` through `defineEx`, `:imap jj <Esc>`                   | Pass                                                                                                      | Pass                                             |
| `V j d`, Ctrl+V `j j I; <Esc>`                                                        | Pass                                                                                                      | Pass                                             |
| `setModel` to another model and back                                                  | Pass, but marks follow the editor: `ma` in File A, `'a` in File B jumps to A's line                       | Same                                             |
| Read-only editor                                                                      | Motions work, `dd` and `x` change nothing, `i` and `o` stay in normal mode                                | Same                                             |
| Two editors                                                                           | Own modes, shared mappings                                                                                | Same                                             |
| Suggest widget open in insert mode                                                    | Down and Enter go to the widget; one Escape closes it and leaves insert mode                              | Same                                             |
| `dispose()`                                                                           | Keys type text again                                                                                      | Same                                             |
| `u` after inserting `hello world, more words; and more`                               | Undoes one word at a time (Monaco's undo stops), where Vim undoes the whole insert                        | Same                                             |
| Ctrl+C in visual mode                                                                 | Acts as Escape; no `copy` event                                                                           |                                                  |
| Ctrl+F in normal mode                                                                 | Pages down; Monaco's find widget does not open                                                            |                                                  |
| `"+yy` with a `+` register added through `defineRegister`                             | The register receives the line                                                                            |                                                  |
| `gd` and `K` mapped to `editor.action.revealDefinition` and `editor.action.showHover` | `gd` on a label jumped to its definition through a registered definition provider                         |                                                  |
| Ctrl+M (Monaco's Tab-focus toggle), then Tab                                          | Focus leaves the editor                                                                                   |                                                  |
| Lazy chunk, minified / gzipped                                                        | 100 KB / 30.6 KB for the ESM build; the default UMD build is 202 KB / 64 KB, with Monaco 0.33 code inside | 94 KB / 29.3 KB for the engine, plus the adapter |

The aliases, as the spike's `vite.config.js` had them:

```js
resolve: {
    alias: [
        //the ESM build imports Monaco's own ShiftCommand; the "browser" UMD build inlines a 0.33 copy
        {
            find: /^monaco-vim$/,
            replacement: fileURLToPath(
                new URL('./node_modules/monaco-vim/dist/index.mjs', import.meta.url)
            )
        },
        //monaco-vim imports Monaco's pre-0.56 deep paths; 0.56's exports map serves them without the esm/vs prefix
        { find: /^monaco-editor\/esm\/vs\/(.*)$/, replacement: 'monaco-editor/$1' }
    ]
}
```

Lines tried as a vimrc, through `Vim.handleEx`:

| Line                                               | `monaco-vim`'s engine   | replit's engine |
| -------------------------------------------------- | ----------------------- | --------------- |
| `imap kj <Esc>`, `nmap Y y$`, `nmap <C-s> :w<CR>`  | Work                    | Work            |
| `nnoremap ; :`, `inoremap jk <Esc>`, `noremap H ^` | "Not an editor command" | Accepted        |
| `let mapleader = ","`, `" a comment`               | "Not an editor command" | Same            |
| `set ignorecase`                                   | "Unknown option"        | Same            |
| `nmap \w :w<CR>`                                   | Works                   | Works           |

`nmap <Space>w :w<CR>` and `nmap ,w :w<CR>` are accepted under both engines but never fire. `<Space>` (move right) and `,` are whole commands, and a whole command runs at once instead of waiting for the next key. After `unmap <Space>`, `<Space>w` works.

The spike could not show what the browser does with the keys it reserves. Events sent over the DevTools protocol go straight to the page and skip the browser's own shortcuts.

## Fit with this codebase

### A Preference, applied in `Editor.svelte`

Vim changes only how the editor behaves for one person, which is the definition of a **Preference**. The natural shape:

- a `choice` Preference in Settings › Preferences: standard or Vim, with Emacs later if ever;
- read by `Editor.svelte`, so that every host gets it: the Workbench, every Interactive editor and the Exam's C editors;
- an effect in `Editor.svelte` that attaches Vim when the Preference turns it on, and disposes it when it turns off.

The spike showed that `dispose()` hands the keys back immediately, so no reload is needed. After disposing, the editor's own cursor options have to be applied again.

The Vim state is global to the page, so everything defined once belongs in one module next to [Monaco.ts](../../src/lib/monaco/Monaco.ts):

- the lazy import;
- the ex commands and actions;
- a clipboard register;
- the person's own mappings.

An ex command that depends on the host, such as `:w`, receives the adapter, and through `cm.editor` the editor it was typed in, so it can find that editor's host. The app registers no Monaco commands or keybindings of its own today, so nothing inside Monaco competes with Vim.

### The status line and the command line

Vim is barely usable without the mode, the pending keys and an input for `:` and `/`. The adapter draws them into a node it is given, or into a status bar class supplied in place of its own. Where they go is a design decision:

- **A strip under the code, inside `Editor.svelte`**, works for every host at once. Compiler Explorer puts its strip above the code instead. But on the desktop Workbench the execution controls float along the editor's bottom edge ([EditorArea.svelte](../../src/components/specific/workbench/EditorArea.svelte)). Also, `Editor.svelte` has no wrapping element today: its two root elements sit in the host's flex row, so it would need one.
- **The mode in the file tab row, with an overlay for `:` and `/`.** The mode goes at the row's right end, beside "Live file" ([FileTabs.svelte](../../src/components/specific/workbench/FileTabs.svelte)). The `:` and `/` input becomes an overlay over the code, the way Monaco's find widget appears. That fits the Workbench, but the compact layouts hide the tab row and the Interactive editor has none.
- **A Monaco overlay widget in a corner of the code** is the same in every host and stays out of the floating controls' way.

The adapter's status bar has no ARIA roles. Ours should announce the mode through a live region.

### Escape and the Workbench's shortcuts

[WorkbenchSession.svelte.ts](../../src/lib/workbench/WorkbenchSession.svelte.ts) (`handleKeyDown`, line 936) ignores keys typed into the editor, except that Escape blurs it (line 949).

- Vim consumes the Escape that leaves insert or visual mode, so that one never gets there.
- An Escape in normal mode with nothing pending is not Vim's, and it reaches the Workbench.

Vim users press Escape out of habit, often more than once. The keys they type next then reach the Workbench's single-key shortcuts ([shortcutsStore.ts](../../src/stores/shortcutsStore.ts)), which are Shift+letter:

| Key | Workbench action      |
| --- | --------------------- |
| `R` | Runs the program      |
| `S` | Saves                 |
| `C` | Clears the execution  |
| `D` | Toggles Documentation |
| `P` | Toggles Settings      |
| `B` | Builds                |

With Vim on, Escape should leave focus where it is. How a keyboard user then leaves the editor is the open part. Monaco's Tab-focus toggle is one candidate: Vim leaves Ctrl+M alone (Ctrl+Shift+M on a Mac), and in the spike Ctrl+M followed by Tab moved focus out of the editor with Vim on.

Browser extensions such as Vimium and Vim Vixen take Escape for themselves. Sites with a Vim mode note the conflict but cannot fix it.

The command-key shortcuts are caught in the capture phase, before the editor sees them (line 924). By default that is only Mod+K, which Vim does not use in normal mode. Someone who rebinds Run to Mod+R would take Ctrl+R from Vim's redo, which Settings › Shortcuts could warn about.

### Ctrl keys, reserved keys and the clipboard

**What Ctrl keys do in Vim's normal mode:**

| Key                            | Vim                                                                       |
| ------------------------------ | ------------------------------------------------------------------------- |
| Ctrl+C                         | Escape                                                                    |
| Ctrl+V                         | Starts a block selection                                                  |
| Ctrl+F, Ctrl+B, Ctrl+D, Ctrl+U | Scroll                                                                    |
| Ctrl+R                         | Redo                                                                      |
| Ctrl+A, Ctrl+X                 | Add to and subtract from the number under the cursor, handy on immediates |

**Keys the browser keeps.** In an ordinary tab, Chromium never passes these to the page ([`IsReservedCommandOrKey`](https://github.com/chromium/chromium/blob/main/chrome/browser/ui/browser_command_controller.cc)):

- Ctrl+W, Ctrl+N and Ctrl+T, and their Shift variants;
- Ctrl+Tab;
- Ctrl+PgUp and Ctrl+PgDn.

Firefox also keeps Ctrl+Q and Ctrl+Shift+P ([browser-sets](https://github.com/mozilla-firefox/firefox/blob/main/browser/base/content/browser-sets.inc.xhtml)). Both browsers lift the restriction in fullscreen, Firefox only with its keyboard lock option, and Chromium also in an installed PWA window.

For Vim that costs:

- Ctrl+W, the window prefix, which in insert mode deletes a word. The browser closes the tab instead. The project page's `beforeunload` guard is the only protection.
- Ctrl+N (move down).
- Ctrl+T in insert mode (indent).

On a Mac, these browser shortcuts use ⌘, so none of these conflicts arise.

**The clipboard.** Yanks go to Vim's registers, and Ctrl+C no longer copies, so text leaves the editor only through Monaco's context menu or a bridge.

- **Writing out:** a `+` register can write through to `navigator.clipboard.writeText`. replit's engine has one. Under `monaco-vim`'s engine it can be added with `defineRegister`.
- **Pasting from outside:** still works in insert mode, where Ctrl+V is native.
- **`"+p`:** must read the clipboard first. Chromium asks for permission for that, and Firefox and Safari show a one-item Paste menu.

Whether every yank should also reach the system clipboard, like Vim's `clipboard=unnamedplus` (Obsidian's plugin does it), is a choice to make.

### Read-only editors, Files and undo

These three gaps are in the adapter, so they need fixing under either engine:

- **Read-only editors.** During a Debug session, on a Build snapshot and in a disabled Exam, the editor is read-only. Vim's motions still work there and nothing can enter insert mode, which is the right behaviour.
- **Marks across Files.** The Workbench keeps one Monaco editor and swaps a model per File. Vim follows the swap. But the adapter stores marks per editor rather than per model, so `'a` in another File jumps to File A's line. Saving and restoring marks on `onDidChangeModel` would make them per File, as Vim's are per buffer.
- **Undo after an insert.** `u` undoes whatever Monaco recorded as one step. After an insert that step is a word, not the whole insert. Recording the model's version when insert mode starts, and undoing back to it, would restore Vim's behaviour.
- **`>>` on misaligned lines.** The fix is to give the adapter `indentMore` and `indentLess` through Monaco's own indent actions. replit's engine prefers those methods when an adapter has them.

### Exams

The Exam asks for fullscreen and locks Escape with `navigator.keyboard.lock` ([exam session page](../../src/routes/exam/session/+page.svelte), line 445). In Chromium a short Escape then reaches the page, and only a long press leaves fullscreen.

That API is Chromium's alone. Firefox 151 (May 2026) added its own equivalent: the `keyboardLock` option of `requestFullscreen()` ([release notes](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/151)). The Exam does not pass it, so in Firefox Escape leaves fullscreen. The Exam counts that against the student and disables itself.

Passing the option would close the gap in recent Firefox. In browsers with neither lock, a Vim user would have to leave insert mode another way:

- Ctrl+[ or Ctrl+C, which Vim treats as Escape;
- a mapping such as `imap jj <Esc>`.

### Phones and tablets

A touch keyboard has no Escape key, and in normal mode typing does nothing. Monaco itself does not support phones. Text from a virtual keyboard can also arrive the way an input method's does, which lands in the document in normal mode.

Since the Preference is per person and off by default, the risk is someone turning it on and then opening the editor on a phone. Hiding the Preference on touch-only devices, or ignoring it there, would avoid that. An iPad with a hardware keyboard is the case against ignoring it.

### Language features from Vim

Vim's own `gd` and `K` mean "go to the declaration" and "look up the word". The spike mapped them to Monaco's `editor.action.revealDefinition` and `editor.action.showHover`. In the Workbench those reach the language service's definitions across Files, and the instruction documentation in the hover. Mappings for references and rename could reach those actions the same way.

## Ways to solve it

### 1. Vim on a vendored adapter and replit's engine, as a Preference (recommended)

- **The Preference:** a `choice` Preference, standard or Vim, in Settings › Preferences, off by default.
- **The adapter, brought into the repository.** Copy `monaco-vim`'s `cm_adapter.ts`, about 1,300 lines, MIT, with its copyright notice, into `src/lib/monaco/`. Fix there:
    - `>>` and `<<` through Monaco's indent actions;
    - marks per File;
    - one undo step per insert;
    - restoring the editor's cursor options;
    - the methods the engine calls that the adapter lacks.
- **The engine as a dependency.** `@replit/codemirror-vim-core` provides it, with the 30 lines of key wiring that CodeMirror 5's keymap used to carry. Its test suite could later run against the adapter in a browser.
- **One page-level module** that lazy-loads the engine and defines the ex commands and actions once per page:
    - `:w` saves in the Workbench;
    - `gd` and `K` reach the language service;
    - the person's mappings are applied there.
- **`Editor.svelte`** attaches and disposes Vim with the Preference, with a status line in the app's design.
- **The Workbench** stops blurring the editor on Escape while Vim is on.
- **Custom mappings**, in the same pass or later:
    - a multi-line Preference holding ex lines;
    - run through `Vim.handleEx` on load, and again on change after the `mapclear` family;
    - `"` comments skipped, and `<leader>` written out, since there is no `mapleader`;
    - a `<Space>` leader needs `unmap <Space>` before it.

    `Setting.svelte` renders no text Preference today, so this needs a new kind of row.

The risk is the engine's youth. Its standalone package is two months old and at 0.1.0, and the interface it expects may still move. Pinning its version contains that.

### 2. Vim on monaco-vim as published

This is the same Preference and the same integration as option 1, but with `monaco-vim` installed as it is:

- the two aliases;
- a runtime patch of the adapter's `indentLine`;
- no `noremap` family;
- an engine that will not move again.

It is the quickest first cut. It leaves us depending on a library that has not had a human commit for ten months and that imports Monaco's internals by path. Moving to option 1 later changes the engine and keeps everything around it.

### 3. Emacs, as a later choice of the same Preference

Emacs could be added with `monaco-emacs`'s sources brought into the repository, or with a keymap of our own through `addKeybindingRules`. Either way, on Windows and Linux it cannot have C-n, C-w or C-t in an ordinary tab, nor C-q and C-S-p in Firefox. So it would ship with alternatives for those keys. It earns its place mainly where many users ask for it, as interview sites found. Nobody has asked here beyond the issue's "I suppose".

### 4. VS Code's Vim through monaco-vscode-api

This gives the most complete Vim, but it means replacing Monaco with CodinGame's build and doubling the main bundle. It adds a 4 MB worker, and it hands models and languages to VS Code's services. That is out of proportion for a key binding Preference.

### 5. Switching to CodeMirror 6

CodeMirror 6 has the best-maintained browser Vim, [`@replit/codemirror-vim`](https://github.com/replit/codemirror-vim), the one the issue's author used before. Moving the editor off Monaco would mean rewriting everything built on Monaco: the language services, diagnostics, hovers, view zones, decorations and multi-File models. It is not a realistic way to get Vim.

## Decisions this leaves for the owner

1. Which engine: replit's with a vendored adapter (option 1), or `monaco-vim` as published (option 2).
2. Vim only, or Vim and Emacs.
3. Which editors get Vim: every editor, or only the Workbench. The others are the Playgrounds, the documentation pages, the embed and chat pages, and Exam answers.
4. Where the status line and the `:` command line go.
5. What Escape does in the Workbench with Vim on, and how a keyboard user leaves the editor.
6. Whether yanks reach the system clipboard always, or only through `"+`.
7. Custom mappings: whether they come in the first pass, and how much of Vim's dialect to accept.
8. Exams: whether to pass Firefox's `keyboardLock`, and what to do in browsers with neither lock. Also what to do on touch-only devices.
