# Design system hardening review

Written on 2026-11-08 on `feat/design-system`. Research only: nothing under `packages/` was changed. It reviews `git diff origin/main...HEAD -- packages/asm-editor/src` against [design-system.md](../design/design-system.md) (D1-D17), its [plan](../design/design-system-plan.md) and the [register](../design/design-system-changes.md), and follows each pattern into the rest of the codebase.

Paths are relative to `packages/asm-editor/src/`. HEAD moved during the review, from `62cc12b7` to `554090cf` (the copy buttons, the exam builder's title, the student's exam page). Line numbers for `routes/exam/**`, `routes/embed/+page.svelte` and `components/specific/exam/*` are at `554090cf`. Elsewhere they are at `62cc12b7`, which `554090cf` left unchanged except for `ErrorState.svelte`, `AgentDocs.svelte`, `LoggerProvider.svelte`, `WorkbenchShell.svelte` and `WorkbenchUi.svelte.ts`, whose numbers may be off by a few lines. The copy-to-clipboard buttons and the toast were left out, as asked.

**How each finding was checked.** Every finding was confirmed by reading the code. Those marked _render-verified_ were also checked on the design-system dev server (port 4197) with headless Chrome, either by computed style or by finding which CSS rules match an element. That server compiles the working tree, which other sessions were editing at the time. Findings marked _needs render check_ were confirmed by reading only.

## 1. Findings, ranked

### F1. Lint fails on HEAD

- **Where:** `components/shared/layout/Page.svelte:4,30-31`.
- **What's wrong:** `pnpm lint`, run as `eslint .`, reports `no-useless-assignment` on `landed = true`. The rule does not see that a later Page instance reads the module-level `let`. svelte-check (0 warnings) and `vp lint` are clean. The name `arriving = landed` is also inverted: it is true when the page did _not_ just land.
- **Fix in progress:** another session's uncommitted edit changes the variable to `const pages = { landed: false }`. With that edit, ESLint on the working tree is clean. Check that it gets committed, and consider renaming `arriving` to `navigated`.
- **Visible change:** no. **Risk:** none. **Effort:** S.

### F2. The file tab's ENTRY weight leaks into the Explorer and Symbols panel

- **Where:** `components/specific/workbench/FileTabs.svelte:119-123`, the unscoped rule `:global(.badge.entry-mark.entry-mark) { font-weight: 500 }`. The same class is used at `specific/project/Explorer.svelte:1034` and `specific/workbench/SymbolsPanel.svelte:455`.
- **What's wrong:** register O-49 asks for medium weight "in a file tab". FileTabs is always mounted in the Workbench, so the Explorer's and the Symbols panel's ENTRY marks are drawn at 500 too, not at Badge's 700 (S3-59). _Render-verified:_ the Explorer's mark computes to `font-weight: 500`. The class is doubled only to outweigh Badge's `.badge.svelte-x`.
- **Fix:** either a `weight` prop on Badge, or a rule scoped to the tab, such as `.name ~ :global(.entry-mark)`.
- **Visible change:** yes. The Explorer and Symbols marks go back to bold, unless the owner wants 500 everywhere, in which case the weight belongs in Badge's tone.
- **Risk:** low. **Effort:** S.

### F3. Button has no gap between icon and label, and no icon size, so about 32 callers set them by hand

- **Where:** `shared/button/variants.scss:11-50` and `Button.svelte:50-71` set no `gap` and no svg size.
    - **24 inline styles:** `routes/+page.svelte:371,419,428,589,615,753,772`; `DocumentationBrowser.svelte:494,499,504`; `routes/projects/+page.svelte:134,157`; `routes/projects/create/+page.svelte:237`; `routes/examples/+page.svelte:254`; `routes/changelog/+page.svelte:45`; `routes/exam/+page.svelte:467`; `routes/exam/session/+page.svelte:1136`; `routes/embed/+page.svelte:438`; `routes/learn/courses/[courseId]/+layout.svelte:128`; `routes/learn/courses/[courseId]/+page.svelte:69`; the lecture page `:199,214`; `ProjectCard.svelte:148`; `TopBar.svelte:34`; `ThemeEditor.svelte:79`. The values are 0.2, 0.4, 0.45, 0.5 (13 of them), 0.6 (7) and 1rem.
    - **Rules in the callers' own CSS:** `DefaultNavbar.svelte:206`, `ErrorState.svelte:~211`, `FileStatusLine.svelte:75-84`, `exam/session/+page.svelte:~1851-1858`, `FilePreview.svelte:319-328`, `ScreenRenderer.svelte:781-784`, `ExamOutline.svelte:291-293`, `routes/+page.svelte:1665-1668`.
- **Fix:** a gap in the size rules, through `--btn-gap` (md 0.5rem, sm 0.4rem), plus `> :global(svg) { width: 1em; height: 1em; flex: none }` in `variants.button`. Delete the overrides that equal the default.
- **Visible change:** none at the 0.5rem and 0.4rem sites. The 0.45, 0.6 and 0.2rem sites either keep an override or snap to the default (at most 1.6px; the owner decides).
- **Risk:** low. **Effort:** S-M.

### F4. Callers out-weigh shared components instead of the components taking an option

The register's O-70 moved Button's size rules behind `:where()`, so that any one caller class wins. The workarounds written before that, and the same pattern on other components, are still there:

- **`a.btn` qualifiers whose comments are now false:** `DefaultNavbar.svelte:202-209` says "`a.btn`: one more than the Button's own size rule … which otherwise ties", and `routes/+page.svelte:1658-1669,1679` says the same. Since O-70, a plain `.pill :global(.btn)` already wins. `ErrorState.svelte:~209-213`: the rule's padding equals `md`'s, so only its gap does anything.
- **Doubled and stacked classes:** `FileTabs.svelte:133-140` (`:global(.icon-button.group-action.group-action)`) and `ScreenRenderer.svelte:781` (`:global(.btn.ghost.sm.screen-action)`). These are the only doubled-class rules in the codebase.
- **Card's fixed column changed by qualifying its selector:** `NavigationLinkButton.svelte:24` (`a.card.navigation-link`), `InstructionIndex.svelte:92`, `AgentDocs.svelte:~104`.
- **The full-height square IconButton, written four times:** each sets `align-self: stretch; height: auto; width: X; border-radius: Y`. The copies are `TabStrip.svelte:330-336` (`.tab-close`), `FileTabs.svelte:133-140` (`.group-action`), `DraggableContainer.svelte:409-427` (`.bar-end`) and `SearchField.svelte:156-164,205-218` (`.clear`), plus `TopBar.svelte:63-68` (`.rail-width`).
- **EditorArea reaches into FileTabs:** `EditorArea.svelte:124-126,159-164` (`.editor-pane:last-child .group-action:last-child`) rounds the corner of a FileTabs button from outside.
- **Fix:**
    - Write Badge's, IconButton's and Card's looks (size, radius, colour, direction) behind `:where()`, as O-70 did for Button.
    - Give IconButton a `fill` mode that reads `--icon-button-cell` and `--icon-button-radius`.
    - Give Card a `direction` (row) prop.
    - FileTabs reads `--group-action-corner`, which EditorArea sets.
    - Then delete the qualifiers, the doubled classes and the stale comments.
- **Visible change:** no. **Risk:** low; the thing to watch is load order, so compare screenshots of the navbar and the file tabs. **Effort:** S-M.

### F5. The create page's form look is copied into the embed's Settings and the exam builder

- **Where:**
    - create page: `routes/projects/create/+page.svelte:151,263-273,280-288,292-312,315-320,365-369,394-440`
    - embed: `routes/embed/+page.svelte:366,641-651,663-667,776-806`
    - exam builder: `routes/exam/+page.svelte:638-666,739-744,786-834,879-887`
    - also `InstructionSetPicker.svelte:165-170` and `routes/+page.svelte:941-946`
- **Identical in all copies:**
    - The band: `--wb-section-header` fill, `border-block: 1px solid var(--line)`, `700 var(--fs-small)/1.4 var(--font-ui)`, `--secondary-text`.
    - The first band's top corners, `nested-radius(var(--wb-radius), $border: 1px)`.
    - `.actions`.
    - `.language-square`: three copies, plus the home page's `::before`.
    - A label over its control, `column; gap 0.3rem` (TextField's `.labelled` already draws this).
    - The sticky footer, apart from z-index and side padding.
    - The page column: `1.5rem` above, `4rem` below, `0.75rem 0 3rem` at 650px and narrower.
    - The subtitles `.guide` and `.lead`, each under `<Title style="margin-bottom: 0.5rem">`.
- **Near-identical:**
    - Band padding: `0.6rem 1.25rem` on create and embed, `0.6rem 1rem` on the exam builder.
    - `.section` gap and padding: 0.75rem on create and embed, 1rem on the exam builder.
    - The phone breakpoint: 600px against 720px.
    - The `.summary` wrap.
- **Different, so pixels would move if unified:** the hint styles (create `.template-description`, embed `.hint` and `.section-hint`, exam `.part-hint`), and the card heads and footers of the embed and the session.
- **Related:** the 52rem column is kept equal by hand between `exam/+page.svelte:599` and `exam/session/+page.svelte:1920`.
- **Fix:**
    - A `styles/form-card.scss` with `band`, `band-first($card-top)`, `section($gap)`, `sticky-footer($z)`, `summary($wrap)` and `actions`, the side inset read from `--form-inset` and the breakpoint passed as a parameter.
    - A `LanguageSquare.svelte` taking `language`.
    - A `PageHead.svelte` taking a title, a subtitle snippet and `centred`.
- **Visible change:** no, if the differing values are passed as parameters. **Risk:** low. **Effort:** M.

### F6. ExamOutline's `footer` slot is empty, and the page hides it with `:not(:has(*))`

- **Where:**
    - `components/specific/exam/ExamOutline.svelte:31,34,210-212` (`footer: Snippet`, required; `.foot`), its CSS at `:304-313,343-352`, and the comments at `:6-8,231-232,287,315-316`.
    - `routes/exam/+page.svelte:255` passes `{#snippet footer()}{/snippet}`, and `:626-630` hides the result with `.exam-builder > :global(.exam-outline .foot:not(:has(*))) { display: none }`.
- **What's wrong:** the slot is never filled, and the page reaches into the component's internals to hide its empty part. _Render-verified:_ `.foot` is an empty `<div>` computed `display: none`.
- **Fix:** delete the prop, `.foot` and its CSS, the empty snippet and the `:global` rule, and correct the comments.
- **Visible change:** no. **Risk:** low. **Effort:** S.

### F7. Nested radii went stale when the owner changed the parents' corners

- **The Debug windows:** `shared/draggable/DraggableContainer.svelte:361` now uses `$corner: var(--r-control)` (0.4rem, the owner's change), and the body clips (`overflow: hidden`). The panels inside still use the old value:
    - `user-tools/CallStack.svelte:73`: `border-radius: var(--r-overlay)` (0.6rem)
    - `user-tools/MutationsRenderer.svelte:69`: the same
    - `user-tools/MutationStep.svelte:487-489`: `nested-radius(var(--r-overlay), $inset: 0.4rem)`, with a comment saying "parallel to the window's"
    - _Render-verified:_ the children compute to 9.6px inside the frame's 6.4px. At 3× zoom, a faint wedge of the tray's fill shows in the bottom corners of Call stack and History. At 1× it is barely visible.
- **The Select options:** `memory/MemoryControls.svelte:505` gives the region list 0.4rem (O-07), but `Select.svelte`'s `.option` and `MemoryControls.svelte:583` still derive their radius from `--r-overlay`.
- **The Hex byte card:** `hex/HexEditor.svelte:571` and `:1058-1064` draw it on `popoverElevation().radius` (0.6rem) with 0.2rem/0.4rem padding. The owner's change moved hover cards to the control's corner, 0.4rem with 0.3rem padding, but O-10 lists only ValueDiffer, RegisterValueCard and MemoryRenderer.
- **Why it keeps happening:** D12's `nested-radius()` holds only while each child names its parent's actual token. Here they were written by hand.
- **Fix:** each rounded parent publishes `--surface-radius` (DraggableContainer, `.region-list`, Select's `.list`), and children use `nested-radius(var(--surface-radius), …)`. Give PopoverOutline a `corner: 'control' | 'overlay'` prop in place of a pixel number.
- **Visible change:** yes, small: the corner wedges disappear and the Hex card takes 0.4rem (the owner confirms that one).
- **Risk:** low. **Effort:** S-M.

### F8. No z-index scale

- **Where:** the values are chosen to beat each other, and the order is written only in comments:

    | Value | Used by                                                                                                 |
    | ----- | ------------------------------------------------------------------------------------------------------- |
    | 4     | navbar                                                                                                  |
    | 7     | exam builder footer                                                                                     |
    | 10    | `Draggable`, ScreenDisplayConfiguration                                                                 |
    | 11    | `FloatingContainer.svelte:77,96`, the Screen window (`ScreenRenderer.svelte:818`), the compact backdrop |
    | 12    | a maximized panel, the compact drawer, the exam session overlays                                        |
    | 15    | `FileDropZone`                                                                                          |
    | 20    | prompts, toasts, dialogs                                                                                |
    | 50    | `SearchPalette`                                                                                         |
    | 100   | `AgentSidebarFrame`                                                                                     |
    | 1000  | PageTransition, Monaco                                                                                  |

- **The exam builder footer:** `routes/exam/+page.svelte:780-789` uses `z-index: 7`, chosen above `InteractiveInstructionEditor`'s internal layers (the code at 2, `.floating-dock` at 5, `.failed::after` at 6). It has to, because `.editor-border` (`InteractiveInstructionEditor.svelte:1105-1115`) is `position: relative` with no isolation, so its layers join the page's stacking context.
- **A comment that disagrees with the code:** `FloatingContainer.svelte:71` says the floating Screen is at 10, but its layer is 11. The two tie and are ordered only by DOM order.
- **Values that do nothing:** `z-index: 100` on top-layer popovers (`popover="manual"` with `showPopover()`), where z-index has no effect: `Select.svelte:535`, `ContextMenu.svelte:192`, `ShareMenu.svelte:163`, `PixelEditor.svelte:2048`.
- **Fix:**
    - `--z-*` tokens in `tokens.css`: navbar, float, window, drawer, overlay, tray, palette, agent.
    - `isolation: isolate` on `.editor-border`, after which the footer's z-index can drop to 1, as the create page's (`:397`).
    - Delete the top-layer z-indexes.
- **Visible change:** no. **Risk:** medium for the isolation, which changes a shared editor's stacking. **Effort:** S-M.
- **Needs render check:** the builder's starter code after a failed Build, with the dock scrolled under the footer and the Testcases window open.

### F9. The anchored popovers and hover cards are written several times

- **ContextMenu and ShareMenu:** `ContextMenu.svelte:51-143,188-204` and `ShareMenu.svelte:44-108,159-175` repeat the same constants (`EDGE`, `ARROW`, `RADIUS`), the same `place()` that calls `placeCard` and then `showPopover`, the first-button focus, four window listeners, focus restore and an identical CSS block.
- **The hover cards:** `ValueDiffer.svelte:44-57,139-189`, `RegisterValueCard.svelte:14-19,44-88` and `HexEditor.svelte:555-571,1058` each repeat the outline, `elementSize`, the size state, `text-box: trim-both` and a pseudo-element pointer bridge.
- **The arrow size:** `ARROW = 6` is declared 8 times in TS (TooltipCard, ContextMenu, ShareMenu, ValueDiffer, RegisterValueCard, ScreenDisplayConfiguration, HexEditor, PixelEditor), plus 3 `$arrow: 6px` in SCSS.
- **The translucent fill:** written in both `PopoverOutline.svelte:49-51` and `popover.scss:26-27`.
- **Fix:**
    - An `AnchoredPopover.svelte`, or a `popoverAnchor` attachment, owning placement, listeners and focus.
    - A `HoverCard.svelte` taking `side`, `at` and children.
    - `POPOVER_ARROW` in `styles/elevation.ts`, beside the existing tested constants, and `$popover-arrow` in `popover.scss`.
- **Visible change:** no, apart from the Hex card (F7). **Risk:** low-medium. **Effort:** M.

### F10. The embed page reaches into FloatingContainer and TabStrip

- **Where:**
    - `routes/embed/+page.svelte:718-724` overrides FloatingContainer's `width: 100vw` (`:100,170`) with `:global(.floating-place) { width: 100cqw }` and `:global(.floating-container) { max-width: calc(100cqw - 2rem) }`.
    - `:866-878` points the theme token `--secondary` at the field fill inside `> :global(.tab-strip)` (through `--share-fill`, to avoid a self-reference), only to recolour TabStrip's selected tab (`TabStrip.svelte:310-311`).
    - The Preview frame's `20.8rem` and `0.8rem` are written in the generated HTML (`:162`) and again in CSS (`:704,712`).
    - `:839` `min-height: calc(1.5rem + var(--fs-small) * 1.3 + 2px)`, the 0.4rem gap and `@container (max-width: 23.5rem)` (`:811-828`) copy `InstructionSetPicker.svelte:126-146`.
- **Fix:**
    - `--screen-width` beside the existing `--screen-height` (`global.css:65,83`), which FloatingContainer reads and `.stage` sets to `100cqw`.
    - A `--tab-strip-picked` hook on TabStrip.
    - One `FRAME` constant used for both the HTML and `style:`.
    - A `styles/tiles.scss` shared with InstructionSetPicker.
- **Visible change:** no. **Risk:** low. **Effort:** S.

### F11. SearchField's clear button assumes SearchPalette's padding

- **Where:** `search/SearchField.svelte:189-218` copies `.top`'s padding (`SearchPalette.svelte:422`, `0.3rem 0.5rem`) as `--band-pad-block` and `--band-pad-end`, and the palette's corner as `nested-radius(var(--r-overlay), 1px)`. It also has a `max-width: 600px` query that exists only because of the palette's phone Cancel button. Register O-74 records the assumption.
- **Fix:** `.top` declares those properties and pads itself with them, SearchField only reads them (with defaults of 0), and the media query moves into SearchPalette.
- **Visible change:** no. **Risk:** low. **Effort:** S.

### F12. `contentPages.css` silently outweighs the pages' own rules

- **`.intro`:** `components/content/contentPages.css:22-33` styles `.content-pages main.content .intro`, which weighs (0,3,1) and beats any scoped `.intro` (0,2,0). That makes these rules dead:
    - `DocumentationHome.svelte:65-68` (`line-height: 1.5; max-width: 60rem; margin: 0`). _Render-verified on `/documentation/mips`:_ the scoped rule matches but loses; the intro computes to `max-width: 840px` (70ch), `line-height: 1.65` and `margin-bottom: 32px`.
    - `routes/documentation/+page.svelte:83-85`.
- **ChapterView:** `contentPages.css:74-79` reaches into ChapterView's markup, so `ChapterView.svelte:132-134` is dead.
- **A tie decided by load order:** `DocumentationHome.svelte:70` `.intro :global(code)` and `InlineMarkdown.svelte:14-21` both weigh (0,2,1), so whichever stylesheet loads last decides the code chips' colours. This is the class of bug O-70 describes.
- **Duplicates:** the intro block (column, 0.8rem gap, `p` margin, accent links) is copied in `routes/donate/+page.svelte:96-107` and `routes/learn/courses/+page.svelte:170-181`. `blog.css:7-13`'s `.blog-lead` plays the same role but has drifted (1.5 against 1.65, 65ch against 70ch).
- **Fix:**
    - Move the column, gap and accent links into `contentPages.css`.
    - Delete the dead scoped rules.
    - Move the chapter title rule into ChapterView.
    - Settle the chip tie.
    - Make `.blog-lead` the same lead style.
- **Visible change:** none for the deletions. The chip colours and the blog lead may move (render check `/documentation/mips` and a blog post). **Risk:** low. **Effort:** S-M.

### F13. The navbar's 3.2rem is written in about 12 places

- **Where:** `Page.svelte:66`, `Sidebar.svelte:53,55,99`, `DocumentationBrowser.svelte:866,870,874`, `blog.css:335,340` (`calc(100dvh - 6.7rem)`), `routes/+page.svelte:898`, `[courseId]/+layout.svelte:143`, the lecture page `:234` (`verticalOffset="3.2rem"`) and `ExamOutline.svelte:235,238`. The last also uses `100dvh` where `--screen-height` exists. `routes/chat/+page.svelte:156` defines its own `--nav-height`.
- **Anchor offsets built on it disagree:** 5.5rem (`ChapterView.svelte:97`, `blog.css:309`), 4.5rem (`MarkdownRenderer.svelte:204`) and `> 100` px (`ArticleOutline.svelte:69`).
- **The student page's offset is a guess:** `exam/session/+page.svelte:~1518` passes `verticalOffset="3rem"` for its own bar, which wraps to three lines on a phone. Bind its height instead (needs render check: review mode with AI, at phone width).
- **Fix:** `--navbar-height` and `--anchor-offset` tokens.
- **Visible change:** no, if each place keeps its anchor offset. **Risk:** low. **Effort:** S-M.

### F14. The documentation sidebar and the course sidebar are one layout written twice

- **Where:** `components/documentation/site/DocumentationLayout.svelte:52-117` and `routes/learn/courses/[courseId]/+layout.svelte:73-149`.
- **What both files repeat:**
    - DefaultNavbar with the same inline `border-bottom-left-radius: 0`.
    - Sidebar with the same `menuStyle`. Sidebar has only these two callers, and its own `overflow-y: auto` never applies.
    - SearchLauncher, MaskedScroll, and TogglableSection with the same `sectionStyle` and `style="padding-block: 0.5rem; gap: 0.3rem;"`.
    - The title `<span style="font-size: 1rem; margin-left: -0.1rem">`, also on the course page `:72`.
    - The footer, the SearchPalette and the preload.
- **The same 2.2rem row indent is passed three ways:** `--menu-link-indent`, `--instruction-indent` and the inline `lectureStyle="padding-left: 2.2rem"`.
- **The row look is written three times:** `MenuLink.svelte:29-37`, `InstructionsMenu.svelte:93-99` and `LecturesMenu.svelte:182-186`.
- **LecturesMenu's non-outline mode is half dead:** its padding is always overridden inline, and `.current-lecture` never matches.
- **Fix:**
    - A `SiteSidebarLayout.svelte` taking the theme, the search scope and placeholder, header, nav and footer snippets, and `contentTop`.
    - TogglableSection's `sticky` variant owns the paddings and the title nudge.
    - One `outline.link-row` mixin reading `--row-indent`.
- **Visible change:** no. **Risk:** low-medium (sticky headers, the phone drawer). **Effort:** M.

### F15. Accessibility gaps the quick rounds left, or did not fix

| Problem                                                                                                                                                                        | Where                                                                                                                     | Fix                                                                                                                                                                 | Visible                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| The two Poke inputs mark a refused value only visually (`.refused`). CommandLine, MemoryControls and the Testcase fields set `aria-invalid`.                                   | `MemoryRenderer.svelte:567`, `RegisterFileRows.svelte:448`                                                                | Set `aria-invalid` and style `[aria-invalid='true']`. That also unifies the three "refused" looks: CommandLine's inset shadow, the 2px outline, TextField's border. | Unifying the looks: yes |
| Button's `active` does not set `aria-pressed`, so four callers write both.                                                                                                     | `Button.svelte:23-24,57`; `HexStatus.svelte:95-96`, `ScreenRenderer.svelte:581-582,600-601`, `FilePreview.svelte:125-126` | A `pressed` prop that sets `aria-pressed`, as IconButton has.                                                                                                       | No                      |
| A disabled ButtonLink only cancels the click: it stays focusable, is announced as a live link and opens on middle click. It also carries `type="button"` on an `<a>`.          | `ButtonLink.svelte:53,59-66`; `examples/+page.svelte:249-251` adds `aria-disabled` by hand                                | Drop `href` and set `aria-disabled` when disabled. Better, one Button that renders `<a>` given `href`, as Card does.                                                | No                      |
| The Workbench rail's pass/fail dot is never announced.                                                                                                                         | `IconRail.svelte:56`                                                                                                      | Pass StatusDot's existing `label`.                                                                                                                                  | No                      |
| Icon sets `cursor: pointer` on its plain `div` branch too, so an icon in a disabled Button shows a pointer. Two callers undo it.                                               | `Icon.svelte:32-33`; `ExecutionDock.svelte:596-598,708-710`, `DraggableContainer.svelte:254`                              | Only `Footer.svelte:57-69` uses the clickable branch: make that an IconButton and delete the branch.                                                                | Cursor only             |
| _Predates the branch:_ Select renders `popupHeader` as an `<li role="presentation">` inside `role="listbox"`, so the memory region filter's `<input>` sits inside the listbox. | `Select.svelte:408-419`                                                                                                   | Render the header beside the `<ul>`.                                                                                                                                | No                      |
| _Predates the branch:_ FloatingContainer has no `role="dialog"`, `aria-modal`, Escape or focus handling, though it dims the page and locks scrolling like a modal.             | `FloatingContainer.svelte`                                                                                                | Dialog semantics, with a shared `ScrimLayer` (see F21).                                                                                                             | No                      |

**Effort:** S each, M for the Button/ButtonLink merge (28 ButtonLink call sites).

### F16. The removed tablet controls bar left dead code

- **Where:**
    - `specific/workbench/ExecutionControls.svelte:49-51,59-60,116,160` keeps the props `showCompilation` and `showViews`, and its doc (`:11-12,50`) still describes the bar. Only the removed bar set them; `lib/workbench/viewSwitch.dom.test.ts:202-205` still tests that case.
    - `ExecutionDock.svelte:563` reads `var(--execution-tray, var(--primary))`, but the only setter, in WorkbenchCompact, was removed in `b594f7ce`. My custom-property audit found this as one of the only two reads with no definition anywhere.
    - `WorkbenchCompact.svelte:5-7` says the controls are "in a bar across it".
- **Fix:** delete the props and the test case, write `--tray: var(--primary)`, and correct the comments.
- **Visible change:** no. **Effort:** S.

### F17. The Workbench repeats the same recipes

| Recipe                                                                                                           | Copies                                                                                                                                                                                                                                                                            | Shared piece                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| The value font pair `font-size-adjust: ex-height 0.49; font-variation-settings: 'wght' 400` (the owner's change) | 11: `RegisterFileRows.svelte:635,667`, `CyclesLine.svelte:66,77`, `ValueDiffer.svelte:199`, `RegisterValueCard.svelte:62`, `MemoryRenderer.svelte:791,824`, `MemoryControls.svelte:548,670`. `MemoryRenderer.svelte:877` undoes it again.                                         | `@mixin machine-value`                                                                                           |
| Row hover, focus ring and height                                                                                 | 5 rows: `SearchPanel.svelte:978-999`, `SymbolsPanel.svelte:790-815`, `EditHistoryPanel.svelte:219-248`, `Explorer.svelte:1416-1425`, `PixelEditor.svelte:2013-2018`. 11 files in the area hand-write the inset ring that `focus.scss`'s `focus-ring($inset: true)` already draws. | `@mixin row($height)` in `rows.scss`                                                                             |
| The outside-corner mask under a pinned header                                                                    | `CollapsibleSection.svelte:200-224`, `DocumentationBrowser.svelte:755-780`, `EntryRow.svelte:269-293`. `ScreenRenderer.svelte:751-762` copies CollapsibleSection's header band, and its comment says so.                                                                          | `radius.scss` `outside-corners()` and a `section-band` mixin                                                     |
| rem to px                                                                                                        | 6: `styles/elevation.ts:22-25` (not exported), `ClampedContent.svelte:52-54`, `ScreenRenderer.svelte:217`, `DebugToolsFloating.svelte:62-65` (read once, so it goes stale), `HexEditor.svelte:207-210`, `Editor.svelte:731`                                                       | An exported `rootFontSize()`                                                                                     |
| `.ellipsis { min-width: 0 }`, with the same comment                                                              | 5: `Explorer:1448`, `SearchPanel:1025`, `AnnotationPrompt:121`, `EditHistoryPanel:206`, `SymbolsPanel:747`                                                                                                                                                                        | `min-width: 0` in the global `.ellipsis`. Needs render check: other `.ellipsis` flex items may start truncating. |

**Visible change:** no. **Effort:** S each.

### F18. Shared components restyled through inline `style` strings

| Component  | What callers do now                                                                                                                                                                                                                   | Option it needs                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Select     | `ProgramPicker.svelte:46-51` undoes the field look inline; `MemoryControls.svelte:398-402` redraws the old memory look in 8 declarations (with a raw `0.8rem`); `examples/+page.svelte:312-317,330` reaches into `:global(.control)`. | `look: 'field' \| 'bare' \| 'outlined'` |
| Switch     | `--switch-*` sizes set inline at `SearchPanel.svelte:482` and `ShareMenu.svelte:134,144`, in two different small sizes.                                                                                                               | `size="sm"`                             |
| TabStrip   | `BottomPanel.svelte:80-81` injects `padding: 0 0.75rem` through `tabAttributes` for its icon-only tabs; `TabStrip.svelte:270-272`'s `margin-left` is always overridden.                                                               | An icon-only tab option                 |
| Button     | `TopBar.svelte:34-38` uses `size="sm"`, then overrides padding, height, gap and font size inline.                                                                                                                                     | A denser size, or `--btn-padding`       |
| IconButton | `SearchPanel.svelte:792-815` reaches in to make the Aa, ab and `.*` letters auto-width and draws its own expanded look.                                                                                                               | A `text` (auto-width) variant           |
| Header     | `<Header noMargin style="…">` at the lecture page `:134` and `InstructionDocumentView.svelte:161`.                                                                                                                                    | A `class` prop                          |

**Visible change:** no. **Effort:** M overall, S per component.

### F19. Every caller of DefaultCodingAgent strips its frame

- **Where:** `DefaultCodingAgent.svelte:259-264` draws a radius, a border and a shadow. All five callers remove them with `border-radius: 0; border: none; box-shadow: none`:
    - `exam/session/+page.svelte:937`
    - `ExamReviewAgentSidebar.svelte:30`
    - `AgentPanel.svelte:38`
    - `FloatingAgentSidebar.svelte:44`
    - `routes/chat/+page.svelte:31-32`
- **Fix:** drop the frame from the component and the strips from the callers, keeping the callers' `flex`, `min-height` and `opacity`.
- **Visible change:** no. **Effort:** S.

### F20. Shared components depend on the Workbench's stylesheet, and `--wb-line` has seven fallbacks

- **Wrong direction of dependency:** `Card.svelte:14`, `FloatingContainer.svelte:14` and `ErrorState.svelte:17` import `specific/workbench/workbench.css` to get the Card tokens.
- **Aliases:** `--wb-line` (50 reads) and `--wb-surface` (31 reads) are now pure aliases of `--line` and `--secondary`; Lines mode never redefines them. `--wb-radius`, `--wb-gap` and `--wb-card-edge` are real switches and stay.
- **Fallbacks:** 31 reads of `var(--wb-line, X)` draw a different line outside the Workbench, with 7 fallback values. Among them are `--tertiary` at 100%, 70%, 75% and 80%, `#404040` and `--hint` at 30%. D7 asked for one line.
- **Fix:**
    - Move the Card tokens to `styles/`.
    - Replace the plain alias reads; that changes nothing on screen.
    - List the fallback reads for the owner.
- **Visible change:** yes for the fallbacks, outside the Workbench. **Risk:** medium. **Effort:** M.

### F21. FloatingContainer re-implements the search palette's scrim

- **Where:** `FloatingContainer.svelte:35-46,74-133` copies SearchPalette's backdrop and its four-band blur grid (`SearchPalette.svelte:205-215,344-388`), with its own `delayHide`.
- **Fix:** a shared `ScrimLayer` that also takes the z-index token (F8) and the dialog semantics (F15).
- **Visible change:** no. **Risk:** medium. **Effort:** M.

### F22. The home page restyles its own components from outside

- **The hex text:** the markup is written three times (`routes/+page.svelte:359-366,443-447,764-767`), and `.quick-hex` (`1040-1060`) and `.closing-hex` (`1832-1855`) differ only in ink and mask. Fix: a `landing/HexBytes.svelte`.
- **HeroLink:** `.quick-links :global(.link-element)` (`1072-1088`) overrides HeroLink's background, colour, transition and hover, so `HeroLink.svelte:26-41` is dead; the home page is its only caller. Fix: move the look into HeroLink.
- **The accent underline link:** written three times, at `.inline-link` (`1464`), `.text-link` (`1476`) and `FeatureAccordion.svelte:250-265`.
- **AgentDocs:** it is styled through `.agents :global(section .heading)` and `:global(.agents > p)` (`1745-1760`), which match only because AgentDocs' root class is also named `agents`.
- **Focus rings:** three are identical to the global ring (`1256-1258`, `1340-1342`, `1491-1494`); four others should use `focus-ring($inset: true)`.
- **Visible change:** no. **Effort:** M.

### F23. The student page's C answer label no longer lines up (needs render check; the file is being edited)

- **Where:** `exam/session/+page.svelte:~2122-2128` pads the label `calc(1rem + 1px)`, which was worked out for the old question Card. The question is now an edge-to-edge panel (`~1937-1950`), so the label sits about 5px off at 900px and narrower, and about 9px off at 720px and narrower.
- **Fix:** one `--part-inset` read by `.part-head`, `.part-body` and the label.
- **Visible change:** yes, a fix.
- **Render check:** a C section at 800px and 400px wide.

### F24. Svelte 5 patterns, low priority

- **Counters raised in `$effect` and wrapped in `untrack`:** `DefaultNavbar.svelte:54-59` and `SearchPalette.svelte:63-68`. Use `onMount` with a returned decrement.
- **A `$derived` that writes a plain variable as a latch:** `DraggableContainer.svelte` (`mounted` and `opened`).
- **A `ResizeObserver` built at the top level with no cleanup:** `Draggable.svelte:31-41`. It predates the branch. Create it in the effect and return `disconnect`.
- **`$state` read and written only inside its own effect:** `routes/chat/+page.svelte:25,37` (`latestExampleSignature`), `exam/session/+page.svelte:160` (`timeoutSubmissionTriggered`), and `InstructionSetPicker.svelte:43` (`tiles`). Each can be a plain `let`.
- **Embed state:**
    - `routes/embed/+page.svelte:150,154,168-169`: `inIframe` and `framedByUs` can be constants. The route is `ssr = false`.
    - `:230-237`: an `$effect` with `untrack` makes up for EmulatorLoader keeping its disposed emulator bound after a remount. Clearing it in EmulatorLoader's `onDestroy` removes the need.
- **Effects that could be calls or keys:**
    - `HeroBackdrop.svelte:113-119`: an `$effect` with `untrack` that a `show(index)` call in `tick()` can replace.
    - `InstructionDocumentView.svelte:83-89`: a reset `$effect` that runs after `{#key}` has already rendered stale state.
    - `routes/projects/create/+page.svelte:100-107`: a template fallback written in an `$effect` and again with `?? templates[0]`.

**Effort:** S each.

### F25. Head tags written by hand instead of PageMeta

- **Where:** `routes/+page.svelte:316-338`, `changelog:15-26`, `projects:119-124`, the five `documentation/*/all/+page.svelte`, `examples:164-170`, `chat:70-73` and `InstructionPage.svelte:60-80`.
- **What's wrong:** these pages miss `twitter:*` and `og:type`, and the changelog's description is the home page's tagline.
- **Visible change:** no, the head only. **Effort:** S.

### F26. Unifications that change pixels (for the owner)

- **The turning chevron:** five copies with drifted opacity (0.55, 0.6, 0.7 or none) and size: `DocumentationBrowser.svelte:853-864`, `EntryRow.svelte:182-193`, `FoldToggle.svelte:53-63`, `FormPatternRow.svelte:218-226`, `CollapsibleSection.svelte:289-300`. Fix: a `DisclosureChevron.svelte`.
- **The collapsed Debug strips:** `DebugColumn.svelte:288-325` and `MemoryStrip.svelte` hover with accent 15% rather than `--hover-bg` (D4), and their focus ring is 1px. S3-83 thinned it from 0.1rem, where every other control has 2px.
- **Hint notes:** four hand-styled `--hint` notes sit beside the new EmptyState, at `SymbolsPanel.svelte:716`, `EditHistoryPanel.svelte:199`, `SearchPanel.svelte:941` and `SidePanel.svelte:347`.
- **The donate cards:** `/donate`'s platform card (`donate/+page.svelte:71-89,126-145`) is ContentLinkCard almost line for line. The phone padding step is written three times with different breakpoints (600px against 650px), and `InstructionIndex.svelte:57-67,92-136` re-implements NavigationLinkButton.
- **The chat page's AI toggle:** it re-implements DefaultNavbar's `aiToggle` (`routes/chat/+page.svelte:74-93,179-200`).
- **The `.external` icon boxes:** they are at 0.7rem, off the icon scale (S4-45), in `InstructionDocumentView.svelte:412-416` and `LectureSectionCard.svelte:127-131`.

## 2. Batches

The batches are grouped by file area so that the parallel ones do not touch the same files. B1 goes first because it adds the options and tokens the later batches consume. It also removes the callers' Button gaps across the whole codebase in one mechanical pass, so that this step conflicts with no other batch.

1. **B1a, Buttons and marks, first.**
    - Files: `components/shared/button/*`, `components/shared/misc/*`, `Icon.svelte`, `Footer.svelte`, `Header.svelte`.
    - Work: F3 (and the removal of the gaps from every caller), F4's `:where()`, IconButton `fill` and Card `direction`, F15's Button `pressed`, ButtonLink `disabled`, StatusDot label and Icon cursor, F19, F2's Badge weight.
    - Quick wins: Card `padding` and `gap`, Spinner `hideLabel`, the Button `variant` prop, `variants.scss:104`.
2. **B1b, the style layer, first and in parallel with B1a.**
    - Files: `styles/*` and `global.css`.
    - Tokens and helpers: `--z-*` (F8), `--navbar-height` and `--anchor-offset` (F13), `--screen-width` (F10), `rootFontSize()`, `POPOVER_ARROW`, the `machine-value`, `row`, `outside-corners`, `form-card` and `tiles` mixins. Only B1b edits `tokens.css`.
    - Shared floating and input: `components/shared/{floating,menu,input}/*` and `search/*` for F9, F11, F18 (Select, Switch, TabStrip) and SegmentedControl's `wrap`; F20's Card tokens move.
    - Quick wins: the global utility classes.
3. **B2, the form pages, after B1.**
    - Files: `routes/projects/create`, `routes/embed`, `routes/exam/**`, `components/specific/exam/*`, `InstructionSetPicker`, `MarkdownEditor`, `InteractiveInstructionEditor` (the isolation only).
    - Work: F5, F6, F8's footer, F10, F23, and the area's quick wins.
    - Start the session page only when the other session's edits there are committed.
4. **B3, the Workbench and project panels, after B1, in parallel with B2 and B4.**
    - Files: `components/specific/workbench/**`, `components/specific/project/**`, `lib/workbench/viewSwitch.dom.test.ts`.
    - Work: F2's scoping, F4's FileTabs and EditorArea, F7, F15's Poke inputs, F16, F17, F18's callers, and the area's quick wins.
    - Leave `InteractiveInstructionEditor` to B2.
5. **B4, the public pages, after B1, in parallel with B2 and B3.**
    - Files: `routes/+page.svelte`, `components/specific/landing/*`, `components/documentation/**`, `components/content/*`, `components/blog/*`, `routes/{learn,blog,documentation,donate,changelog,examples,chat,projects/+page.svelte}`, `MarkdownRenderer.svelte`, `TogglableSection.svelte`.
    - Work: F12, F13's callers, F14, F22, F25, and the area's quick wins.
6. **B5, the owner's calls, last.** F2's final weight, F7's Hex card, F20's fallbacks and F26, one decision at a time, each with a register entry.

Each batch adds an entry to the register for anything visible, as the register's rules ask.

## 3. Quick wins: no visible change

**Shared (B1):**

- `shared/input/SegmentedControl.svelte`:
    - The `wrap` prop and its CSS have no caller since `fed7a8f2` (lines 39-45, 66, 114, 119, 149-150 and 243-259), nor do `--segmented-count` and `--segmented-columns`.
    - Lines 4-6 and 42 still name the create page, which now uses InstructionSetPicker.
    - `.slider` is left over from the removed tabs mode.
    - The global `.wrap` (`global.css:60-62`) then has no user either.
- `global.css`: `.text-prose` (124-126), `.align-center` (168-170), `.justify-center` (172-174, which also sets `justify-items`, not `justify-content`) and `.flex-center` (178-181) are used nowhere, `src/content` included.
- `package.json`: `@iconify-json/ic` and `@iconify-json/octicon` are imported by nothing since `ee201938`. Register S4-44 left them for the owner, because dropping them changes the lockfile.
- Card: the `padding` prop is passed only as `padding="0"`, a no-op (Card has no padding), at create:163, embed:370, 393, 486, exam:260 and session:982, 1032, 1175, 1215, 1408. The `gap` prop has no caller.
- Spinner `hideLabel` and TextField `wrapperStyle` have no caller. Button and ButtonLink's `variant` prop has no caller; keep the SCSS switch, as D5 asks.
- `variants.scss:104`: `background-image: none` is left over from the removed gradient hover.
- `Header.svelte:20-36`: the four branches collapse to `<svelte:element this={type}>`.
- `Footer.svelte:186-195`: `height: unset` and the repeated logo size do nothing.
- `field.scss:2-3` still names the memory address field, which no longer uses it (O-07).
- `tokens.css:4-6` does not mention `--r-control`, which `elevation.test.ts` checks.
- `tray.scss:52-55` should be `@include focus-ring($inset: true)`.
- Focus rings identical to the global one: `Switch.svelte:65-68`, `ClampedContent.svelte:155-158`.
- Per-component `prefers-reduced-motion` blocks that `global.css:217-226` already covers: `Switch.svelte:95-100`, `Select.svelte:519-523`, `SegmentedControl.svelte:274-276`, `ClampedContent.svelte:181-186`.
- `lib/languages/languageCapabilities.ts`: `LANGUAGE_CAPABILITIES` and `LanguageCapabilityRow` are exported but used only inside the file.
- The `token()` test helper is copied in `elevation.test.ts`, `iconSizes.test.ts` and `motion.test.ts`.

**Form pages (B2):**

- `exam/+page.svelte:75`: `LANGUAGES` filters nothing, since `BASE_CODE` is typed to cover every language.
- `embed/+page.svelte`:
    - `:350`: an inner `<div style="display: contents">` that does nothing.
    - `:352`: the `padding` repeats `var(--embed-padding)` three times.
    - `.hint` (`674-679`) and `.section-hint` (`850-855`) are identical.
- `exam/session/+page.svelte`:
    - The classes `part-card prompt-card` (`981`) and `part-card` (`1407`) match no rule.
    - The `var(--wb-…, fallback)` fallbacks at `2122,2135,2136` never apply.
    - The comments at `2022` and `1567-1568` cite looks that have since changed.
- `MarkdownEditor.svelte`: the `split` and `auto` layouts, `lineNumbers`, `gutterSpacing` and the side-by-side CSS (`:16-30,44,159-179`) are used only by its DOM test; both callers pass `layout="switch"`.
- `MarkdownEditor.svelte:106-107`: hard-coded `1px solid var(--line)` and `--r-control`, where its comment says it matches `--wb-card-edge` and `--wb-radius`.

**Workbench (B3):**

- `EditorArea.svelte:130-132`: dead; the `.editor` box-shadow it cancels is gone.
- `FileTabs.svelte`: `:139`'s `color` is inherited from TabStrip anyway, and the comment at `:125-126` is orphaned.
- `WorkbenchCompact.svelte:315`: an overlong comment line.
- `BottomPanel.svelte:212`: an empty comment.
- `ValueDiffer.svelte:129`: a duplicate `text-align`.
- `TestcaseItem.svelte:479-481`: repeats the size set above it.
- `MemoryControls.svelte`: `:508`'s `backdrop-filter: none` and `:504`'s `border` do nothing.
- `Editor.svelte:1255-1258,1375-1381`: two `:global(.find-widget)` blocks that can be one.

**Public pages (B4):**

- `MarkdownRenderer`'s callers:
    - `EntryBody.svelte:161-166` and `LectureSectionCard.svelte:112-117` restyle `pre:has(code)`, but `MarkdownRenderer.svelte:425-431` (`.simple-code pre.code-block { … !important }`) always wins, so they are dead.
    - Keep those `!important`s: `markdownPlaygrounds.ts` puts `margin` and `max-width` inline on playground fences, and only `!important` beats them.
    - `codeBlocks.css:14-15`'s `background`/`color !important` fight nothing. _Render-verified on a lecture:_ the only other matching rule sets the same `--secondary`. They can go.
- `heroProgram.ts:158-159`: `hex` is exported and unused.
- `HeroBackdrop.svelte:280`: the comment sits above the wrong rule.
- `EntryRow.svelte:116-118,140-142`: a dead `.entry-row + .entry-row` rule and its svelte-ignore.
- `TogglableSection.svelte`:
    - `:136-138`: `translate: translateX(0)` is invalid CSS.
    - `:134`: the `!important` can become `.sub-section-content.cantAnimate`.
- Reduced-motion blocks that the global rule already covers: `routes/+page.svelte:1943-1948`, `FeatureAccordion:345-354`, `DocumentationBrowser:876-880`, `EntryRow:300-304`, `FoldToggle:68-72`.
- `routes/+page.svelte:1660-1661` and `DefaultNavbar.svelte:202-204`: the stale "`a.btn` … ties" comments (F4).
- `[courseId]/+layout.svelte`:
    - `:131`: `href="/donate"` without `resolve()`.
    - `:76`: `gap: 0` repeats Sidebar's.
- Lecture page:
    - `:216`: `disabled={!nextLecture}` sits inside `{#if nextLecture}`.
    - `:90-108`: the same `findIndex` is run twice.
    - `:304`: the comment refers to a removed Card.
- `InstructionIndex.svelte:48-53`: an inline layout style, and a `<div>` inside an `<h2>`.
- `InstructionLessons.svelte`: `:68`'s `--rule` duplicates `--doc-rule`, and `:123-126` repeats the global ring.
- `donate:101-103` and `learn/courses/+page.svelte:175-177`: `p { margin: 0 }` repeats the reset.
- AgentDocs: its `level` 3 and `.nested` have no caller (re-check after `554090cf`).
- `blog.css:73-79`: add `isolation: isolate` to `.blog-card`. The image's `z-index: -1` relies on Card isolating only when it has a cover.

## 4. Checked and found fine

**Tools and audits:**

- `svelte-check --threshold warning`: 0 errors, 0 warnings (2,100 files). `vp lint` (oxlint): clean. ESLint: only F1 on HEAD, plus two `svelte/no-useless-mustaches` that were briefly in the other session's uncommitted session page. A second run on the working tree, with both edits in progress, was clean.
- Custom properties, every `var(--x)` read against every definition (theme-generated ones included):
    - The only reads with no definition are `--execution-tray` and `--segmented-columns` (F16 and the SegmentedControl quick win), plus runtime-generated `--asm-*`, `--terminal-*` and Monaco's `--vscode-*`.
    - No stage-2 `--wb-*` alias is unread, and no `--RGB-*` channel is left.
- `:global(.class)` selectors: a script found none without a markup user, apart from classes generated at runtime (`compiled-section-border-*`, Monaco's).

**`!important`:** the 10 added on the branch are Monaco widget overrides (`Editor.svelte`, which Monaco styles inline or at high specificity) and the global reduced-motion rule. None fights our own code.

**New modules:**

- Every module the branch added is imported. The only unused exports are the two in `languageCapabilities.ts` listed under the quick wins.
- `elementSize.ts`: one shared ResizeObserver, cleaned up.
- `lib/scrollLock.ts`: counts its holders and restores the overflow and gutter correctly.
- `styles/elevation.ts`, `motion.ts` and `iconSizes.ts`: their tests read `tokens.css`, so they really tie the TS numbers to the tokens.

**Components:**

- **TabStrip:** roles, `aria-selected`, roving tabindex (close buttons included), arrows, Home and End, manual activation and the focus hand-off on close. Every caller's `aria-controls` points at a real panel.
- **Select:** apart from F15, a combobox with `aria-activedescendant`, type-ahead and the list in the top layer.
- **ContextMenu:** roles, focus, listeners.
- **The tooltip attachment:** cleans up its listeners and `aria-describedby`.
- **IconButton:** `label` is required; `pressed` sets `aria-pressed`. The PixelEditor tools, Search toggles, HexStatus and FilePreview use it correctly.
- **SidePanel Maximize:** its label switches between Maximize and Restore, which is correct without `aria-pressed`.
- **The exam session:** `.exam-session:focus { outline: none }` is on a `tabindex=-1` element focused only by script. The two notices' ids never coexist. `aria-controls="exam-prompt"` always resolves.
- **InstructionSetPicker:** roving tabindex, wrap-around arrows, `aria-describedby` only while the description shows. The create page's ids and the embed page's ids all resolve.
- **The home page's HeroBackdrop:** `aria-hidden`, `inert`, `pointer-events: none`. Its timer, observer and listeners are cleaned up.
- **The home page's other code:** the IntersectionObserver and matchMedia listeners are cleaned up. The duplicate tile link is `aria-hidden` with `tabindex=-1`.
- **Other public pages:** the FeatureAccordion panels are `inert` when closed; ArticleOutline's observers are cleaned up; the menus mark the current page with `aria-current`.
- **`fonts.css`:** every `size-adjust`, `ascent-override` and `descent-override` matches the documented metrics.

**Other code:**

- **Container queries:** ExecutionDock's 40 `@container` rules predate the branch (it added none). The embed's `container-type` on `.section` is safe, since Tooltips and Select lists leave it through the top layer.
- **`ThemeProvider.svelte`:** the new `$effect` that writes `--scroll-accent` and `color` on `<html>` is a legitimate side effect.
- **`WorkbenchShell`:** its `untrack` reads an initial value only.
- **`vite.config.ts`:** the `inlineStyleThreshold: 50_000` change and `static/_headers`' immutable caching are sound and documented.
