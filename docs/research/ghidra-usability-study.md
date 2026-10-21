# Usability study: reverse engineering with Pseudocode

Date: 2026-10-21. Target: the `feat/pseudocode` preview deploy, https://feat-pseudocode.asm-editor.pages.dev/.

Six AI testers played first-time users at different skill levels. Each tried to solve a real picoCTF reverse-engineering challenge using only the deployed app. The questions were whether the Ghidra integration (Decompile → Pseudocode) is good and easy to use, and what is missing around it.

Raw material for every tester is in `.cache/ghidra-usability-study/` (git-ignored, local only): `report.md`, `notes.md`, `shots/` and the exact `prompt.md`. My own reproduction screenshots are in `organiser-checks/`. The harness to rerun the study is in `harness/`.

## Results

| Tester | Level | Model | Challenge | Result | Effort |
|---|---|---|---|---|---|
| Sam | Complete beginner (school Python, no C or assembly) | Claude Sonnet | GDB baby step 4 | Solved, `picoCTF{12905}` | ~20 tool calls, 2 min |
| Priya | CS student (C, a little MIPS, never reversed anything) | Claude Sonnet | Bbbbloat (stripped PIE) | Solved, `picoCTF{cu7_7h3_bl047_44f74a60}` | ~23 calls, 2 min |
| Kai | Self-taught web developer, watched Ghidra videos | Codex gpt-6-luna | reverse_cipher (binary plus output text) | Solved, `picoCTF{r3v3rs312528e05}` | ~30 calls, 2 min |
| Jordan | Intermediate CTF player (some Ghidra and gdb) | Claude Sonnet | Classic Crackme 0x100 | Solved: a password that prints SUCCESS in the app | ~44 calls, 4 min |
| Alex | Professional reverse engineer (IDA, Binary Ninja, Ghidra) | Claude Opus | FactCheck (C++) | Solved statically, `picoCTF{wELF_d0N3_mate_1c496e73}`; the debugger never started | ~119 calls, 21 min |
| Morgan | CTF veteran, debugger-first | Codex gpt-6.1-sol | not-crypto (optimized AES) | **Not solved**: the emulator stops on AVX instructions | ~167 calls, 9 min |

Every flag found matches the known answer. All five solves came from reading the Pseudocode.

## Headline

1. **The static path works at every level.** Import → Decompile → read `main` got a complete beginner to the answer in about 20 actions. Every tester named the side-by-side Listing ↔ Pseudocode view, with its coloured bands, as the best part of the app. Finding `main` automatically in stripped binaries (bbbbloat, not-crypto) rescued the testers who had no idea where to look.
2. **The dynamic half is where it breaks.**
   - Optimized binaries that use AVX stop with SIGILL.
   - One session saw Build spin forever with no error.
   - The debug layout squeezes both code panes until they're unreadable.
   - Pointer following and debug-time label lookup were missing or broken.
3. **Everyone struggled to get started and to navigate.**
   - Nothing on the home page says you can open a program.
   - A binary opens on the Hex view.
   - "Build" doesn't read as "run this program".
   - There is no function list, strings list or go-to-address in the Listing.
4. **Experts miss the core RE loop:** demangling, rename/comment, back navigation, a strings window, cross-reference details and a graph view.

## Findings

Verification key:
- **Reproduced**: I reproduced it in my own browser.
- **Screenshot**: visible in the tester's screenshots.
- **Reported**: the tester's word only.
- **Not reproduced**: I tried and it didn't happen.

| # | Finding | Severity | Testers | Verification |
|---|---|---|---|---|
| 1 | AVX (VEX) instructions stop execution with `Illegal instruction (signal 4)` | Blocker for such binaries | Morgan | Screenshot |
| 2 | Build can spin forever: no progress, no error, no timeout | Blocker when it happens | Alex (4×) | Not reproduced (2 profiles) |
| 3 | Nothing on the landing page says you can open a binary | Major | all 6 | Reproduced |
| 4 | Finding functions is hard: no function list, Ctrl+G goes to a line, go-to-address only in Hex | Major | Sam, Kai, Jordan, Alex, Morgan | Reported |
| 5 | Calls in the Pseudocode can't be followed by clicking; F12/Ctrl+click work but nothing hints at them; no back navigation | Major | Sam, Alex | Reproduced |
| 6 | Starting a debug session squeezes Listing and Pseudocode to ~365 px each; lines are cut off | Major | Priya, Jordan, Morgan | Reproduced |
| 7 | No C++ demangling in Listing, Pseudocode or the symbol list; `std::string` locals show as `undefined1[32]` | Major for C++ | Alex | Reproduced |
| 8 | No rename, comment or retype anywhere | Major for RE work | Priya, Jordan, Alex | Reported |
| 9 | Hovering a constant in the Listing shows decimal/hex/binary, but in the Pseudocode it shows nothing | Medium | Priya; Sam found the Listing hover only after using Python | Reproduced |
| 10 | An imported binary opens on Hex: "a wall of numbers", "scary" | Medium | Sam, Priya, Jordan | Reproduced |
| 11 | "Build" on an imported binary actually starts debugging | Medium | Sam, Jordan, Alex, Morgan | Reproduced |
| 12 | When the program exits, Listing and Pseudocode jump to `_start` and the user loses `main` | Medium | Priya | Reproduced |
| 13 | The memory address box rejects the Listing's invented labels (`DAT_singing_perch` → "Unknown label", shown as `0xsinging_perch`) | Medium | Morgan | Screenshot |
| 14 | No strings window (a CTF staple) | Medium | Jordan, Alex | Reported |
| 15 | No "follow pointer" from a register or memory value; clicking a register starts a decimal edit | Medium | Morgan | Screenshot |
| 16 | Breakpoints only through the gutter: no context-menu item, no breakpoint list, no run-to-cursor | Medium | Morgan | Reported |
| 17 | Program input is easy to miss (one tester typed into the Arguments field during a run); the terminal shows ~2 lines, so output is cut | Medium | Jordan | Screenshot |
| 18 | "Leave site?" appears every time you leave a project, even with nothing unsaved | Minor | Alex | Reproduced (every navigation) |
| 19 | Selecting the `memcmp` statement in the Pseudocode didn't bring its `call` into view in the Listing | Minor | Morgan | Reported |
| 20 | Ghidra names (`uStack_48`, `undefined4`, `in_FS_OFFSET`) and invented names (`FUN_gleeful_osprey`) have no in-place explanation | Minor | Sam, Priya, Morgan | Reported |
| 21 | Hex Find in hex mode rejects text ("Each byte is two hex digits") instead of offering Text mode | Minor | Alex | Reported |
| 22 | The Hex section tooltip stays on screen and covers bytes and the context menu | Minor | Alex | Reported |
| 23 | PLT stubs decompile into two "Could not recover jumptable" warnings | Polish | Alex | Reported |
| 24 | The References peek has no address or containing-function column | Polish | Alex | Reported |
| 25 | Ctrl+F in the Listing works only after clicking into it (one tester thought search was broken); the find box overlaps the "read-only" badge | Polish | Kai | Reproduced |
| 26 | The large default font limits the split view to ~30 lines and truncates long lines | Polish | Alex | Reported |

Not bugs, or not reproduced:

- **"`main`'s pseudocode is wrong"** (Sam): `func1(0x28e); return 0x28e;` is correct, because `main` discards `func1`'s result. It's a beginner comprehension problem, not a decompiler error.
- **"The last Pseudocode lines are hidden under the floating toolbar"** (Jordan): not reproduced in the default layout, where scrolling reaches the closing `}`. It happened with the Explorer open and a taller terminal.
- **"Mouse-wheel scrolling in the Pseudocode is extremely slow"** (Alex): probably an artefact of the harness's single large synthetic wheel event. Repeated smaller wheel events scrolled normally.
- **"Ctrl+F12 doesn't go to the definition"** (Alex): F12 does; Ctrl+F12 is Monaco's Go to Implementation.
- **HTTP 404 on project pages:** opening `/projects/<id>` directly returns HTTP 404 from Cloudflare Pages before the app renders client-side. Users don't see it; it only shows up as a console error.

### Detail on the top items

**1. AVX → SIGILL.** not-crypto was built with AVX. Run printed the prompt, then stopped at the first `vmovdqa xmm0, [rel …]` with only "Illegal instruction (signal 4)". Morgan used Undo and the in-app patch dialog to rewrite four `vmovdqa` as `movdqa`. That reached `fread`, accepted input, and then faulted on the next of many vector moves. Static analysis still worked; the dynamic route ("break at `memcmp`, read the buffer") was impossible.
- Cheapest useful fix: detect VEX-encoded instructions when building the Listing. Warn before running ("this program uses AVX, which the emulator can't execute; static analysis still works") and mark those lines.
- Real fix: AVX support in the x86 Core.

**2. Silent Build hang.** In Alex's session, Build stayed disabled with a clock icon for over 2 minutes, four times. This included a brand-new x86-64 "Print a string" template project, so it wasn't specific to the ELF. Nothing appeared in Log or Terminal, and the Problems spinner never stopped. After a reload, the console showed `TypeError: Failed to fetch at window.fetch (…/chunks/Db2jF6Cw.js)`, a 404 and `net::ERR_FAILED`, and the page was unresponsive for ~40 s.
- I couldn't reproduce it, either in a warm profile or in a fresh one (Build reached the paused debugger in under 30 s both times).
- The likely cause is a transient download failure under load: three emulator sessions ran at once on this machine.
- Whatever the cause, the app needs progress for runtime/library downloads, a timeout, an error state and Retry.

**3–4. Getting started and finding things.**
- Every tester said the home page reads as "write assembly", not "look inside a program".
- They got in through the Projects drop zone (Sam, Priya, Jordan, Alex) or the upload box at the bottom of "Create first project" (Kai, Morgan). Priya first found the Blog guide "Explore x86-64 executables".
- Inside the project, those who clicked Decompile early were saved by its jump to `main`. The others scrolled from `_init`, or used Ctrl+F `main:`.
- Ctrl+Shift+O (Go to Symbol) works as a function list, but only Alex found it.
- Suggestions:
  - a home-page entry such as "Open a program (ELF)";
  - a visible Functions list (with Strings beside it);
  - an address-aware Go to in the Listing.

**5. Following calls.** A plain click on `func1` in the Pseudocode does nothing. F12, Ctrl+click and the context menu open `func1`'s Pseudocode, but Sam never discovered them. Suggestions: underline call targets on hover and follow on (double-)click, as IDA does; add back/forward navigation (Alt+Left / Esc).

**9. Hex to decimal.** Three of the six testers reached for Python just to convert a constant (`0x3269`, `0x86187`). The Listing hover already shows decimal, hex and binary; giving the Pseudocode the same hover would remove the most common detour.

**10–11. First view and naming.** Testers disliked landing on Hex for an executable and didn't expect Build to mean "start the debugger". Hex-first was a deliberate design decision (file-views), so whether to change it is your call. A Run/Debug label for Executables would cost little.

## What worked well

- **Import:** drag-and-drop, detection by magic bytes, no setup.
- **The Decompile split:**
  - Listing ↔ Pseudocode with coloured bands, synced both ways;
  - the Pseudocode follows the Listing cursor;
  - it finds `main` in stripped PIEs.
  - Several testers' "it clicked" moment.
- **The Listing header:** PIE base, interpreter, libraries, stripped or not, entry point and inferred `main`. Experts called it "triage I'd normally get from file/readelf".
- **Inline string comments** in the Listing.
- **Hover number conversions** in the Listing.
- **Running in the app:** stdin input with a clear Program input row and Ctrl+D, registers, memory in character mode, Undo after a fault.
- **The patch dialog**, with assembled bytes and a decoded preview ("unusually useful for a browser tool").
- **The in-app Docs:** the Executables and Pseudocode chapters were rated "genuinely excellent", but only Alex found them, through the sidebar book icon. A link from the Executable's first view to those chapters would help.
- **Deterministic invented names**, which Alex liked for classrooms ("everyone gets the same names").

## Ratings (1–5)

| | Sam | Priya | Kai | Jordan | Alex | Morgan |
|---|---|---|---|---|---|---|
| Getting started | 3 | 3 | 3 | 2 | 5 | 4 |
| Words and labels | 3 | 3 | 4 | 3 | 4 | 3 |
| Pseudocode usefulness | 3 | 5 | 5 | 4 | 3 | 4 |
| Disassembly / decompile / run / debug fit | 4 | 4 | 3 | 4 | 2 | 2 |
| Overall | 4 | 4 | 4 | 4 | 3 | 2 |
| Would use again | yes | 4 | 4 | yes | teaching yes, CTF no | 2 |

## Suggested order of work

1. **Executables that can't run:** warn about AVX (VEX) instructions at import, and consider AVX support in the x86 Core.
2. **Build robustness:** download progress, timeout, error and Retry.
3. **First-run path:**
   - a home-page entry for binaries;
   - reconsider the Hex-first view for executables;
   - Run/Debug instead of Build for Executables;
   - link the Executables/Pseudocode docs from the editor.
4. **Navigation:**
   - a Functions and Strings list;
   - address Go to in the Listing;
   - click to follow calls in the Pseudocode;
   - back/forward.
5. **Pseudocode:** hover number conversions, C++ demangling.
6. **Debugging:**
   - a code-focused layout preset;
   - follow-pointer from registers and memory;
   - a breakpoint context-menu item and list;
   - fix label lookup for invented `DAT_` names;
   - keep the last function in view after exit.
7. **Later:** rename and comments persisted in the Project, cross-reference details, a graph view.

## Method and caveats

- **Isolation:** each tester ran as a separate `claude -p` or `codex exec` process, started from an empty folder outside the repo, with:
  - no project memory, no repo instructions and no app-related skills;
  - no web search;
  - written rules forbidding source code, bundles, GitHub, and outside RE tools on the binary.

  Ordinary subagents weren't used because they inherit this project's memory index, which names the app's features. I audited all transcripts afterwards: no tester accessed a forbidden path or tool.
- **Harness:** each tester had a private headless Chromium (1440×900), driven through a small CLI: screenshots, clicks, typing, file picker, drag-and-drop, dialogs.
  - Chrome's File System Access picker can't open headless, so it was removed: testers used the `<input type=file>` fallback, as in Firefox.
  - The harness's element list exposes tooltips without hovering, a small advantage over a real user.
- **Testers are language models in character.** The beginners were faster and better informed than real beginners (Sam "guessed" `imul` means multiply). Read their solve times as optimistic, and treat the confusion points they did report as places where real beginners would struggle more.
- **Wave 2 load:** three emulator sessions ran at once on one machine. This may explain Alex's Build hang.
- **Codex safety filter:** OpenAI's cybersecurity content filter stopped Morgan's first gpt-6.1-sol run mid-way ("flagged for possible cybersecurity risk"). The rerun, with explicit "authorized educational study, public picoCTF practice challenge" context, completed. Expect this when using Codex for RE work.
- **Challenge files:** picoCTF's artifact host wasn't reachable from this machine, so the binaries came from GitHub mirrors (DeffreusTheda/CTF).
