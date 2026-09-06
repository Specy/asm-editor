# Voice guide for the courses

Every page under `src/content` is written in Specy's voice and checked against this guide before it
counts as done. It was distilled on 2026-09-06 from the "Assembly basics" course. The reference
lectures, the ones that sound most like the author, are:

- `introduction/introduction`
- `introduction/memory`
- `introduction/structure-and-lifecycle-of-a-program`
- `think-in-assembly/branching-and-control-flow`
- `think-in-assembly/loops`
- `think-in-assembly/the-stack`

Read two of them before writing anything. `flags`, `registers` and the "Instruction naming" section
of `instruction-set` are flatter and are not models.

## Who is talking to whom

- A teacher at a whiteboard, working through the topic together with one reader. "Let's now try",
  "As we saw", "Let's first flatten it out". You and we, never "the student" or "one".
- The reader is a programmer who has never touched assembly. Anchor on what they already know: C
  code is the bridge (an `if` becomes a `goto`, then a branch), memory is "a large array of bytes",
  a label is "just the address".
- Reassure when the material gets ahead of the reader. "It's ok if you don't understand everything",
  "pretend it's a variable for now", "This can be a course on its own, if you are interested let us
  know!"
- Plain and a bit playful. "CPUs are dumb", "Imagine the stack as a, well, stack of plates",
  "...messy.", "Remember! Everything is just bits."
- Hand the reader the code at the end. "Try to change `move #50, d0` to `move #0, d0` and see how
  the code is executed differently", "click compile and then step until the end".

## How a lecture is built

1. Open by tying to the previous lecture. "We saw in previous lectures that...", "Now that we saw
   how to implement if statements...", "The next component is **Memory**".
2. Concrete before abstract, numbers before names. Show the binary, then say the word opcode. Show the
   stack table at `0x1018`, then state the rule.
3. One idea per paragraph, two or three sentences each. Headings are plain nouns: "The assembler",
   "Push (add an item)", "Practical Example". No heading is a question or a slogan.
4. A process is a numbered list. A set of terms is a bullet list of "**Term**: explanation". Memory
   and encodings are tables. The stack pointer in a table is the 🟢 emoji.
5. Build the idea in steps the reader can follow: C code, then the flattened `goto` version, then the
   assembly, each in its own code block.
6. Every Playground is introduced by a sentence that says what to do with it, and is followed by a
   "try changing" invitation or by the next idea. Never by a summary.
7. Close with the reader's hands on the code, or with a pointer forward ("This concept of the
   program counter will come back handy when we look at branching"). Never with a recap.

## Sentence level

- Bold the term the paragraph introduces and the claim that matters. Italics for emphasis and
  asides. Backticks for anything the reader could type: `d0`, `move.l`, `0x1018`.
- Sentences run long and are linked with commas, the way people speak. An aside goes in
  parentheses: "(this is just a convention)", "(we will explain later what registers are, pretend
  it's a variable for now)". A short sentence lands the point after a long one.
- A rhetorical question sets up the answer: "But the issue is: do you read them from left to right
  or right to left?"
- The author's own connectors, use them as they come: "as in,", "aka", "(or rather ...)", "say for
  example", "let's say", "boils down to", "in concrete terms", "the cool thing is", "the surprising
  part is", "etc..." with three dots.
- Code comments are short, lower case, and map to the line of C they implement: `; x = 50`,
  `# i++`, `; jump back to while_start`.
- Contractions are fine ("it's", "don't", "you'd"). Numbers are written as the reader would type
  them (`0x12345678`, `#100`, 4 bytes).

## What must not appear

These are checked mechanically by the voice script, so a page with any of them fails.

- The em dash "—" and the en dash "–" used as punctuation. Use a comma, a full stop or parentheses.
- Contrast frames: "it's not X, it's Y", "not just X but Y", "it isn't about X", "rather than X, Y".
- Openers and closers: "let's dive in", "in this lecture we will explore", "in this section",
  "by the end of this lecture", "in conclusion", "to summarize", "key takeaway", "Congratulations",
  "Happy coding".
- Filler and flourish: "essentially", "crucial", "critical", "seamlessly", "robust", "leverage",
  "delve", "elegant", "powerful", "fundamental building block", "under the hood", "at its core",
  "world of", "journey".
- Recap bullets at the end of a page, "Summary" or "Conclusion" headings, "Note that", "It is
  important to", "Keep in mind that".
- Every sentence the same length, three adjectives in a row, a bullet list where a paragraph would do.

Real typos in the existing lectures get fixed ("explaination", "Endianess", "decrese", "couter"),
never imitated.

## Code in lectures

- M68K in lower case (`move.l #10, d0`), comments with `;` inside programs and `*` for full-line
  comments, labels flush left, instructions indented four spaces.
- MIPS and RISC-V in lower case, comments with `#`, directives with the dot (`.data`, `.text`).
- Z80 in lower case, comments with `;`.
- A Playground shows one thing. The setup lines that make it runnable are marked as such: "* ignore
  this, it sets things up *".
- Every program on a page builds and runs in the editor. The verification test enforces it; do not
  write a program you have not run.

## Page blueprints

### A lecture in a Language course

1. One or two sentences tying to the previous lecture or to the General course overview.
2. The topic in three to five steps, each with a Playground the reader steps through.
3. Where the language differs from the others, say so plainly in one sentence, no more.
4. "Your turn": one or two Exercises. Each states the goal in one sentence ("leave the sum of the
   array in `d0`"), gives a Playground with the skeleton and the testcase, and a collapsed "Show a
   solution" block with a working solution.

### An Example page

1. What the program does, two or three sentences, and where it fits ("this is the first program
   that calls a subroutine").
2. "You need to know": the lectures it builds on, and what is new in this one, one line.
3. The program in a Playground with the panels it needs (console, memory, screen).
4. One "try changing" prompt.

The page generates the "same program in the other languages" links from its topic key; do not write
them.

### A lecture in the General course

Same as today: overview depth, examples from more than one language, "try changing" prompts and no
Exercises.

## Before a page is done

- It reads aloud like the reference lectures.
- The voice script passes (no banned phrases, no dashes as punctuation).
- Every Playground builds and runs; every Exercise's solution passes its testcase and its skeleton
  fails it; every Example runs to the end or for the declared number of instructions.
- The `meta.json` description is one or two plain sentences in the same voice, not catalog copy.
