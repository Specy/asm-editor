import { analyze, type ElfAnalysis } from '@specy/x86/disassembler'
import { fileBytes, type ProjectFile } from './projectFiles'

export type ExecutableKind = 'none' | 'supported' | { unsupported: string }
const analyses = new WeakMap<ProjectFile, ElfAnalysis>()

export function executableAnalysis(file: ProjectFile): ElfAnalysis {
    let info = analyses.get(file)
    if (!info) {
        info = analyze(fileBytes(file))
        analyses.set(file, info)
    }
    return info
}

/** Purpose comes from the bytes, independently of a File's path and encoding. */
export function executableKind(file: ProjectFile | undefined): ExecutableKind {
    if (!file) return 'none'
    const info = executableAnalysis(file)
    if (!info.isElf) return 'none'
    return info.supported
        ? 'supported'
        : { unsupported: info.reason ?? 'an unsupported ELF program' }
}
