import { makeMipsCore } from '#lib/languages/MIPS/MIPS-core.ts'
import { makeRiscVCore } from '#lib/languages/RISC-V/RISC-V-core.ts'
import {
    checkMarsProgram,
    type MarsCheckCore,
    type MarsCoreFactory,
    type MarsTarget
} from '#lib/languages/mars/marsCheck.ts'
import type { BuildSources } from '#lib/projectFiles.ts'
import type { ProjectAnalysisSnapshot, ProjectFileAnalysisStatus } from '../protocol'
import { unresolvedSnapshot, unresolvedSources } from './unresolved'

/** The Core of whichever Target a session analyzes: this Worker serves all three. */
const makeCore: MarsCoreFactory<MarsCheckCore> = (files, entry, profile, link, target) =>
    target === 'MIPS'
        ? makeMipsCore(files, entry, profile, link)
        : makeRiscVCore(files, entry, profile, target === 'RISC-V-64', link)

export function analyzeMarsProject(
    sources: BuildSources,
    sessionId: string,
    revision: number,
    target: MarsTarget
): ProjectAnalysisSnapshot {
    //sources the Build refuses are not checked either: why they cannot be built is the one error,
    //as a Project with no Program or a missing Entry gives, rather than a failure of the analysis
    const unresolved = unresolvedSources(sources)
    if (unresolved)
        return unresolvedSnapshot(
            sources,
            unresolved,
            sessionId,
            revision,
            target,
            target === 'MIPS' ? 'mips' : 'risc-v'
        )
    const { reached, diagnostics } = checkMarsProgram(sources, target, {
        makeCore,
        display: undefined
    })
    const fileStatus: Record<string, ProjectFileAnalysisStatus> = Object.create(null)
    for (const [path, file] of Object.entries(sources.files)) {
        fileStatus[path] =
            file.encoding !== 'plain' ? 'binary' : reached.has(path) ? 'assembled' : 'not-reachable'
    }
    return {
        sessionId,
        revision,
        target,
        diagnostics,
        symbols: [],
        occurrences: [],
        fileStatus
    }
}
