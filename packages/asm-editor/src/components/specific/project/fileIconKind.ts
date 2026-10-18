import type { AvailableLanguages } from '#lib/Project.svelte.ts'
import { startsWithElfMagic } from '#lib/executables.ts'
import { filePreview, previewSignature, type FilePreview } from '#lib/fileKinds.ts'
import type { ProjectFile } from '#lib/projectFiles.ts'
import { textFileLanguage } from '#lib/textFileLanguages.ts'

/**
 * Which icon the Explorer draws for a File. What its bytes are comes first, as `fileKind` decides
 * a File's kind ([file-views.md](../../../../../../docs/design/file-views.md), decision 1): an ELF,
 * or an image, a PDF, audio or video by their signature, whatever the File is named. Bytes that
 * are none of those are `binary`; a text File is known by its name.
 */
export type FileIconKind =
    | 'executable'
    | FilePreview['preview']
    | 'binary'
    | 'c'
    | 'cpp'
    | 'header'
    | 'assembly'
    | 'markdown'
    | 'python'
    | 'table'
    | 'code'
    | 'text'
    | 'file'

const assemblyExtensions: Record<string, AvailableLanguages> = {
    m68k: 'M68K',
    x68: 'M68K',
    mips: 'MIPS',
    riscv: 'RISC-V',
    x86: 'X86',
    z80: 'Z80'
}

function extensionOf(path: string) {
    return path.split('/').pop()?.split('.').slice(1).pop()?.toLowerCase() ?? ''
}

/** The Target whose assembly the File at `path` is, by its extension. */
export function assemblyLanguageOf(
    path: string,
    language: AvailableLanguages
): AvailableLanguages | undefined {
    const extension = extensionOf(path)
    if (['asm', 's', 'inc'].includes(extension)) return language
    if (extension === 'riscv' && language === 'RISC-V-64') return language
    return Object.prototype.hasOwnProperty.call(assemblyExtensions, extension)
        ? assemblyExtensions[extension]
        : undefined
}

/**
 * The icon for the File at `path`: `file` is its content, a Project File or the bytes of a Build
 * output, and none for a name still being typed.
 */
export function fileIconKind(
    path: string,
    language: AvailableLanguages,
    file?: ProjectFile | Uint8Array
): FileIconKind {
    if (file) {
        if (startsWithElfMagic(file)) return 'executable'
        const preview = file instanceof Uint8Array ? previewSignature(file) : filePreview(file)
        if (preview) return preview.preview
        if (file instanceof Uint8Array || file.encoding !== 'plain') return 'binary'
    }
    const extension = extensionOf(path)
    if (extension === 'c') return 'c'
    if (['cpp', 'cc', 'cxx'].includes(extension)) return 'cpp'
    if (['h', 'hpp', 'hh', 'hxx'].includes(extension)) return 'header'
    if (assemblyLanguageOf(path, language)) return 'assembly'
    if (['csv', 'tsv'].includes(extension)) return 'table'
    const text = textFileLanguage(path)
    if (text === 'markdown' || text === 'python') return text
    if (text === 'plaintext') return 'text'
    return text ? 'code' : 'file'
}
