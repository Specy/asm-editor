# Examples page and links

`/examples` shows a project in an iframe. Its navbar uses the app's custom Select for an ISA filter and an example picker. The filter starts at All ISAs. Filtering changes the picker without discarding the open project. A visit that names no example opens the first one by name whose archive is at most 64 KiB, so a first look never downloads asmOS.

Each port has a stable id: the lower-case ISA, the example's repository slug, and its variant when present, joined with hyphens. For example, `mips-bouncing-ball` and `risc-v-pacman`. Display names and source folder locations do not affect these ids. Repository slugs and variant names are public URL identifiers and must be preserved when renaming display text or moving an example between a Target folder and `shared/`.

`/examples?example=mips-bouncing-ball` selects the example on the page. The iframe loads `/projects/share?example=mips-bouncing-ball`, which also opens directly in the full editor. The `example` query takes precedence over a `project` payload. An unknown id shows an error.

The project is fetched from the bundled `/examples/index.json` and its archive. Opening it does not save a project. An example is edited once its work differs from the archive: its Files, Programs and records. The open tabs, File views and a Build output nobody changed do not count, so looking around an example or building it is not editing it. An unedited example leaves without asking and its editor Share action copies its short example link. After editing, Share includes the project contents through the existing `project` payload, and leaving asks. Save makes a personal copy using the shared-project save flow. The page's Share example action always shares the original example.

Share offers a plain link, a link with Build, and a link with Build and Run. `&build=true` builds the selected Program when the Workbench is ready. `&buildAndRun=true` builds it and then runs only if the Build succeeded. Bare flags also work, and Build and Run takes precedence when both are enabled. An action runs once per opened link. Removing the Workbench during its Build cancels startup.

These flags work with example links and existing `project` payloads. The Examples page forwards them into its iframe and Open in editor link, and retains them when another example is selected.

Edits in the iframe notify its same-origin parent so changing examples or leaving the page asks before discarding changes. The editor's own Home, Back and Donate, and Save's move to the saved copy, ask the parent to go there instead of opening the site inside the frame. They name a destination from a fixed set, never a path. Browser Back and Forward select the example recorded in the URL.

`packages/examples` is the examples submodule. The root `build:examples` task installs its dependencies and builds its archives, and dev, build, test and measure depend on it. Only the site's build also runs the editor's `build:example-outputs` task, which adds the linked outputs archives ask for: it Builds asmOS on the x86 Core, about twenty seconds. The Vite plugin serves the files during development and emits them into the production site's assets. CI runs both tasks itself, since its jobs skip task dependencies.
