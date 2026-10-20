import type { AvailableLanguages } from '#lib/Project.svelte.ts'
import { parsePlaygroundLanguage } from './playgrounds'

/**
 * What colours a code block, read from its fence's info string ([ADR 0053](../../../../../docs/adr/0053-markdown-is-rendered-by-our-own-synchronous-pipeline.md)).
 * Assembly is named as a **Playground** names it; C and C++ as Monaco names them, so a fence says
 * `c`, `h`, `cpp`, `cc` or `hpp` as a File would. Anything else is left to Monaco where the host
 * asks for it, and plain everywhere else; a bare `asm` names none of the five architectures and is
 * one of those.
 */
export type FenceLanguage =
    | { kind: 'assembly'; language: AvailableLanguages }
    | { kind: 'c-cpp' }
    | { kind: 'other'; name: string }
    | { kind: 'none' }

/**
 * The ids, aliases and file extensions Monaco registers for its one C/C++ grammar
 * (`monaco-editor/languages/definitions/cpp/register.js`), lowercased. Copied rather than imported:
 * that file registers the languages through Monaco's contribution machinery, which the server
 * render and the tests cannot load.
 */
export const C_CPP_FENCE_NAMES: ReadonlySet<string> = new Set([
    'c',
    'h',
    'cpp',
    'c++',
    'cc',
    'cxx',
    'hpp',
    'hh',
    'hxx'
])

/** The language a fence names: the first `|`-separated word of its info string. */
export function fenceLanguage(info: string | undefined): FenceLanguage {
    const name = info?.split('|')[0].trim().toLowerCase() ?? ''
    if (!name) return { kind: 'none' }
    const assembly = parsePlaygroundLanguage(name)
    if (assembly) return { kind: 'assembly', language: assembly }
    if (C_CPP_FENCE_NAMES.has(name)) return { kind: 'c-cpp' }
    return { kind: 'other', name }
}
