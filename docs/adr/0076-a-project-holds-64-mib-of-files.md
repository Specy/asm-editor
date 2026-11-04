---
status: accepted
date: 2026-11-04
---

# A Project holds 64 MiB of Files

Amends the FileSystem resource profile accepted on 2026-09-08 ([multiple-file-compilation.md](../design/multiple-file-compilation.md), Accepted: FileSystem resource limits), whose 16 MiB was set "for now". asmOS's MIPS and RISC-V ports take 15 to 17 MiB with everything they hold, and about 20 MiB once compiled with source annotations.

A **Project**'s **Files** may hold 64 MiB together, UTF-8 or binary (`FILE_BYTE_LIMIT`), and the **FileSystem** gives a running program the same room: ENOSPC past 64 MiB of Files or 4,096 Files, EFBIG for one File past 64 MiB. There is no separate limit on one File. The archive's compressed-size ceiling follows the limit; the 4,096 Files, the 1,024-byte paths, the archive's 1 MiB manifest and the FileSystem's 64 MiB Undo budget stay. The Byte edits of Projects saved before [ADR 0063](./0063-a-file-holds-its-current-bytes-and-undo-is-a-journal-beside-it.md) stay bounded by the 16 MiB a Project held when they were written. Compiler Explorer's answer may be 32 MiB (`ASSEMBLY_BYTE_LIMIT`), up from 16 MiB. Every message that states a limit derives it from its constant.

A Project is still stored as one row ([the research](../research/project-size-limit.md), 2026-11-04, which measured what large Projects cost). Its cost was mostly not the row but work that grew with the Project, so the raise comes with:

- **A change costs what the changed File does.** Every File record the editor makes or checks is kept with its byte length, so checking a map of them costs O(Files); a map `cleanFiles` returned is not checked again; no snapshot copies the Files map, which is frozen and replaced on change; text typed into the editor is stored without encoding it; and completion, document symbols, Compilation status and include scans read again only the Files that changed, by record.
- **Saves and pages read one Project.** A save puts the saved Project in its place in a loaded list rather than reading the list again. Only the Projects page reads the list, and forgets it as it goes; the home page and the reading pages count the stored Projects; opening a Project reads that Project alone.
- **Autosave waits for 3 seconds without changes**, for every change, where it saved code 250 ms after a pause and everything else at once. It saves at once when the page is hidden or closed, when the Workbench goes, on Save, and before the page reads the stored Project, as leaving for another page does. A read of the stored Projects waits for the saves in flight. A linked `.asmproj` is written by the same save.
- **A save writes the browser's copy at once and commits its IndexedDB transaction as soon as its writes are made**, so that one started as the tab closes is stored; IndexedDB keeps one Project's writes in the order they start. Only the linked file's writes queue, and a newer snapshot replaces one still waiting. Closing the tab asks first while the save of a Project of more than 16 MiB is still being written, whose whole row the closing tab lost most times, and while a linked file is still to be written.
- **Archives are zipped and unzipped by fflate's asynchronous functions**, which compress and inflate the larger Files in Workers, two at a time: fflate starts one for each large File together, which at 64 MiB took up to 1.4 GiB more memory.
- **A share link refuses at once** a Project whose Files hold more than 1 MiB, which would need its JSON compressed more than 40 times, and compresses the first 128 KiB of the rest before the whole.

## Considered options

- **Keep 16 MiB.** asmOS's MIPS port would stay without its video, and a recompile with source annotations would not fit either port.
- **Store a Project as a metadata row and a row for each File** (the research's option 3), so that an autosave writes only the Files that changed and the list reads only metadata. Deferred by the owner. It would bring an autosave at 64 MiB from a whole-row write, 0.36 to 0.45 s, down to milliseconds, at the cost of a migration and of deciding how two tabs on one Project save.
- **A summaries table for the list** (option 2c). Deferred with option 3.
- **A smaller limit on one File**, 16 MiB or for text only, since Monaco stops highlighting past 20 MB or 300,000 lines. Rejected: one limit is simpler to explain, and a program may write one large File.
- **Write a linked `.asmproj` only on Save.** Rejected: autosave keeps the disk file current, now only at a pause.

## Consequences

- A 64 MiB Project in the Workbench took about 1.25 GB of a desktop renderer in the research, near an iPhone's limit for a tab; nothing was measured on a phone.
- Measured on the research's fixtures ([the research](../research/project-size-limit.md), "Measured after the decisions"): typing five keys in a 64 MiB Project blocks the page 1.2 s in all, where it blocked it 19 to 22 s, about what it costs at 16 MiB; Share refuses at once, where it froze the page for 29 s and then failed.
- An autosave of a 64 MiB Project still writes the whole row: about half a second, a third of a second of it on the page's thread.
- Up to 3 seconds of changes wait in memory. A tab the browser kills, or a crash, loses them; closing the tab, hiding it and leaving the Workbench do not, except a Project of more than 16 MiB whose tab is closed at once after the browser asks.
- Archive export still keeps the page busy for about 1.9 s at 64 MiB, in tasks of at most 0.3 s, where it blocked it 4.5 s at once: fflate compresses Files under 160 KB, and computes every File's checksum, on the page's thread.
- An editor older than this one, which a tab opened before a deploy can still run, refuses a Project over 16 MiB that this one stored or archived, saying it is over the 16 MiB limit, and leaves it out of its list.
- A File of more than 20 MB or 300,000 lines opens without colours, as Monaco does.
- A Compile answer of up to 32 MiB is read whole before it is measured, a string of its size and its parse for a moment.
- Two tabs on one Project still save over each other, the last one winning.
