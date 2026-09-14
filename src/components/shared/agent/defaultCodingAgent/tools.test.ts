import { describe, expect, it, vi } from 'vitest'
import { createDefaultCodingAgentTools } from './tools'
import { buildDefaultCodingAgentPrompt } from './prompts'
import {
    DEFAULT_TAKE_LINES,
    MAX_TAKE_LINES,
    type DefaultCodingAgentToolContext,
    type SupportedLanguage
} from './types'
import type { Emulator } from '$lib/languages/Emulator'
import {
    InterpreterStatus,
    makeGenericDiagnostic,
    makeRegister,
    RegisterSize,
    resolveRegisterFileLayout,
    type RegisterFile,
    type RegisterFileDescriptor
} from '$lib/languages/commonLanguageFeatures.svelte'
import type { FormattedRegisterFile } from './formatting'

interface ToolExecutionResult {
    success?: boolean
    error?: string
    errorKind?: string
    path?: string
    file?: string
    line?: number
    lineCount?: number
    startLine?: number
    endLine?: number
    returnedLines?: number
    hasMore?: boolean
    nextStartLine?: number | null
    code?: string
    entry?: string
    files?: Array<{ path: string; isEntry?: boolean; lineCount?: number }> | string[]
    count?: number
    breakpoints?: Array<{
        file: string
        line: number
        isOutOfBounds?: boolean
        snippet: string
        context: Array<{ line: number; text: string; isBreakpoint: boolean }>
    }>
    snippet?: string
    context?: Array<{ line: number; text: string; isBreakpoint: boolean }>
    alreadySet?: boolean
    removed?: boolean
    removedCount?: number
    totalBreakpoints?: number
    added?: number[]
    deleted?: string
    address?: string
    lineNumber?: number
    stepsRequested?: number
    details?: {
        errors?: string[]
        [key: string]: unknown
    }
    [key: string]: unknown
}

function createMockEmulator(): Emulator {
    const breakpoints: { file: string; line: number }[] = []

    return {
        entry: 'main.s',
        currentFile: 'main.s',
        line: 0,
        pc: 0x1000n,
        sp: 0x2000n,
        canExecute: true,
        terminated: false,
        canUndo: true,
        interrupt: undefined,
        stdOut: 'hello world',
        breakpoints,
        compilerDiagnostics: [],
        compilerErrors: [],
        errors: [],
        callStack: [],
        statusRegisters: [],
        registers: [],
        latestSteps: [],
        executionTime: 0,
        systemSize: 4 as Emulator['systemSize'],
        peripherals: {} as Emulator['peripherals'],
        clear: vi.fn(),
        setCode: vi.fn(),
        setSources: vi.fn(),
        check: vi.fn(async () => []),
        compile: vi.fn(async () => {}),
        step: vi.fn(async () => false),
        run: vi.fn(async () => InterpreterStatus.Terminated),
        undo: vi.fn(() => 1),
        pause: vi.fn(),
        resetSelectedLine: vi.fn(),
        dispose: vi.fn(),
        test: vi.fn(async () => []),
        getLineFromAddress: vi.fn(() => 0),
        getSourceLocationFromAddress: vi.fn((_addr: bigint) => ({ file: 'sub.s', line: 2 })),
        readMemoryBytes: vi.fn(() => new Uint8Array([0xaa, 0xbb])),
        setGlobalMemoryAddress: vi.fn(),
        setTabMemoryAddress: vi.fn(),
        setScreenHistoryBudgetMb: vi.fn(),
        setFileSystemHistoryBudgetMb: vi.fn(),
        toggleBreakpoint: vi.fn((bLine: number, file = 'main.s') => {
            const idx = breakpoints.findIndex((b) => b.file === file && b.line === bLine)
            if (idx >= 0) {
                breakpoints.splice(idx, 1)
            } else {
                breakpoints.push({ file, line: bLine })
            }
        })
    } as unknown as Emulator
}

/**
 * A Register file the way `GenericEmulator` publishes one: the descriptor with its layout resolved
 * and one `Register` per declared name, so the agent formatting reads exactly what the panel reads.
 */
function makeFakeRegisterFile(
    descriptor: RegisterFileDescriptor,
    values: bigint[],
    flagValues: number[] = [],
    blanks: boolean[] = []
): RegisterFile {
    const layout = resolveRegisterFileLayout(descriptor)
    return {
        ...descriptor,
        layout,
        registers: layout.map((register, index) =>
            makeRegister(register.name, values[index] ?? 0n, register.size)
        ),
        flags: (descriptor.flagNames ?? []).map((name, index) => ({
            name,
            value: flagValues[index] ?? 0,
            prev: 0
        })),
        blanks: layout.map((_, index) => blanks[index] === true)
    }
}

function makeCpuFile(): RegisterFile {
    return makeFakeRegisterFile(
        {
            id: 'cpu',
            label: 'CPU',
            size: RegisterSize.Long,
            formats: ['hex'],
            registers: [{ name: '$t0' }]
        },
        [7n]
    )
}

/**
 * An emulator holding every shape the formatting has to handle rather than a copy of one language's
 * files: the CPU file; a float file with the MIPS pairing rule and condition flags which also holds
 * a control register of integer kind, `mxcsr`, the way x86's SSE file does; and an integer file
 * that nothing has written yet. `$f0` holds the single 3.5, `$f1` is untouched and the `$f2`/`$f3`
 * pair holds the double 3.5, whose low word is zero, which is why the even half of a pair cannot be
 * dropped for being zero.
 */
function createRegisterFileEmulator(): Emulator {
    const emulator = createMockEmulator()
    const cpu = makeCpuFile()
    const fpu = makeFakeRegisterFile(
        {
            id: 'fpu',
            label: 'FPU',
            size: RegisterSize.Long,
            formats: ['single', 'double', 'hex'],
            pairedDoubles: true,
            flagNames: ['0', '1'],
            registers: [
                { name: '$f0' },
                { name: '$f1' },
                { name: '$f2' },
                { name: '$f3' },
                { name: 'mxcsr', kind: 'integer' }
            ]
        },
        [0x40600000n, 0n, 0n, 0x400c0000n, 0x18n],
        [1, 0]
    )
    const cp0 = makeFakeRegisterFile(
        {
            id: 'cp0',
            label: 'CP0',
            size: RegisterSize.Long,
            formats: ['hex'],
            registers: [{ name: '$12 (status)' }, { name: '$13 (cause)' }]
        },
        [0n, 0n]
    )
    return {
        ...emulator,
        registers: cpu.registers,
        registerFiles: [cpu, fpu, cp0]
    } as unknown as Emulator
}

/**
 * x86's x87 file, whose tag word marks stack slots empty: `st0` holds the double 3.5, `st1` is a
 * slot the file blanks although the bits left in it are a NaN rather than zero, and `st2` is a
 * live slot nothing has written yet.
 */
function createBlankingRegisterFileEmulator(): Emulator {
    const emulator = createMockEmulator()
    const cpu = makeCpuFile()
    const x87 = makeFakeRegisterFile(
        {
            id: 'x87',
            label: 'x87',
            size: RegisterSize.Double,
            formats: ['double', 'hex'],
            registers: [{ name: 'st0' }, { name: 'st1' }, { name: 'st2' }]
        },
        [0x400c000000000000n, 0x7ff8000000000000n, 0n],
        [],
        [false, true, false]
    )
    return {
        ...emulator,
        registers: cpu.registers,
        registerFiles: [cpu, x87]
    } as unknown as Emulator
}

/** M68K and Z80: the CPU file is the only file the emulator publishes. */
function createCpuOnlyEmulator(): Emulator {
    const emulator = createMockEmulator()
    const cpu = makeCpuFile()
    return {
        ...emulator,
        registers: cpu.registers,
        registerFiles: [cpu]
    } as unknown as Emulator
}

function createTestContext(
    initialFiles: Record<string, string>,
    emulator?: Emulator
): {
    context: DefaultCodingAgentToolContext
    files: Record<string, string>
} {
    const files = { ...initialFiles }
    let language: SupportedLanguage = 'M68K'
    let activePath = Object.keys(files)[0] ?? 'main.s'
    let em = emulator ?? createMockEmulator()

    const context: DefaultCodingAgentToolContext = {
        canUpdateLanguage: true,
        canEditCode: true,
        getEditorLanguage: () => language,
        setEditorLanguage: (l: SupportedLanguage) => {
            language = l
            em = createMockEmulator()
        },
        getEmulator: () => em,
        getFiles: () => files,
        getFile: (path) => files[path] ?? null,
        setFile: (path, code) => {
            files[path] = code
        },
        deleteFile: (path) => {
            delete files[path]
        },
        getEntryPath: () => 'main.s',
        getActivePath: () => activePath,
        setActivePath: (p) => {
            activePath = p
        }
    }

    return { context, files }
}

describe('DefaultCodingAgent Tools (Standard Agent Model)', () => {
    describe('view_file', () => {
        it('returns entry file by default with raw source lines', async () => {
            const { context } = createTestContext({
                'main.s': 'line 1\nline 2\nline 3'
            })
            const tools = createDefaultCodingAgentTools(context)
            const result = (await tools.view_file.execute({})) as unknown as ToolExecutionResult

            expect(result.success).toBe(true)
            expect(result.path).toBe('main.s')
            expect(result.lineCount).toBe(3)
            expect(result.startLine).toBe(1)
            expect(result.endLine).toBe(3)
            expect(result.code).toBe('line 1\nline 2\nline 3')
            expect(result.files).toEqual(['main.s'])
        })

        it('returns a specific file when path is provided', async () => {
            const { context } = createTestContext({
                'main.s': 'main code',
                'utils.s': 'helper 1\nhelper 2'
            })
            const tools = createDefaultCodingAgentTools(context)
            const result = (await tools.view_file.execute({
                path: 'utils.s'
            })) as unknown as ToolExecutionResult

            expect(result.success).toBe(true)
            expect(result.path).toBe('utils.s')
            expect(result.lineCount).toBe(2)
            expect(result.code).toBe('helper 1\nhelper 2')
        })

        it('returns a helpful failure if file does not exist', async () => {
            const { context } = createTestContext({ 'main.s': 'code' })
            const tools = createDefaultCodingAgentTools(context)
            const result = (await tools.view_file.execute({
                path: 'missing.s'
            })) as unknown as ToolExecutionResult

            expect(result.success).toBe(false)
            expect(result.error).toContain('missing.s')
            expect(result.error).toContain('Available files: main.s')
        })

        it('supports start_line and end_line bounds', async () => {
            const codeLines = Array.from({ length: 50 }, (_, i) => `instruction_${i + 1}`).join(
                '\n'
            )
            const { context } = createTestContext({ 'main.s': codeLines })
            const tools = createDefaultCodingAgentTools(context)

            // View lines 11 to 15
            const result = (await tools.view_file.execute({
                start_line: 11,
                end_line: 15
            })) as unknown as ToolExecutionResult

            expect(result.success).toBe(true)
            expect(result.startLine).toBe(11)
            expect(result.endLine).toBe(15)
            expect(result.returnedLines).toBe(5)
            expect(result.hasMore).toBe(true)
            expect(result.nextStartLine).toBe(16)
            expect(result.code).toBe(
                'instruction_11\ninstruction_12\ninstruction_13\ninstruction_14\ninstruction_15'
            )
        })

        it('clamps lines to MAX_TAKE_LINES and defaults to DEFAULT_TAKE_LINES', async () => {
            const codeLines = Array.from(
                { length: MAX_TAKE_LINES + 100 },
                (_, i) => `line_${i + 1}`
            ).join('\n')
            const { context } = createTestContext({ 'main.s': codeLines })
            const tools = createDefaultCodingAgentTools(context)

            // Without bounds, should return DEFAULT_TAKE_LINES
            const defaultResult = (await tools.view_file.execute(
                {}
            )) as unknown as ToolExecutionResult
            expect(defaultResult.returnedLines).toBe(DEFAULT_TAKE_LINES)
            expect(defaultResult.startLine).toBe(1)
            expect(defaultResult.endLine).toBe(DEFAULT_TAKE_LINES)
            expect(defaultResult.hasMore).toBe(true)
            expect(defaultResult.nextStartLine).toBe(DEFAULT_TAKE_LINES + 1)

            // With large end_line, should clamp to MAX_TAKE_LINES
            const hugeResult = (await tools.view_file.execute({
                start_line: 1,
                end_line: 9999
            })) as unknown as ToolExecutionResult
            expect(hugeResult.returnedLines).toBe(MAX_TAKE_LINES)
            expect(hugeResult.endLine).toBe(MAX_TAKE_LINES)
        })

        it('does not format code with line numbers or breakpoint markers', async () => {
            const emulator = createMockEmulator()
            emulator.toggleBreakpoint(1, 'main.s') // line 2 in main.s

            const { context } = createTestContext({ 'main.s': 'first\nsecond\nthird' }, emulator)
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.view_file.execute({
                path: 'main.s'
            })) as unknown as ToolExecutionResult
            expect(result.code).toBe('first\nsecond\nthird')
            expect(result.code).not.toContain('|')
            expect(result.breakpoints).toBeUndefined()
        })
    })

    describe('replace_file_content', () => {
        it('replaces an exact unique snippet in a file', async () => {
            const initial = 'start:\n    move.l #1, d0\n    rts\n'
            const { context, files } = createTestContext({ 'main.s': initial })
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.replace_file_content.execute({
                path: 'main.s',
                target_content: '    move.l #1, d0',
                replacement_content: '    move.l #42, d0'
            })) as unknown as ToolExecutionResult

            expect(result.success).toBe(true)
            expect(files['main.s']).toBe('start:\n    move.l #42, d0\n    rts\n')
            expect(result.code).toContain('move.l #42, d0')
        })

        it('fails if target_content is empty', async () => {
            const { context } = createTestContext({ 'main.s': 'some code' })
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.replace_file_content.execute({
                path: 'main.s',
                target_content: '',
                replacement_content: 'replacement'
            })) as unknown as ToolExecutionResult

            expect(result.success).toBe(false)
            expect(result.error).toContain('cannot be empty')
        })

        it('fails if target_content is not found', async () => {
            const { context } = createTestContext({ 'main.s': 'line 1\nline 2' })
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.replace_file_content.execute({
                path: 'main.s',
                target_content: 'nonexistent snippet',
                replacement_content: 'new snippet'
            })) as unknown as ToolExecutionResult

            expect(result.success).toBe(false)
            expect(result.error).toContain('was not found')
        })

        it('fails if target_content matches multiple times without bounds', async () => {
            const initial = 'nop\nnop\nnop'
            const { context } = createTestContext({ 'main.s': initial })
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.replace_file_content.execute({
                path: 'main.s',
                target_content: 'nop',
                replacement_content: 'rts'
            })) as unknown as ToolExecutionResult

            expect(result.success).toBe(false)
            expect(result.error).toContain('matches 3 times')
        })

        it('disambiguates multiple matches using start_line and end_line bounds', async () => {
            const initial = 'label1:\n    nop\nlabel2:\n    nop'
            const { context, files } = createTestContext({ 'main.s': initial })
            const tools = createDefaultCodingAgentTools(context)

            // Restrict search to lines 3-4 (targeting the second nop)
            const result = (await tools.replace_file_content.execute({
                path: 'main.s',
                target_content: '    nop',
                replacement_content: '    rts',
                start_line: 3,
                end_line: 4
            })) as unknown as ToolExecutionResult

            expect(result.success).toBe(true)
            expect(files['main.s']).toBe('label1:\n    nop\nlabel2:\n    rts')
        })

        it('fails when targeting a file that does not exist and suggests write_to_file', async () => {
            const { context } = createTestContext({ 'main.s': 'code' })
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.replace_file_content.execute({
                path: 'missing.s',
                target_content: 'old',
                replacement_content: 'new'
            })) as unknown as ToolExecutionResult

            expect(result.success).toBe(false)
            expect(result.error).toContain('does not exist')
            expect(result.error).toContain('write_to_file')
        })

        it('reports compile_error when code has syntax errors', async () => {
            const emulator = createMockEmulator()
            emulator.check = vi.fn(async () => [makeGenericDiagnostic('Syntax error on line 2')])

            const { context } = createTestContext({ 'main.s': 'line 1\nline 2' }, emulator)
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.replace_file_content.execute({
                path: 'main.s',
                target_content: 'line 2',
                replacement_content: 'bad instruction syntax'
            })) as unknown as ToolExecutionResult

            expect(result.success).toBe(false)
            expect(result.errorKind).toBe('compile_error')
            expect(result.details?.errors).toContain('Syntax error on line 2')
        })
    })

    describe('write_to_file', () => {
        it('overwrites an existing file completely', async () => {
            const { context, files } = createTestContext({ 'main.s': 'old code' })
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.write_to_file.execute({
                path: 'main.s',
                code: 'new complete code\nline 2'
            })) as unknown as ToolExecutionResult

            expect(result.success).toBe(true)
            expect(files['main.s']).toBe('new complete code\nline 2')
            expect(result.lineCount).toBe(2)
        })

        it('creates a new file in the project', async () => {
            const { context, files } = createTestContext({ 'main.s': 'main code' })
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.write_to_file.execute({
                path: 'helper.s',
                code: 'helper:\n    rts'
            })) as unknown as ToolExecutionResult

            expect(result.success).toBe(true)
            expect(files['helper.s']).toBe('helper:\n    rts')
            expect(result.files).toContain('helper.s')
        })

        it('updates editor language if requested and allowed', async () => {
            const { context } = createTestContext({ 'main.s': 'old' })
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.write_to_file.execute({
                path: 'main.asm',
                code: 'li $v0, 10\nsyscall',
                language: 'MIPS'
            })) as unknown as ToolExecutionResult

            expect(result.success).toBe(true)
            expect(context.getEditorLanguage()).toBe('MIPS')
        })
    })

    describe('list_files', () => {
        it('lists all files in the project with metadata', async () => {
            const { context } = createTestContext({
                'main.s': 'move.l #1, d0\nrts',
                'sub.s': 'rts'
            })
            const tools = createDefaultCodingAgentTools(context)
            const result = (await tools.list_files.execute({})) as unknown as ToolExecutionResult

            expect(result.success).toBe(true)
            expect(result.entry).toBe('main.s')
            expect(result.files).toHaveLength(2)

            const fileList = result.files as Array<{
                path: string
                isEntry?: boolean
                lineCount?: number
            }>
            const mainEntry = fileList.find((f) => f.path === 'main.s')
            expect(mainEntry?.isEntry).toBe(true)
            expect(mainEntry?.lineCount).toBe(2)

            const subEntry = fileList.find((f) => f.path === 'sub.s')
            expect(subEntry?.isEntry).toBe(false)
            expect(subEntry?.lineCount).toBe(1)
        })
    })

    describe('delete_file', () => {
        it('deletes a non-entry file', async () => {
            const { context, files } = createTestContext({
                'main.s': 'code',
                'temp.s': 'temp'
            })
            const tools = createDefaultCodingAgentTools(context)
            const result = (await tools.delete_file.execute({
                path: 'temp.s'
            })) as unknown as ToolExecutionResult

            expect(result.success).toBe(true)
            expect(result.deleted).toBe('temp.s')
            expect(files['temp.s']).toBeUndefined()
        })

        it('refuses to delete the sole entry file', async () => {
            const { context } = createTestContext({ 'main.s': 'code' })
            const tools = createDefaultCodingAgentTools(context)
            const result = (await tools.delete_file.execute({
                path: 'main.s'
            })) as unknown as ToolExecutionResult

            expect(result.success).toBe(false)
            expect(result.error).toContain('sole entry file')
        })
    })

    describe('set_breakpoint', () => {
        it('sets a breakpoint by instruction text and returns snippet', async () => {
            const emulator = createMockEmulator()
            const content = 'main:\n    addi $t0, $zero, 1\n    syscall\n'
            const { context } = createTestContext({ 'main.s': content }, emulator)
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.set_breakpoint.execute({
                instruction: 'addi $t0, $zero, 1'
            })) as unknown as ToolExecutionResult

            expect(result.success).toBe(true)
            expect(result.file).toBe('main.s')
            expect(result.line).toBe(2)
            expect(result.snippet).toContain('=>    2 |     addi $t0, $zero, 1  <-- [BREAKPOINT]')
            expect(emulator.toggleBreakpoint).toHaveBeenCalledWith(1, 'main.s')
        })

        it('is idempotent when setting a breakpoint multiple times', async () => {
            const emulator = createMockEmulator()
            const content = 'line 1\nline 2\nline 3'
            const { context } = createTestContext({ 'main.s': content }, emulator)
            const tools = createDefaultCodingAgentTools(context)

            // First call sets it
            const res1 = (await tools.set_breakpoint.execute({
                line: 2
            })) as unknown as ToolExecutionResult
            expect(res1.success).toBe(true)
            expect(res1.alreadySet).toBe(false)

            // Second call doesn't toggle off
            const res2 = (await tools.set_breakpoint.execute({
                line: 2
            })) as unknown as ToolExecutionResult
            expect(res2.success).toBe(true)
            expect(res2.alreadySet).toBe(true)
            expect(emulator.breakpoints).toHaveLength(1)
        })

        it('sets a breakpoint by address', async () => {
            const emulator = createMockEmulator()
            emulator.getSourceLocationFromAddress = vi.fn(() => ({ file: 'sub.s', line: 2 }))
            const { context } = createTestContext(
                { 'sub.s': 'line 1\nline 2\nline 3\nline 4' },
                emulator
            )
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.set_breakpoint.execute({
                address: '0x1000'
            })) as unknown as ToolExecutionResult
            expect(result.success).toBe(true)
            expect(result.file).toBe('sub.s')
            expect(result.line).toBe(3)
            expect(result.snippet).toContain('=>    3 | line 3  <-- [BREAKPOINT]')
        })

        it('fails with ambiguous error when instruction matches multiple lines', async () => {
            const emulator = createMockEmulator()
            const content = 'nop\naddi $t0, $zero, 1\nnop'
            const { context } = createTestContext({ 'main.s': content }, emulator)
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.set_breakpoint.execute({
                instruction: 'nop'
            })) as unknown as ToolExecutionResult
            expect(result.success).toBe(false)
            expect(result.error).toContain('matches 2 times')
        })
    })

    describe('remove_breakpoint', () => {
        it('removes a breakpoint by instruction text', async () => {
            const emulator = createMockEmulator()
            emulator.toggleBreakpoint(1, 'main.s') // line 2
            const content = 'line 1\ntarget instruction\nline 3'
            const { context } = createTestContext({ 'main.s': content }, emulator)
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.remove_breakpoint.execute({
                instruction: 'target instruction'
            })) as unknown as ToolExecutionResult

            expect(result.success).toBe(true)
            expect(result.line).toBe(2)
            expect(result.removed).toBe(true)
            expect(emulator.breakpoints).toHaveLength(0)
        })

        it('removes a breakpoint by line number', async () => {
            const emulator = createMockEmulator()
            emulator.toggleBreakpoint(0, 'main.s') // line 1
            const { context } = createTestContext({ 'main.s': 'first\nsecond' }, emulator)
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.remove_breakpoint.execute({
                line: 1
            })) as unknown as ToolExecutionResult
            expect(result.success).toBe(true)
            expect(result.removed).toBe(true)
            expect(emulator.breakpoints).toHaveLength(0)
        })

        it('removes all breakpoints when all: true is passed', async () => {
            const emulator = createMockEmulator()
            emulator.toggleBreakpoint(0, 'main.s')
            emulator.toggleBreakpoint(1, 'main.s')
            const { context } = createTestContext({ 'main.s': 'line 1\nline 2\nline 3' }, emulator)
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.remove_breakpoint.execute({
                all: true
            })) as unknown as ToolExecutionResult
            expect(result.success).toBe(true)
            expect(result.removedCount).toBe(2)
            expect(emulator.breakpoints).toHaveLength(0)
        })
    })

    describe('get_line_from_address', () => {
        it('resolves source file and line from address', async () => {
            const emulator = createMockEmulator()
            const { context } = createTestContext(
                { 'main.s': 'line 1', 'sub.s': 'line 1\nline 2\ntarget line' },
                emulator
            )
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.get_line_from_address.execute({
                address: '0x1000'
            })) as unknown as ToolExecutionResult

            expect(result.success).toBe(true)
            expect(result.file).toBe('sub.s')
            expect(result.lineNumber).toBe(3)
            expect(result.line).toContain('target line')
        })
    })

    describe('list_breakpoints', () => {
        it('lists breakpoints with surrounding code and explicit breakpoint markers', async () => {
            const emulator = createMockEmulator()
            emulator.toggleBreakpoint(1, 'main.s') // line 2 in main.s (0-indexed line 1)
            emulator.toggleBreakpoint(3, 'main.s') // line 4 in main.s (0-indexed line 3)

            const content = [
                'line 1',
                'line 2',
                'line 3',
                'line 4',
                'line 5',
                'line 6',
                'line 7'
            ].join('\n')

            const { context } = createTestContext({ 'main.s': content }, emulator)
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.list_breakpoints.execute(
                {}
            )) as unknown as ToolExecutionResult

            expect(result.success).toBe(true)
            expect(result.count).toBe(2)
            expect(result.breakpoints).toHaveLength(2)

            const bp1 = result.breakpoints![0]!
            expect(bp1.file).toBe('main.s')
            expect(bp1.line).toBe(2)
            expect(bp1.snippet).toContain('=>    2 | line 2  <-- [BREAKPOINT]')
            expect(bp1.snippet).toContain('      1 | line 1')
            expect(bp1.snippet).toContain('      3 | line 3')
            expect(bp1.context).toEqual([
                { line: 1, text: 'line 1', isBreakpoint: false },
                { line: 2, text: 'line 2', isBreakpoint: true },
                { line: 3, text: 'line 3', isBreakpoint: false },
                { line: 4, text: 'line 4', isBreakpoint: false },
                { line: 5, text: 'line 5', isBreakpoint: false }
            ])

            const bp2 = result.breakpoints![1]!
            expect(bp2.file).toBe('main.s')
            expect(bp2.line).toBe(4)
            expect(bp2.snippet).toContain('=>    4 | line 4  <-- [BREAKPOINT]')
        })

        it('filters breakpoints by path', async () => {
            const emulator = createMockEmulator()
            emulator.toggleBreakpoint(0, 'main.s') // line 1 in main.s
            emulator.toggleBreakpoint(1, 'sub.s') // line 2 in sub.s

            const { context } = createTestContext(
                { 'main.s': 'main line 1', 'sub.s': 'sub line 1\nsub line 2' },
                emulator
            )
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.list_breakpoints.execute({
                path: 'sub.s'
            })) as unknown as ToolExecutionResult
            expect(result.success).toBe(true)
            expect(result.count).toBe(1)
            expect(result.breakpoints![0]!.file).toBe('sub.s')
            expect(result.breakpoints![0]!.line).toBe(2)
        })

        it('returns empty list when no breakpoints are set', async () => {
            const { context } = createTestContext({ 'main.s': 'line 1' })
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.list_breakpoints.execute(
                {}
            )) as unknown as ToolExecutionResult
            expect(result.success).toBe(true)
            expect(result.count).toBe(0)
            expect(result.breakpoints).toEqual([])
        })
    })
    describe('register files', () => {
        it('reports every Register file in full from get_emulator_state', async () => {
            const { context } = createTestContext({ 'main.s': 'nop' }, createRegisterFileEmulator())
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.get_emulator_state.execute(
                {}
            )) as unknown as ToolExecutionResult
            const files = result.registerFiles as FormattedRegisterFile[]

            expect(files.map((file) => file.id)).toEqual(['fpu', 'cp0'])
            expect(files[0].label).toBe('FPU')
            //a float register reads as a decimal number in the file's default Format, with the
            //readings that Format hides beside it, and an integer one keeps the formatNumber shape
            expect(files[0].registers).toEqual([
                { name: '$f0', value: '3.5', other: ['0x40600000', 'double 5.3360734e-315'] },
                { name: '$f1', value: '0', other: ['0x00000000'] },
                //the double the pair holds is reported on its even half, where a single reads as 0
                { name: '$f2', value: '0', other: ['0x00000000', 'double 3.5'] },
                { name: '$f3', value: '2.1875', other: ['0x400c0000'] },
                {
                    name: 'mxcsr',
                    value: {
                        decimal: '24',
                        hex: '0x00000018',
                        unsignedDecimal: '24',
                        display: 'decimal: 24 hex: 0x00000018'
                    }
                }
            ])
            expect(files[0].flags).toEqual([
                { name: '0', value: 1 },
                { name: '1', value: 0 }
            ])
            expect(files[1].registers).toHaveLength(2)
            //the CPU file stays where every caller already reads it and is not repeated
            expect(result.registers).toEqual([
                {
                    name: '$t0',
                    value: {
                        decimal: '7',
                        hex: '0x00000007',
                        unsignedDecimal: '7',
                        display: 'decimal: 7 hex: 0x00000007'
                    }
                }
            ])
        })

        it('reports only the non-zero registers of the other files from step', async () => {
            const { context } = createTestContext({ 'main.s': 'nop' }, createRegisterFileEmulator())
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.step.execute({})) as unknown as ToolExecutionResult
            const files = result.registerFiles as FormattedRegisterFile[]

            expect(files.map((file) => file.id)).toEqual(['fpu', 'cp0'])
            //`$f2` is zero and stays: it is the low half of the pair holding the double 3.5
            expect(files[0].registers.map((register) => register.name)).toEqual([
                '$f0',
                '$f2',
                '$f3',
                'mxcsr'
            ])
            //the other readings travel with a step too, so the double is not lost on the way
            expect(files[0].registers[1]).toEqual({
                name: '$f2',
                value: '0',
                other: ['0x00000000', 'double 3.5']
            })
            //flags are a handful of bits, so they come along whatever the detail
            expect(files[0].flags).toEqual([
                { name: '0', value: 1 },
                { name: '1', value: 0 }
            ])
            //a file with nothing written to it is still listed, so the model knows it exists
            expect(files[1]).toEqual({ id: 'cp0', label: 'CP0', registers: [] })
        })

        it('reports only the non-zero registers from run_to_completion and undo', async () => {
            const { context } = createTestContext({ 'main.s': 'nop' }, createRegisterFileEmulator())
            const tools = createDefaultCodingAgentTools(context)

            const run = (await tools.run_to_completion.execute(
                {}
            )) as unknown as ToolExecutionResult
            const undone = (await tools.undo.execute({})) as unknown as ToolExecutionResult

            for (const result of [run, undone]) {
                const files = result.registerFiles as FormattedRegisterFile[]
                expect(files[0].registers.map((register) => register.name)).toEqual([
                    '$f0',
                    '$f2',
                    '$f3',
                    'mxcsr'
                ])
                expect(files[1].registers).toEqual([])
            }
        })

        it('marks a blanked register empty in the full listing and keeps its stale bits', async () => {
            const { context } = createTestContext(
                { 'main.s': 'nop' },
                createBlankingRegisterFileEmulator()
            )
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.get_emulator_state.execute(
                {}
            )) as unknown as ToolExecutionResult
            const files = result.registerFiles as FormattedRegisterFile[]

            //the word gdb's `info float` prints, with whatever the slot last held behind it
            expect(files[0].registers).toEqual([
                { name: 'st0', value: '3.5', other: ['0x400c000000000000'] },
                { name: 'st1', value: 'empty', other: ['0x7ff8000000000000'] },
                { name: 'st2', value: '0', other: ['0x0000000000000000'] }
            ])
        })

        it('leaves a blanked register out of the non-zero listing', async () => {
            const { context } = createTestContext(
                { 'main.s': 'nop' },
                createBlankingRegisterFileEmulator()
            )
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.step.execute({})) as unknown as ToolExecutionResult
            const files = result.registerFiles as FormattedRegisterFile[]

            //`st1` holds a NaN rather than zero and is dropped all the same: the slot is empty
            expect(files[0].registers.map((register) => register.name)).toEqual(['st0'])
        })

        it('reports no files for a language that only has the CPU one', async () => {
            const { context } = createTestContext({ 'main.s': 'nop' }, createCpuOnlyEmulator())
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.get_emulator_state.execute(
                {}
            )) as unknown as ToolExecutionResult
            expect(result.registerFiles).toEqual([])
        })

        //the tip is written from the allow list, so its sentence has to read as English whether the
        //agent has all three abbreviating tools or one of them
        it('names the abbreviating tools in the prompt with a verb that agrees', () => {
            const all = buildDefaultCodingAgentPrompt({
                enabledToolNames: ['get_emulator_state', 'step', 'run_to_completion', 'undo'],
                enabledWorkflows: []
            })
            expect(all).toContain(
                'step, run_to_completion and undo list only the registers that are not zero, plus the even half of a live MIPS double pair, and skip a row that holds nothing'
            )

            const two = buildDefaultCodingAgentPrompt({
                enabledToolNames: ['step', 'undo'],
                enabledWorkflows: []
            })
            expect(two).toContain(
                'step and undo list only the registers that are not zero, plus the even half of a live MIPS double pair, and skip a row that holds nothing'
            )

            const stepOnly = buildDefaultCodingAgentPrompt({
                enabledToolNames: ['get_emulator_state', 'step'],
                enabledWorkflows: []
            })
            expect(stepOnly).toContain(
                'step lists only the registers that are not zero, plus the even half of a live MIPS double pair, and skips a row that holds nothing'
            )
        })

        //undo returns registerFiles like step does, so an allow list holding only undo still needs
        //the tip that says what its listing leaves out
        it('renders the tip for an allow list that only undoes', () => {
            const prompt = buildDefaultCodingAgentPrompt({
                enabledToolNames: ['undo'],
                enabledWorkflows: []
            })
            expect(prompt).toContain('undo lists only the registers that are not zero')
        })

        it('tells the prompt what a row that holds nothing reads as', () => {
            const prompt = buildDefaultCodingAgentPrompt({
                enabledToolNames: ['get_emulator_state'],
                enabledWorkflows: []
            })
            expect(prompt).toContain('where a row that holds nothing reads empty')
        })

        it('reports no files for an emulator that publishes none at all', async () => {
            const { context } = createTestContext({ 'main.s': 'nop' })
            const tools = createDefaultCodingAgentTools(context)

            const result = (await tools.get_emulator_state.execute(
                {}
            )) as unknown as ToolExecutionResult
            expect(result.registerFiles).toEqual([])
        })
    })
})
