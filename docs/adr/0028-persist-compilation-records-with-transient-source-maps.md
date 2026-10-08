---
status: accepted
date: 2026-10-03
---

# Persist Compilation records and keep Source maps transient

Source maps belong to a Project's in-memory editor state, outside its program-visible FileSystem, and are excluded from persistence, share links, and Project archives; restoring the mapped split view after reopening requires Source compilation. Persist a separate Compilation record containing input/output paths and content fingerprints so stale-input detection and overwrite protection survive reopening and map invalidation. The owner chose transient line correspondence rather than a saved map or a program-visible `.map` File, while retaining the origin information needed to avoid silently replacing manual work.
