---
status: accepted
date: 2026-09-30
---

# The Workbench is a separate shell that edits one Project for its host

The project editor is being redesigned as an IDE-like **Workbench** that pages other than the projects route must be able to host, starting with the exam session. We decided that the Workbench edits exactly one **Project** and owns nothing around it. Its host passes the Project, the actions it supports (back, save, share), which built-in rail panels (Explorer, Testcases, Documentation, AI, Settings) are off or read only, and rail panels and links of its own (the exam prompt, the teacher's review agent, Donate). The Workbench shows a control only for an action it was given, never imports the project store or navigates, and fills its container rather than the viewport. It stays a separate shell from the **Interactive editor** used inline by Playgrounds and the documentation, although both are built from the same leaf components and repeat some Build and Run wiring. The two do different jobs: the Workbench arranges a whole Project the way an IDE does, while the Interactive editor shows the few panels a host picks, inside a page's flow.

## Considered options

- **Individual fields and events with a `showX` flag per feature**, which is today's `ProjectEditor` shape. Rejected: every new host adds flags and special slots, and the single-`code` source mode it needs for the exam session is the cause of the editor's two source paths (`hasProjectFiles`, the `(no file)` badge, the `breakpointFile` fallback).
- **A fixed set of panels**, with the exam prompt as a built-in instructions panel. Rejected: each host-specific panel would become a Workbench feature.
- **One editor with a full-screen layout and an inline layout**, merging the Workbench and the Interactive editor. Rejected by the owner: the inline editor is kept separate so that it can evolve for inline use without the IDE layout's constraints.

## Consequences

- A host without a stored Project builds a temporary one. The exam session wraps each assembly section in a one-file Project and copies the Entry file's text back into its answer string. Exam sections are still not stored as Projects ([project-format.md](../design/project-format.md), Serialization and migration).
- Saving, autosave, the unsaved-changes prompt, share links and the language theme switch move out of the editor into the host, or stay there.
