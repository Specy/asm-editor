import { analyze, type ElfAnalysis } from '@specy/x86/elf'
import { byteEditsKey, fileBytes, fileHead, type ProjectFile } from './projectFiles'

export type ExecutableKind = 'none' | 'supported' | { unsupported: string }

/**
 * Whether bytes, or a File, start with the ELF magic. A File is read from its first bytes, Byte
 * edits included, without decoding it whole: most Files are not ELFs, and this runs on every live
 * check and Build.
 */
export function startsWithElfMagic(file: ProjectFile | Uint8Array): boolean {
    let head: Uint8Array
    try {
        head = file instanceof Uint8Array ? file : fileHead(file, 4)
    } catch {
        return false
    }
    return head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46
}

/**
 * Analyses of ELF Files by content, least recently used first. A File's content string is the key,
 * not the File: `$state.snapshot` and every copy of a Project make new File objects for the same
 * content, which an object key misses, while a string compares by content (and the engine keeps a
 * string's hash once computed). Its Byte edits, a short text, tell versions of one content apart.
 * Few are kept: an x86 Project has one Executable as its Entry.
 */
const analyses = {
    plain: new Map<string, { edits: string; info: ElfAnalysis }>(),
    base64: new Map<string, { edits: string; info: ElfAnalysis }>()
}
const CACHED_ANALYSES = 8

export function executableAnalysis(file: ProjectFile): ElfAnalysis {
    const cache = analyses[file.encoding]
    const edits = byteEditsKey(file)
    let cached = cache.get(file.content)
    if (cached) cache.delete(file.content)
    if (cached?.edits !== edits) cached = { edits, info: analyze(fileBytes(file)) }
    cache.set(file.content, cached)
    if (cache.size > CACHED_ANALYSES) cache.delete(cache.keys().next().value!)
    return cached.info
}

/** Purpose comes from the bytes, independently of a File's path and encoding. */
export function executableKind(file: ProjectFile | Uint8Array | undefined): ExecutableKind {
    if (!file || !startsWithElfMagic(file)) return 'none'
    const info = file instanceof Uint8Array ? analyze(file) : executableAnalysis(file)
    return info.supported
        ? 'supported'
        : { unsupported: info.reason ?? 'an unsupported ELF program' }
}
