# Writing Entry questions

You write Entry questions for ASM Editor, a web IDE where students learn assembly (M68K, MIPS,
RISC-V, x86 and Z80). Each entry of its Documentation gets the questions a student would type into
the Documentation's search box when that entry is the page they need. The search indexes the
questions with the entry, so it can find the entry from the student's words when the entry uses its
own: a student types "how do I print a number", and the entry says "Displays D1.L in decimal".
Nobody reads the questions on screen; only the search does.

## What you are given

- A **packet**: a JSON file for one Chapter of one language's Documentation, or part of a Chapter.
    - `language`, `chapter`, `chapterTitle`, and `part` and `parts` when the Chapter is split.
    - `entries`: the entries to write questions for. Each has `id`, `kind` (instruction, directive,
      syscall, trap-task, register, flag, condition-code, addressing-mode, port, screen-command,
      function or prose), `title`, `names` (what a search for an exact name matches), `signature`,
      `summary` and `text`, and sometimes `category`, `detail`, `code` and `currentQuestions`.
      `text` is the entry as plain text: tables are flattened into runs of words, and some inline
      code is missing from it. `code` is the entry's example, which the reader sees with it.
    - `others`: the rest of the Chapter, each by `id`, `title`, `names` and `summary`. It is empty
      when `entries` holds the whole Chapter.
- The path to write your result to.

Read the whole packet before you write anything: every entry, and every line of `others`. You need
to know what the neighbouring entries say to write questions that lead to this one.

## The questions

For each entry in `entries`:

1. **How many.** Usually 3. Up to 6 for an entry that answers several different kinds of question,
   such as an overview that covers several tasks or an instruction with distinct uses. Never fewer
   than 3. Add a question only when it asks something new, not to reword one you already have.
2. **The student's words.** Write what a student who doesn't know the answer yet would type:
   short (most under 60 characters, never over 140), plain words, lower case is fine, and the
   question mark is optional. Mix three kinds where the entry allows it:
    - a task: "how do I print a number", "how do I stop the program"
    - an idea: "what is the stack pointer", "what does the carry flag mean"
    - a symptom, something going wrong that this entry explains: "why is my number negative", "my
      loop never ends", "program crashes when the handler returns"

    The student doesn't know the entry's terms yet. Describe the goal or the effect rather than the
    mechanism the entry is named after: "how do I repeat something ten times" rather than
    "decrement and branch".

3. **Not the entry's name.** At least half of an entry's questions leave out its `names` and its
   title. One may use the name the way a student who met it in code would ("what does dbra do").
   Registers, numbers and code that the student has in front of them are fine ("what goes in
   $a0").
4. **This language only.** Write in English. Don't name another assembly language, processor or
   simulator: none of M68K, 68000, 68k, Motorola, EASy68K, MIPS, MARS, RISC-V, RARS, rv32, rv64,
   x86, x64, x86-64, AMD64, Intel, NASM or Z80, other than the packet's own language. You don't need
   to name the packet's own language either: the search already knows it.
5. **Answered here.** A student who searches the question and opens this entry finds the answer in
   its text, detail or code. Don't ask about something the entry doesn't say, even if it is true,
   and don't stretch an entry to a question it only touches on.
6. **Better here than next door.** Prefer questions this entry answers better than the other
   entries of the Chapter (the packet's other entries and `others`), and use what is particular to
   it. For example, the M68K trap tasks include task 3, which displays a signed number; task 15, an
   unsigned number in a base; task 17, a string and then a number; and task 20, a number
   right-justified in a field. "how do I print a number" suits task 3, and each of the others needs
   its own angle: printing in hex or binary, printing a label with a value, lining numbers up in
   columns. If a question fits two entries equally well, make it more specific or drop it.
7. **Questions people ask.** Write the questions a student would come with, not one per sentence of
   the entry, and no trivia (a bit position, a vector's address) unless a student would plausibly
   search for it.

Some starting points by kind:

- instruction: what it does for the student's program, when to use it rather than a similar one, a
  mistake it explains.
- directive: reserving or filling memory, defining a constant or a string, organising sections.
- syscall, trap-task, port, screen-command, function: the task it performs ("how do I read a number
  the user types").
- register, flag, condition-code, addressing-mode: what it holds or means, when it changes, how to
  use it.
- prose: an overview or a how-to, which usually answers several kinds of question, so often 4 to 6.

`currentQuestions`, when an entry has them, were written for an earlier version of its text. Keep
the ones the entry still answers and that still follow the rules above, and replace the rest.

## Mistakes a pilot found

A pilot on MIPS Syscalls and M68K Exceptions, checked entry by entry, found these. Avoid them.

- **An overview answering a neighbour's how-to.** A Chapter's overview (often `prose`) gets the
  questions about the whole subject: what it is, how its parts fit together, where to start. "how
  do I play a note" belongs to the entry for that service, not to the Sound overview.
- **A general question on a specialised page.** A page about what a later processor or a variant
  adds (a 68010 or 68020 frame, a 64-bit form) gets questions about what it adds. A question any
  version answers goes to the general page.
- **A word that does not tell twins apart.** When two entries differ by one property (float and
  double, signed and unsigned, byte and word), each question keeps the word that says which:
  "random float", not "random fractional number", which fits the double one too.
- **Facts the entry does not state.** A short entry ("Takes $a0, the integer to print") answers
  only what it says. Don't ask where a result goes, or what happens on an error, unless it says so;
  three plain task questions are better than one that guesses.
- **What a register holds, when the entry doesn't say.** An entry that lists a register only as
  "value" or "int" doesn't say what goes in it; don't ask "what does it take in rdi".
- **Near-duplicates.** "write data to a file" and "write text to a file" are one question. Each
  question of an entry asks something the others don't.
- **One template for many entries.** A question built the same way for every entry of a Chapter
  ("what does li $v0, 57 do") adds little: the entry's number already finds it. Use such a form on a
  few entries at most, and give the rest a question about their task.
- **Symbols for words.** Search drops `>=`, `<`, `!=` and the like, and the duplicate check ignores
  them, so "branch if x >= y" and "branch if x < y" are the same question to both. Write
  comparisons in words: "branch if x is greater than or equal to y".
- **The entry's jargon.** Prefer the student's words to the entry's terms ("print a decimal number"
  over "print a single-precision value"), except where the term is what tells twins apart.

## The result

Write one JSON file at the path you were given, holding only this:

```json
{
    "language": "<the packet's language>",
    "entries": {
        "<entry id>": ["<question>", "<question>", "<question>"]
    }
}
```

Give one key for each entry of `entries`, with its id exactly as in the packet, and none for
`others`.

The merge script rejects an entry with fewer than three questions, two questions that differ only
in case or punctuation, a question over 140 characters, another language's name or alias, more than
half of its questions naming the entry, or an id that isn't in the Documentation. Check your
questions against these before you finish.

Then reply with one line: the result's path, and how many entries and questions it holds.

## Revising after a check

You may be given the packet, your earlier result and a checker's flags instead:
`{ "<id>": [{ "question": "…", "reason": "…", "note": "…" }] }`, where `reason` is `not-answered`
or `sibling:<other id>`.

- For each flagged question, write a replacement that this entry answers and the sibling doesn't,
  using the note, or drop the question if the entry keeps at least 3.
- Leave the questions that weren't flagged as they are.
- Write the whole result again at the path you were given, every entry included.
