# Tendencies to notice

These are habits that have made our text harder to read. They are things to notice, not rules to enforce. Each one has cases where it is fine, and a sentence that looks like one of them may be the clearest way to say something.

When one of them does get in the reader's way, the fix is to say the point directly. Swapping the words for others usually keeps the problem.

## Saying less than it means

These are the most common in this project. They come from taking "be plain", "be short" and "be accurate" too far.

### No subject

A sentence starts with a verb, as a catalogue entry does, and the reader can't tell who acts.

- "Sorts an array from smallest to largest in the same memory."
- Clearer: "This program sorts an array from smallest to largest."

Fine in labels, buttons, menu items, headings, table cells and one-line catalogue descriptions, where the subject is obvious from the context.

### Describing instead of naming

The text explains how a technique works but never gives its name, so the reader can't look it up or connect it to the lecture.

- "The screen shows the completed frame without a double-buffering command."
- Clearer: "The program uses double buffering by hand, because the TRS-80 has no command for it."

Fine in the lecture that teaches the concept, where describing it first and naming it afterwards can be the better order.

### Squeezed-in exceptions

A sentence carries a clause for one variant, so every reader has to step around it.

- "Looks for 91, or 23 in six numbers on X86. The result is 9, or 4 on X86."
- Clearer: "This program looks for a number in a sorted array," with each Target's number and result in a table.

A variant that does something different can have a sentence of its own: "On X86, `sum7` adds the numbers 1 to 7." Short parallel lists ("`os/main.c.asm` on x86, `os/main.c.riscv` on RISC-V") are usually fine.

### Squashed phrases

Words are dropped until the phrase reads oddly.

- "one a pass", "one byte a pixel", "each one a click"
- Clearer: "one per iteration", "one byte per pixel"

### Wrong actor

Something is given a verb it can't do, because the real actor was compressed away.

- "An absent value returns -1."
- Clearer: "If the value is not found, the result is -1."

### Talking about the product from outside

The text describes the editor as a reviewer would, though the reader is already in it.

- "The editor's courses explain it line by line."
- Clearer: "Go to the course's lecture to read a line-by-line explanation."

"The editor's Synth" is fine where it tells the reader that the original simulator doesn't have the device.

### Steps the screen already shows

- "Build, then Run." next to the Build button.

Steps the reader wouldn't guess are worth keeping: "Click the Screen so it gets the keyboard," "Turn your sound on."

### Inverted statements

A statement is turned around so that it is technically true but has to be decoded.

- "`main.s` is the Entry of no program."
- Clearer: "No program has `main.s` as its Entry."

### Details the reader doesn't need

Counts, encodings and bounds added to be safe: "an array of twelve numbers", "an index counting from 0", "(255 unsigned)". Worth keeping when the reader will see the detail or act on it.

### Defensive caveats

Qualifiers that protect the writer rather than inform the reader, often left over from patching an earlier overstatement.

- "The wait sets the intended frame rate, though a slower computer may take longer to draw a frame."
- Clearer: "The wait sets the frame rate."

A caveat that changes what the reader does is worth keeping: "On M68K, the instruction limit can stop a long game. To play without it, set ..."

### Changing a term for variety

The Screen, then the display, then the canvas: the reader may think these are three things. Repeating the [`CONTEXT.md`](../../../../CONTEXT.md) term is usually clearer, and its `_Avoid_` lines list the words that have confused readers before.

### Vague errors

"Error executing code." says that something failed, but not what or what to do. Naming what failed, and the fix if there is one, helps the reader more.

### Talking down

_Obviously_, _of course_, _just click_, _it's easy to_. A learner who is stuck feels worse. "Simply" meaning "only" ("a raw binary is simply a sequence of bytes") is fine.

## Saying more than it means

Adapted from humanizer (see [NOTICE.md](../NOTICE.md)). The fact underneath is usually fine. Keeping it and removing the staging is usually the fix.

### Not X but Y

A contrast whose negative half denies something no one claimed, to make the positive half sound bigger: "It's not just an editor, it's a complete learning environment."

A contrast that corrects a mistake learners really make is teaching, and worth keeping.

### Closing lines and sayings

A last line that repeats the paragraph ("That's the key idea."), a saying that sounds deep ("At its core, assembly is about control."), or a row of fragments for effect. Usually better cut, or replaced with the specific claim.

### Run-ups

"Let's dive in", "Here's what you need to know", "It's worth noting that". Starting with the point is usually enough.

### Arguing with no one

Rejecting an option or answering an objection nobody raised. In lectures and documentation, naming a mistake beginners really make, with what happens, is different and useful: "If you forget the terminator, `print` keeps reading past the string."

### Inflated importance and sales language

_Pivotal_, _crucial_, _powerful_, _seamless_, _cutting-edge_, _unlock_, _showcase_, "small but powerful". Saying what the thing is or does is usually stronger. Technical uses keep their meaning: a robust parser, a logic gate.

### Avoiding is and has

"Serves as", "stands as", "boasts", "features". _Is_ and _has_ are usually clearer. Literal technical verbs are fine: "-1 is represented as `0xFF`", "marks the rectangle dirty", "highlights the line".

### Chat leftovers

"I hope this helps", "Let me know", "Great question". These don't belong in text that stands on its own.

### Writing about the document

"This section explains ...", "The table below compares ...". Saying the content itself is usually better. A sentence that points the reader somewhere they can't see is useful.

### Heading repeated as the first sentence

A heading followed by a sentence that says the heading again.

## Formatting

- **Bold** works well for UI control and setting names as the UI shows them (**Build**, **Undo enabled**), and for a term where it is defined. Bold used for emphasis everywhere stops meaning anything.
- **Labelled lists** ("**Keys.** W and S move ...") help in reference text that readers scan. Prose often reads better when the labels only repeat what each item says.
- **Headings** read best in sentence case, naming what the section holds ("Playing", "The C version on RISC-V") rather than an effect.
- **Dashes** used everywhere to join clauses can hide how the clauses relate; a comma, colon or new sentence often says it better. En dashes in ranges (I2–I0) are correct.
- **Tables** suit text that covers several Targets or modes: one row each, with "Same as MIPS." where a row repeats another.
