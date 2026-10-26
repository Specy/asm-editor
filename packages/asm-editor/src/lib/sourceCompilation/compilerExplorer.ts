import {
    compilerPreset,
    compilerCodeFlags,
    compilerLanguageFlags,
    prepareCompilerLines
} from '@asm-editor/runtime/compiler-contract'
export { compilerPreset } from '@asm-editor/runtime/compiler-contract'
import { compilationInputs } from './compilationInputs'
export { compilationInputs } from './compilationInputs'
import type { Diagnostic } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import {
    fileFingerprint,
    defaultSourceCompiler,
    sourceLanguage,
    type CompilationRecord,
    type CompilationSourceMap,
    type CompilationTarget,
    type Optimization,
    type SourceCompiler,
    type SourceLocation
} from './records'
import { isValidFilePath, type ProjectFiles } from '#lib/projectFiles.ts'
import { CURRENT_RUNTIME_ABI } from '#lib/runtimeAbi.ts'
import { loadRuntimeHeaders } from '#lib/sourceRuntime/runtimeLibrary.ts'
import {
    ENVIRONMENT_HEADER,
    ENVIRONMENT_HEADER_PATH,
    loadEnvironmentHeader
} from '#lib/sourceRuntime/environmentLibrary.ts'
import type {
    CompilerLocation,
    TranslationDiagnostic,
    TranslationProfile,
    translateCompilerOutput
} from '@specy/x86/compiler-output'

const API_ROOT = 'https://godbolt.org/api'
export const COMPILE_BYTE_LIMIT = 1024 * 1024
const ASSEMBLY_BYTE_LIMIT = 4 * 1024 * 1024
/** Where the Runtime library's headers are uploaded; the program sees them as its system headers. */
export const SYSROOT_INCLUDE = 'sysroot/include'
/**
 * Sources a compilation reads that are no Project File, by the path the editor shows them at:
 * `<sim.h>` as `@runtime/include/sim.h`. A Source map may name them, a Compilation record never.
 */
export type ReadOnlySources = Readonly<Record<string, string>>
export type CompilationRequest = {
    sourcePath: string
    outputPath: string
    files: ProjectFiles
    target: CompilationTarget
    optimization: Optimization
    sourceAnnotations?: boolean
    compiler?: SourceCompiler
}
export type CompilationResult = {
    assembly: string
    record: CompilationRecord
    map: CompilationSourceMap
    diagnostics: Diagnostic[]
    /**
     * Whether the Generated assembly defines a global `main`, which a program needs and a
     * companion File (an `add.c` that `main.asm` links or `main.s` includes) does not
     * ([programs.md](../../../../../docs/design/programs.md), decision 9).
     */
    definesMain: boolean
}
type AssemblyLine = {
    text: string
    source?: { file?: string | null; line?: number; mainsource?: boolean } | null
}

/**
 * The replaceable component that performs Source compilation: Files and headers in, Generated
 * assembly and its Source map out. Compiler Explorer is the current driver, and nothing outside it
 * depends on which compiler service is used.
 */
export type CompilerDriver = {
    /** The service named in the Compile tooltip. */
    name: string
    compile(request: CompilationRequest, signal?: AbortSignal): Promise<CompilationResult>
}

export class SourceCompilationError extends Error {
    constructor(
        message: string,
        readonly diagnostics: Diagnostic[] = []
    ) {
        super(message)
    }
}

/**
 * What x86 compilation uses of `@specy/x86/compiler-output`, which only an x86 compilation loads,
 * so no other Target's users download the translator.
 */
export type X86Translator = {
    readonly GCC_INTEL_V1: TranslationProfile
    readonly translateCompilerOutput: typeof translateCompilerOutput
}

/** The flag groups of the translation profile x86 compiles under, which its caller passes in. */
function x86Flags(profile: TranslationProfile | undefined) {
    if (!profile) throw new Error('An x86 compilation needs the translation profile of its output.')
    return profile.flags
}

function diagnostic(
    message: string,
    path: string,
    line = 0,
    column = 1,
    severity: Diagnostic['severity'] = 'error'
): Diagnostic {
    return {
        severity,
        message,
        formatted: message,
        lineIndex: line,
        column,
        file: path,
        source: 'Compiler Explorer'
    }
}

/**
 * The editor's path for a file the compiler names: the source, a Project header, `<sim.h>` when the
 * compilation uploaded it, or undefined for anything else, such as the Runtime library's headers.
 */
function projectPath(
    path: unknown,
    sourcePath: string,
    files: ProjectFiles,
    mainsource = false,
    readOnly: ReadOnlySources = {}
) {
    if (path === undefined || path === null || path === '' || mainsource) return sourcePath
    if (typeof path !== 'string') return undefined
    if (/^\/?(?:app\/)?example\.(?:c|cpp|cc|cxx)$/.test(path)) return sourcePath
    const relative = path.replace(/^\/app\//, '').replace(/^\.\//, '')
    if (
        relative === `${SYSROOT_INCLUDE}/${ENVIRONMENT_HEADER}` &&
        readOnly[ENVIRONMENT_HEADER_PATH] !== undefined
    )
        return ENVIRONMENT_HEADER_PATH
    return isValidFilePath(relative) && files[relative] ? relative : undefined
}

/** The text of a file `projectPath` named: a Project File's, or a read-only source's. */
function mappedText(path: string, files: ProjectFiles, readOnly: ReadOnlySources) {
    return Object.prototype.hasOwnProperty.call(files, path)
        ? files[path].content
        : (readOnly[path] ?? '')
}

/** Compiler output is terminal text; Monaco and the Problems panel need plain text. */
function compilerText(text: string) {
    /* eslint-disable no-control-regex -- Strip terminal control sequences, including colored/clickable diagnostics. */
    return text
        .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, '')
        .replace(/(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]/g, '')
        .replace(/\u001b[ -/]*[@-~]/g, '')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '')
        .trim()
    /* eslint-enable no-control-regex */
}

function compilerDiagnostics(
    messages: unknown[],
    request: CompilationRequest,
    failed: boolean,
    readOnly: ReadOnlySources = {}
): Diagnostic[] {
    const diagnostics: Diagnostic[] = []
    const unlocated: string[] = []
    const positive = (value: unknown, fallback: number) => {
        const number = Number(value)
        return Number.isSafeInteger(number) && number > 0 ? number : fallback
    }
    for (const item of messages) {
        if (!item || typeof item !== 'object' || !('text' in item) || typeof item.text !== 'string')
            continue
        const text = compilerText(item.text)
        if (!text) continue
        const tag =
            'tag' in item && item.tag && typeof item.tag === 'object' && !Array.isArray(item.tag)
                ? (item.tag as Record<string, unknown>)
                : undefined
        //GCC first names the includes that led to a header's diagnostic: context, whose
        //`file:line:` would otherwise read as a diagnostic of its own, on the wrong File
        if (/^(?:In file included from|from)\s/.test(text)) continue
        const location = /^(.*?):(\d+)(?::(\d+))?:\s*(.*)$/.exec(text)
        const description =
            typeof tag?.text === 'string' ? compilerText(tag.text) : (location?.[4] ?? text)
        const level = /^(?:[^:\n]+:\s*)?(fatal error|error|warning|note|remark):\s*(.*)$/i.exec(
            description
        )
        if (!level && !location && !(tag && positive(tag.line, 0))) {
            // Function/include context and source/caret excerpts are not additional errors.
            if (
                !/(?:^|:\s)(?:In (?:function|member function|instantiation|file included)|At (?:global scope|top level))\b/.test(
                    text
                ) &&
                !/^\s*(?:from\s|\d+\s*\||\||[~^])/.test(text)
            )
                unlocated.push(text)
            continue
        }
        //one in `<sim.h>` lands on the header, which the editor shows read-only
        const path =
            projectPath(
                tag?.file ?? location?.[1],
                request.sourcePath,
                request.files,
                false,
                readOnly
            ) ?? request.sourcePath
        const line = positive(tag?.line, positive(location?.[2], 1)) - 1
        const column = positive(tag?.column, positive(location?.[3], 1))
        const severity: Diagnostic['severity'] = level
            ? /error/i.test(level[1])
                ? 'error'
                : level[1].toLowerCase() === 'warning'
                  ? 'warning'
                  : 'suggestion'
            : failed
              ? 'error'
              : 'suggestion'
        const message = level?.[2] ?? description
        const previous = diagnostics[diagnostics.length - 1]
        if (/^(?:note|remark)$/i.test(level?.[1] ?? '') && previous) {
            previous.related = [
                ...(previous.related ?? []),
                { file: path, lineIndex: line, column, endColumn: column + 1, message }
            ]
        } else {
            diagnostics.push(diagnostic(message, path, line, column, severity))
        }
    }
    // Keep service/driver failures without structured locations, but don't inflate a real error
    // list with the compiler's surrounding prose or source excerpts.
    if (
        unlocated.length &&
        (!diagnostics.length || (failed && !diagnostics.some((item) => item.severity === 'error')))
    )
        diagnostics.push(
            diagnostic(
                unlocated.join('\n'),
                request.sourcePath,
                0,
                1,
                failed ? 'error' : 'suggestion'
            )
        )
    return diagnostics
}

/**
 * The Compiler Explorer request. A program is hosted: it compiles with `-nostdinc` against the
 * Runtime library's headers, uploaded as `sysroot/include`, so an unsupported header is a clear
 * error and no toolchain header leaks in, and `main` keeps its name and its implicit `return 0`.
 * The caller adds the Target's `<sim.h>` to the sysroot (`compileSource` does).
 * Project Files are found by quoted includes only (`-iquote`, from the source's directory and from
 * the Project root), so a Project's `stdio.h` or `sim.h` never shadows `<stdio.h>` or `<sim.h>`.
 * x86 uses the same Runtime ABI headers, translating GCC's output to NASM with its pinned profile.
 */
export function createCompilerRequest(
    request: CompilationRequest,
    sysroot: Readonly<Record<string, string>> = {},
    profile?: TranslationProfile
) {
    const language = sourceLanguage(request.sourcePath)
    const source = request.files[request.sourcePath]
    if (!language || source?.encoding !== 'plain')
        throw new SourceCompilationError('Select a C or C++ text File to compile.')
    const x86 = request.target === 'X86' ? x86Flags(profile) : undefined
    const compiler = x86 ? 'gcc' : (request.compiler ?? defaultSourceCompiler(request.target))
    const preset = compilerPreset(request.target, language, compiler, profile)
    const directory = request.sourcePath.includes('/')
        ? request.sourcePath.slice(0, request.sourcePath.lastIndexOf('/'))
        : '.'
    const quote = (text: string) => `'${text.replace(/'/g, "'\\''")}'`
    //what the source's quoted includes reach, a `.c` as much as a `.h`, and nothing else of the
    //Project: other Programs' sources and data Files never leave the browser
    const included = Object.keys(compilationInputs(request.sourcePath, request.files))
        .filter((path) => path !== request.sourcePath)
        .sort()
    const sourceAnnotations = compiler === 'clang' && request.sourceAnnotations
    const common = compilerCodeFlags(
        compiler,
        request.optimization,
        !!sourceAnnotations,
        x86 ? profile : undefined
    )
    const standard = compilerLanguageFlags(language, x86 ? profile : undefined)
    // Compiler Explorer writes the primary input as example.c/cpp at its working directory's
    // root. A #line directive only changes locations, so compiling the source there would search
    // root headers before the source's own directory. Include an uploaded source instead, keeping
    // all Project Files together and away from the service's primary input and our sysroot.
    const projectDirectory = 'project'
    const upload = (path: string, content: string) => ({
        filename: `${projectDirectory}/${path}`,
        contents: `#line 1 ${JSON.stringify(path)}\n${content}`
    })
    const quoteDirectory = directory === '.' ? projectDirectory : `${projectDirectory}/${directory}`
    const userArguments = `${common} -nostdinc -isystem ${SYSROOT_INCLUDE} ${preset.architecture} -iquote ${quote(quoteDirectory)} -iquote ${projectDirectory} -include ${quote(`${projectDirectory}/${request.sourcePath}`)} ${standard}`
    const body = {
        source: '/* The program is uploaded at its Project path and read through -include. */\n',
        lang: language === 'cpp' ? 'c++' : 'c',
        options: {
            userArguments,
            filters: {
                binary: false,
                execute: false,
                labels: false,
                directives: false,
                commentOnly: false,
                trim: false,
                demangle: false,
                libraryCode: false
            }
        },
        files: [
            upload(request.sourcePath, source.content),
            ...included.map((path) => upload(path, request.files[path]!.content)),
            ...Object.entries(sysroot).map(([path, contents]) => ({
                filename: `${SYSROOT_INCLUDE}/${path}`,
                contents
            }))
        ]
    }
    const json = JSON.stringify(body)
    if (new TextEncoder().encode(json).length > COMPILE_BYTE_LIMIT)
        throw new SourceCompilationError(
            'The source and the Files it includes exceed the 1 MiB compilation limit.'
        )
    return { compilerId: preset.id, language, body, json }
}

/**
 * Remove debug payloads and compose the Source map. Every other section stays as the compiler
 * wrote it. Library members use the same preparation; startup stays in the runtime library.
 * A source without `main` prepares as well, since a companion File is compiled for another to
 * include; `definesMain` says whether a global `main` was among the lines kept.
 */
export function prepareAssembly(
    output: readonly AssemblyLine[],
    request: CompilationRequest,
    readOnly: ReadOnlySources = {}
) {
    const lines = restoreDroppedLocations(output)
    const text: string[] = []
    const mapping: (SourceLocation | null)[] = []
    let globalMain = false
    let mainLabel = false
    const lineCounts = new Map<string, number>()
    const clang = (request.compiler ?? defaultSourceCompiler(request.target)) === 'clang'
    const sourceAnnotations = clang && request.sourceAnnotations
    const kept = prepareCompilerLines(lines, request.target, !!sourceAnnotations)
    for (const prepared of kept) {
        const line = lines[prepared.index]
        //Clang follows both with a comment (`# -- Begin function main`, `# @main`)
        if (/^\s*\.globa?l\s+main\s*(?:#|$)/.test(prepared.text)) globalMain = true
        if (/^\s*main:/.test(prepared.text)) mainLabel = true
        text.push(prepared.text)
        const path = projectPath(
            line.source?.file,
            request.sourcePath,
            request.files,
            line.source?.mainsource,
            readOnly
        )
        const number = line.source?.line
        if (path && !lineCounts.has(path))
            lineCounts.set(path, mappedText(path, request.files, readOnly).split('\n').length)
        mapping.push(
            path && Number.isSafeInteger(number) && number! > 0 && number! <= lineCounts.get(path)!
                ? { path, line: number! - 1 }
                : null
        )
    }
    if (clang && request.optimization === '0')
        placeUnlocatedInstructions(kept, lines, mapping, request.target)
    return {
        assembly: text.join('\n') + '\n',
        lines: [...mapping, null],
        definesMain: globalMain && mainLabel
    }
}

/** What Compiler Explorer takes for the end of a block, anywhere in a line. */
const EXPLORER_BLOCK_END = /\.(cfi_endproc|data|text|section)\b/

/**
 * Compiler Explorer ends the source location at any line its block end matches, an instruction's
 * too, and leaves the lines after it without one up to the next `.loc`. Clang names a function's
 * static local `next.data` and a local array's initializer `__const.main.text`, so an instruction
 * that refers to either loses its line, and the `.loc` right before it with it. Those lines take
 * the location the compiler's own `.file` and `.loc` give them.
 */
function restoreDroppedLocations(lines: readonly AssemblyLine[]): readonly AssemblyLine[] {
    const files = new Map<number, string>()
    let location: AssemblyLine['source'] = null
    let dropped = false
    return lines.map((line) => {
        const text = line.text
        const file = /^\s*\.file\s+(\d+)\s+"([^"]*)"(?:\s+"([^"]*)")?/.exec(text)
        const loc = /^\s*\.loc\s+(\d+)\s+(\d+)/.exec(text)
        if (file) {
            const [, number, first, second] = file
            files.set(
                Number(number),
                second === undefined || second.startsWith('/')
                    ? (second ?? first)
                    : `${first}/${second}`
            )
        } else if (loc) {
            const name = files.get(Number(loc[1]))
            location =
                name === undefined
                    ? null
                    : {
                          file: name,
                          line: Number(loc[2]),
                          mainsource: /<stdin>|^-$|example\.[^/]+$|<source>/.test(name)
                      }
            dropped = false
        } else if (/^\s*\./.test(text) && !LABEL.test(text)) {
            if (EXPLORER_BLOCK_END.test(text)) location = null
        } else if (!LABEL.test(text) && !/^\s*(?:#|\S+\s*=)/.test(text) && !line.source) {
            dropped ||= EXPLORER_BLOCK_END.test(text)
            if (dropped && location) return { ...line, source: location }
        }
        return line
    })
}

/** Labels only the line table refers to, which separate no blocks. */
const DEBUG_LABEL = /^\s*(?:\.Ltmp|\$tmp)\d+:/
const LABEL = /^\s*[^\s#:]+:/
const STORE = /^(?:s[bhwd]|fs[hwd]|sc(?:\.[wd])?|amo[\w.]*|sw[lr]|s[wd]x?c1|s\.[sd])$/
const CONTROL = /^(?:b\w*|j\w*|call|tail|ret|ecall|ebreak|syscall|nop|fence[\w.]*|[ems]ret|wfi)$/

/**
 * Clang at `-O0` puts the constant or address an instruction needs right before it and gives it no
 * source line, so it would read as the line before: the previous statement's, or the function's
 * opening one for the first statement. `-use-unknown-locations` marks the first kind with line 0;
 * a run of them takes the line of the instruction after it, within its block, and one that ends its
 * block, such as a spill and the jump after it, keeps the line before it. The first statement's
 * stay on the opening line up to `prologue_end`, so the run of them before it moves to that
 * instruction's line: what writes a register, back to a store or to the frame's own setup.
 */
function placeUnlocatedInstructions(
    kept: readonly { index: number; text: string }[],
    lines: readonly AssemblyLine[],
    mapping: (SourceLocation | null)[],
    target: CompilationTarget
) {
    const frame = target === 'MIPS' ? /\$(?:sp|fp|s8|29|30)\b/ : /\b(?:sp|s0|fp|x2|x8)\b/
    const kind = (text: string) =>
        /^\s*#/.test(text) || DEBUG_LABEL.test(text)
            ? 'transparent'
            : LABEL.test(text)
              ? 'label'
              : /^\s*\./.test(text) || /^\s*\S+\s*=/.test(text)
                ? 'directive'
                : 'instruction'
    //writes a register without touching memory, control flow or the frame
    const materializes = (text: string) => {
        const [, mnemonic = '', operands = ''] = /^\s*([\w.]+)\s*([^#]*)/.exec(text) ?? []
        return !STORE.test(mnemonic) && !CONTROL.test(mnemonic) && !frame.test(operands)
    }
    let pending: number[] = []
    let located: number | undefined
    const endBlock = () => {
        if (located !== undefined)
            for (const unlocated of pending) mapping[unlocated] = mapping[located]
        pending = []
        located = undefined
    }
    let prologueEnd = false
    for (let at = 0; at < kept.length; at++) {
        const from = at === 0 ? 0 : kept[at - 1].index + 1
        for (let index = from; index < kept[at].index; index++)
            if (/^\s*\.loc\b.*\bprologue_end\b/.test(lines[index].text)) prologueEnd = true
        const lineKind = kind(kept[at].text)
        if (lineKind === 'label') endBlock()
        if (lineKind !== 'instruction') continue
        if (lines[kept[at].index].source?.line === 0) {
            pending.push(at)
            continue
        }
        for (const unlocated of pending) mapping[unlocated] = mapping[at]
        pending = []
        located = at
        if (!prologueEnd) continue
        prologueEnd = false
        let opening: SourceLocation | null | undefined
        for (let before = at - 1; before >= 0 && mapping[at]; before--) {
            const text = kept[before].text
            const beforeKind = kind(text)
            if (beforeKind === 'transparent') continue
            opening ??= mapping[before]
            if (
                beforeKind !== 'instruction' ||
                !materializes(text) ||
                !opening ||
                mapping[before]?.path !== opening.path ||
                mapping[before]?.line !== opening.line
            )
                break
            mapping[before] = mapping[at]
        }
    }
    endBlock()
}

/**
 * Translate GCC's x86 output to NASM, the assembler x86 Builds use, and compose the Source map from
 * the locations the translation reads from the compiler's own `.file` and `.loc`. What it cannot
 * translate is an error on the source line it came from, and leaves no output. A unit without a
 * global `main` translates as well, for a hand-written `main.asm` to link as needed (ADR 0033).
 */
export function prepareX86Assembly(
    lines: readonly AssemblyLine[],
    request: CompilationRequest,
    translator: X86Translator,
    readOnly: ReadOnlySources = {}
) {
    const translation = translator.translateCompilerOutput(
        lines.map((line) => line.text),
        { profile: translator.GCC_INTEL_V1.id }
    )
    const lineCounts = new Map<string, number>()
    const locate = (location: CompilerLocation | null): SourceLocation | null => {
        const path =
            location &&
            projectPath(location.file, request.sourcePath, request.files, false, readOnly)
        if (!path) return null
        if (!lineCounts.has(path))
            lineCounts.set(path, mappedText(path, request.files, readOnly).split('\n').length)
        return Number.isSafeInteger(location.line) &&
            location.line > 0 &&
            location.line <= lineCounts.get(path)!
            ? { path, line: location.line - 1 }
            : null
    }
    const diagnostics: Diagnostic[] = []
    for (const item of translation.diagnostics) {
        const entry = translationDiagnostic(item, request, locate(item.location))
        //an inline function or an unrolled loop repeats its source line's construct in the output
        if (
            !diagnostics.some(
                (other) =>
                    other.file === entry.file &&
                    other.lineIndex === entry.lineIndex &&
                    other.column === entry.column &&
                    other.message === entry.message
            )
        )
            diagnostics.push(entry)
    }
    if (!translation.ok)
        throw new SourceCompilationError(
            'The compiler output uses something x86 cannot run yet.',
            diagnostics
        )
    return {
        assembly: translation.text.endsWith('\n') ? translation.text : translation.text + '\n',
        lines: [...translation.lines.map((line) => locate(line.location)), null],
        diagnostics,
        //not a weak one, which is a default for another unit's `main` to replace
        definesMain: translation.symbols.defined.some(
            (symbol) => symbol.name === 'main' && symbol.binding === 'global'
        )
    }
}

/**
 * A translation Diagnostic on the source line it came from, or else on the source File's first.
 * Inline assembly is the learner's own text, which the translator quotes with what it cannot read.
 */
function translationDiagnostic(
    item: TranslationDiagnostic,
    request: CompilationRequest,
    location: SourceLocation | null
): Diagnostic {
    const inline = item.code === 'inline-assembly'
    const entry = diagnostic(
        item.message,
        location?.path ?? request.sourcePath,
        location?.line ?? 0,
        location && item.location!.column > 0 ? item.location!.column : 1,
        item.severity
    )
    entry.code = item.code
    if (inline) {
        entry.hint =
            'Write the instructions as a global function in a .asm File of the Project, and call that function instead.'
        entry.formatted = `${entry.message}\n${entry.hint}`
    }
    return entry
}

export const compilerExplorerDriver: CompilerDriver = {
    name: 'Compiler Explorer',
    compile: (request, signal) => compileSource(request, signal)
}

export async function compileSource(
    request: CompilationRequest,
    signal?: AbortSignal,
    fetcher: typeof fetch = fetch
): Promise<CompilationResult> {
    const runtimeHeaders = await loadRuntimeHeaders(CURRENT_RUNTIME_ABI)
    //the Target's own `<sim.h>`, beside the library's headers but kept out of their ABI's set
    const environment = await loadEnvironmentHeader(request.target)
    const sysroot =
        environment === undefined
            ? runtimeHeaders
            : { ...runtimeHeaders, [ENVIRONMENT_HEADER]: environment }
    const readOnly: ReadOnlySources =
        environment === undefined ? {} : { [ENVIRONMENT_HEADER_PATH]: environment }
    //loaded with the first x86 compilation, so it stays out of the bundle every other Target loads
    const translator =
        request.target === 'X86' ? await import('@specy/x86/compiler-output') : undefined
    const prepared = createCompilerRequest(request, sysroot, translator?.GCC_INTEL_V1)
    const response = await fetcher(`${API_ROOT}/compiler/${prepared.compilerId}/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: prepared.json,
        signal
    })
    if (!response.ok)
        throw new SourceCompilationError(
            `Compiler Explorer returned HTTP ${response.status}. Try compiling again.`
        )
    const body = await response.text()
    if (body.length > ASSEMBLY_BYTE_LIMIT)
        throw new SourceCompilationError('Compiler output exceeds the supported size.')
    let result: Record<string, unknown>
    try {
        result = JSON.parse(body)
    } catch {
        throw new SourceCompilationError('Compiler Explorer returned an invalid response.')
    }
    if (!result || typeof result !== 'object')
        throw new SourceCompilationError('Compiler Explorer returned an invalid response.')
    const messages = [result.stderr, result.stdout].flatMap((items) =>
        Array.isArray(items) ? items : []
    )
    const diagnostics = compilerDiagnostics(messages, request, result.code !== 0, readOnly)
    if (result.code !== 0 || result.timedOut || result.truncated) {
        throw new SourceCompilationError(
            result.timedOut
                ? 'Source compilation timed out.'
                : result.truncated
                  ? 'Compiler output was truncated.'
                  : 'Source compilation failed.',
            diagnostics
        )
    }
    if (
        !Array.isArray(result.asm) ||
        result.asm.length > 100_000 ||
        result.asm.some(
            (line) =>
                !line ||
                typeof line.text !== 'string' ||
                (line.source !== undefined &&
                    line.source !== null &&
                    (typeof line.source !== 'object' ||
                        Array.isArray(line.source) ||
                        (line.source.file !== undefined &&
                            line.source.file !== null &&
                            typeof line.source.file !== 'string') ||
                        (line.source.line !== undefined &&
                            !Number.isSafeInteger(line.source.line)) ||
                        (line.source.mainsource !== undefined &&
                            typeof line.source.mainsource !== 'boolean')))
        )
    ) {
        throw new SourceCompilationError('Compiler Explorer returned invalid assembly.')
    }
    let output: ReturnType<typeof prepareX86Assembly>
    try {
        output = translator
            ? prepareX86Assembly(result.asm as AssemblyLine[], request, translator, readOnly)
            : {
                  ...prepareAssembly(result.asm as AssemblyLine[], request, readOnly),
                  diagnostics: []
              }
    } catch (error) {
        //the compiler's own warnings still describe the source when its output cannot be used
        if (error instanceof SourceCompilationError && diagnostics.length)
            throw new SourceCompilationError(error.message, [...diagnostics, ...error.diagnostics])
        throw error
    }
    const outputFingerprint = fileFingerprint({ encoding: 'plain', content: output.assembly })!
    const inputs = { ...compilationInputs(request.sourcePath, request.files) }
    // Header locations supplied by the compiler also establish dependencies, including macro includes.
    // `<sim.h>` is the editor's, not the Project's, so it is no input and has no fingerprint.
    for (const line of output.lines)
        if (line && Object.prototype.hasOwnProperty.call(request.files, line.path))
            inputs[line.path] = fileFingerprint(request.files[line.path])!
    return {
        assembly: output.assembly,
        record: {
            runtimeAbi: CURRENT_RUNTIME_ABI,
            ...(request.target === 'X86' ? {} : { assemblerProfile: 'gnu-compiler-v1' as const }),
            sourcePath: request.sourcePath,
            outputPath: request.outputPath,
            target: request.target,
            language: prepared.language,
            compilerId: prepared.compilerId,
            optimization: request.optimization,
            inputs,
            outputFingerprint
        },
        map: { sourcePath: request.sourcePath, outputFingerprint, lines: output.lines },
        diagnostics: [...diagnostics, ...output.diagnostics],
        definesMain: output.definesMain
    }
}
