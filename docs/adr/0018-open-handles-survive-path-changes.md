---
status: accepted
date: 2026-09-08
---

# Open handles survive path changes

A Project persists Files by path, but runtime file operations address their contents through open handles. Those handles remain attached to the same contents across rename and deletion, and creating a new File at the old path never redirects them; only named Files participate in Project persistence. We accept tracking detached contents and handle identity, instead of repeated pathname lookup or forbidding these operations, so file access and instruction Undo remain consistent when paths change.
