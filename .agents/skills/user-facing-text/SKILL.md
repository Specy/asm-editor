---
name: user-facing-text
description: Guidance for writing or reviewing any text that users of ASM Editor read, so that it says what it means directly. Use for documentation, course lectures, example READMEs, blog posts, release notes, button labels, menu items, tooltips, error and toast messages, diagnostics and hints, and any other prose or UI string. Not for code comments, commit messages or internal design notes.
license: AGPL-3.0. Some of the guidance is adapted from humanizer (MIT); see NOTICE.md.
metadata:
    version: '2.0.0'
---

# User-facing text

The aim is text that tells the reader what they need, in the words they would use, without making them work out what it means.

This is guidance, not a set of rules. Each suggestion describes something that has made our text worse before. Use a suggestion where it helps the reader, and ignore it where it doesn't. If following one makes a passage harder to read, the passage wins.

## Why guidance and not rules

Our example READMEs were written under rules like "be plain", "avoid jargon" and "be accurate". Applied everywhere, those rules produced text that avoided the term it should have used, dropped the subject from sentences, and squeezed every exception into the main sentence. Each rule was reasonable. Following them mechanically was the problem.

Any list of patterns can fail the same way, this one included. So don't rewrite a sentence just because it resembles an example below. Rewrite it because a reader would stumble on it.

## The reader

Most readers are learners using the editor. They can see the screen around the text, they know less than the writer, and they came to do something. A good test for a sentence: would you say it this way to a person sitting next to you, looking at the same screen?

## Two ways text goes wrong

- **Saying less than it means.** Fragments with no subject, a description where the term belongs, squashed phrases, exceptions squeezed in everywhere. The text is correct, but the reader has to work out what it says. This is the more common problem in this project.
- **Saying more than it means.** Run-ups, dramatic contrasts, inflated importance, sales language. The text sounds important but adds nothing.

Fixing one often causes the other. Cutting padding too hard leads to the first; adding explanation to fix the first can lead to the second.

## Questions to ask of a draft

These usually find the problems. The examples come from our own text.

- **Who does what?** If a sentence has no clear actor, the reader has to guess.
    - "Looks for 91 in a sorted array of twelve numbers" reads better as "This program looks for 91 in a sorted array."
    - "An absent value returns -1" reads better as "If the element is not found, the result is -1."
- **Did I use the name the reader would look up?** If a sentence explains how something works instead of naming it, the reader can't search for it.
    - "Each comparison with the middle element rules out half of the remaining range" reads better as "It uses binary search to find the match."
    - In the lecture that teaches a concept, describing it before naming it can be the right order.
- **Does the reader need this detail?** Counts, encodings and bounds added to be safe make the useful part harder to find.
    - "The result is an index counting from 0: 9, or 4 on X86" reads better as "The result is the index of the element in the array." A detail like -1 being stored as `0xFF` earns its place where the reader will see it and be surprised.
- **Is this true for everyone who reads it?** When one text covers several Targets or modes, a clause for one of them ("..., or 23 on X86") makes every reader work around it. The common case usually belongs in the prose, and the differences in a table or a sentence of their own.
- **Does the screen already say this?** "Build, then Run" next to a Build button tells the reader nothing new. A step they wouldn't guess, such as clicking the Screen so it gets the keyboard, is worth writing.
- **Am I talking to the reader, or about the product?** "The editor's courses explain it line by line" describes the editor from outside. "Go to the course's lecture to read a line-by-line explanation" speaks to someone who is already in it.
- **Did I fix a fact by adding a clause?** Corrections that pile up clauses are how a clear sentence becomes hard to read. Rebuilding the sentence usually works better.
- **Am I using the same word for the same thing?** Switching terms for variety (the Screen, the display, the canvas) suggests three different things. The terms in [`CONTEXT.md`](../../../CONTEXT.md) are the ones the UI and the docs use.
- **Would a person say it this way?** Squashed phrases ("one byte a pixel"), inverted statements ("is the Entry of no program") and stiff verbs ("serves as") often pass every other question and still read oddly.

[references/patterns.md](references/patterns.md) describes these tendencies in more detail, with examples and the cases where they are fine. [references/surfaces.md](references/surfaces.md) has suggestions for each kind of text: labels, tooltips, errors, documentation, lectures, READMEs, blog posts and release notes.

## Writing

1. Work out what kind of text it is and what the reader can already see around it. The section for it in [references/surfaces.md](references/surfaces.md) may help.
2. Get the facts from the source: read the code, the program or the feature. A value, a register or a key you haven't checked is better left out, or asked about.
3. Start with what the thing is or does, using its name. Then what the reader does with it. Then the details they need.
4. Read the draft against the questions above, then once more as the learner would.

## Reviewing

1. Read the whole text before judging any line. Some problems only show at the paragraph level, such as the same exception in every sentence or the same closing line after every section.
2. Check the facts against the source.
3. For each finding, say what the reader would struggle with, quote the text and suggest a rewrite. Describe the effect on the reader rather than naming a pattern: the point is the reader, not the list.
4. Leave alone what already works, even if it resembles an example in the references.
5. Apply the rewrites only when the user asks for fixes. When you do, rewrite the passage around its point rather than swapping out the flagged words.

## What a rewrite keeps

- The facts. A rewrite shouldn't add or drop a value, a name, a step or a claim. If a sentence needs a detail you don't have, ask, or write a simpler sentence.
- Code, commands, paths, URLs, identifiers, keyboard shortcuts, and UI control names as the UI spells them.
- License, copyright and attribution text. Problems in it are worth reporting, but rewording it is the user's call.
- Text the user wrote and asked to keep.
