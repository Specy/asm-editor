---
name: grill
description: Interrogate a plan, design, or decision one question at a time until it holds up, capturing the agreed vocabulary in a glossary and each hard call as a written decision as they settle. Use when the user asks to grill, stress-test, or pressure-test their thinking; not for routine implementation work or questions that have a single correct answer.
license: MIT
---

# Grill

Interview the user relentlessly about a plan, design, or decision until you reach a shared
understanding, and write down the language and the decisions the moment they crystallise.

The interview and the documentation are one activity. Grilling is what surfaces the vocabulary and
the trade-offs; capturing them immediately is what stops the same ground being retrodden next week.
Writing up afterwards loses the precision that the questioning just bought.

Do not act on the plan until the user confirms you have reached a shared understanding.

## Read the model before the first question

Find the project's existing domain model and read it before opening the interview:

- a `CONTEXT-MAP.md` at the repository root means the project has several contexts, and it records
  where each one lives;
- otherwise a root `CONTEXT.md` means a single context; and
- neither means nothing has been written down yet.

This repository has a single context, the root `CONTEXT.md`, and keeps its decisions as numbered ADRs
in `docs/adr/`. Read what is already there. You cannot challenge a term as inconsistent
without knowing what the project has already agreed it means.

## Run the interview

Ask one question at a time and wait for the answer before moving on. Asking several at once is
bewildering and produces shallow replies.

Walk down each branch of the decision tree, resolving dependencies between decisions one by one.
Take the decisions that constrain later ones first.

For every question, give your own recommended answer and the reasoning behind it. An interview
without recommendations just pushes the work back onto the user.

Separate facts from decisions. When a fact can be settled by exploring the environment — reading
files, running a query, checking a configuration — look it up instead of asking. The decisions are
the user's: put each one to them and wait for their answer.

## Sharpen the language as you go

**Challenge terms that conflict with the glossary.** When the user uses a term in a way the existing
`CONTEXT.md` does not support, say so immediately: "Your glossary defines cancellation as X, but you
seem to mean Y — which is it?"

**Replace fuzzy words with a canonical one.** When a term is vague or overloaded, propose something
precise: "You're saying account — do you mean the Customer or the User? Those are different things."

**Stress-test relationships with concrete scenarios.** Invent specific cases that probe edge
conditions and force the user to be precise about where one concept ends and the next begins.

**Check claims against the code.** When the user states how something works, verify it. Surface any
contradiction you find: "Your code cancels whole Orders, but you just said partial cancellation is
possible — which is right?"

## Capture decisions as they crystallise

Write things down during the session rather than afterwards. Create files lazily: add a `CONTEXT.md`
when the first term is resolved, and a new ADR in `docs/adr/` when a decision is warranted.

**Update the glossary inline.** The moment a term is settled, add it to the appropriate `CONTEXT.md`
using [references/context-format.md](references/context-format.md). Do not batch these up.

Keep `CONTEXT.md` a glossary and nothing else. It is not a spec, a scratch pad, or a home for
implementation detail or for decisions that belong in a record.

**Offer to write a decision down sparingly.** Propose it only when all three of these are true:

1. **Hard to reverse** — changing your mind later carries a meaningful cost.
2. **Surprising without context** — a future reader will wonder why it was done this way.
3. **The result of a real trade-off** — genuine alternatives existed and one was chosen for reasons.

If any of the three is missing, skip it. An easily reversed decision will simply be reversed, an
unsurprising one prompts no questions, and where there was no alternative there is nothing to record
beyond having done the obvious thing. Use
[references/decision-format.md](references/decision-format.md) for the template, the numbering, and
the kinds of decisions that qualify.

## Close the session

Stop when the user confirms the shared understanding, not when you run out of questions. Before
handing back, say what was written down, what remains unresolved, and which decisions the user
deferred rather than settled.
