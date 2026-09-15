---
status: accepted
date: 2026-09-08
---

# Entry path can name a missing File

A Project's `entry` is its configured Entry path, which may temporarily name a missing File after a file operation; a Build reports that condition while an already-running program retains its Build snapshot. We chose to permit deletion and rename of the Entry file without silently selecting a different build target or recreating deleted source, accepting that a Project may need its entry restored or changed before it can build again. This revises the earlier project-format existence invariant: saving, loading, export, and editor presentation must preserve the missing-entry state, including an explicitly empty Files map, while new Project creation and legacy code-only migration still provide their default source File.
