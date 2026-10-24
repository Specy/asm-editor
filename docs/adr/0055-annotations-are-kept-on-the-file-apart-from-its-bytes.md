---
status: accepted
date: 2026-10-23
---

# Annotations are kept on the File, apart from its bytes

Amends the consequences of [ADR 0047](./0047-byte-edits-are-kept-apart-from-the-original-bytes.md): a Byte edit keeps a File's Annotations, and replacing its content drops them with its Byte edits.

A person reading an imported **Executable** gives its functions, data and the decompiler's variables names of their own and writes comments on its lines and functions: **Annotations**, a **Rename** or a **Comment** each ([the design](../design/annotations-and-search.md), decisions 1 to 5, 20 and 21). They are kept on the Executable's File record, as `ProjectFile.annotations`, beside its **Byte edits** and apart from its bytes, which they never change. A global Rename, a line Comment and a function Comment are keyed by a link-time address, written `0x` and lower-case hex digits with no leading zeros, the address in the file [ADR 0045](./0045-invented-names-are-frozen-words-from-file-addresses.md) derives Invented names from, so an Annotation does not depend on where a PIE is loaded. A variable's Rename is keyed by its function's address and the decompiler's id for the variable, an opaque string built from Ghidra's storage for it with use points counted from the function's entry (`stack:-0x98`, `register:0x0:4@+0x8e`). Being on the record, Annotations go wherever the File goes: every save and autosave, a share link, and the **Project archive**, whose manifest entry for the File carries them in a version 4 written only when some File has them. Whatever makes the File's whole content new drops them; a Byte edit, which only overwrites, keeps them.

## Considered options

- **A Project-level map from path to Annotations.** Every rename, deletion, upload and program write of a File would have to keep it in step by hand, and a share link or archive would need a second place to look.
- **Keys by run-time address or by line.** A PIE loads at another base in another environment, and lines move whenever a Comment, a Rename or a Byte edit changes the Listing.
- **Version 4 for every archive.** Editors older than Annotations would refuse every Project, rather than only the Projects that need them.

## Consequences

- Replacing the File's content drops its Annotations: an upload over it, and a program's write during a **Debug session**, which the **FileSystem** stores as the File's whole new content. Instruction Undo of that write brings back the record it replaced, Annotations included, as it brings back Byte edits ([ADR 0047](./0047-byte-edits-are-kept-apart-from-the-original-bytes.md)). Renaming the File keeps them, and deleting it deletes them.
- A Byte edit, the Hex editor's Undo and Redo of one, and typing over the bytes of a File stored as text keep them, since addresses do not move. An Annotation whose address no longer starts a label or a line stays saved and applies again when the bytes bring its address back; a variable's Rename whose id the decompiler no longer reports is ignored. Nothing is pruned.
- Saved Annotations are checked when a Project is loaded, as Byte edits are: a name is a C identifier of at most 128 characters that no keyword, decompiler type, x86 register or NASM operand word is, and a variable's is not shaped like one the decompiler gives; a comment has at most 4,000 characters on 40 lines; a Project's Annotations take at most 256 KiB together. Uniqueness among names is the Listing's to settle, since a Byte edit can change the names around one.
- A Build's staleness and a Compilation record's fingerprints ignore Annotations, which change no byte a Build reads; the unsaved-changes comparison sees them. During a Debug session they are written through the session's record of the File, so its next publish keeps them, and the running program's **Listing** is made again with them.
- An archive with Annotations is version 4, which editors older than them refuse as an unknown version. A Project with Annotations is never downloaded as a bare source File, which cannot carry them.
- The Listing and the **Pseudocode** stay views ([ADR 0048](./0048-decompiled-code-is-a-view-not-a-file.md)): Annotations are their input, applied each time they are made, and nothing derived from them is saved.
