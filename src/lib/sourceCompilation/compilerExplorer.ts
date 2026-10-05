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
import { isValidFilePath, resolveFilePath, type ProjectFiles } from '$lib/projectFiles'
import { CURRENT_RUNTIME_ABI } from '$lib/runtimeAbi'
import { loadRuntimeHeaders } from '$lib/sourceRuntime/runtimeLibrary'

const API_ROOT = 'https://godbolt.org/api'
export const COMPILE_BYTE_LIMIT = 1024 * 1024
const ASSEMBLY_BYTE_LIMIT = 4 * 1024 * 1024
/** Where the Runtime library's headers are uploaded; the program sees them as its system headers. */
export const SYSROOT_INCLUDE = 'sysroot/include'
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

export function compilerPreset(
    target: CompilationTarget,
    language: SourceLanguage,
    compiler: SourceCompiler = defaultSourceCompiler(target)
) {
    const ids = {
        MIPS: { c: 'cmipsg1420', cpp: 'mipsg1420' },
        'RISC-V': { c: 'rv32-cgcc1420', cpp: 'rv32-gcc1420' },
        'RISC-V-64': { c: 'rv64-cgcc1420', cpp: 'rv64-gcc1420' }
    }
    // MARS skips branch delay slots, so the compiler must fill them with nops.
    const mipsDelaySlots =
        compiler === 'clang' ? '-mllvm -disable-mips-delay-filler' : '-fno-delayed-branch'
    const architecture =
        target === 'MIPS'
            ? // little-endian: MARS memory is, so -EB code read its bytes and halves the wrong way round
              `-march=mips32 -mabi=32 -mno-abicalls -fno-pic -G0 ${mipsDelaySlots} -mfp32 -mhard-float -EL`
            : target === 'RISC-V'
              ? '-march=rv32imfd -mabi=ilp32d'
              : '-march=rv64imfd -mabi=lp64d'
    const clangIds = {
        MIPS: { c: 'mipsel-cclang2110', cpp: 'mipsel-clang2110' },
        'RISC-V': { c: 'rv32-cclang2110', cpp: 'rv32-clang2110' },
        'RISC-V-64': { c: 'rv64-cclang2110', cpp: 'rv64-clang2110' }
    }
    const id = compiler === 'clang' ? clangIds[target][language] : ids[target][language]
    return { id, architecture }
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

function projectPath(path: unknown, sourcePath: string, files: ProjectFiles, mainsource = false) {
    if (path === undefined || path === null || path === '' || mainsource) return sourcePath
    if (typeof path !== 'string') return undefined
    if (/^\/?(?:app\/)?example\.(?:c|cpp|cc|cxx)$/.test(path)) return sourcePath
    const relative = path.replace(/^\/app\//, '').replace(/^\.\//, '')
    return isValidFilePath(relative) && files[relative] ? relative : undefined
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
    failed: boolean
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
        const path =
            projectPath(tag?.file ?? location?.[1], request.sourcePath, request.files) ??
            request.sourcePath
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
            entry.line.line = request.files[path]?.content.split(/\r?\n/)[line] ?? ''
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

/** Track quoted local includes recursively; computed includes conservatively depend on all headers. */
export function compilationInputs(
    sourcePath: string,
    files: ProjectFiles
): Readonly<Record<string, string>> {
    const headers = Object.keys(files).filter(
        (path) => /\.(h|hpp|hh|hxx|inc)$/i.test(path) && files[path].encoding === 'plain'
    )
    const seen = new Set<string>()
    const visit = (path: string) => {
        if (seen.has(path)) return
        seen.add(path)
        const content = files[path]?.content ?? ''
        // Comments cannot introduce an include dependency. Preserve newlines for the directive scan.
        const text = content
            .replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g, ' '))
            .replace(/\/\/[^\n]*/g, '')
        for (const match of text.matchAll(/^\s*#\s*include\s+([^\n]+)/gm)) {
            const include = /^["<]([^">]+)[">]/.exec(match[1])
            if (!include) {
                for (const header of headers) visit(header)
                continue
            }
            const directory = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''
            for (const candidate of [directory + include[1], include[1]]) {
                try {
                    const resolved = resolveFilePath(candidate)
                    if (headers.includes(resolved)) {
                        visit(resolved)
                        break
                    }
                } catch {
                    /* An external/system include is left to the compiler. */
                }
            }
        }
    }
    visit(sourcePath)
    return Object.fromEntries([...seen].map((path) => [path, fileFingerprint(files[path])!]))
}

/**
 * The Compiler Explorer request. A program is hosted: it compiles with `-nostdinc` against the
 * Runtime library's headers, uploaded as `sysroot/include`, so an unsupported header is a clear
 * error and no toolchain header leaks in, and `main` keeps its name and its implicit `return 0`.
 */
export function createCompilerRequest(
    request: CompilationRequest,
    sysroot: Readonly<Record<string, string>> = {}
) {
    const language = sourceLanguage(request.sourcePath)
    const source = request.files[request.sourcePath]
    if (!language || source?.encoding !== 'plain')
        throw new SourceCompilationError('Select a C or C++ text File to compile.')
    const compiler = request.compiler ?? defaultSourceCompiler(request.target)
    const preset = compilerPreset(request.target, language, compiler)
    const directory = request.sourcePath.includes('/')
        ? request.sourcePath.slice(0, request.sourcePath.lastIndexOf('/'))
        : '.'
    const quote = (text: string) => `'${text.replace(/'/g, "'\\''")}'`
    const headers = Object.entries(request.files).filter(
        ([path, file]) => /\.(h|hpp|hh|hxx|inc)$/i.test(path) && file.encoding === 'plain'
    )
    const sourceAnnotations = compiler === 'clang' && request.sourceAnnotations
    const annotations = sourceAnnotations ? '-fverbose-asm' : '-fno-verbose-asm'
    const compilerOptions =
        compiler === 'clang'
            ? `-fno-addrsig${sourceAnnotations ? ' -fno-discard-value-names' : ''}`
            : '-fno-section-anchors'
    const common = `-O${request.optimization} -g1 -fdiagnostics-color=never ${annotations} -fno-stack-protector -fno-pie ${compilerOptions}`
    const standard = language === 'cpp' ? '-std=c++17 -fno-exceptions -fno-rtti' : '-std=c17'
    const userArguments = `${common} -nostdinc -isystem ${SYSROOT_INCLUDE} ${preset.architecture} -iquote ${quote(directory)} -I . ${standard}${language === 'cpp' ? ' -fno-threadsafe-statics -nostdinc++' : ''}`
    const body = {
        source: `#line 1 ${JSON.stringify(request.sourcePath)}\n${source.content}`,
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
            ...headers.map(([filename, file]) => ({ filename, contents: file.content })),
            ...Object.entries(sysroot).map(([path, contents]) => ({
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

/** Labels GCC's MIPS output defines only for the debug sections, which are dropped. */
const MIPS_DEBUG_LABEL = /^\s*(?:\$L|\.L)(?:FB|FE|BB|BE|VL|text|etext|debug)\w*\s*(?::|=)/

/**
 * Remove debug payloads and compose the Source map. Every other section stays as the compiler
 * wrote it, for the GNU compiler profile to place and check, and no startup lines are added: the
 * Runtime library's `_start` calls `main`. Kept in step with `prepare` in
 * scripts/runtime/build.mjs, which prepares the Library members the same way.
 */
export function prepareAssembly(lines: readonly AssemblyLine[], request: CompilationRequest) {
    const text: string[] = []
    const mapping: (SourceLocation | null)[] = []
    let debugSection = false
    let foundMain = false
    const lineCounts = new Map<string, number>()
    const sourceAnnotations =
        (request.compiler ?? defaultSourceCompiler(request.target)) === 'clang' &&
        request.sourceAnnotations
    for (const line of lines) {
        const code = line.text
        const blockComment = sourceAnnotations && /^\s*#\s*%bb\.\d+:\s*#\s*%[\w.]+\s*$/.test(code)
        const section = /^\s*\.section\s+(?:"([^"]+)"|([^\s,]+))/.exec(code)?.slice(1).find(Boolean)
        if (section) debugSection = /^\.(?:debug|zdebug|mdebug|note|comment|eh_frame)/.test(section)
        else if (/^\s*\.(?:text|data|bss|sdata|sbss|rodata|rdata)\b/.test(code))
            debugSection = false
        else if (debugSection && /^\s*\.previous\b/.test(code)) {
            //back to the section before the debug one, where the lines after it belong
            debugSection = false
            continue
        }
        if (
            debugSection ||
            /^\s*\.(?:file|loc|cfi_\w+|ident)\b/.test(code) ||
            (request.target === 'MIPS' && MIPS_DEBUG_LABEL.test(code)) ||
            (/^\s*#/.test(code) && !blockComment) ||
            !code.trim()
        )
            continue
        if (/^\s*main:/.test(code)) foundMain = true
        text.push(code)
        const path = projectPath(
            line.source?.file,
            request.sourcePath,
            request.files,
            line.source?.mainsource
        )
        const number = line.source?.line
        if (path && !lineCounts.has(path))
            lineCounts.set(path, request.files[path].content.split('\n').length)
        mapping.push(
            path && Number.isSafeInteger(number) && number! > 0 && number! <= lineCounts.get(path)!
                ? { path, line: number! - 1 }
                : null
        )
    }
    if (!foundMain)
        throw new SourceCompilationError(
            'The program must define int main(void) or int main(int argc, char **argv).',
            [diagnostic('Define an int main() entry point.', request.sourcePath)]
        )
    return { assembly: text.join('\n') + '\n', lines: [...mapping, null] }
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
    const prepared = createCompilerRequest(request, await loadRuntimeHeaders(CURRENT_RUNTIME_ABI))
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
    const diagnostics = compilerDiagnostics(messages, request, result.code !== 0)
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
    const output = prepareAssembly(result.asm as AssemblyLine[], request)
    const outputFingerprint = fileFingerprint({ encoding: 'plain', content: output.assembly })!
    const inputs = { ...compilationInputs(request.sourcePath, request.files) }
    // Header locations supplied by the compiler also establish dependencies, including macro includes.
    for (const line of output.lines)
        if (line) inputs[line.path] = fileFingerprint(request.files[line.path])!
    return {
        assembly: output.assembly,
        record: {
            assemblerProfile: 'gnu-compiler-v1',
            runtimeAbi: CURRENT_RUNTIME_ABI,
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
        diagnostics
    }
}
