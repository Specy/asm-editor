import { fileFingerprint } from './fingerprints'
import { compilationInputs } from './compilationInputs'
import type { AvailableLanguages } from '$lib/Project.svelte'
import { isAssemblerProfile, type AssemblerProfile } from '$lib/assemblerProfiles'
import { hasRuntimeLibrary, isRuntimeAbiName } from '$lib/runtimeAbi'
import { LANGUAGE_EXTENSIONS } from '$lib/Config'
import { isValidFilePath, ProjectFormatError, type ProjectFiles } from '$lib/projectFiles'

export type CompilationTarget = 'MIPS' | 'RISC-V' | 'RISC-V-64' | 'X86'
const COMPILATION_TARGETS: readonly string[] = ['MIPS', 'RISC-V', 'RISC-V-64', 'X86']
export type SourceLanguage = 'c' | 'cpp'
export type SourceCompiler = 'gcc' | 'clang'
export const OPTIMIZATIONS = ['0', '1', '2', '3', 's'] as const
export type Optimization = (typeof OPTIMIZATIONS)[number]
export type SourceLocation = { path: string; line: number }
export type CompilationRecord = {
    assemblerProfile?: AssemblerProfile
    /**
     * The Runtime ABI the Generated assembly was compiled against, which its Builds link whatever
     * the Project Setting says ([ADR 0031](../../../docs/adr/0031-projects-pin-the-runtime-abi-not-its-implementation.md)).
     * Absent in records written before the Runtime library, whose programs are self-contained, and
     * in x86 records until x86 has a Runtime library: their Builds link the editor's start unit.
     */
    runtimeAbi?: `v${number}`
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
    return COMPILATION_TARGETS.includes(target)
}

export { defaultSourceCompiler } from './compilerContract.mjs'

export function generatedAssemblyPath(sourcePath: string, target: AvailableLanguages): string {
    return `${sourcePath}.${LANGUAGE_EXTENSIONS[target]}`
}

export const SOURCE_TEMPLATE =
    '#include <sim.h>\n\nint main(void) {\n    int result = 6 * 7;\n    return result;\n}\n'
/** The starting text of a new C or C++ File: a hosted Target's program can print. */
export function sourceTemplate(target: AvailableLanguages, language: SourceLanguage): string {
    if (!hasRuntimeLibrary(target)) return SOURCE_TEMPLATE
    return language === 'cpp'
        ? '#include <cstdio>\n#include <sim.h>\n\nint main() {\n    int result = 6 * 7;\n    std::printf("The answer is %d\\n", result);\n    return 0;\n}\n'
        : '#include <stdio.h>\n#include <sim.h>\n\nint main(void) {\n    int result = 6 * 7;\n    printf("The answer is %d\\n", result);\n    return 0;\n}\n'
}

export { contentFingerprint, fileFingerprint } from './fingerprints'

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
            ) ||
            Object.entries(compilationInputs(record.sourcePath, files)).some(
                ([path, fingerprint]) => record.inputs[path] !== fingerprint
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
            value &&
            typeof value === 'object' &&
            Object.prototype.hasOwnProperty.call(value, 'assemblerProfile') &&
            !isAssemblerProfile(value.assemblerProfile)
        ) {
            throw new ProjectFormatError('Unsupported assembler profile in Compilation record')
        }
        //x86 Generated assembly is NASM, which no GNU assembler profile reads
        if (
            value &&
            typeof value === 'object' &&
            value.target === 'X86' &&
            Object.prototype.hasOwnProperty.call(value, 'assemblerProfile')
        ) {
            throw new ProjectFormatError('Unsupported assembler profile in Compilation record')
        }
        //an ABI this editor does not ship is kept, and blocks the Build with a Recompile action
        if (
            value &&
            typeof value === 'object' &&
            Object.prototype.hasOwnProperty.call(value, 'runtimeAbi') &&
            !isRuntimeAbiName(value.runtimeAbi)
        ) {
            throw new ProjectFormatError('Invalid Runtime ABI in Compilation record')
        }
        if (
            !value ||
            typeof value !== 'object' ||
            !isValidFilePath(value.sourcePath) ||
            !isValidFilePath(value.outputPath) ||
            value.sourcePath === value.outputPath ||
            outputs.has(value.outputPath) ||
            !COMPILATION_TARGETS.includes(value.target) ||
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
            ...(Object.prototype.hasOwnProperty.call(value, 'assemblerProfile')
                ? { assemblerProfile: value.assemblerProfile }
                : {}),
            ...(Object.prototype.hasOwnProperty.call(value, 'runtimeAbi')
                ? { runtimeAbi: value.runtimeAbi }
                : {}),
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
