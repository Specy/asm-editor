---
status: accepted
date: 2026-11-10
---

# The Workbench appears before its Emulator

Opening a Project showed a blurred page with one spinner until the Project's **Core** had downloaded and its Emulator had been made, then the whole Workbench at once, then a second spinner in the editor until Monaco loaded. Little of the Workbench needs the Core: the rail and its panels, the Files, the tabs, the editor and its live Diagnostics (the language worker's), the bottom panel and the Command line do not, and the Debug session's panels are built at the first Build anyway. We decided that the Workbench is on screen as soon as its host has the Project, while the Core loads, and that only what needs the Core waits for it ([workbench-loading-plan.md](../design/workbench-loading-plan.md)).

The session takes the Emulator as it arrives (`WorkbenchSession.attach`): `session.emulator` is undefined until then, and `session.coreStatus` says whether the Core is loading, ready or failed. A Build pressed while the Core loads waits for it as a Build waits for anything, saying "Loading the MIPS emulator…" and taking Cancel; a test run waits the same way, and the coding agent's tools answer that the emulator is still loading. The language worker starts once Monaco has loaded, or the Core has settled if that comes first, so that it does not slow down the editor's own download. Breakpoints set, Files edited and Settings chosen meanwhile reach the Emulator as it arrives. A Core that does not load leaves the Workbench open, with Reload in Build's place, rather than replacing it with an error page. What only a Debug session shows reads `session.core`, which throws without an Emulator, since a Build made one.

## Considered options

- **An inert stand-in Emulator until the real one arrives.** Rejected: the Emulator's type is large, a stand-in would fake every member, and a member a later change starts reading would quietly give a wrong answer; an optional `emulator` makes the type checker name every reader.
- **Constructing each language's Emulator without its Core and loading the Core inside it.** Rejected for now: it touches all five adapters and their Cores' imports for nothing visible beyond this decision.
- **A skeleton drawn in the Workbench's place until everything is loaded.** Kept only for the read of the Project itself (`WorkbenchFrame`), which has no Workbench to draw yet.

## Consequences

- Hosts no longer pass `loading` or `failureActions`; a host panel's `emulator` is undefined while the Core loads.
- The bottom panel shows an empty Terminal until the Core loads, then the Emulator's.
- The Testcases panel waits for the Core, which names the registers a Testcase checks.
