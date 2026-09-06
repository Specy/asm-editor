# Course plan: the General course and the Language courses

Decided on 2026-09-06 in a design interview. This is the record the writers work from; the voice they
write in is `docs/courses/voice.md`, the vocabulary is `CONTEXT.md` (Course, Module, Lecture,
Playground, General course, Language course, Example, Exercise, Topic), the structural decision is
ADR 0012.

## Decisions

1. Four Language courses, written in this order: M68K, RISC-V, MIPS, Z80. x86 is deferred until its
   syntax (FASM or NASM) is decided and it has documentation pages. RISC-V-64 is one lecture inside the
   RISC-V course; everything else is RV32.
2. The General course grows from 10 to 18 lectures in three modules (skeleton below). The ten existing
   lectures get a three-tier revision: a light pass on all (typos, dashes, the unfinished landing text,
   descriptions rewritten in the voice), Registers and Addressing modes expanded to the 500-word floor
   with a Playground each, Flags re-voiced with a Playground.
3. Each Language course mirrors the General course Module for Module and Lecture for Lecture, retitled
   for the language. Its first lecture is "Getting started with ...", which is the mirror of the General
   Introduction and also holds the syntax conventions and the first program. "Using the editor" is not
   mirrored. The outside-world module bends to the machine.
4. Each Language course closes with an Examples module: the same ladder of programs in every language,
   program for program, in prerequisite order. 24 programs (the list below), one page each: the
   compute-only ones first (result in the registers or memory panel), then the console ones, then the
   screen ones, because traps, syscalls and ports are taught in the last module.
5. Language course lectures end with one or two checked Exercises with a visible, collapsed solution.
   General course lectures keep "try changing" prompts only.
6. Links between the overview, the deep dives and sibling Examples are generated from a `topic` key in
   each lecture's `meta.json`, never written by hand.
7. The "Assembly Examples" course (`src/content/examples`) is retired; its Fibonacci pages fold into
   the ladders; its URLs redirect.
8. Slugs `m68k`, `mips`, `risc-v`, `z80`. Names "M68K assembly", "MIPS assembly", "RISC-V assembly",
   "Z80 assembly". Courses page order: Assembly basics, M68K, MIPS, RISC-V, Z80. Author Specy.
9. Length guides, not limits (Specy, 2026-09-06: "better prioritize proper explanation than word
   count"): General lectures around 500 to 900 words with one to three Playgrounds; Language lectures
   around 800 to 1,500 words with three to five Playgrounds and one or two Exercises; Example pages
   around 150 to 300 words of prose. A lecture is as long as its explanation needs; the lower number
   is the one that matters, and no explanation is ever cut to hit the upper one. Full scale: 175
   pages, 96 verified programs.
10. Playgrounds get a `screen` flag (off by default) so the Screen peripheral can be shown inline.
11. Work happens in a git worktree at `/home/dev/code/asm-editor-courses` on branch `feat/courses`
    cut from `feat/screen-peripherals`; it becomes a pull request after PR #71 merges. Content under
    `src/content` may also be edited in the main checkout; code only in the worktree until the freeze
    lifts. The one exception, agreed the same day: the `screen` playground flag, done in the main
    checkout.
12. One Opus writer per batch, orchestrated and reviewed by the main session: the three-page voice
    sample first (Subroutines, Getting started with M68K, Sum of an array in M68K), then the General
    course, then each Language course. A page is done when it passes the voice script and the
    verification test.

## The General course (`assembly-basics`), 18 lectures

Slug, title, topic key, status. Order is the position in the module.

### Module `introduction`, "Introduction"

| #   | slug                                   | title                                | topic               | status                                |
| --- | -------------------------------------- | ------------------------------------ | ------------------- | ------------------------------------- |
| 0   | `introduction`                         | Introduction                         | `introduction`      | existing, light pass                  |
| 1   | `using-the-editor`                     | Using the editor                     | `using-the-editor`  | new                                   |
| 2   | `registers`                            | Registers                            | `registers`         | existing, expanded with a Playground  |
| 3   | `memory`                               | Memory                               | `memory`            | existing, light pass                  |
| 4   | `numbers-and-sizes`                    | Numbers and sizes                    | `numbers`           | new                                   |
| 5   | `instruction-set`                      | Instruction set                      | `instruction-set`   | existing, light pass                  |
| 6   | `addressing-modes`                     | Addressing modes                     | `addressing-modes`  | existing, expanded with a Playground  |
| 7   | `flags`                                | Flags                                | `flags`             | existing, re-voiced with a Playground |
| 8   | `structure-and-lifecycle-of-a-program` | Structure and lifecycle of a program | `program-structure` | existing, light pass                  |

What the new ones cover:

- Using the editor: one tiny program in a Playground. Build it, step it, watch a register change,
  set a breakpoint, undo, open it in the full editor, where the memory viewer and the call stack tab
  are. Uses M68K, because Undo in MIPS and RISC-V is a known gap (see Risks).
- Numbers and sizes: binary and hex, bytes, words and longs, two's complement, signed against unsigned,
  sign extension, what overflow is. Sets up Flags.

### Module `think-in-assembly`, "Think in assembly"

| #   | slug                         | title                      | topic            | status               |
| --- | ---------------------------- | -------------------------- | ---------------- | -------------------- |
| 0   | `branching-and-control-flow` | Branching and control flow | `branching`      | existing, light pass |
| 1   | `loops`                      | Loops                      | `loops`          | existing, light pass |
| 2   | `arithmetic-logic-and-bits`  | Arithmetic, logic and bits | `arithmetic`     | new                  |
| 3   | `data-in-memory`             | Data in memory             | `data-in-memory` | new                  |
| 4   | `the-stack`                  | The stack                  | `the-stack`      | existing, light pass |
| 5   | `subroutines`                | Subroutines                | `subroutines`    | new                  |

- Arithmetic, logic and bits: add, sub, mul, div; and, or, xor, not; shifts; masks; testing a bit.
- Data in memory: arrays, indexing with a register, strings as bytes with a terminator, the directives
  that reserve and fill memory.
- Subroutines: call and return, where the return address goes (stack or link register), passing
  arguments, saving registers, recursion. Continues The stack.

### Module `talking-to-the-outside-world`, "Talking to the outside world" (new)

| #   | slug                        | title                     | topic        | status |
| --- | --------------------------- | ------------------------- | ------------ | ------ |
| 0   | `system-calls-and-traps`    | System calls and traps    | `syscalls`   | new    |
| 1   | `memory-mapped-io`          | Memory-mapped I/O         | `mmio`       | new    |
| 2   | `interrupts-and-exceptions` | Interrupts and exceptions | `interrupts` | new    |

- System calls and traps: the program asks the environment to do something; what a simulator does
  instead of an operating system; a trap is an instruction that hands control to the environment.
- Memory-mapped I/O: devices that live at addresses, polling a status bit, a framebuffer as a grid of
  pixels; port-mapped I/O as the sibling (the Z80).
- Interrupts and exceptions: what happens when the outside world or a fault stops the program, vectors
  and handlers, and what this editor does and does not simulate.

## The Language course skeleton, 17 lectures (18 for RISC-V) plus the ladder

Module slugs are the same as the General course. Lecture slugs may follow the language's title; the
topic key must match the General course's. Titles by language:

| topic                | M68K                                         | MIPS                                          | RISC-V                                        | Z80                                          |
| -------------------- | -------------------------------------------- | --------------------------------------------- | --------------------------------------------- | -------------------------------------------- |
| `introduction`       | Getting started with M68K                    | Getting started with MIPS                     | Getting started with RISC-V                   | Getting started with the Z80                 |
| `registers`          | Data and address registers                   | The 32 registers and their names              | The 32 registers and their names              | Registers, pairs and the shadow set          |
| `memory`             | Memory, big endian and sizes                 | Memory, little endian and alignment           | Memory, little endian and alignment           | The 64 KB address space                      |
| `numbers`            | Bytes, words and longs                       | Words, halves and bytes                       | Words, halves and bytes                       | Bytes and 16-bit pairs                       |
| `rv64` (RISC-V only) |                                              |                                               | Going 64-bit                                  |                                              |
| `instruction-set`    | The M68K instruction set                     | The MIPS instruction set                      | The RISC-V instruction set                    | The Z80 instruction set                      |
| `addressing-modes`   | Addressing modes                             | Loads, stores and immediates                  | Loads, stores and immediates                  | Addressing on the Z80                        |
| `flags`              | The condition code register                  | Comparing without flags                       | Comparing without flags                       | The F register                               |
| `program-structure`  | org, equ, dc and ds                          | .data, .text and directives                   | .data, .text and directives                   | org, db, dw and ds                           |
| `branching`          | Compare and branch                           | Branch on compare                             | Branch on compare                             | jp, jr and the conditions                    |
| `loops`              | Loops and dbra                               | Loops                                         | Loops                                         | Loops and djnz                               |
| `arithmetic`         | Arithmetic, logic and bits                   | Arithmetic, logic and bits                    | Arithmetic, logic and bits                    | 8-bit and 16-bit arithmetic, logic and bits  |
| `data-in-memory`     | Arrays, strings and (a0)+                    | Arrays and strings                            | Arrays and strings                            | Arrays, strings and ix                       |
| `the-stack`          | The stack, -(sp) and movem                   | The stack and $sp                             | The stack and sp                              | The stack, push and pop                      |
| `subroutines`        | bsr, rts, link and unlk                      | jal, jr and the calling convention            | jal, ret and the calling convention           | call, ret and passing values                 |
| `syscalls`           | trap #15 and its tasks                       | syscall                                       | ecall                                         | Ports: in and out                            |
| `mmio`               | The screen, keyboard and mouse through traps | The bitmap display and the keyboard registers | The bitmap display and the keyboard registers | The screen, keyboard and mouse through ports |
| `interrupts`         | Exceptions and the vector table              | Exceptions, coprocessor 0 and interrupts      | Exceptions, CSRs and interrupts               | Interrupts: im, ei, di and halt              |

Getting started covers, in this order: what the CPU is and where it was used (verify every date and
name before writing it), which simulator the editor imitates (EASy68K, MARS, RARS; none for the Z80),
the syntax conventions (comments, labels, number literals, case, sizes), the first program built and
run in a Playground, and only the editor details that differ for this language: which panels matter
(flags for M68K and Z80, the screen panel and its `@screen` line for MIPS and RISC-V), and one sentence
saying that the console exists and that printing is taught in the outside-world module.

No I/O before it is taught: every Playground in the first two modules shows its result in the
registers or memory panel. The first program of Getting started moves values and adds them, read in
the registers panel; no trap, syscall or port appears before the `syscalls` lecture.

Going 64-bit (RISC-V, after Numbers): registers become 64 bits, `ld` and `sd` join `lw` and `sw`,
the `w`-suffixed instructions exist because 32-bit results are sign-extended, `li` holds a 64-bit
constant, one `riscv64` Playground, and how to pick RISC-V-64 when creating a project.

Interrupts lectures explain the machine's real mechanism and state plainly what the editor runs. None
of the Cores runs a user interrupt handler today; verify in each Core what exceptions it raises
(division by zero, illegal instruction, address errors) before claiming it on a page.

### Module `examples`, "Examples": the ladder, 24 programs

Same slug and topic in every course. Panels are the fence flags the page uses. The first group never
prints: its result is read in the registers or memory panel, since traps, syscalls and ports are
taught in the outside-world module and an easy program must not use what the reader has not studied.

Compute only:

| #   | slug / topic                         | title                                                 | what is new                                       | panels    |
| --- | ------------------------------------ | ----------------------------------------------------- | ------------------------------------------------- | --------- |
| 0   | `moving-values`                      | Moving values around                                  | registers, sizes, immediates, an add              | registers |
| 1   | `variables-in-memory`                | Variables in memory and constants                     | data directives, load and store, named constants  | memory    |
| 2   | `if-else`                            | The bigger of two numbers                             | compare and branch                                | registers |
| 3   | `counting-loop`                      | Fill an array with the numbers from 1 to 10           | a loop with a counter, writing memory             | memory    |
| 4   | `sum-of-an-array`                    | Sum of an array                                       | walking memory with a pointer                     | memory    |
| 5   | `max-of-an-array`                    | The largest element                                   | keeping a best-so-far                             | memory    |
| 6   | `string-length`                      | Length of a string                                    | scanning to the terminator                        | memory    |
| 7   | `reverse-a-string`                   | Reverse a string in place                             | two pointers, swapping bytes                      | memory    |
| 8   | `multiply-and-divide`                | Multiply and divide, with the remainder               | mul and div (a shift-and-add routine on the Z80)  | registers |
| 9   | `bit-tricks`                         | Even or odd, count the set bits, multiply by shifting | and, shifts, testing a bit                        | registers |
| 10  | `subroutine-with-register-arguments` | A subroutine with its arguments in registers          | call and return                                   | registers |
| 11  | `subroutine-with-stack-arguments`    | Stack arguments and a stack frame                     | saving registers, frame pointer, stack discipline | memory    |
| 12  | `factorial-and-fibonacci`            | Recursion: factorial and Fibonacci                    | a subroutine calling itself                       | memory    |
| 13  | `bubble-sort`                        | Bubble sort                                           | nested loops over memory                          | memory    |
| 14  | `jump-table`                         | A jump table                                          | computed jumps, a switch                          | registers |
| 15  | `binary-search`                      | Binary search                                         | index arithmetic, halving                         | memory    |
| 16  | `two-dimensional-array`              | A 2D array                                            | rows, columns, address scaling                    | memory    |

Console, after the syscalls lecture:

| #   | slug / topic         | title                                   | what is new                                                         | panels  |
| --- | -------------------- | --------------------------------------- | ------------------------------------------------------------------- | ------- |
| 17  | `hello-world`        | Print a string                          | the first trap, syscall or port write                               | console |
| 18  | `sum-of-two-numbers` | Read two numbers and print their sum    | reading input, printing a number                                    | console |
| 19  | `number-to-string`   | Print a number in any base without help | repeated division, building a string backwards, printing characters | console |

Screen, after the memory-mapped I/O lecture:

| #   | slug / topic            | title                           | what is new                           | panels          |
| --- | ----------------------- | ------------------------------- | ------------------------------------- | --------------- |
| 20  | `drawing-on-the-screen` | Drawing shapes on the screen    | the screen peripheral                 | screen          |
| 21  | `bouncing-ball`         | A bouncing ball                 | double buffering, delay, program time | screen          |
| 22  | `keyboard-control`      | Move a square with the keyboard | polling the keyboard                  | screen          |
| 23  | `snake`                 | The snake game                  | everything above                      | screen, console |

The mouse has no ladder program because MIPS and RISC-V have no mouse; it is shown in the `mmio`
lecture of M68K and Z80. The retired examples course's Fibonacci programs become
`factorial-and-fibonacci`. Programs that run until Stop (bouncing ball, keyboard control, snake)
declare how many instructions the verification test runs them for.

## Page formats and fence syntax

Playground fence, today: ` ```<lang>|playground|<flags> ` where `<lang>` is `m68k`, `mips`, `riscv`,
`riscv64`, `z80`, `x86` and the flags are `memory`, `console`, `tests`, `pc`, `no-registers`,
`no-flags`, `large`, `tall`, `allow-open`. Added by this plan: `screen` (shows the Screen panel, off
unless present).

Exercise, to be supported by the renderer and the verification test:

````
```m68k|playground|tests|exercise
* your code here
```

```testcase
{
    "input": [],
    "expectedOutput": "",
    "startingRegisters": { "d0": "0x10" },
    "expectedRegisters": { "d0": "0x20" },
    "startingMemory": [],
    "expectedMemory": []
}
```

<details>
<summary>Show solution</summary>

```m68k|playground|solution
    add.l d0, d0
```

</details>
````

Rules: a `testcase` fence directly after a Playground attaches to it (register values as JSON numbers
or hex strings, memory entries in the Testcase shape of `src/lib/Project.svelte.ts`); a Playground
with `exercise` must be followed by a `testcase` and by a `solution` Playground in a `<details>`
block; a plain Playground may carry a `testcase` fence only to supply `input` or `runFor` (the
instruction budget for a program that never ends) to the verification test.

As implemented in batch 0 (2026-09-06): "directly follows" means only blank lines between the two
fences; every field of the testcase JSON is optional; register values may be JSON numbers or strings
in any base JavaScript's `BigInt` reads (`0x`, `0o`, `0b`, decimal, with a leading `-`);
`runFor` sits inside the same JSON and is stripped before the Testcase reaches the embed; every
`testcase` fence is removed from the rendered page, attached or not, and the test fails a page with
a stray one; malformed JSON logs an error and renders the Playground without testcases, and fails the
test. The parser shared by the renderer and the test is `src/lib/content/playgrounds.ts`. Until item
I below is fixed, Exercises check registers, output, `string-chunk` or `number-chunk` memory, never
a `number` memory entry.

Lecture `meta.json` gains `"topic": "<key>"`. Course `meta.json` is unchanged apart from the values.

## Implementation list (code)

| #   | change                                                                                                                                                                                                                                                                                                                                              | where                                                                    | when                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| A   | `screen` fence flag, `showScreen` embed parameter and checkbox, `showScreen` prop passed explicitly (false by default)                                                                                                                                                                                                                              | `MarkdownRenderer.svelte`, `routes/embed/+page.svelte`                   | done 2026-09-06, main checkout (uncommitted) and `feat/courses` d64940f |
| B   | `loading="lazy"` on the playground iframe (check DOMPurify keeps the attribute)                                                                                                                                                                                                                                                                     | `MarkdownRenderer.svelte`                                                | worktree                                                                |
| C   | `topic` key read by the getters; lecture page renders "Go deeper", "The overview is in", "The same topic in", "The same program in" from it                                                                                                                                                                                                         | `lib/content/getters.ts`, lecture page                                   | worktree                                                                |
| D   | Retire `src/content/examples`; redirect `/learn/courses/examples` and its three lectures to the new pages (in the `[courseId]` layout load)                                                                                                                                                                                                         | routes                                                                   | worktree                                                                |
| E   | `testcase` fence attached to the preceding Playground; `exercise` and `solution` flags                                                                                                                                                                                                                                                              | `MarkdownRenderer.svelte`, `lib/content/playgrounds.ts`                  | done 2026-09-06, e95aaaf                                                |
| F   | Verification test: walk `src/content`, build and run every Playground with its Core, apply the exercise rules, respect `runFor`                                                                                                                                                                                                                     | `src/lib/content/content.test.ts`                                        | done 2026-09-06, 13bf2be (`npx vitest run src/lib/content`)             |
| G   | Voice script: grep the content folder for the banned list in `voice.md`, fail on any hit                                                                                                                                                                                                                                                            | `scripts/check-voice.mjs`, `npm run check:voice`, part of `npm run lint` | done 2026-09-06, f4b8bd7                                                |
| H   | `getters.ts` reads `authors`, the course files write `author`; align on `authors`                                                                                                                                                                                                                                                                   | `getters.ts`, course `meta.json`                                         | worktree, batch 1                                                       |
| I   | Pre-existing bug found in batch 0: `cleanTestcases` sets `expected: BigInt(memory.address)` instead of `BigInt(memory.expected)` for `number` memory entries, in both starting and expected memory. It runs on every project loaded from storage and on every embed URL, so a `number` memory expectation is checked against its address in the app | `src/lib/Project.svelte.ts`                                              | worktree, batch 1 (or the main checkout, the owner's call)              |
| J   | The Test button stays on an embedded Playground that carries testcases (it was hidden when the testcases panel was shown); the exam editor passes `embedded={false}` and is unchanged                                                                                                                                                               | `InteractiveInstructionEditor.svelte`                                    | done 2026-09-06, b48f09b                                                |
| K   | The existing lectures say "click compile"; the button is labelled Build. Part of the light pass                                                                                                                                                                                                                                                     | `src/content/assembly-basics`                                            | batch 1                                                                 |
| L   | Custom components for lectures (a stack or memory diagram a markdown table cannot show), allowed by Specy on 2026-09-06; add renderer support in the worktree when a page needs one and record it here                                                                                                                                              | `MarkdownRenderer.svelte`                                                | when needed                                                             |

## Verification

- Every Playground builds without errors and runs to the end (or for `runFor` instructions) without a
  runtime error, using the same Core packages the app ships.
- Programs that read input get it from the `testcase` fence's `input`; a program that asks for input
  with none declared fails the test.
- Every Exercise: the solution passes the testcase, the skeleton fails it.
- The voice script passes.
- A page is not done until both pass. The batch is not delivered until every page in it is done.

## Process

1. Now, main checkout: `docs/courses/voice.md`, `docs/courses/plan.md`, ADR 0012, the glossary
   entries, change A.
2. Worktree: `git worktree add /home/dev/code/asm-editor-courses -b feat/courses feat/screen-peripherals`,
   `npm install` there, apply change A to it as its first commit.
3. Batch 0, an Opus agent: changes E, F, G in the worktree (small, independent of content), and the
   three-page voice sample: `assembly-basics/think-in-assembly/subroutines`,
   `m68k/introduction/getting-started` (with one Exercise), `m68k/examples/sum-of-an-array`. Specy reads
   the sample; the voice guide is amended before anything else is written.
   Done 2026-09-06 (commits e95aaaf to 3f4264c on `feat/courses`): 20 content tests green, voice
   script green, `npm run check` at the two-error baseline, lint clean. Left out of Getting started
   for lack of a source in the repo: the 68000's dates and the machines it shipped in.
   Specy's verdict (2026-09-06): the pages performed instead of explaining; the rules are now the
   "Say it straight" section of the voice guide, the ladder was reordered so no easy program prints,
   and the three pages are being rewritten before batch 1.
4. Batch 1: the General course (10 revised, 8 new). Changes B, C, D, H land in the same batch.
5. Batches 2 to 5: M68K, RISC-V, MIPS, Z80, each delivered whole with the dev server running in the
   worktree. The Examples of each later language are ported program by program from the M68K pages.
6. Pull request from `feat/courses` after PR #71 merges; rebase onto main first.

Reviewer's gates per batch: voice script clean, verification test green, the pages read aloud like the
reference lectures, descriptions in the voice, `topic` keys present and matching.

## Where the writers find the facts

- M68K: `src/lib/languages/M68K/M68K-documentation.ts` (instructions, addressing modes, directives,
  condition codes), `M68K-traps.ts` (trap 15 tasks, the rejected ones with reasons), `examples/m68k/`
  (the screen, keyboard and mouse programs and EASy68K's originals), `/documentation/m68k` pages.
- MIPS: `src/lib/languages/MIPS/MIPS-documentation.ts` (instructions, directives, syscalls,
  registers), `examples/mips/` (bitmap display, keyboard registers at `0xffff0000`, the `@screen`
  line), `/documentation/mips` pages including `screen`.
- RISC-V: `src/lib/languages/RISC-V/RISC-V-documentation.ts`, `examples/risc-v/`,
  `/documentation/risc-v` pages including `screen`.
- Z80: `src/lib/languages/Z80/Z80-model.ts` (registers, flags, the port map, org `0x8000`, stack
  top `0xFFFF`), `Z80-documentation.ts`, `examples/z80/`, `/documentation/z80` pages including `io`,
  ADR 0002 and ADR 0011.
- Peripherals for every language: `docs/design/screen-peripherals.md` and ADRs 0003 to 0011.
- Existing lectures, for the voice and for what the General course already says: `src/content/assembly-basics`.

## Risks and known gaps that shape the content

- Undo in MIPS and RISC-V is unusable in the GUI (a Core gap); the Using the editor lecture demonstrates
  Undo on M68K and the MIPS and RISC-V courses do not lean on it.
- M68K charges one instruction per trap, so a drawing loop of thousands of trap calls can exceed the
  Playground's instruction limit; keep drawing loops modest and verify with the embed's limit.
- Testcases cannot script input into the MARS and RARS keyboard receiver, so keyboard MMIO Exercises on
  MIPS and RISC-V are prompts, not checked.
- RV64 registers are untested in the editor; every claim in Going 64-bit is run before it is written.
- No Core runs a user interrupt handler; the interrupt lectures teach the mechanism and say so.
- x86 has no course; the embed still lists it, which is fine.
- The playground embed boots a full editor per iframe; change B is required before lectures with five
  or more Playgrounds ship.
