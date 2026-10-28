import type { BuildArtifact, ChangedCode } from './commonLanguageFeatures.svelte'

/**
 * Code a program changed at run time, as the editor shows it: an M68K program's code is memory, so
 * a store or a Poke can change the bytes a line placed, and the line keeps its place while what it
 * runs changes ([m68k-machine.md](../../../../../docs/design/m68k-machine.md), decision 27).
 */

/** Whether two readings name the same lines running the same code, so a refresh can keep the first. */
export function sameChangedCode(a: readonly ChangedCode[], b: readonly ChangedCode[]): boolean {
    return (
        a.length === b.length &&
        a.every(
            (changed, i) =>
                changed.address === b[i].address &&
                changed.runsNow === b[i].runsNow &&
                changed.file === b[i].file &&
                changed.line === b[i].line
        )
    )
}

/**
 * The Build's artifacts for one File with what runs now at each address whose bytes changed, which
 * the Build hover says beside the machine code the Build placed.
 */
export function withChangedCode(
    artifacts: readonly BuildArtifact[],
    changed: readonly ChangedCode[]
): BuildArtifact[] {
    if (changed.length === 0) return [...artifacts]
    const now = new Map(changed.map((code) => [code.address, code.runsNow]))
    return artifacts.map((artifact) => {
        const runsNow = now.get(artifact.address)
        return runsNow === undefined ? artifact : { ...artifact, runsNow }
    })
}

/**
 * The lines of `file` marked as changed at run time, once each, with what runs there now: a File
 * included twice is two placements of one line, and the first changed one speaks for the line.
 */
export function changedLinesOf(
    changed: readonly ChangedCode[],
    file: string | undefined
): { line: number; runsNow: string }[] {
    const lines = new Map<number, string>()
    for (const code of changed)
        if (code.file === file && !lines.has(code.line)) lines.set(code.line, code.runsNow)
    return [...lines].map(([line, runsNow]) => ({ line, runsNow }))
}
