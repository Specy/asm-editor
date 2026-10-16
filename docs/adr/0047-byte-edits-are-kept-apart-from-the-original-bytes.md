---
status: accepted
date: 2026-10-15
---

# Byte edits are kept apart from the original bytes

Typing in the **Hex editor** changes a byte **File** as far as anything can tell: the **FileSystem**, a Build, the **Listing** and a download all see the edited bytes, and the interface shows no list of changes. Underneath, the **Project** saves the File's original bytes unchanged and its **Byte edits** separately. The owner chose this so that a later version can show what changed, revert one edit, or hand back the original without changing the saved format. That later version is what [the binary import design](../design/binary-import.md) deferred as permanent patches under decision 13, and this replaces the design sketched there.

The Hex editor only overwrites, so a File keeps its length. The saved form of a Byte edit can still express an insertion or a deletion, for example as an offset, a count of original bytes taken out and the bytes put in their place, applied in order, so that those can be added without changing the format either.

## Considered options

- **Editing the bytes in place**, as HxD and ImHex do. The simplest, and what the interface looks like, but the original would be gone, and a later revert or patch list would need a format change.
- **A visible patch list now**, as Ghidra and radare2 keep. It shows more interface than a first hex editor needs.

## Consequences

- Anything that replaces a File's whole content makes that content the new original and drops its Byte edits: uploading over it, and a program writing it during a run, since the **FileSystem** stores a program's write as the File's whole new content. Byte edits are only what a person types; Undo in a **Debug session** still takes a program's write back, original and Byte edits together.
- The original bytes and the Byte edits both count toward the Project's 16 MiB of Files.
