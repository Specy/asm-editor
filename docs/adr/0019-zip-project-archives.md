---
status: accepted
date: 2026-09-08
---

# ZIP project archives

Export a complete Project as a standard ZIP container named `<project-name>.asmproj`, also accepting a `.zip` file with the same validated internal format, because an assembly-source body cannot represent every Project state, including binary or missing entry Files. Store a versioned `project.json` manifest at the archive root and exact file bytes beneath an archive-only `files/` prefix, keeping project metadata outside the FileSystem without reserving user filenames. This trades direct source-file opening for a lossless multi-file package; individual-file downloads retain their raw contents, and legacy source-plus-metadata imports remain supported.

Linked legacy sources retain write-back only for compatible single-text-file Projects; other states require an explicit `Save As .asmproj` before updating the disk copy again. Browser persistence continues under the ordinary saving preference, with the stale disk copy clearly identified, and the original source is never silently replaced with ZIP data.

## Update 2026-09-11: one download per Project, chosen by its shape

A Project card offered two downloads — the archive, plus a raw Entry-file export when nothing would be omitted — and having to know which one to press is a choice the Project's shape already answers. There is now one download button. A Project of exactly one plain-text File at its Entry path downloads as that source with the commented metadata block appended: the same representation linked legacy sources are written back in, readable by other assemblers, and carrying the name, description, Testcases, Settings and display an archive would have kept. Every other Project — multi-file, binary, or a missing Entry — downloads as the `.asmproj` archive, the only form that survives it.

The boundary is deliberately the one already accepted for linked write-back, so a Project's download and its linked file agree on what a source file can hold. The raw Entry export without metadata is gone from the Project card; per-File downloads in the sidebar still give exact bytes.
