import {
    compilerPreset,
    compilerCodeFlags,
    compilerLanguageFlags,
    prepareCompilerLines
} from './compilerContract.mjs'
export { compilerPreset } from './compilerContract.mjs'
import { compilationInputs } from './compilationInputs'
export { compilationInputs } from './compilationInputs'
import type { Diagnostic } from '$lib/languages/commonLanguageFeatures.svelte'
import {
    fileFingerprint,
    defaultSourceCompiler,
    sourceLanguage,
    type CompilationRecord,
    type CompilationSourceMap,
    type CompilationTarget,
    type Optimization,
    type SourceLanguage,
    type SourceCompiler,
    type SourceLocation
} from './records'
import { isValidFilePath, type ProjectFiles } from '$lib/projectFiles'
import { CURRENT_RUNTIME_ABI } from '$lib/runtimeAbi'
import { loadRuntimeHeaders } from '$lib/sourceRuntime/runtimeLibrary'
import {
    ENVIRONMENT_HEADER,
    ENVIRONMENT_HEADER_PATH,
    loadEnvironmentHeader
} from '$lib/sourceRuntime/environmentLibrary'
import type {
    CompilerLocation,
    TranslationDiagnostic,
    TranslationProfile,
    translateCompilerOutput
} from '@specy/x86/compiler-output'
import { X86_HEADERS, X86_HEADER_NAMES } from './capabilities'

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
 * Runtime ABI v1's freestanding headers, the only ones of the library an x86 program gets until x86
 * has a Runtime library. They are written on GCC's predefined macros, so they describe x86-64 as
 * they are. `<sim.h>`, the Environment library, comes with them.
 */
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
        source: 'Compiler Explorer',
        line: { line: '', line_index: line }
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
            const entry = diagnostic(message, path, line, column, severity)
            entry.line.line = mappedText(path, request.files, readOnly).split(/\r?\n/)[line] ?? ''
            diagnostics.push(entry)
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
 * An x86 program is freestanding until x86 has a Runtime library: only the library's freestanding
 * headers and `<sim.h>` are uploaded, and it compiles exactly as the corpus its translation is
 * verified on did, with the translation profile's flags and `-ffreestanding`, under which GCC
 * still gives `main` its implicit `return 0`. The profile is the caller's to pass, as it comes with
 * the translator.
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
    const headers = Object.entries(request.files).filter(
        ([path, file]) => /\.(h|hpp|hh|hxx|inc)$/i.test(path) && file.encoding === 'plain'
    )
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
            ...headers.map(([path, file]) => upload(path, file.content)),
            ...Object.entries(sysroot)
                .filter(([path]) => !x86 || X86_HEADER_NAMES.has(path))
                .map(([path, contents]) => ({
                    filename: `${SYSROOT_INCLUDE}/${path}`,
                    contents
                }))
        ]
    }
    const json = JSON.stringify(body)
    if (new TextEncoder().encode(json).length > COMPILE_BYTE_LIMIT)
        throw new SourceCompilationError(
            'Source and local headers exceed the 1 MiB compilation limit.'
        )
    return { compilerId: preset.id, language, body, json }
}

/**
 * Remove debug payloads and compose the Source map. Every other section stays as the compiler
 * wrote it. Library members use the same preparation; startup stays in the runtime library.
 */
export function prepareAssembly(
    lines: readonly AssemblyLine[],
    request: CompilationRequest,
    readOnly: ReadOnlySources = {}
) {
    const text: string[] = []
    const mapping: (SourceLocation | null)[] = []
    let foundMain = false
    const lineCounts = new Map<string, number>()
    const sourceAnnotations =
        (request.compiler ?? defaultSourceCompiler(request.target)) === 'clang' &&
        request.sourceAnnotations
    for (const prepared of prepareCompilerLines(lines, request.target, !!sourceAnnotations)) {
        const line = lines[prepared.index]
        if (/^\s*main:/.test(prepared.text)) foundMain = true
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
    if (!foundMain) throw mainRequired(request)
    return { assembly: text.join('\n') + '\n', lines: [...mapping, null] }
}

function mainRequired(request: CompilationRequest, found: Diagnostic[] = []) {
    return new SourceCompilationError(
        'The program must define int main(void) or int main(int argc, char **argv).',
        [...found, diagnostic('Define an int main() entry point.', request.sourcePath)]
    )
}

/**
 * Translate GCC's x86 output to NASM, the assembler x86 Builds use, and compose the Source map from
 * the locations the translation reads from the compiler's own `.file` and `.loc`. What it cannot
 * translate is an error on the source line it came from, and leaves no output.
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
        const entry = translationDiagnostic(item, request, locate(item.location), readOnly)
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
    if (!translation.symbols.defined.some((symbol) => symbol.name === 'main'))
        throw mainRequired(request, diagnostics)
    return {
        assembly: translation.text.endsWith('\n') ? translation.text : translation.text + '\n',
        lines: [...translation.lines.map((line) => locate(line.location)), null],
        diagnostics
    }
}

/**
 * A translation Diagnostic on the source line it came from, or else on the source File's first.
 * Inline assembly is the learner's own text, which the translator quotes with what it cannot read.
 */
function translationDiagnostic(
    item: TranslationDiagnostic,
    request: CompilationRequest,
    location: SourceLocation | null,
    readOnly: ReadOnlySources
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
    entry.line.line =
        mappedText(entry.file!, request.files, readOnly).split(/\r?\n/)[entry.lineIndex] ?? ''
    if (inline) {
        entry.hint =
            'Write the instructions as a global function in a .asm File of the Project, and call that function instead.'
        entry.formatted = `${entry.message}\n${entry.hint}`
    }
    return entry
}

/** "a, b and c" */
function listed(items: readonly string[]) {
    return items.length > 1
        ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
        : items[0]
}

/**
 * Explain a standard header the Runtime library has but an x86 program cannot include yet, whose
 * error alone reads as a misspelt include, and point to `<sim.h>` for what the missing library does.
 */
function x86HeaderHint(
    item: Diagnostic,
    language: SourceLanguage,
    runtimeHeaders: Readonly<Record<string, string>>
) {
    const header = /^(.+): No such file or directory$/.exec(item.message)?.[1]
    if (
        item.severity !== 'error' ||
        !header ||
        !Object.prototype.hasOwnProperty.call(runtimeHeaders, header) ||
        X86_HEADER_NAMES.has(header)
    )
        return
    const headers = language === 'cpp' ? [...X86_HEADERS.cpp, ...X86_HEADERS.c] : X86_HEADERS.c
    item.hint = `x86 programs have no C standard library yet, so they can include only ${listed([...headers, ENVIRONMENT_HEADER])}. <${ENVIRONMENT_HEADER}> has a function for each Linux system call: sim_write(1, text, length) prints.`
    item.formatted = `${item.message}\n${item.hint}`
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
    if (request.target === 'X86')
        for (const item of diagnostics) x86HeaderHint(item, prepared.language, runtimeHeaders)
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
            //x86 output is NASM, and links the editor's start unit until x86 has a Runtime library
            ...(request.target === 'X86'
                ? {}
                : {
                      assemblerProfile: 'gnu-compiler-v1' as const,
                      runtimeAbi: CURRENT_RUNTIME_ABI
                  }),
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
        diagnostics: [...diagnostics, ...output.diagnostics]
    }
}
