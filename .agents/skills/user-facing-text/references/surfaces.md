# Suggestions for each kind of text

Each section adds suggestions to [SKILL.md](../SKILL.md) for one kind of text. Some describe conventions the project already has (marked with their source). The rest are suggestions, to follow where they help.

## Buttons, menu items and labels

- A button or menu item usually works best as a verb phrase for what happens: "Build", "Split editor", "New text file", "Show in memory".
- A label for a value or setting is usually a noun phrase: "Instruction execution limit", "Byte order".
- The UI uses sentence case ("Close editor"). Glossary terms keep their capital (Program, Entry, Screen).
- Saying what the control acts on helps when the screen doesn't: "Upload files" rather than "Upload".
- Short is good, squashed isn't. "Go to the home" reads oddly because a word is missing, not because it is long.
- An icon-only control carries an `aria-label` with its name (ADR 0064).

## Tooltips

- A tooltip describes what the control does or why you would use it, and doesn't repeat its name (ADR 0064).
- The existing ones are verb phrases without a subject or final period: "Stop building and go back to editing", "Collapse the registers and memory".

## Error, warning and toast messages

- What helps most: what happened, in the reader's terms, and what to do about it if anything can be done.
    - "Error executing code." leaves the reader with nothing to act on.
- Naming the thing that failed helps: "Could not read `sprites.bmp`".
- A positive statement is easier to read than an inverted one: "No program has `main.s` as its Entry."

## Diagnostics and hints

- A diagnostic says what is wrong in the source, at its line. A hint says how to fix it, and reads well as an instruction: "Add a `.text` directive before the first instruction."
- The Target's own names for instructions, registers and directives are the ones the learner will look up.

## Confirmations and empty states

- A confirmation that names the action and its effect, with buttons that repeat the verb ("Delete" and "Cancel"), is easier to answer than "Are you sure?" with "Yes" and "No".
- An empty state can say what would appear there and how to get it: "No breakpoints. Click the gutter beside a line to add one."

## Documentation entries

- Documentation is for learners: what the thing is, how to use it, and a small example, without emulator internals or specification trivia (owner's direction, 2026-10-27).
- A first sentence that says what it does works well: "`add` adds two registers and stores the sum in a third."
- Explaining a term the first time it appears, or linking to its entry, saves the reader a search.
- Fixed behaviour reads best stated plainly, without "may".

## Course lectures

- A lecture can teach a concept before naming it. Once named, using the same term every time helps.
- Introducing each instruction, notation and tool action before an example needs it keeps the reader from getting stuck.
- Speaking to the reader works well here: "Step through the loop and watch `t0`."
- Teaching the subject directly reads better than narrating what the lecture leaves out or why it was written that way.
- A mistake beginners really make is worth naming once, with what happens when they make it.

## Example READMEs

The README opens in a Preview next to the program, so the reader can see the Build button and the code.

- An opening like "This program ..." or "This game is ..." tells the reader at once what they are looking at.
- Naming the technique ("It uses binary search", "It uses double buffering") connects the example to the lecture and to what the reader can look up.
- Steps worth writing are the ones the reader wouldn't guess: clicking the Screen so it gets the keyboard, turning the sound on, picking a Program, compiling C again after a change.
- A shared example's README opens in every Target's Project, so the prose reads best when it is true for every Target, with each Target's values and differences in a table.
- A link to the lecture can be an instruction: "Go to the course's lecture to read a line-by-line explanation: [M68K](...), [MIPS](...) or [Z80](...)."
- License sections stay as they are.

## Example descriptions and other catalogue entries

The one-line description in `example.json`, a table cell or a card is a catalogue entry. A fragment without a subject is natural here ("Finds a value in a sorted array"). Naming the technique still helps ("using binary search").

## Library READMEs

The READMEs of the Core packages and other libraries describe the library only, without mentioning ASM Editor, shaped like `packages/x86/README.md` (owner's direction).

## Blog posts

A blog post has a voice: opinions, a reason the writer cares, an aside. Those are worth keeping. Staging and inflation (the second half of [patterns.md](patterns.md)) show up most often in blog posts, so that half is the one to read for them.

## Release notes

- Leading with what changed for the user, in their terms, works well: "The Screen's window now fits the Screen."
- One item per change, with breaking changes first and what to do about them.
- Describing the previous behaviour is fine here, because the document is about change.
