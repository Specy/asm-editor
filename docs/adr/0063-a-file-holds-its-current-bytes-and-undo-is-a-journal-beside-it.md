---
status: accepted
date: 2026-10-25
supersedes: 0047
---

# A File holds its current bytes, and Undo is a journal beside it

A change typed in the **Hex editor** or drawn in the **Pixel editor** writes the File's bytes, as any editor writes a document. What each change overwrote is kept as an **Edit step** in an Edit journal beside the Project, in the browser that made it: the bytes it replaced, or for Canvas size the whole content it replaced, which Undo writes back and Redo writes again, so Undo and the **Edit history** panel survive a reload. A File's journal keeps at most 1 MiB, its oldest steps dropped past it, and is tied to a fingerprint of the File's content, so a File changed any other way (a program's write, an upload, another tab) drops its journal rather than having stale bytes written into it. A journal is written with each save of the Project, in the same transaction, so a tab closed between two saves never leaves one ahead of its File or behind it. The Project, its archives and its share links hold each File as it is. A Project saved with ADR 0047's Byte edits is read with them applied, and saved again without them.

## Considered options

- **The original kept apart, with Edit steps in the File** (ADR 0047, then the Pixel editor's decision 11, implemented and reviewed on 2026-10-25). Two reviews found that the original and every undone step travelled in share links and archives, so bytes a person erased (a flag blanked in a CTF binary) were still in what they shared; that an edited File cost up to twice its size for good; that steps tied to the File's last edits by count were lost by any code that rebuilt the File's record, a rename for one; that step labels filled the archive's 1 MiB manifest; and that edits after a whole replacement replayed in quadratic time, which a crafted archive or link could turn into minutes. It needed an archive version of its own.
- **Actions saved and replayed**, as parametric photo editors keep them: rejected first, since replaying tools means versioning every tool forever ([the Pixel editor design](../design/pixel-editor.md), decision 11).

Image editors (Paint, GIMP, Photoshop, Krita, Aseprite), hex editors (HxD, ImHex, 010 Editor) and Vim's undo file all keep the document as it is and its undo beside it.

## Consequences

- There is no original to show or revert to: a list of patches, which ADR 0047 kept the original for, would need a person to pin a File's original first.
- Undo does not travel in an archive or a link; a Project opened elsewhere starts with no Edit steps.
- Projects saved with Byte edits lose their originals the first time they are read and saved.
- Annotations stay through a change typed or drawn, which moves no address, and go with a whole new content, as before.
