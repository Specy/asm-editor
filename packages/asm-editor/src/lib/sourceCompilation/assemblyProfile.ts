import { validateAssemblerProfile, type AssemblerProfile } from '#lib/assemblerProfiles.ts'
import { LANGUAGE_EXTENSIONS } from '#lib/Config.ts'
import {
    fileText,
    resolveFilePath,
    resolveProjectInclude,
    ProjectFormatError,
    type BuildSources
} from '#lib/projectFiles.ts'
import {
    isRuntimeLibrarySetting,
    RUNTIME_ENTRY_SYMBOL,
    RUNTIME_NAMESPACE,
    unsupportedRuntimeAbi,
    type RuntimeLibrarySetting
} from '#lib/runtimeAbi.ts'
import type { AvailableLanguages } from '#lib/Project.svelte.ts'
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

/** An include line of MARS, RARS or GNU assembly, or of NASM's, `%include` and `incbin`, and the path it names. */
const INCLUDE_LINE =
    /^[ \t]*(?:[A-Za-z_@$.?][\w@$.?]*[ \t]*:[ \t]*)?(?:\.include|%include|incbin)[ \t]+(["'])([^"'\n]+)\1/gim

/**
 * The Files a Program's Entry reads through its includes, the Entry among them, as far as they
 * can be followed: `.include`, and on x86 `%include` and `incbin`, with a literal path. A path that
 * names no File, or a macro-made include, reaches nothing; the assembler reports what it means.
 */
function entryTree(sources: BuildSources, entry: string, x86: boolean): Set<string> {
    const reached = new Set<string>()
    const visit = (path: string) => {
        const file = sources.files[path]
        if (!file || reached.has(path)) return
        reached.add(path)
        if (file.encoding !== 'plain') return
        for (const [, , written] of fileText(file).matchAll(INCLUDE_LINE)) {
            let target: string | null = null
            if (x86) target = resolveProjectInclude(path, written, sources)
            else {
                //MARS's and RARS's rule: beside the including File, or from the root with a `/`
                const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''
                try {
                    target = resolveFilePath(
                        written.startsWith('/') ? written.slice(1) : parent + written
                    )
                } catch {
                    /* The assembler reports malformed includes. */
                }
            }
            if (target) visit(target)
        }
    }
    visit(entry)
    return reached
}

/**
 * The extensions of the hand-written Files a Build of `language` may link beside its Entry's unit:
 * the Target's own in the editor's assembly set (`editorFileRouting.ts`), `.mips`, `.riscv` or
 * `.asm`, and the `.asm` and `.s` that MARS, RARS and NASM all save assembly as, and on x86 NASM's
 * own `.nasm` too, every extension x86's Core takes as a unit when it is given none
 * (`x86Project.ts`). An `.inc` is an include fragment, part of whatever includes it, an
 * extension-less File is a `README` or a `Makefile` as often as assembly, and another Target's
 * extension is that Target's assembly, so none of them is a unit. Undefined for a Target that
 * links its Entry's unit alone.
 */
function linkedExtensions(language: AvailableLanguages): ReadonlySet<string> | undefined {
    if (language === 'X86') return new Set([LANGUAGE_EXTENSIONS[language], 'asm', 's', 'nasm'])
    if (language !== 'MIPS' && language !== 'RISC-V' && language !== 'RISC-V-64') return undefined
    return new Set([LANGUAGE_EXTENSIONS[language], 'asm', 's'])
}

/**
 * The Files a Build takes as an archive's members besides its Entry's unit, by path in path order
 * so two Builds lay the program out alike ([asmos-stage2.md](../../../../../docs/design/asmos-stage2.md),
 * decision 10): every assembly File of the Target, Generated assembly and hand-written alike, that
 * is no Program's Entry and that no Program's Entry reads through its includes, so another Program
 * and its parts never join this one. The Core reads which globals each declares and assembles one
 * only once the program needs a global it defines, as `ld` takes a member out of a library, so a
 * File the program does not need, an exercise in MARS's dialect or a broken File among them, is
 * never assembled and cannot fail the Build. A needed one must be GNU assembly on MIPS and RISC-V,
 * and the Core says so when it is not.
 *
 * MIPS and RISC-V link units only in a GNU-profile Build: a Program in MARS's or RARS's dialect, a
 * hand-written Entry, links its includes alone, as it always has. x86 links every Program's units
 * this way, whatever its Entry ([ADR 0033](../../../../../docs/adr/0033-x86-links-the-entry-and-takes-other-files-as-needed.md)).
 * `programs` are the Entries of every Program of the Project, this one's included.
 */
export function resolveLinkUnits(
    sources: BuildSources,
    language: AvailableLanguages,
    profile: AssemblerProfile | undefined,
    programs: readonly string[] = [sources.entry]
): string[] {
    const extensions = linkedExtensions(language)
    if (!extensions || (language !== 'X86' && profile !== 'gnu-compiler-v1')) return []
    const parts = new Set<string>()
    for (const entry of new Set([sources.entry, ...programs]))
        for (const path of entryTree(sources, entry, language === 'X86')) parts.add(path)
    return Object.keys(sources.files)
        .filter((path) => {
            if (parts.has(path) || sources.files[path]?.encoding !== 'plain') return false
            const name = path.slice(path.lastIndexOf('/') + 1)
            const dot = name.lastIndexOf('.')
            return dot > 0 && extensions.has(name.slice(dot + 1).toLowerCase())
        })
        .sort()
}

/** The Compilation records whose Generated assembly a Build takes as its other units. */
function linkUnitRecords(
    sources: BuildSources,
    records: readonly CompilationRecord[] | undefined
): CompilationRecord[] {
    const units = new Set(sources.linkUnits ?? [])
    return (records ?? []).filter((record) => units.has(record.outputPath))
}

/**
 * The Runtime library a Build links and where it starts. Generated assembly whose Compilation
 * record requires a Runtime ABI links that ABI and starts at the library's `_start`, which runs
 * its startup code and then `main`; otherwise the *Link Runtime library* Setting decides, and a
 * hand-written program keeps its own start
 * ([ADR 0031](../../../../../docs/adr/0031-projects-pin-the-runtime-abi-not-its-implementation.md)).
 * The Build's other units (`linkUnits`) pin their ABI too, and link it, but only the Entry's unit
 * moves the start.
 */
export function resolveRuntimeLink(
    sources: BuildSources,
    records: readonly CompilationRecord[] | undefined,
    setting: RuntimeLibrarySetting | undefined
): Pick<BuildSources, 'runtimeAbi' | 'entrySymbol'> {
    const required = new Set<`v${number}`>()
    for (const record of reachableRecords(sources, records))
        if (record.runtimeAbi !== undefined) required.add(record.runtimeAbi)
    const starts = required.size > 0
    for (const record of linkUnitRecords(sources, records))
        if (record.runtimeAbi !== undefined) required.add(record.runtimeAbi)
    if (required.size > 1)
        throw new ProjectFormatError(
            sources.linkUnits?.length
                ? "Conflicting required Runtime ABIs in the program's units"
                : 'Conflicting required Runtime ABIs in the include unit'
        )
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
    return starts ? { runtimeAbi, entrySymbol: RUNTIME_ENTRY_SYMBOL } : { runtimeAbi }
}

/**
 * A compiled x86 Entry receives a startup object. Other compiled Files receive the trailing
 * support archive without replacing the Entry's _start. New compilations use the Runtime
 * library; records without an ABI retain the original freestanding startup and support.
 */
export function resolveX86Start(
    sources: BuildSources,
    records: readonly CompilationRecord[] | undefined,
    setting?: RuntimeLibrarySetting
): Pick<BuildSources, 'entrySymbol' | 'x86Support' | 'runtimeAbi'> {
    const compiled = (records ?? []).filter(
        (record) =>
            record.target === 'X86' &&
            Object.prototype.hasOwnProperty.call(sources.files, record.outputPath)
    )
    const required = new Set(
        compiled.flatMap((record) => (record.runtimeAbi ? [record.runtimeAbi] : []))
    )
    if (required.size > 1)
        throw new ProjectFormatError('Conflicting required Runtime ABIs in the x86 project')
    const runtimeAbi =
        required.values().next().value ?? (setting && setting !== 'off' ? setting : undefined)
    if (runtimeAbi) {
        const problem = unsupportedRuntimeAbi(runtimeAbi, required.size > 0)
        if (problem) throw new ProjectFormatError(problem)
    }
    if (!compiled.length && !runtimeAbi) return {}
    const shadowed = Object.keys(sources.files).find((path) => path.startsWith(RUNTIME_NAMESPACE))
    if (shadowed)
        throw new ProjectFormatError(
            `${shadowed} is inside ${RUNTIME_NAMESPACE}, which the start code of compiled programs reserves. Move it to link the start code.`
        )
    return {
        ...(runtimeAbi ? { runtimeAbi } : { x86Support: true }),
        ...(reachableRecords(sources, compiled).length ? { entrySymbol: RUNTIME_ENTRY_SYMBOL } : {})
    }
}

/**
 * Keep compiler names scoped to Generated assembly, including mixed assembly/source Builds: the
 * Entry's unit's and the Build's other units' (`linkUnits`).
 */
export function compiledLanguages(
    sources: BuildSources,
    records: readonly CompilationRecord[] | undefined
) {
    return Object.fromEntries(
        [...reachableRecords(sources, records), ...linkUnitRecords(sources, records)].map(
            (record) => [record.outputPath, record.language]
        )
    )
}
