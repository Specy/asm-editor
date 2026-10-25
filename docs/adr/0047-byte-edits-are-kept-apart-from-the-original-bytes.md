---
status: superseded by 0063
date: 2026-10-15
---

# Byte edits are kept apart from the original bytes

Amended in part by [ADR 0055](./0055-annotations-are-kept-on-the-file-apart-from-its-bytes.md), which keeps a File's Annotations beside its Byte edits.

Typing in the **Hex editor** changes a byte **File** as far as anything can tell: the **FileSystem**, a Build, the **Listing** and a download all see the edited bytes, and the interface shows no list of changes. Underneath, the **Project** saves the File's original bytes unchanged and its **Byte edits** separately. The owner chose this so that a later version can show what changed, revert one edit, or hand back the original without changing the saved format. That later version is what [the binary import design](../design/binary-import.md) deferred as permanent patches under decision 13, and this replaces the design sketched there.

The Hex editor only overwrites, so a File keeps its length. The saved form of a Byte edit can still express an insertion or a deletion, for example as an offset, a count of original bytes taken out and the bytes put in their place, applied in order, so that those can be added without changing the format either.

## Considered options

- **Editing the bytes in place**, as HxD and ImHex do. The simplest, and what the interface looks like, but the original would be gone, and a later revert or patch list would need a format change.
- **A visible patch list now**, as Ghidra and radare2 keep. It shows more interface than a first hex editor needs.

## Consequences

- Anything that replaces a File's whole content makes that content the new original and drops its Byte edits: uploading over it, and a program writing it during a run, since the **FileSystem** stores a program's write as the File's whole new content. Byte edits are only what a person types; Undo in a **Debug session** still takes a program's write back, original and Byte edits together.
- The original bytes and the Byte edits both count toward the Project's 16 MiB of Files.
- A File's **Annotations**, its Renames and Comments, are kept beside its Byte edits and apart from its bytes too ([ADR 0055](./0055-annotations-are-kept-on-the-file-apart-from-its-bytes.md)). They survive Byte edits and the Hex editor's Undo of them, since an overwrite moves no address, and go with the content when it is replaced, as the Byte edits do.

## Update 2026-10-25

The **Pixel editor** makes Byte edits too: drawing on a BMP overwrites its pixel bytes, saved as Byte edits beside the original exactly as typing them in the Hex editor would be ([the Pixel editor design](../design/pixel-editor.md), decision 4).

Each change is now an **Edit step**: its Byte edits stay unmerged at the end of the File's list, applied in order as every Byte edit always was, and a `history` record beside them names the steps and keeps those Undo took back, so Undo, Redo and the **Edit history** panel survive a reload (decision 11). Past 1 MiB of steps the oldest fold into the merged edits, so the original is still kept. Canvas size is a step whose Byte edit replaces the whole content, the one Byte edit the editor writes that changes a File's length; a File whose edits do that and otherwise only overwrite can still be edited.

A Project archive now holds an edited File as edited, under `files/`, with its original under `original-files/` and only the edits' ranges in the manifest, so an unzipped archive shows the bytes as edited and the 1 MiB manifest no longer bounds how much can be edited (see [ADR 0019](./0019-zip-project-archives.md), Update 2026-10-25).

## Superseded 2026-10-25

[ADR 0063](./0063-a-file-holds-its-current-bytes-and-undo-is-a-journal-beside-it.md) replaces this decision: a File holds its current bytes, and Undo is a journal beside the Project. Projects saved with Byte edits are read with them applied.
