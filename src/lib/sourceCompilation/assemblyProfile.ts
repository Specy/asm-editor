import { validateAssemblerProfile, type AssemblerProfile } from '$lib/assemblerProfiles'
import { fileText, resolveFilePath, ProjectFormatError, type BuildSources } from '$lib/projectFiles'
import {
    isRuntimeLibrarySetting,
    RUNTIME_ENTRY_SYMBOL,
    RUNTIME_NAMESPACE,
    type RuntimeLibrarySetting
} from '$lib/runtimeAbi'
import type { CompilationRecord } from './records'

/** The Compilation records whose Generated assembly the Entry file's include unit reaches. */
function reachableRecords(
    sources: BuildSources,
    records: readonly CompilationRecord[] | undefined
): CompilationRecord[] {
    const byOutput = new Map<string, CompilationRecord>()
    for (const record of records ?? []) byOutput.set(record.outputPath, record)
    const seen = new Set<string>()
    const reached: CompilationRecord[] = []
    const visit = (path: string) => {
        if (seen.has(path)) return
        seen.add(path)
        const record = byOutput.get(path)
        if (record) reached.push(record)
        const file = sources.files[path]
        if (!file) return // The assembler supplies the missing-file diagnostic.
        let text: string
        try {
            text = fileText(file)
        } catch {
            return
        }
        for (const match of text.matchAll(/^\s*(?:\.include|%include)\s+"([^"\n]+)"/gm)) {
            const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''
            try {
                visit(
                    resolveFilePath(
                        match[1].startsWith('/') ? match[1].slice(1) : parent + match[1]
                    )
                )
            } catch {
                /* The assembler reports malformed includes. */
            }
        }
    }
    visit(sources.entry)
    return reached
}

/** Provenance owns a whole reachable include unit, even after its source map expires. */
export function resolveAssemblyProfile(
    sources: BuildSources,
    records: readonly CompilationRecord[] | undefined,
    manual?: { riscvAssemblerProfile?: AssemblerProfile }
): AssemblerProfile {
    const validate = (value: unknown) => {
        try {
            return validateAssemblerProfile(value)
        } catch (error) {
            throw new ProjectFormatError((error as Error).message)
        }
    }
    const fallback =
        manual && Object.prototype.hasOwnProperty.call(manual, 'riscvAssemblerProfile')
            ? validate(manual.riscvAssemblerProfile)
            : 'rars'
    const required = new Set<AssemblerProfile>()
    for (const record of records ?? [])
        if (Object.prototype.hasOwnProperty.call(record, 'assemblerProfile'))
            validate(record.assemblerProfile)
    for (const record of reachableRecords(sources, records))
        if (Object.prototype.hasOwnProperty.call(record, 'assemblerProfile'))
            required.add(validate(record.assemblerProfile))
    if (required.size > 1)
        throw new ProjectFormatError('Conflicting required assembler profiles in the include unit')
    return required.values().next().value ?? fallback
}

/**
 * The Runtime library a Build links and where it starts. Generated assembly whose Compilation
 * record requires a Runtime ABI links that ABI and starts at the library's `_start`, which runs
 * its startup code and then `main`; otherwise the *Link Runtime library* Setting decides, and a
 * hand-written program keeps its own start
 * ([ADR 0031](../../../docs/adr/0031-projects-pin-the-runtime-abi-not-its-implementation.md)).
 */
export function resolveRuntimeLink(
    sources: BuildSources,
    records: readonly CompilationRecord[] | undefined,
    setting: RuntimeLibrarySetting | undefined
): Pick<BuildSources, 'runtimeAbi' | 'entrySymbol'> {
    const required = new Set<`v${number}`>()
    for (const record of reachableRecords(sources, records))
        if (record.runtimeAbi !== undefined) required.add(record.runtimeAbi)
    if (required.size > 1)
        throw new ProjectFormatError('Conflicting required Runtime ABIs in the include unit')
    const runtimeAbi =
        required.values().next().value ??
        (setting !== undefined && isRuntimeLibrarySetting(setting) && setting !== 'off'
            ? setting
            : undefined)
    if (runtimeAbi === undefined) return {}
    const shadowed = Object.keys(sources.files).find((path) => path.startsWith(RUNTIME_NAMESPACE))
    if (shadowed)
        throw new ProjectFormatError(
            `${shadowed} is inside ${RUNTIME_NAMESPACE}, which the Runtime library reserves. Move it to link the Runtime library.`
        )
    return required.size ? { runtimeAbi, entrySymbol: RUNTIME_ENTRY_SYMBOL } : { runtimeAbi }
}

/**
 * A compiled x86 Entry receives a startup object. Other compiled Files receive the trailing
 * support archive without replacing the Entry's _start. A Runtime ABI recorded by a future
 * compiler still needs recompilation until x86 has that library.
 */
export function resolveX86Start(
    sources: BuildSources,
    records: readonly CompilationRecord[] | undefined
): Pick<BuildSources, 'entrySymbol' | 'x86Support'> {
    const compiled = (records ?? []).filter(
        (record) =>
            record.target === 'X86' &&
            Object.prototype.hasOwnProperty.call(sources.files, record.outputPath)
    )
    if (!compiled.length) return {}
    const hosted = compiled.find((record) => record.runtimeAbi !== undefined)
    if (hosted)
        throw new ProjectFormatError(
            `${hosted.outputPath} was compiled against Runtime ABI ${hosted.runtimeAbi}, and this editor has no x86 Runtime library. Recompile ${hosted.sourcePath} to build it.`
        )
    const shadowed = Object.keys(sources.files).find((path) => path.startsWith(RUNTIME_NAMESPACE))
    if (shadowed)
        throw new ProjectFormatError(
            `${shadowed} is inside ${RUNTIME_NAMESPACE}, which the start code of compiled programs reserves. Move it to link the start code.`
        )
    return {
        x86Support: true,
        ...(compiled.some((record) => record.outputPath === sources.entry)
            ? { entrySymbol: RUNTIME_ENTRY_SYMBOL }
            : {})
    }
}

/** Keep compiler names scoped to Generated assembly, including mixed assembly/source Builds. */
export function compiledLanguages(
    sources: BuildSources,
    records: readonly CompilationRecord[] | undefined
) {
    return Object.fromEntries(
        reachableRecords(sources, records).map((record) => [record.outputPath, record.language])
    )
}
