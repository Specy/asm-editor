---
status: accepted
date: 2026-10-20
---

# Render Markdown with our own synchronous pipeline, and colour code blocks with the editor's highlighters

Every piece of Markdown the app shows, authored (**Lectures**, **Blog posts**, **Documentation entries**) or written by a user (a Project's Markdown **Preview**, an **Exam**'s instructions and prompts), becomes HTML through one synchronous unified pipeline that runs the same way in the server render and in the browser: remark with GFM, raw HTML, the editor's own hast plugins (Playgrounds, heading ids, disabled links, code blocks), stringified and sanitized. There is one render, so what the prerendered page carries is what the reader keeps; a **Playground**'s embed replaces its code block after mount, from the rendered page, not from a second render.

Code blocks are coloured by the editor's own synchronous highlighters, which paint from the token colour table Monaco's theme uses: the assembly highlighter, and a C/C++ highlighter that follows Monaco's C/C++ grammar and takes its keyword list from that grammar's data, as Monaco colours `.c` and `.cpp` files with one grammar. Any other fence language is plain, except where the host asks for Monaco: the Workbench's Markdown Preview and the Exam session pass a flag, and there Monaco, loaded if it is not yet, colours the fences our highlighters do not handle. A fence names its language as Monaco names one, by id, alias or file extension, ignoring case (`h`, `cc` and `hpp` are C/C++), and assembly by the names a Playground uses; a bare `asm` names none of the five and stays plain.

This replaces carta-md and Shiki. Carta rendered twice, synchronously for the prerendered page and asynchronously on mount, and when the second render failed it silently kept the first, so a stale chunk on a dev server left every C block plain and every Playground unembedded. It loaded a grammar only for a fence whose info was a bare language name, missing `c|playground|…`. Shiki's themes colour code unlike the editor (purple keywords where the editor's are orange), and its bundled grammars put about 300 lazy chunks, some 13 MB, into every build.

## Considered options

- Render authored Markdown to HTML at build or load time and keep a runtime pipeline for user Markdown: deferred. The Documentation panel renders entries in the browser from modules, user Markdown is runtime-only, and the one pipeline can be moved to build time later without changing it.
- Shiki's synchronous core (`createHighlighterCoreSync` with the JavaScript regex engine): rejected. It removes the second render's failure but keeps the heavy C++ grammar and colours that are not the editor's.
- highlight.js (lowlight) or Lezer's C++ parser: rejected. Synchronous and small, but their token kinds are not Monaco's, so code blocks would only approximate the editor.
- A small Monarch interpreter running Monaco's grammars unchanged: rejected for now. Exact by construction, but it has to reproduce Monarch's state parameters and cases faithfully, and its payoff, other languages outside Monaco, is not needed where no user Markdown appears.

## Consequences

- A fence language outside assembly and C/C++ renders plain on lecture, blog and documentation pages.
- The C/C++ highlighter imports `monaco-editor/languages/definitions/cpp/cpp.js`, an internal path that moved in Monaco 0.57; a Monaco upgrade can break the import, loudly.
- The **Exam** builder's Markdown fields, carta's editor until now, become Monaco in its Markdown mode with a preview beside it or behind a Text · Preview switch: the host chooses, or leaves it to the editor's own width (side by side from 768 px). The preview asks for Monaco, so it shows what the Exam session will.
- carta-md, `@cartamd/plugin-code` and with them Shiki leave the dependencies; `remark-rehype` and `rehype-stringify` become direct ones.
