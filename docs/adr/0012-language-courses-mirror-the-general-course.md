# Language courses mirror the General course

The learning section has one General course, "Assembly basics", that covers what most assembly
languages share, and (from September 2026) one Language course per supported language: M68K, MIPS,
RISC-V and Z80. We decided that every Language course mirrors the General course Module for Module
and Lecture for Lecture, retitled for the language, with the same `topic` key on each mirrored
lecture, rather than shaping each course around its own documentation (instruction families, then
directives, then traps). The mirror is what lets a reader go from any overview lecture to the matching
deep dive in every language, and from any Example to the same program in the other languages, with
the links generated from the topic key instead of maintained by hand. The cost is that some mirrored
lectures fit a language loosely (the M68K has no memory-mapped I/O, the Z80 has no system calls), so
the outside-world module bends to what each machine really has while keeping its position and topic
key; language peculiarities live inside the lecture text, never in extra modules, so that the
symmetry survives. Reversing this means restructuring around 175 pages, which is why it is recorded.

## Considered options

- Own shape per language, following each language's documentation. Easier to write, loses the link
  back to the overview and the side-by-side reading of the same program across languages.
- A single course with per-language tabs inside each lecture. Rejected: a lecture that switches
  language mid-page cannot go deep in any of them, and the existing course format has no tabs.
