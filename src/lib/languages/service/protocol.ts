import type { ProjectFile, ProjectFiles } from '$lib/projectFiles'
import type { LanguageDiagnostic, SourceLocation, SymbolKind } from './sourceModel'

export type ProjectAnalysisTarget = 'M68K' | 'MIPS' | 'RISC-V' | 'RISC-V-64' | 'X86' | 'Z80'

export type ProjectFileChange =
    { type: 'set'; path: string; file: ProjectFile } | { type: 'delete'; path: string }

export type ProjectFileAnalysisStatus = 'assembled' | 'not-reachable' | 'binary'

export type LanguageSymbol = {
    id: string
    name: string
    kind: SymbolKind
    value?: number
    /** False when the Core reports position-dependent definitions or another rename hazard. */
    renameable?: boolean
    location: SourceLocation
}

export type ProjectAnalysisSnapshot = {
    sessionId: string
    revision: number
    target: ProjectAnalysisTarget
    diagnostics: LanguageDiagnostic[]
    symbols: LanguageSymbol[]
    occurrences: import('./sourceModel').SymbolOccurrence[]
    fileStatus: Record<string, ProjectFileAnalysisStatus>
}

export type ProjectWorkerRequest =
    | {
          type: 'open'
          sessionId: string
          revision: number
          target: ProjectAnalysisTarget
          entry: string
          files: ProjectFiles
      }
    | {
          type: 'update'
          sessionId: string
          revision: number
          entry: string
          changes: ProjectFileChange[]
      }
    | { type: 'dispose'; sessionId: string }

export type ProjectWorkerResponse =
    | { type: 'analysis'; snapshot: ProjectAnalysisSnapshot }
    | { type: 'failure'; sessionId: string; revision: number; message: string }

/** Kept as aliases while the M68K adapter/provider names remain Target-specific. */
export type M68kAnalysisSnapshot = ProjectAnalysisSnapshot
export type M68kFileAnalysisStatus = ProjectFileAnalysisStatus
export type M68kWorkerRequest = ProjectWorkerRequest
export type M68kWorkerResponse = ProjectWorkerResponse
