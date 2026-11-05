import type { AssemblerProfile } from '#lib/assemblerProfiles.ts'
import type {
    LanguageDiagnostic,
    RelatedLanguageDiagnostic
} from '#lib/languages/service/sourceModel.ts'
import {
    buildAssemblerProfile,
    fileText,
    ProjectFormatError,
    sourceLineText,
    sourceText,
    textAssemblyFiles,
    type BuildSources,
    type ProjectFile
} from '#lib/projectFiles.ts'
import { CURRENT_RUNTIME_ABI, unsupportedRuntimeAbi } from '#lib/runtimeAbi.ts'
import {
    coreLibrary,
    loadedRuntimeFunctions,
    loadedRuntimeLibrary,
    loadRuntimeFunctions,
    loadRuntimeLibrary,
    runtimeLibraryHint,
    type RuntimeFunctionList
} from '#lib/sourceRuntime/runtimeLibrary.ts'
import type { Diagnostic } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import { normalizeMarsDisplay, type ProjectDisplay } from './marsDisplay'
import {
    applyScreenDirective,
    assembledCore,
    ignoredIncludedScreenDiagnostics,
    readScreenLabelProbe,
    resolveScreenLabel,
    SCREEN_LABEL_PROBE_ADDRESS,
    screenLabelProbeSource,
    type ScreenDirectiveApplication,
    type ScreenLabelTable
} from './screenDirective'
import { makeTokenSpanIndex, tokenSpanEnd, type SpanLine, type TokenSpanIndex } from './tokenSpans'
import { NOT_LINKED_MESSAGE, notLinkedMessage } from './exceptionHandlerScan'

/**
 * How a MIPS or RISC-V program is checked, by the analysis Worker while it is typed
 * (`marsAdapter.ts`) and by the Emulator at a Build: the Runtime library it links, its assembly, the
 * token each message points at, and its `@screen` comment, whose base name the program's own
 * symbol table resolves or, failing that, a probe. Both read the one result, so a squiggle says the
 * same thing before and after a Build.
 *
 * No Core is imported here, as in the rest of this folder: the caller passes the factory of the
 * Cores it has, so the MIPS Emulator does not load RARS nor the RISC-V one MARS.
 */

/** The Targets a MARS-derived Core assembles for. */
export type MarsTarget = 'MIPS' | 'RISC-V' | 'RISC-V-64'

/**
 * What a Build links besides its Entry's unit: the Runtime library, the global execution starts at,
 * and the Project's other assembly Files, which the Core takes as an archive's members by need
 * (`BuildConfiguration.linkUnits`).
 */
export type MarsLink = {
    library?: ReturnType<typeof coreLibrary>
    entrySymbol?: string
    units?: readonly string[]
}

/** A Core of `target` for the Files, assembled from `entry` and linked as `link` says. */
export type MarsCoreFactory<C> = (
    files: Record<string, string>,
    entry: string,
    profile: AssemblerProfile,
    link: MarsLink,
    target: MarsTarget
) => C

type MarsSourceLocation = {
    readonly sourcePath: string
    /** One-based line in `sourcePath`. */
    readonly sourceLine: number
}

/** A message of the assembler as both Cores report it. */
type MarsAssembleError = MarsSourceLocation & {
    readonly isWarning: boolean
    readonly message: string
    /** One-based column in `sourcePath`. Zero only for a message without a source location. */
    readonly sourceColumn: number
    readonly macroExpansionTrace: readonly MarsSourceLocation[]
}

/** The part of a MARS or RARS Core a check reads, which `JsMips` and `JsRiscV` both have. */
export type MarsCheckCore = ScreenLabelTable & {
    assemble(): { readonly report: string; readonly errors: readonly MarsAssembleError[] }
    /** The Entry's unit: the Entry and what it includes. */
    getTokenizedLines(): readonly SpanLine[]
    /** The unit of the Entry or of one of the Build's other units, by its File. */
    getTokenizedUnit(path: string): readonly SpanLine[]
    /** Every File the units read: the Entry's, and those of the other units the link took. */
    getUnitFiles(): readonly string[]
    /** The Entry, then the other units the link took. */
    getLinkedUnits(): readonly string[]
    readMemoryBytes(address: number, length: number): ArrayLike<number>
}

export type MarsCheckOptions<C> = {
    makeCore: MarsCoreFactory<C>
    /** The display the Entry's `@screen` comment is applied on top of. */
    display: ProjectDisplay | undefined
    /**
     * Readies the program's Core to run, before it assembles, as a Build does. Such a Core is
     * assembled again after a probe, which assembles one of its own over the state every Core
     * shares, so the Core returned is still the program's.
     */
    prepare?: (core: C) => void
}

/** What checking a program found. */
export type MarsCheck<C> = {
    /** The Core the program assembled in. */
    core: C
    /** The assembler's own account, which a failed Build reports. */
    report: string
    /** The display the Entry's `@screen` comment asks for, and its warnings. */
    screen: ScreenDirectiveApplication
    /** Every File the assembly read, the Entry included. */
    reached: ReadonlySet<string>
    /**
     * The `@screen` warnings, the Entry's and those of the included Files it ignores, then the
     * assembler's messages, an undefined library function's with how to link the Runtime library.
     */
    diagnostics: LanguageDiagnostic[]
}

/**
 * Loads the Runtime library the sources link, or, when they link none, the list of library
 * functions that explains an undefined `printf`, so the check itself stays synchronous. An ABI this
 * editor does not ship loads nothing, and `marsRuntimeLink` says why.
 */
export async function prepareMarsRuntime(sources: BuildSources, target: MarsTarget): Promise<void> {
    if (sources.runtimeAbi === undefined) await loadRuntimeFunctions(CURRENT_RUNTIME_ABI)
    else if (!unsupportedRuntimeAbi(sources.runtimeAbi))
        await loadRuntimeLibrary(sources.runtimeAbi, target)
}

/** The library and entry symbol `prepareMarsRuntime` loaded for these sources. */
export function marsRuntimeLink(sources: BuildSources, target: MarsTarget): MarsLink {
    const units = sources.linkUnits?.length ? { units: sources.linkUnits } : {}
    if (sources.runtimeAbi === undefined) return units
    //only a Compilation record's requirement starts at the library's _start (resolveRuntimeLink)
    const problem = unsupportedRuntimeAbi(sources.runtimeAbi, sources.entrySymbol !== undefined)
    if (problem) throw new ProjectFormatError(problem)
    const library = loadedRuntimeLibrary(sources.runtimeAbi, target)
    if (!library)
        throw new ProjectFormatError(`The Runtime library ${sources.runtimeAbi} is not loaded`)
    return {
        library: coreLibrary(library),
        ...(sources.entrySymbol ? { entrySymbol: sources.entrySymbol } : {}),
        ...units
    }
}

/** Assembles the program and reads what the check reports of it; see the module comment. */
export function checkMarsProgram<C extends MarsCheckCore>(
    sources: BuildSources,
    target: MarsTarget,
    { makeCore, display, prepare }: MarsCheckOptions<C>
): MarsCheck<C> {
    const files = textAssemblyFiles(sources)
    const profile = buildAssemblerProfile(sources)
    const link = marsRuntimeLink(sources, target)
    const make = (sourceFiles: Record<string, string>) =>
        makeCore(sourceFiles, sources.entry, profile, link, target)
    const assemble = () => {
        const core = make(files)
        prepare?.(core)
        return { core, result: core.assemble() }
    }
    let { core, result } = assemble()
    const lines = tokenizedLines(core)
    const spans = makeTokenSpanIndex(lines)
    //the Entry's unit and the other units the program needs, the only ones the Core read: one it
    //does not need is never assembled, so it is not reached
    const reached = new Set([...lines.map((line) => line.sourcePath), ...unitFiles(core)])
    reached.add(sources.entry)
    const source = target === 'MIPS' ? 'mips' : 'risc-v'
    //hand-written assembly links no library by default: say how to get printf
    const functions =
        sources.runtimeAbi === undefined ? loadedRuntimeFunctions(CURRENT_RUNTIME_ABI) : undefined
    //another unit's tokens are read only for a unit with something to say
    const unitSpans = new Map<string, TokenSpanIndex>()
    const spansFor = (path: string) => {
        if (!sources.linkUnits?.includes(path)) return spans
        let index = unitSpans.get(path)
        if (!index) unitSpans.set(path, (index = makeTokenSpanIndex(tokenizedUnit(core, path))))
        return index
    }
    const assembled = result.errors.map((error) =>
        coreDiagnostic(error, sources, source, spansFor(error.sourcePath), functions, target)
    )
    if (!result.errors.some((error) => !error.isWarning))
        assembled.push(...unlinkedUnitHints(sources, core, source, target))
    //read after everything else this check takes from its Core, since a probe assembles another
    let probed = false
    const screen = applyScreenDirective(
        sourceText(sources),
        normalizeMarsDisplay(display),
        (label) =>
            resolveScreenLabel(assembledCore(core, result), label, () => {
                //GNU assembly cannot place a probe word at a fixed address, and its symbol table is
                //all a probe would read
                if (profile === 'gnu-compiler-v1') return null
                probed = true
                return probeScreenLabel(files, sources.entry, label, make)
            })
    )
    if (probed && prepare) ({ core, result } = assemble())
    return {
        core,
        report: result.report,
        screen,
        reached,
        diagnostics: [
            ...screen.diagnostics,
            ...ignoredIncludedScreenDiagnostics(files, sources.entry, reached)
        ]
            .map((diagnostic) => screenDiagnostic(diagnostic, sources.entry))
            .concat(assembled)
    }
}

/** The tokenized source of a build, or nothing when the Core will not give it up. */
function tokenizedLines(core: MarsCheckCore): readonly SpanLine[] {
    try {
        return core.getTokenizedLines()
    } catch {
        return []
    }
}

function tokenizedUnit(core: MarsCheckCore, path: string): readonly SpanLine[] {
    try {
        return core.getTokenizedUnit(path)
    } catch {
        return []
    }
}

function unitFiles(core: MarsCheckCore): readonly string[] {
    try {
        return core.getUnitFiles()
    } catch {
        return []
    }
}

/**
 * A Hint on each of the Build's other units the link left out, as x86 gives one
 * ([ADR 0039](../../../../../../docs/adr/0039-x86-links-start-objects-before-user-and-support-archives.md)):
 * nothing the program needs is defined there, so the Core never assembled it, and its mistakes, or
 * MARS's or RARS's own dialect, are no concern of this Build
 * ([asmos-stage2.md](../../../../../../docs/design/asmos-stage2.md), decision 10). A unit that a
 * unit the program needs includes is part of that one, and gets none. On MIPS, one that holds an
 * exception handler is told how to include it (`notLinkedMessage`).
 */
function unlinkedUnitHints(
    sources: BuildSources,
    core: MarsCheckCore,
    source: string,
    target: MarsTarget
): LanguageDiagnostic[] {
    if (!sources.linkUnits?.length) return []
    const read = new Set([...core.getLinkedUnits(), ...unitFiles(core)])
    const included = new Set(tokenizedLines(core).map((line) => line.sourcePath))
    return sources.linkUnits
        .filter((path) => !read.has(path) && !included.has(path))
        .map((path) => ({
            severity: 'suggestion' as const,
            source,
            code: 'not-linked',
            message: target === 'MIPS' ? mipsNotLinkedHint(sources, path) : NOT_LINKED_MESSAGE,
            location: {
                path,
                range: {
                    start: { line: 0, column: 0 },
                    end: { line: 0, column: sourceLineText(sources, path, 0).length }
                }
            }
        }))
}

/**
 * Each unit's Hint on MIPS, by File record: the live check runs at every change to the Files, and
 * a File's Hint changes only with the File, so its text is scanned once a record.
 */
const mipsHints = new WeakMap<ProjectFile, string>()

/** The Hint on a MIPS unit the link left out, which says how to include its exception handler. */
export function mipsNotLinkedHint(sources: BuildSources, path: string): string {
    const file = sources.files[path]
    if (!file) return NOT_LINKED_MESSAGE
    const kept = mipsHints.get(file)
    if (kept !== undefined) return kept
    let text: string | undefined
    try {
        text = fileText(file)
    } catch {
        text = undefined
    }
    const hint = notLinkedMessage(text)
    if (Object.isFrozen(file)) mipsHints.set(file, hint)
    return hint
}

/**
 * The address of a `@screen base=` name the program's symbol table does not hold, such as an
 * `.eqv` name: the program assembled once more with one extra `.word <name>` at a fixed address,
 * that word read back, since the assembler itself resolves the name in it.
 */
function probeScreenLabel(
    files: Record<string, string>,
    entry: string,
    label: string,
    makeCore: (files: Record<string, string>) => MarsCheckCore
): number | null {
    try {
        const probe = makeCore({
            ...files,
            [entry]: screenLabelProbeSource(files[entry] ?? '', label)
        })
        const result = probe.assemble()
        if (result.errors.some((error) => !error.isWarning)) return null
        return readScreenLabelProbe(probe.readMemoryBytes(SCREEN_LABEL_PROBE_ADDRESS, 4))
    } catch {
        return null
    }
}

function coreDiagnostic(
    error: MarsAssembleError,
    sources: BuildSources,
    source: string,
    spans: TokenSpanIndex,
    functions: RuntimeFunctionList | undefined,
    target: MarsTarget
): LanguageDiagnostic {
    const line = Math.max(0, error.sourceLine - 1)
    const column = Math.max(0, error.sourceColumn - 1)
    //the Cores point at the first character of the token and say no more, so the span comes from
    //their own token list; `tokenSpanEnd` is one-based and exclusive like Monaco, a range here is
    //zero-based, and a token that cannot be confirmed leaves the single character this always drew
    const tokenEnd = tokenSpanEnd(
        spans,
        error.sourcePath || sources.entry,
        error.sourceLine,
        error.sourceColumn
    )
    const related: RelatedLanguageDiagnostic[] = error.macroExpansionTrace.map((location) => {
        const line = Math.max(0, location.sourceLine - 1)
        return {
            message: 'Expanded from here',
            location: {
                path: location.sourcePath,
                range: {
                    start: { line, column: 0 },
                    end: { line, column: sourceLineText(sources, location.sourcePath, line).length }
                }
            }
        }
    })
    const hint = error.isWarning ? undefined : runtimeLibraryHint(error.message, functions, target)
    return {
        severity: error.isWarning ? 'warning' : 'error',
        source,
        location: {
            path: error.sourcePath || sources.entry,
            range: {
                start: { line, column },
                end: { line, column: tokenEnd === undefined ? column + 1 : tokenEnd - 1 }
            }
        },
        message: error.message,
        ...(hint ? { hint } : {}),
        related
    }
}

/** A `@screen` warning, which `screenDirective.ts` makes in the editor's shape, as the Worker's. */
function screenDiagnostic(diagnostic: Diagnostic, entry: string): LanguageDiagnostic {
    const line = Math.max(0, diagnostic.lineIndex)
    const column = Math.max(0, diagnostic.column - 1)
    return {
        severity: diagnostic.severity,
        source: diagnostic.source ?? 'asm-editor',
        code: diagnostic.code,
        message: diagnostic.message,
        hint: diagnostic.hint,
        location: {
            path: diagnostic.file ?? entry,
            range: {
                start: { line, column },
                end: {
                    line,
                    column: Math.max(column + 1, (diagnostic.endColumn ?? column + 2) - 1)
                }
            }
        }
    }
}
