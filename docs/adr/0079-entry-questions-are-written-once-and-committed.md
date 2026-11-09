---
status: accepted
date: 2026-11-09
---

# Entry questions are written once and committed

A reader asks "how do I print a number", and the Documentation answers in its own words: "Displays the
signed number in D1.L". To close that gap, every **Documentation entry** but the x86 Extensions gets
**Entry questions**: usually three questions a student would ask that the entry answers, more where
it answers more kinds. A language model writes them once (Haiku, with Opus checking each entry's
questions against the entry, and the owner reading a sample), and they are committed beside the
Documentation, one file per language keyed by entry id, each entry's questions with a hash of the
text they were written from. The build reads the file and never runs a model on it.

In the index an entry's questions are words of its own, and they come first in the text the entry's
vector is made from ([the design record](../design/documentation-search.md), Searching in plain
English). The writer sees the Chapter's other entries, and the checker flags a question another
entry answers as well, so that questions tell similar entries apart.

When the Documentation changes, nothing breaks and nothing blocks: an edited entry keeps its
questions, marked stale; a new one has none until the script is run; questions of a removed entry are
ignored. A check lists them and never fails the build.

## Considered options

- **Writing them in the build.** Rejected: every build would need a model provider, a key in CI and
  minutes of calls, and the index would change from build to build with no edit to the
  Documentation. The owner asked for them to be made once and changed when needed.
- **Failing the build when an entry has no questions.** Rejected: every edit to the Documentation would
  wait for a model run.
- **A vector per question.** Rejected: about 2.6 MB more compressed, more than doubling the index
  (2.45 MB for all 11 shards).
- **A second vector per entry, made from its questions alone.** First agreed, at about 0.65 MB more,
  then dropped: on a hand test of 14 M68K entries it ranked the right answers no better than putting
  the questions in front of the entry's own text (their ranks summed 12 against 13, from 36 without
  questions), which costs nothing to download.
- **Holding some questions back to measure the search with.** Dropped by the owner as not worth it at
  this project's scale; all of an entry's questions are indexed.
- **Questions for Lecture sections.** Left out: a lecture is long, teaches in the reader's words
  already, and is cut into windows that each have a vector.

## Consequences

- A file of model-written text is part of the Documentation's sources. It is never shown to readers;
  it changes only when someone runs the script and commits the result.
- The shard format changes (an entry carries its questions, and a long entry has vectors for the rest
  of its text), so `PAYLOAD_FORMAT` goes up; a page left open across the deploy has to be reloaded.
- The agents' `search_documentation` tool finds entries by their questions too, since it shares the
  search.
