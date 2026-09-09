---
status: accepted
date: 2026-09-08
---

# ZIP project archives

Export a complete Project as a standard ZIP container named `<project-name>.asmproj`, also accepting a `.zip` file with the same validated internal format, because an assembly-source body cannot represent every Project state, including binary or missing entry Files. Store a versioned `project.json` manifest at the archive root and exact file bytes beneath an archive-only `files/` prefix, keeping project metadata outside the FileSystem without reserving user filenames. This trades direct source-file opening for a lossless multi-file package; individual-file downloads retain their raw contents, and legacy source-plus-metadata imports remain supported.

Linked legacy sources retain write-back only for compatible single-text-file Projects; other states require an explicit `Save As .asmproj` before updating the disk copy again. Browser persistence continues under the ordinary saving preference, with the stale disk copy clearly identified, and the original source is never silently replaced with ZIP data.
