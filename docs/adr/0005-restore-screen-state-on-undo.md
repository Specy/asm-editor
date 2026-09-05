# Restore screen state on Undo

Undo will restore the complete program-visible **Screen** state alongside the **Core**, at the same instruction boundary and within the configured instruction-history limit: pixels in both the visible and drawing images, buffering mode, pen and fill settings, drawing position, the text cursor, and program-controlled dimensions. This adds history bookkeeping and memory overhead, especially for clears, presentations and resizes, but ensures that both the displayed image and subsequent drawing match the restored program state. For example, undoing a screen clear must recover the previous image; the history representation remains to be designed.

## History budget

A clear, a presentation or a resize journals a whole image, which is over a megabyte at 640 by 480, so the Screen history has its own byte budget, a user setting, and the Undo depth is the smaller of the Core's instruction history and the Screen's history within that budget. Both therefore always restore together; a deeper Core history than the Screen can afford is not offered rather than restoring the Core alone.

## Memory-backed images

When an image lives in Core memory, as with the MARS/RARS bitmap display, the Core's own rollback already restores the pixels, so Undo re-reads the mapped region into the Screen instead of journaling pixel changes on the Screen side. This follows the TRS-80 emulator that `@specy/z80` descends from, which rebuilds its screen from screen RAM after restoring a snapshot ([Trs80.ts](https://github.com/lkesteloot/trs80/blob/master/packages/trs80-emulator/src/Trs80.ts)). Images changed through drawing commands, such as EASy68K's, have no memory copy and still need Screen-side history.
