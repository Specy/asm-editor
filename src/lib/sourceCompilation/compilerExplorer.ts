import type { Diagnostic } from '$lib/languages/commonLanguageFeatures.svelte'
import {
    fileFingerprint,
    sourceLanguage,
    type CompilationRecord,
    type CompilationSourceMap,
    type CompilationTarget,
    type Optimization,
    type SourceLanguage,
    type SourceLocation
} from './records'
import { isValidFilePath, resolveFilePath, type ProjectFiles } from '$lib/projectFiles'

const API_ROOT = 'https://godbolt.org/api'
export const COMPILE_BYTE_LIMIT = 1024 * 1024
const ASSEMBLY_BYTE_LIMIT = 4 * 1024 * 1024
export const MAIN_SYMBOL = '__asm_editor_main'
export type CompilationRequest = {
    sourcePath: string
    outputPath: string
    files: ProjectFiles
    target: CompilationTarget
    optimization: Optimization
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

export class SourceCompilationError extends Error {
    constructor(
        message: string,
        readonly diagnostics: Diagnostic[] = []
    ) {
        super(message)
    }
}

export function compilerPreset(target: CompilationTarget, language: SourceLanguage) {
    const ids = {
        MIPS: { c: 'cmipsg1420', cpp: 'mipsg1420' },
        'RISC-V': { c: 'rv32-cgcc1420', cpp: 'rv32-gcc1420' },
        'RISC-V-64': { c: 'rv64-cgcc1420', cpp: 'rv64-gcc1420' }
    }
    const architecture =
        target === 'MIPS'
            ? '-march=mips32 -mabi=32 -mno-abicalls -fno-pic -G0 -fno-delayed-branch -mfp32 -mhard-float -EB'
            : target === 'RISC-V'
              ? '-march=rv32imfd -mabi=ilp32d'
              : '-march=rv64imfd -mabi=lp64d'
    return { id: ids[target][language], architecture }
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
        .split(MAIN_SYMBOL)
        .join('main')
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

export function createCompilerRequest(request: CompilationRequest) {
    const language = sourceLanguage(request.sourcePath)
    const source = request.files[request.sourcePath]
    if (!language || source?.encoding !== 'plain')
        throw new SourceCompilationError('Select a C or C++ text File to compile.')
    const preset = compilerPreset(request.target, language)
    const directory = request.sourcePath.includes('/')
        ? request.sourcePath.slice(0, request.sourcePath.lastIndexOf('/'))
        : '.'
    const quote = (text: string) => `'${text.replace(/'/g, "'\\''")}'`
    const headers = Object.entries(request.files).filter(
        ([path, file]) => /\.(h|hpp|hh|hxx|inc)$/i.test(path) && file.encoding === 'plain'
    )
    const signature =
        language === 'cpp' ? `extern "C" int ${MAIN_SYMBOL}(void);` : `int ${MAIN_SYMBOL}(void);`
    const body = {
        source: `${signature}\n#line 1 ${JSON.stringify(request.sourcePath)}\n${source.content}`,
        lang: language === 'cpp' ? 'c++' : 'c',
        options: {
            userArguments: `-O${request.optimization} -g1 -fdiagnostics-color=never -fno-verbose-asm -ffreestanding -fno-stack-protector -fno-pie -fno-section-anchors -Dmain=${MAIN_SYMBOL} ${preset.architecture} -iquote ${quote(directory)} -I . ${language === 'cpp' ? '-std=c++17 -fno-exceptions -fno-rtti' : '-std=c17'}`,
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
        files: headers.map(([filename, file]) => ({ filename, contents: file.content }))
    }
    const json = JSON.stringify(body)
    if (new TextEncoder().encode(json).length > COMPILE_BYTE_LIMIT)
        throw new SourceCompilationError(
            'Source and local headers exceed the 1 MiB compilation limit.'
        )
    return { compilerId: preset.id, language, body, json }
}

/** Preserve executable sections, remove debug payloads, and compose mappings with startup lines. */
export function prepareAssembly(lines: readonly AssemblyLine[], request: CompilationRequest) {
    const wrapper =
        request.target === 'MIPS'
            ? [
                  '.text',
                  '.globl main',
                  'main:',
                  `    jal ${MAIN_SYMBOL}`,
                  '    move $a0, $v0',
                  '    li $v0, 17',
                  '    syscall'
              ]
            : [
                  '.text',
                  '.globl main',
                  'main:',
                  `    call ${MAIN_SYMBOL}`,
                  '    li a7, 93',
                  '    ecall'
              ]
    const text = [...wrapper]
    const mapping: (SourceLocation | null)[] = wrapper.map(() => null)
    let debugSection = false
    let foundMain = false
    const lineCounts = new Map<string, number>()
    for (const line of lines) {
        let code = line.text
        const section = /^\s*\.section\s+([^\s,]+)/.exec(code)?.[1]
        if (section) debugSection = /^\.(?:debug|zdebug|mdebug|note|comment|eh_frame)/.test(section)
        else if (/^\s*\.(?:text|data|bss|sdata|sbss|rodata|rdata)\b/.test(code))
            debugSection = false
        if (
            debugSection ||
            /^\s*\.(?:file|loc|cfi_\w+|ident)\b/.test(code) ||
            /^\s*(?:\$L|\.L)(?:FB|FE|BB|BE|VL|text|etext|debug)\w*\s*(?::|=)/.test(code) ||
            /^\s*#/.test(code) ||
            !code.trim()
        )
            continue
        if (section) {
            if (/^\.text(?:\.|$)/.test(section)) code = '.text'
            else if (/^\.(?:data|sdata|bss|sbss|rodata|srodata|rdata)(?:\.|$)/.test(section))
                code = '.data'
            else
                throw new SourceCompilationError(
                    `Compiler output requires unsupported section ${section}. Use a self-contained program without runtime initialization or thread-local storage.`
                )
        }
        if (request.target === 'MIPS') {
            // GNU accepts an immediate operand on slt/sltu; MARS spells that form slti/sltiu.
            code = code.replace(
                /^(\s*)slt(u?)\s+([^,]+),([^,]+),\s*(-?\d+)\s*$/,
                '$1slti$2 $3,$4,$5'
            )
        }
        if (new RegExp(`^\\s*${MAIN_SYMBOL}:`).test(code)) foundMain = true
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
            'A self-contained program must define int main(void) (or int main() in C++).',
            [diagnostic('Define a parameterless int main() entry point.', request.sourcePath)]
        )
    return { assembly: text.join('\n') + '\n', lines: [...mapping, null] }
}

export async function compileSource(
    request: CompilationRequest,
    signal?: AbortSignal,
    fetcher: typeof fetch = fetch
): Promise<CompilationResult> {
    const prepared = createCompilerRequest(request)
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
