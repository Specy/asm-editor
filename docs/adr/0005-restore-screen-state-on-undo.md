# Restore screen state on Undo

Undo will restore the complete program-visible **Screen** state alongside the **Core**, at the same instruction boundary and within the configured instruction-history limit: pixels in both the visible and drawing images, buffering mode, pen and fill settings, drawing position, the text cursor, and program-controlled dimensions. This adds history bookkeeping and memory overhead, especially for clears, presentations and resizes, but ensures that both the displayed image and subsequent drawing match the restored program state. For example, undoing a screen clear must recover the previous image; the history representation remains to be designed.

## History budget

A clear, a presentation or a resize journals a whole image, which is over a megabyte at 640 by 480, so the Screen history has its own byte budget, a user setting, and the Undo depth is the smaller of the Core's instruction history and the Screen's history within that budget. Both therefore always restore together; a deeper Core history than the Screen can afford is not offered rather than restoring the Core alone.

## Instruction alignment

Adapters associate Screen journal ranges with the CPU instruction that produced them, including
instructions executed inside Run. M68K uses stable execution IDs from the Core's history; Z80 uses
the bus timestamp within each history record's instruction clock interval. A CPU instruction with
no peripheral effects leaves the Screen untouched on Undo. The byte budget is checked before
rolling either side back: unrelated instructions after an evicted drawing can still be undone,
but Undo cannot cross the drawing whose image is no longer recoverable.

M68K drawing mode and Z80's staged drawing coordinates are restored alongside the Screen.
Off-screen drawing and scalar settings do not invalidate the visible image when undone;
undoing a presentation restores the previous visible image. Input echo belongs to its input
instruction, including the Z80 IN that is retried after input becomes available.

## Memory-backed images

When an image lives in Core memory, as with the MARS/RARS bitmap display, the Core's own rollback already restores the pixels, so Undo re-reads the mapped region into the Screen instead of journaling pixel changes on the Screen side. This follows the TRS-80 emulator that `@specy/z80` descends from, which rebuilds its screen from screen RAM after restoring a snapshot ([Trs80.ts](https://github.com/lkesteloot/trs80/blob/master/packages/trs80-emulator/src/Trs80.ts)). Images changed through drawing commands, such as EASy68K's, have no memory copy and still need Screen-side history.
