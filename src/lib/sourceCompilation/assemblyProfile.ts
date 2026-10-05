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
        for (const match of text.matchAll(/^\s*\.include\s+"([^"\n]+)"/gm)) {
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
