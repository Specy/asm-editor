import type { AvailableLanguages } from '$lib/Project.svelte'
import { LANGUAGE_EXTENSIONS } from '$lib/Config'
import {
    isValidFilePath,
    ProjectFormatError,
    type ProjectFile,
    type ProjectFiles
} from '$lib/projectFiles'

export type CompilationTarget = 'MIPS' | 'RISC-V' | 'RISC-V-64'
export type SourceLanguage = 'c' | 'cpp'
export const OPTIMIZATIONS = ['0', '1', '2', '3', 's'] as const
export type Optimization = (typeof OPTIMIZATIONS)[number]
export type SourceLocation = { path: string; line: number }
export type CompilationRecord = {
    sourcePath: string
    outputPath: string
    target: CompilationTarget
    language: SourceLanguage
    compilerId: string
    optimization: Optimization
    inputs: Readonly<Record<string, string>>
    outputFingerprint: string
    /** A renamed input needs recompilation even if its bytes did not change. */
    renamedInput?: true
}
export type CompilationSourceMap = {
    sourcePath: string
    outputFingerprint: string
    /** Zero-based assembly line to zero-based original source location. */
    lines: readonly (SourceLocation | null)[]
}

export function sourceLanguage(path: string): SourceLanguage | undefined {
    if (/\.c$/i.test(path)) return 'c'
    if (/\.(cpp|cc|cxx)$/i.test(path)) return 'cpp'
}

export function editorFileLanguage(path: string, target: AvailableLanguages) {
    return sourceLanguage(path) ?? (/\.(h|hpp|hh|hxx)$/i.test(path) ? 'cpp' : target)
}

export function isCompilationTarget(target: AvailableLanguages): target is CompilationTarget {
    return target === 'MIPS' || target === 'RISC-V' || target === 'RISC-V-64'
}

export function generatedAssemblyPath(sourcePath: string, target: AvailableLanguages): string {
    return `${sourcePath}.${LANGUAGE_EXTENSIONS[target]}`
}

export const SOURCE_TEMPLATE = 'int main(void) {\n    int result = 6 * 7;\n    return result;\n}\n'

/** A deterministic 128-bit content fingerprint, for change detection, not authentication. */
export function contentFingerprint(text: string): string {
    let a = 1779033703,
        b = 3144134277,
        c = 1013904242,
        d = 2773480762
    for (let i = 0; i < text.length; i++) {
        const k = text.charCodeAt(i)
        a = b ^ Math.imul(a ^ k, 597399067)
        b = c ^ Math.imul(b ^ k, 2869860233)
        c = d ^ Math.imul(c ^ k, 951274213)
        d = a ^ Math.imul(d ^ k, 2716044179)
    }
    a = Math.imul(c ^ (a >>> 18), 597399067)
    b = Math.imul(d ^ (b >>> 22), 2869860233)
    c = Math.imul(a ^ (c >>> 17), 951274213)
    d = Math.imul(b ^ (d >>> 19), 2716044179)
    return [a ^ b ^ c ^ d, b ^ a, c ^ a, d ^ a]
        .map((value) => (value >>> 0).toString(16).padStart(8, '0'))
        .join('')
}

export function fileFingerprint(file: ProjectFile | undefined): string | undefined {
    return file ? contentFingerprint(`${file.encoding}\0${file.content}`) : undefined
}

export function compilationStatus(
    record: CompilationRecord,
    files: ProjectFiles,
    target: AvailableLanguages
) {
    return {
        stale:
            !!record.renamedInput ||
            record.target !== target ||
            Object.entries(record.inputs).some(
                ([path, fingerprint]) => fileFingerprint(files[path]) !== fingerprint
            ),
        edited:
            !!files[record.outputPath] &&
            fileFingerprint(files[record.outputPath]) !== record.outputFingerprint
    }
}

/** Validate provenance supplied by storage, share links, or archive imports. Never trust a map from JSON. */
export function cleanCompilationRecords(raw: unknown): CompilationRecord[] | undefined {
    if (raw === undefined) return undefined
    if (!Array.isArray(raw) || raw.length > 256)
        throw new ProjectFormatError('Invalid Compilation records')
    const outputs = new Set<string>()
    const fingerprint = (value: unknown): value is string =>
        typeof value === 'string' && /^[a-f0-9]{32}$/.test(value)
    const records = raw.map((value): CompilationRecord => {
        if (
            !value ||
            typeof value !== 'object' ||
            !isValidFilePath(value.sourcePath) ||
            !isValidFilePath(value.outputPath) ||
            value.sourcePath === value.outputPath ||
            outputs.has(value.outputPath) ||
            !['MIPS', 'RISC-V', 'RISC-V-64'].includes(value.target) ||
            !['c', 'cpp'].includes(value.language) ||
            typeof value.compilerId !== 'string' ||
            !/^[\w.+-]{1,80}$/.test(value.compilerId) ||
            !OPTIMIZATIONS.includes(value.optimization) ||
            !fingerprint(value.outputFingerprint) ||
            !value.inputs ||
            typeof value.inputs !== 'object' ||
            Array.isArray(value.inputs)
        ) {
            throw new ProjectFormatError('Invalid Compilation record')
        }
        const entries = Object.entries(value.inputs)
        if (
            entries.length > 4096 ||
            !entries.some(([path]) => path === value.sourcePath) ||
            entries.some(([path, hash]) => !isValidFilePath(path) || !fingerprint(hash))
        ) {
            throw new ProjectFormatError('Invalid Compilation inputs')
        }
        outputs.add(value.outputPath)
        return {
            sourcePath: value.sourcePath,
            outputPath: value.outputPath,
            target: value.target,
            language: value.language,
            compilerId: value.compilerId,
            optimization: value.optimization,
            outputFingerprint: value.outputFingerprint,
            inputs: Object.fromEntries(entries) as Record<string, string>,
            ...(value.renamedInput === true ? { renamedInput: true } : {})
        }
    })
    return records.length ? records : undefined
}
