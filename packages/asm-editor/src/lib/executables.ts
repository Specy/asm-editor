import { analyze, type ElfAnalysis } from '@specy/x86/elf'
import { fileBytes, type ProjectFile } from './projectFiles'

export type ExecutableKind = 'none' | 'supported' | { unsupported: string }

/** The four bytes every ELF starts with. */
const ELF_MAGIC = '\x7fELF'

/**
 * Whether bytes, or a File, start with the ELF magic. A File is read from its first characters,
 * without decoding it whole: most Files are not ELFs, and this runs on every live check and Build.
 */
export function startsWithElfMagic(file: ProjectFile | Uint8Array): boolean {
    if (file instanceof Uint8Array)
        return file[0] === 0x7f && file[1] === 0x45 && file[2] === 0x4c && file[3] === 0x46
    if (file.encoding === 'plain') return file.content.startsWith(ELF_MAGIC)
    try {
        // Eight base64 characters are six bytes; the content is canonical, so they decode alone.
        return atob(file.content.slice(0, 8)).startsWith(ELF_MAGIC)
    } catch {
        return false
    }
}

/**
 * Analyses of ELF Files by content, least recently used first. A File's content string is the key,
 * not the File: `$state.snapshot` and every copy of a Project make new File objects for the same
 * content, which an object key misses, while a string compares by content (and the engine keeps a
 * string's hash once computed). Few are kept: an x86 Project has one Executable as its Entry.
 */
const analyses = {
    plain: new Map<string, ElfAnalysis>(),
    base64: new Map<string, ElfAnalysis>()
}
const CACHED_ANALYSES = 8

export function executableAnalysis(file: ProjectFile): ElfAnalysis {
    const cache = analyses[file.encoding]
    let info = cache.get(file.content)
    if (info) cache.delete(file.content)
    else info = analyze(fileBytes(file))
    cache.set(file.content, info)
    if (cache.size > CACHED_ANALYSES) cache.delete(cache.keys().next().value!)
    return info
}

/** Purpose comes from the bytes, independently of a File's path and encoding. */
export function executableKind(file: ProjectFile | Uint8Array | undefined): ExecutableKind {
    if (!file || !startsWithElfMagic(file)) return 'none'
    const info = file instanceof Uint8Array ? analyze(file) : executableAnalysis(file)
    return info.supported
        ? 'supported'
        : { unsupported: info.reason ?? 'an unsupported ELF program' }
}
