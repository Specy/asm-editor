# Pixel editor

Decision record for the **Pixel editor**, a small editor for drawing the pictures a program reads at run time, such as the sprite sheets of the [Pac-Man example](../../packages/asm-editor/examples/risc-v/pacman/README.md). Settled one question at a time in a grill session on 2026-10-25.

## 1. A view of the File, beside Preview and Hex

Decided on 2026-10-25.

The Pixel editor is a view of a **File** in a **Workbench** pane, offered by the view switch beside the File's **Preview** and **Hex editor**, the way an **Executable** offers Hex · Disassemble · Decompile. The Preview stays read-only. The Project saves the view each File is shown in, as it does for every view, so a picture switched to the Pixel editor reopens there.

Why: the Preview is the File "as it reads" and is also how a CTF image is inspected, so drawing on it would let a click change a forensics File. A dialog or a page of its own would leave the Workbench's panes, tabs and Undo behind, where a view lets a sprite sheet be drawn in one pane while the program that reads it runs beside it.

## 2. Pixels and Pixel editor

Decided on 2026-10-25.

The view switch's button is **Pixels**, its title "Show the File's pixels in the Pixel editor", and the view is the **Pixel editor**, as **Hex** shows a File's bytes in the **Hex editor**.

Why: it names what is edited rather than what the picture is for, since the same view draws a maze or a tile set as well as a sprite sheet. "Sprite editor" is too narrow, "image editor" promises layers and filters, "BMP editor" ties the name to a format, and "Edit" says nothing the Hex editor does not.

## 3. Every uncompressed BMP, kept in its own layout

Decided on 2026-10-25.

Pixels is offered for every BMP whose pixels are stored uncompressed: 1, 4 and 8 bits a pixel through the File's palette, 16, 24 and 32 bits a pixel with or without colour masks and an alpha channel, rows stored bottom-up or top-down, under any of the DIB headers the Preview recognises (`BITMAPCOREHEADER`'s 12 bytes to `BITMAPV5HEADER`'s 124). Drawing never changes that layout: the bits a pixel, the row order, the palette's length and the masks stay as the File has them, so every change overwrites pixel bytes and leaves the File's length alone. A picture with a palette is drawn in its palette's colours. A compressed BMP (RLE4, RLE8, or the JPEG or PNG a BMP can wrap) and every other picture format keep Preview and Hex only.

Why: a program reads the layout its File has, and the File must still read the same way after a drawing session, or the program that loaded it yesterday breaks today. Pictures with a palette are how sprites were stored where a byte a pixel or less matters, on the M68K and the Z80, and drawing in the palette's colours is how such pixel art was made; once a decoder handles one colour layout the others cost little. A PNG or a GIF would have to be decoded and encoded again, and no program here can read one.

## 4. Drawing makes Byte edits, and an archive holds the File as edited

Decided on 2026-10-25. Revised the same day by decision 11: changes are kept as Edit steps rather than merged, Undo is theirs rather than the session's, and the archive's `edits/` entry replaced the ranges described below.

Every stroke is saved as **Byte edits** ([ADR 0047](../adr/0047-byte-edits-are-kept-apart-from-the-original-bytes.md)): the File's original bytes stay as they are, and the pixel bytes a stroke changes are overwrites beside them, exactly as typing the same bytes in the Hex editor would save them. The Pixel editor and the Hex editor share the File's one Undo history, the Hex editor shows the drawn bytes, the status line says "edited", and everything that reads the File (the **FileSystem**, a Build, a download) sees the picture as drawn.

Where it is saved:

- **IndexedDB** is unchanged. The Project's row in the `projects` table of `mips-m68k-db` keeps each File as `content`, the original in base64, and `edits`, a list of `{ offset, remove, insert }` with `insert` in base64, and every autosave puts the whole row.
- **A Project archive changes** (a new archive version). An edited File is stored under `files/<path>` as edited, so a person who unzips an `.asmproj` sees the picture they drew, and its original goes under `original-files/<path>` at the archive's root. The manifest keeps each edit's `offset` and `remove` but not its bytes, which are read back from the edited File at those ranges. A File without Byte edits is stored as today, under `files/` alone. An edit list that inserts or deletes bytes, which the editor reads but never writes, keeps its bytes in the manifest.
- **Overwrites a few bytes apart are joined** into one edit, the unchanged bytes between them included, rather than only those that overlap or touch, so a stroke or a dither stays one edit rather than one a pixel.

`original-files/` cannot collide with a person's File: every File of a Project lies under `files/`, and the archive's root holds only what the archive itself adds, `project.json` until now, as [ADR 0019](../adr/0019-zip-project-archives.md) laid it out so as to reserve no File name. A reader refuses any other root entry, so an editor older than the new version refuses the archive as a version it does not know rather than misreading it.

Why: the two views change the same bytes, so they keep one record and one Undo; replacing the content instead would make drawing on a File with Hex edits flatten them, and Undo in one view would not take back the other's changes. ADR 0047 keeps the original so that a list of edits or the original itself can be shown later, which serves a retouched CTF picture as it serves a patched binary. The archive change comes from two facts checked on 2026-10-25 in `projectArchive.ts`: until now `files/` held the original and the edits lived in `project.json` as base64, so an unzipped archive showed the picture as it was before any drawing, and the manifest is capped at 1 MiB, about 750 KB of changed bytes across every edited File, which a fully repainted 512 × 512 32-bit picture exceeds and a dithered 256 × 144 sheet nearly reaches, since `mergeOverwrites` joined only edits that overlap or touch and each run costs some 40 bytes of JSON. With the bytes in `files/` and only ranges in the manifest, the manifest stays small whatever is drawn, and a patched ELF unzips as patched too.

## 5. A new picture starts in the Target's Screen format

Decided on 2026-10-25.

The Explorer offers **New picture…** beside New file, and **New picture in this folder** in a folder's menu. A small form asks for the name (`sprite.bmp` by default), the width and height, each from 1 to 1024 as the Screen's are, and the layout; the picture starts black and opens in the Pixel editor. The layout is any of those decision 3 edits (32-bit, 24-bit, or 8-, 4- or 1-bit through a palette), with an uncompressed 40-byte `BITMAPINFOHEADER`, and it starts on the one the **Project**'s **Target** draws with, so that a program loads a pixel without converting it:

| Target       | New picture's layout           | Why                                                                                                                                  |
| ------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| MIPS, RISC-V | 32-bit, top-down, no alpha     | pixel (x, y) is the word at `pixels + 4·(y·width + x)`, and that little-endian word is `0x00RRGGBB`, the Screen's own colour         |
| Z80          | 8-bit, top-down, 3-3-2 palette | each pixel byte is the colour byte an `out` gives the Z80's Screen ([ADR 0011](../adr/0011-z80-peripherals-through-the-port-map.md)) |
| M68K         | 32-bit, top-down, no alpha     | the big-endian long read from a pixel, shifted right by 8, is EASy68K's `$00BBGGRR` pen colour                                       |
| x86          | 32-bit, top-down, no alpha     | x86 has no Screen; the same layout as the others                                                                                     |

Why: the editor exists to make pictures a program reads, and the cheapest one to read is already in the Screen's format: no row padding, no rows stored last-first, no byte triplets to reassemble. Black is the Screen's clear colour and the transparent colour of the Pac-Man example's sprites. A picture is not made from an empty File named `.bmp`, since a byte File's kind comes from its bytes, never its name ([file-views.md](./file-views.md), decision 14). Top-down pictures, a negative height, are read by browsers and by the Pac-Man example's `decode_bmp`; only some old Windows tools mishandle them.

## 6. A palette's colours can be changed; new pictures start on fixed palettes

Decided on 2026-10-25.

A picture with a palette is drawn by choosing one of its entries, and an entry's colour can be changed, which recolours every pixel that uses it at once. The palette is in the File's header, so the change is a same-length overwrite saved as a Byte edit and undone like a stroke; entries are never added or removed, which would change the File's length (decision 3). A new picture's palette depends only on its bits a pixel:

| Bits a pixel | Palette                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| 8            | 3-3-2 on every Target: entry `RRRGGGBB` is that colour, each field stretched as the Z80's Screen stretches it |
| 4            | the 16 standard Windows and VGA colours                                                                       |
| 1            | black and white                                                                                               |

Why: swapping palette colours is how sprite variants were made on palette hardware (the same ghost in red, pink, cyan and orange), and it costs nothing beyond the Byte edits decision 4 already keeps. One 8-bit palette everywhere gives one rule, that an 8-bit pixel's index is its 3-3-2 colour, which is also the Z80's colour byte; the VGA mode 13h palette was the alternative, faithful to DOS but arbitrary to anyone who did not grow up with it.

## 7. Pixels are drawn opaque or transparent; partial alpha is kept

Decided on 2026-10-25.

In a picture with an alpha channel (32 bits a pixel with an alpha mask), every pixel drawn is either opaque or fully transparent: an **Erase** tool makes pixels transparent, shown over the Preview's checkerboard. Partial alpha already in the File, such as the soft edges of a picture converted from an anti-aliased PNG, is shown as it is over the checkerboard and kept exactly; only the pixels drawn get 0 or 255, and the eyedropper takes a partly transparent pixel's colour as opaque. A picture without an alpha channel has no transparency in the editor: a key colour, such as the black the Pac-Man example's sprite routines skip, is a colour like any other, and no option shows it as see-through. The New picture form offers **32-bit with transparency**, written with a 108-byte `BITMAPV4HEADER` carrying the red, green, blue and alpha masks, and never as the default (decision 5).

Why: the Screen stores `0x00RRGGBB` and cannot blend, so a program makes a sprite's background see-through by skipping a key colour, and partial alpha would need a blending step no program here performs. Black is also a colour pictures really use (the Pac-Man maze's background), so showing it as transparent would mislead. `BITMAPV4HEADER` is the smallest header that carries an alpha mask among those Microsoft documents (the 56-byte `BITMAPV3INFOHEADER` is an Adobe extension), and both browsers and the Pac-Man example's `decode_bmp` read its alpha. Full 0 to 255 alpha can be added later as an opacity control and a blending rule with no change to the File, the Byte edits or any saved form, because the BMP keeps 8 bits of alpha a pixel whatever the editor writes, and because pixels nobody draws are never rounded.

## 8. The first tools

Decided on 2026-10-25.

| Tool           | What it does                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Pencil**     | sets one pixel at a time, a drag a continuous stroke                                                                           |
| **Line**       | a straight line from where the pointer goes down to where it comes up                                                          |
| **Rectangle**  | an outline, or filled with a modifier key                                                                                      |
| **Ellipse**    | the ellipse in the box a drag makes, an outline or filled; any ellipse or circles only (added 2026-10-25)                      |
| **Fill**       | a flood fill of the same colour through the four neighbours up, down, left and right, so it never leaks through a diagonal gap |
| **Eyedropper** | takes the colour under the pointer                                                                                             |
| **Erase**      | makes pixels transparent, in a picture with an alpha channel only (decision 7)                                                 |

Around them: one stroke is one Undo step in the File's shared history (decision 4); zoom fits the pane as the Preview does and steps by whole numbers, so pixels stay square (since 2026-10-25 smooth, at the owner's request: [the plan](./pixel-editor-plan.md), decision 8); a pixel grid shows once zoomed in far enough; a cell grid draws lines every N × M pixels (16 × 16, say) so a sprite sheet's frames can be told apart, saved per File with the Project beside the File's view. A picture with a palette is drawn by choosing from its palette, whose entries can be recoloured (decision 6); any other by the browser's colour picker and a row of the colours the picture already uses.

_Added 2026-10-25 at the owner's request:_ tool settings, in a card under the tool's button, which is split in two, the tool and an arrow: the arrow opens them, as does a click on the tool once it is chosen, and a pointer elsewhere, Escape or another tool closes them. The Pencil has a size, 1 to 32 pixels, and a round or square brush, which the Eraser shares; Line has a width, drawn with a round brush; Rectangle and Ellipse have Filled, and Ellipse a switch between any ellipse and circles only, which Shift reverses while drawing (on Rectangle Shift reverses Filled). A brush wider than a pixel shows where it will draw under the pointer. The settings are kept with the pane's view of the picture, as the tool is.

Why: these are what drawing a sprite, a tile or a maze needs, and each is small. Selecting a region to move, copy, paste or flip is left out: it is the first thing a sprite sheet wants next, mirroring a sprite to face the other way being a flip, but it needs a floating selection and costs more than all the rest together.

## 9. Canvas size replaces the content, as one Undo step

Decided on 2026-10-25.

**Canvas size…** takes a new width and height, each from 1 to 1024. The picture stays anchored at its top-left corner: growing it adds pixels whose colour bits are all zero on the right and at the bottom: black, transparent in a picture with an alpha channel, and palette entry 0 in a picture with a palette (black in every palette a new picture starts with); bits no channel uses are copied from the top-left pixel, so a 32-bit picture whose fourth bytes are 0xFF, which Chrome reads as alpha, does not grow transparent. Shrinking it crops the right and the bottom. A picture opened larger than 1024 pixels can be resized up to its own size. The layout stays the File's (decision 3). The resized picture is the File's new content, and the Edit step it makes keeps the whole content it replaced, so Undo takes a resize back like a stroke (decision 12, [ADR 0063](../adr/0063-a-file-holds-its-current-bytes-and-undo-is-a-journal-beside-it.md)). _As first decided,_ under ADR 0047, it became the File's new original with its Byte edits folded in and a step of the shared Undo history put the previous original back. Scaling, which resamples the pixels themselves, is not offered.

Why: a sprite sheet grows as frames are added, and with selection left out (decision 8) a picture of a fixed size could not take its pixels into a larger one. Facts checked on 2026-10-25: `ByteEditHistory` starts a fresh stack when a File's original changes, and nothing outside a Debug session undoes a File's whole content being replaced, so the resize brings its own Undo step. Resizing through Byte edits that insert and delete was the alternative that keeps the original: the saved form expresses them, but `editBytes` refuses to add overwrites to a File that has one (`overwritesOnly`), the Hex editor's merging would have to be redone around them, and their bytes would sit in the archive's manifest that decision 4 empties, all to keep an original that matters for CTF Files nobody resizes.

## 10. Touch: one finger draws, two move

Decided on 2026-10-25.

On a touch screen one finger draws with the current tool, and two fingers pan and pinch-zoom, settling on a whole-number zoom when they lift so pixels stay square (since 2026-10-25 wherever they leave it); a stroke the first finger began is cancelled when a second one lands, so a pinch leaves no mark. Rectangle's filled form has a toggle in the toolbar, since touch has no modifier key, and the toolbar wraps at phone width rather than scrolling sideways, as nothing in the Workbench scrolls the page sideways. A stylus draws as a finger does, its pressure ignored, since a pixel is set or not.

Why: the Workbench works on phones, and a mode switch between drawing and moving, the simpler alternative, would have a person flipping it constantly; not drawing on touch at all would leave a phone with only the Preview.

## 11. Edits are kept as Edit steps, with an Edit history panel

Decided on 2026-10-25, after the first implementation, revising decisions 4 and 9. Where the steps are kept was superseded the same day by decision 12.

A File's newest changes are kept as **Edit steps**, each the Byte edits one change made (a stroke, a Fill, a recolour, a Canvas size, a burst of typing in the Hex editor) with a label and a time, and saved with the Project, so Undo and Redo survive a reload and any earlier step can be gone back to. The steps' edits end the File's `edits`, after the merged edits of older changes, so everything that reads the File applies them as it always did; a small `history` record says which trailing edits belong to which step and keeps the steps Undo took back, which Redo puts back and a new change discards, as a drawing program's History does. Canvas size is a step whose edit replaces the whole content, and its Undo puts the old picture back. An upload over the File or a program's write still makes the content new and drops the steps.

A File's steps keep at most 1 MiB of what they store, counted within the Project's 16 MiB. Past it the oldest steps fold into the merged edits, so the original is kept and the File reads the same, and only the way back that far is gone; the newest step stays even when larger than the budget alone, until the next change. Archives keep the steps; share links leave them out, carrying the File's edits merged.

The **Edit history** panel, a Workbench side panel like the Symbols panel, lists the steps of the byte File in the focused pane, newest first, the steps Undo took back greyed beyond the current one; choosing a step goes back, or forward, to just after it.

Why: drawing programs keep their History as the pixels each step changed, never as actions to replay (Paint, Paint.NET, GIMP, Photoshop, Krita, Aseprite), and only parametric editors save actions, at the price of versioned rendering (Lightroom's Process Versions, darktable's module versions). Bytes mean the same whatever later versions of the tools do. Measured on 2026-10-25, a Pencil stroke costs tens to a few hundred bytes, a Fill the area it covers: a sprite's whole history is tens of KB and reworking the Pac-Man sheet a few hundred, while a Fill of a 1024 × 1024 picture alone is 5.6 MB, which is why the budget.

## 12. A File holds its current bytes; Edit steps are a journal beside it

Decided on 2026-10-25, after two reviews of decision 11 as implemented, superseding decision 4's storage and decision 11's place for the steps; recorded in [ADR 0063](../adr/0063-a-file-holds-its-current-bytes-and-undo-is-a-journal-beside-it.md), which supersedes ADR 0047.

A stroke, a Fill, a recolour, Canvas size and Hex typing write the File's bytes. What each overwrote is an **Edit step** in the File's Edit journal, kept in the browser beside the Project (in IndexedDB on the project page, in memory elsewhere), not in it: Undo writes those bytes back and keeps the ones it removes for Redo. The Edit history panel, labels, times, going back to any step and the 1 MiB a File stay as decision 11 has them, with 4 MiB for all a Project's Files and 1,000 steps a File besides; the oldest steps past a budget are dropped, since the File is already its current self. A journal is tied to a fingerprint of its File's content and dropped when the File changes any other way. Archives and share links hold the Files as they are and no steps; Projects and archives saved with Byte edits are read with them applied.

Why: the reviews found the original and undone steps leaking into share links and archives, an edited File costing twice its size, steps lost when a rename rebuilt the File's record, the archive's manifest filling with step labels, and quadratic replays after a whole replacement; keeping the document as it is and its undo beside it, as image and hex editors do, removes each of them. What it gives up: the original ADR 0047 kept for a future patch list, and undo travelling in archives.

## Follows from the code

Checked on 2026-10-25; not decisions, since the Hex editor already settles them and the Pixel editor shares its File and its edits.

- **Read-only when the Hex editor is.** `EditorGroup.bytesReadOnly` makes the Hex editor read-only in a read-only Project, during a Debug session or a Build ("The Files are read-only during a Debug session: Stop to edit them"); the Pixel editor is read-only in the same cases, with the same words. A program that writes the picture during a run replaces its content, which the view shows as it does any other change; if what it writes is no longer an uncompressed BMP, the File offers Preview and Hex only.
- **The Workbench only.** The Hex editor and the Preview are shown only by the Workbench's `EditorPane`, and no **Interactive editor** shows a File's views, so neither does it show the Pixel editor.

## Deferred

Left out of the first version on purpose, each to be raised with the owner again:

- **Selection**: selecting a region to move, copy, paste or flip, the first follow-up (decision 8).
- **Full alpha**: an opacity control and a blending rule, which need no change to any saved form (decision 7).
- **Scaling** a picture by whole multiples (decision 9).
- **Folding Byte edits into the original**, so a picture drawn from a blank one stops carrying the blank one (decision 4).
- **Adding or removing palette entries**, which changes the File's length (decision 6).
- **Editing other formats**: compressed BMPs, PNG, GIF (decision 3).

## Open for planning

Settled in [the implementation plan](./pixel-editor-plan.md), "Decisions taken while planning", on 2026-10-25:

- The archive version that stores an edited File as edited (decision 4), its reader and writer, and how far apart two overwrites may be and still be joined.
- Where the Pixel editor is documented: each Target's Screen chapter, the x86 Executables chapter's Hex editor section, and the Pac-Man example's README are the candidates.
- The status line (size, layout, zoom, "edited", as the Hex editor's and the Preview's), the tools' keyboard shortcuts, and the cell grid's default and where the Project saves it beside the File's view.
