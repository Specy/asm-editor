---
status: accepted
date: 2026-09-08
---

# UTF-8 for FileSystem text

The shared FileSystem converts text Files to UTF-8 bytes for every target architecture and preserves binary Files as exact bytes. We chose one common encoding so file access has a consistent meaning across tools and future C support, accepting that non-ASCII text, including accented Latin letters, needs conversion when interpreted through M68K's Latin-1 character conventions. This does not change the Core's character literals or terminal behavior.

Program writes may leave an existing text File with invalid UTF-8. Such writes succeed and preserve the resulting bytes with `base64` storage; a consumer requiring text reports that it cannot read the File as text, and instruction Undo restores both its earlier contents and storage encoding.

After program byte writes, including writes to newly created Files, select `plain` whenever the complete bytes round-trip through UTF-8 unchanged, and `base64` otherwise. Later writes can therefore make a File readable as text again; storage encoding does not declare its purpose, and even binary data may use `plain` storage without changing its byte contents.

`incbin` must embed the exact FileSystem bytes independently of storage encoding, so text `è` embeds `C3 A8` while an M68K character literal still represents `E8`. This requires adapting s68k's current Latin-1 conversion of text `incbin` inputs; the dependency requirement is recorded in the [design record](../design/multiple-file-compilation.md).
