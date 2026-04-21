<script lang="ts" module>
    export const SUPPORTED_LANGUAGES = ['M68K', 'MIPS', 'X86', 'RISC-V', 'RISC-V-64'] as const
    export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]
</script>

<script lang="ts">
    import AiAgent from '$cmp/shared/agent/AiAgent.svelte'
    import { ThemeStore } from '$stores/themeStore.svelte'
    import { tool } from '@discerns/sdk'
    import { z } from 'zod'
    import type { Emulator } from '$lib/languages/Emulator'
    import { RegisterSize } from '$lib/languages/commonLanguageFeatures.svelte'
    import { delay } from '$lib/utils'
    import { BASE_CODE } from '$lib/Config'
    import type { RegisteredTool } from '@discerns/sdk'

    interface Props {
        editorLanguage: SupportedLanguage | null
        editorCode: string
        emulatorInstance: Emulator | null
        style?: string
        canUpdateLanguage?: boolean
        additionalInstructions?: string
        tools?: RegisteredTool[]
    }

    let {
        editorLanguage = $bindable(),
        editorCode = $bindable(),
        emulatorInstance,
        style,
        canUpdateLanguage = true,
        additionalInstructions = '',
        tools: externalTools = []
    }: Props = $props()

    let accent = $derived(ThemeStore.get('accent').color)

    function createSetCodeTool(withLanguage: boolean) {
        if (withLanguage) {
            return tool({
                name: 'set_code',
                description:
                    'Creates or updates the code editor with the given code and assembly language. Returns any compilation errors after setting the code.',
                schema: z.object({
                    language: z
                        .enum(SUPPORTED_LANGUAGES)
                        .describe('The assembly language for the editor'),
                    code: z.string().describe('The code to set in the editor')
                }),
                execute: async ({ language, code }) => {
                    const languageChanged = editorLanguage !== language
                    editorLanguage = language
                    editorCode = code
                    if (languageChanged) {
                        await delay(2000) // Wait for the emulator to load the new language
                    }
                    if (emulatorInstance) {
                        emulatorInstance.setCode(code)
                        const errors = await emulatorInstance.check()
                        if (errors.length > 0) {
                            return $state.snapshot({
                                success: false,
                                errors: [...errors.map((e) => e.formatted), ...emulatorInstance.errors]
                            })
                        }
                    }
                    return { success: true, language, codeLength: code.length }
                }
            })
        }
        return tool({
            name: 'set_code',
            description:
                'Creates or updates the code editor with the given code. Returns any compilation errors after setting the code.',
            schema: z.object({
                code: z.string().describe('The code to set in the editor')
            }),
            execute: async ({ code }) => {
                editorCode = code
                if (emulatorInstance) {
                    emulatorInstance.setCode(code)
                    const errors = await emulatorInstance.check()
                    if (errors.length > 0) {
                        return $state.snapshot({
                            success: false,
                            errors: [...errors.map((e) => e.formatted), ...emulatorInstance.errors]
                        })
                    }
                }
                return { success: true, language: editorLanguage, codeLength: code.length }
            }
        })
    }

    function fmtAddr(value: bigint | number) {
        return `decimal: ${String(value)} hex: 0x${value.toString(16)}`
    }

    const SIZE_NAMES = {
        [RegisterSize.Byte]: 'Byte',
        [RegisterSize.Word]: 'Word',
        [RegisterSize.Long]: 'Long',
        [RegisterSize.Double]: 'Double'
    } satisfies Record<RegisterSize, string>

    function fmtSize(size: RegisterSize) {
        return SIZE_NAMES[size] ?? String(size)
    }

    function fmtLine(lineIndex: number) {
        const lineNumber = lineIndex + 1
        const lines = editorCode.split('\n')
        const lineText = lineNumber <= lines.length ? lines[lineNumber - 1] : null
        return { lineNumber, lineText, line: `${lineNumber} | ${lineText ?? ''}` }
    }

    function formatLatestSteps(emulator: Emulator, max = 10) {
        return emulator.latestSteps.slice(-max).map((step) => ({
            line: fmtLine(step.line).line,
            pc: step.pc,
            mutations: step.mutations.map((m) => {
                switch (m.type) {
                    case 'WriteRegister':
                        return {
                            type: m.type,
                            register: m.value.register,
                            old: fmtAddr(m.value.old),
                            size: fmtSize(m.value.size)
                        }
                    case 'WriteMemory':
                        return {
                            type: m.type,
                            address: fmtAddr(m.value.address),
                            old: fmtAddr(m.value.old),
                            size: fmtSize(m.value.size)
                        }
                    case 'WriteMemoryBytes':
                        return {
                            type: m.type,
                            address: fmtAddr(m.value.address),
                            old: m.value.old
                        }
                    case 'PushCallStack':
                    case 'PopCallStack':
                        return {
                            type: m.type,
                            from: fmtAddr(m.value.from),
                            to: fmtAddr(m.value.to)
                        }
                    case 'Other':
                        return { type: m.type, value: m.value }
                }
            })
        }))
    }

    let allTools = $derived([
        createSetCodeTool(canUpdateLanguage),
        tool({
            name: 'get_code',
            description:
                'Returns the current code and language in the editor. Each line is prefixed with its 1-based line number and a "B" marker if a breakpoint is set on that line.',
            schema: z.object({}),
            execute: async () => {
                const breakpoints = new Set(emulatorInstance?.breakpoints ?? [])
                const lines = editorCode.split('\n').map((text, i) => {
                    const bp = breakpoints.has(i) ? ' B' : ' '
                    return `${String(i + 1).padStart(4)}${bp} | ${text}`
                })
                return {
                    language: editorLanguage,
                    code: lines.join('\n')
                }
            }
        }),
        tool({
            name: 'get_emulator_state',
            description:
                'Returns the current emulator execution state including registers, memory, errors, flags, and call stack.',
            schema: z.object({}),
            execute: async () => {
                if (!emulatorInstance) {
                    await delay(2000)
                    return { errors: ['Emulator not loaded yet'] }
                }
                await emulatorInstance.check()

                return $state.snapshot({
                    errors: [
                        ...emulatorInstance.compilerErrors.map((e) => e.formatted),
                        ...emulatorInstance.errors
                    ],
                    terminated: emulatorInstance.terminated,
                    currentInterrupt: emulatorInstance.interrupt,
                    stdOut: emulatorInstance.stdOut,
                    breakpoints: emulatorInstance.breakpoints.map((b: number) => b + 1),
                    canExecute: emulatorInstance.canExecute,
                    canUndo: emulatorInstance.canUndo,
                    callStack: emulatorInstance.callStack.map((frame) => ({
                        address: fmtAddr(frame.address),
                        name: frame.name,
                        line: frame.line + 1,
                        color: frame.color,
                        destinationAddress: fmtAddr(frame.address),
                        stackPointer: fmtAddr(frame.sp)
                    })),
                    currentLine: fmtLine(emulatorInstance.line).line,
                    stackPointer: fmtAddr(emulatorInstance.sp),
                    programCounter: fmtAddr(emulatorInstance.pc),
                    statusRegisters: emulatorInstance.statusRegisters,
                    registers: emulatorInstance.registers.map((r) => ({
                        name: r.name,
                        value: fmtAddr(r.value)
                    })),
                    latestSteps: formatLatestSteps(emulatorInstance)
                })
            }
        }),
        tool({
            name: 'step',
            description:
                'Steps the emulator forward by a given number of instructions. Returns the emulator state after stepping.',
            schema: z.object({
                steps: z
                    .number()
                    .int()
                    .min(1)
                    .optional()
                    .describe('Number of steps to execute (default: 1)')
            }),
            execute: async ({ steps = 1 }) => {
                if (!emulatorInstance) {
                    return { success: false, error: 'Emulator not loaded yet' }
                }
                if (!emulatorInstance.canExecute) {
                    return {
                        success: false,
                        error: 'Cannot execute. Code may not be compiled or program has terminated.'
                    }
                }
                if (emulatorInstance.terminated) {
                    return { success: false, error: 'Program has already terminated.' }
                }
                if (emulatorInstance.interrupt !== undefined) {
                    return { success: false, error: 'Emulator is paused on an interrupt.' }
                }
                let terminated = false
                for (let i = 0; i < steps && !terminated; i++) {
                    terminated = await emulatorInstance.step()
                }
                return $state.snapshot({
                    success: true,
                    terminated,
                    currentLine: fmtLine(emulatorInstance.line).line,
                    programCounter: fmtAddr(emulatorInstance.pc),
                    stackPointer: fmtAddr(emulatorInstance.sp),
                    registers: emulatorInstance.registers.map((r) => ({
                        name: r.name,
                        value: fmtAddr(r.value)
                    })),
                    statusRegisters: emulatorInstance.statusRegisters,
                    stdOut: emulatorInstance.stdOut,
                    latestSteps: formatLatestSteps(emulatorInstance)
                })
            }
        }),
        tool({
            name: 'run_to_completion',
            description:
                'Runs the program until it terminates or hits a breakpoint. You MUST compile the code first (use the compile tool). Returns the final emulator state.',
            schema: z.object({}),
            execute: async () => {
                if (!emulatorInstance) {
                    return { success: false, error: 'Emulator not loaded yet' }
                }
                if (!emulatorInstance.canExecute) {
                    return {
                        success: false,
                        error: 'Cannot execute. Code may not be compiled or program has terminated.'
                    }
                }
                if (emulatorInstance.terminated) {
                    return { success: false, error: 'Program has already terminated.' }
                }
                if (emulatorInstance.interrupt !== undefined) {
                    return { success: false, error: 'Emulator is paused on an interrupt.' }
                }
                const status = await emulatorInstance.run(1000000)
                return $state.snapshot({
                    success: true,
                    status,
                    terminated: emulatorInstance.terminated,
                    currentLine: fmtLine(emulatorInstance.line).line,
                    programCounter: fmtAddr(emulatorInstance.pc),
                    stackPointer: fmtAddr(emulatorInstance.sp),
                    registers: emulatorInstance.registers.map((r) => ({
                        name: r.name,
                        value: fmtAddr(r.value)
                    })),
                    statusRegisters: emulatorInstance.statusRegisters,
                    stdOut: emulatorInstance.stdOut,
                    latestSteps: formatLatestSteps(emulatorInstance)
                })
            }
        }),
        tool({
            name: 'undo',
            description:
                'Undoes the last execution step(s). Use this to step backwards through execution. Requires the program to have been compiled and stepped at least once.',
            schema: z.object({
                steps: z
                    .number()
                    .int()
                    .min(1)
                    .max(100)
                    .optional()
                    .describe('Number of steps to undo (default: 1)')
            }),
            execute: async ({ steps = 1 }) => {
                if (!emulatorInstance) {
                    return { success: false, error: 'Emulator not loaded yet' }
                }
                if (!emulatorInstance.canExecute) {
                    return { success: false, error: 'Cannot undo. Code may not be compiled.' }
                }
                if (emulatorInstance.terminated) {
                    return { success: false, error: 'Program has terminated. Recompile to restart.' }
                }
                if (emulatorInstance.interrupt !== undefined) {
                    return { success: false, error: 'Emulator is paused on an interrupt.' }
                }
                if (!emulatorInstance.canUndo) {
                    return { success: false, error: 'No execution history to undo.' }
                }
                emulatorInstance.undo(steps)
                return $state.snapshot({
                    success: true,
                    currentLine: fmtLine(emulatorInstance.line).line,
                    programCounter: fmtAddr(emulatorInstance.pc),
                    stackPointer: fmtAddr(emulatorInstance.sp),
                    registers: emulatorInstance.registers.map((r) => ({
                        name: r.name,
                        value: fmtAddr(r.value)
                    })),
                    statusRegisters: emulatorInstance.statusRegisters,
                    canUndo: emulatorInstance.canUndo,
                    latestSteps: formatLatestSteps(emulatorInstance)
                })
            }
        }),
        tool({
            name: 'update_breakpoints',
            description:
                'Adds and/or removes breakpoints on the given 1-based line numbers. Both fields are optional but at least one must be provided.',
            schema: z.object({
                add: z
                    .array(z.number().int().min(1))
                    .optional()
                    .describe('1-based line numbers to add breakpoints on'),
                remove: z
                    .array(z.number().int().min(1))
                    .optional()
                    .describe('1-based line numbers to remove breakpoints from')
            }),
            execute: async ({ add = [], remove = [] }) => {
                if (!emulatorInstance) {
                    return { success: false, error: 'Emulator not loaded yet' }
                }
                const current = new Set(emulatorInstance.breakpoints)
                for (const line of add) {
                    const idx = line - 1
                    if (!current.has(idx)) {
                        emulatorInstance.toggleBreakpoint(idx)
                    }
                }
                for (const line of remove) {
                    const idx = line - 1
                    if (current.has(idx)) {
                        emulatorInstance.toggleBreakpoint(idx)
                    }
                }
                return $state.snapshot({ success: true, breakpoints: emulatorInstance.breakpoints.map((b: number) => b + 1) })
            }
        }),
        tool({
            name: 'get_line_from_address',
            description:
                'Returns the source line number corresponding to a given memory address. Useful for mapping program counter values back to source code.',
            schema: z.object({
                address: z.string().describe('Hex string of the address (e.g. "0x1000" or "1000")')
            }),
            execute: async ({ address }) => {
                if (!emulatorInstance) {
                    return { success: false, error: 'Emulator not loaded yet' }
                }
                const addr = BigInt(address.startsWith('0x') ? address : `0x${address}`)
                const lineIndex = emulatorInstance.getLineFromAddress(addr)
                const line = lineIndex != null && lineIndex >= 0 ? fmtLine(lineIndex).line : null
                return $state.snapshot({ success: true, address: `0x${addr.toString(16)}`, line })
            }
        }),
        tool({
            name: 'compile',
            description: 'Compiles the current code in the editor. Returns any compilation errors.',
            schema: z.object({}),
            execute: async () => {
                if (!emulatorInstance) {
                    return { success: false, error: 'Emulator not loaded yet' }
                }
                await emulatorInstance.compile(100)
                const errors = [
                    ...emulatorInstance.compilerErrors.map((e) => e.formatted),
                    ...emulatorInstance.errors
                ]
                return $state.snapshot({
                    success: errors.length === 0,
                    errors,
                    canExecute: emulatorInstance.canExecute
                })
            }
        }),
        tool({
            name: 'read_memory',
            description:
                'Reads a region of memory from the emulator. Returns the bytes as a hex string.',
            schema: z.object({
                address: z
                    .string()
                    .describe('Hex string of the start address (e.g. "0x1000" or "1000")'),
                length: z.number().int().min(1).max(1024).describe('Number of bytes to read')
            }),
            execute: async ({ address, length }) => {
                if (!emulatorInstance) {
                    return { success: false, error: 'Emulator not loaded yet' }
                }
                const addr = BigInt(address.startsWith('0x') ? address : `0x${address}`)
                const bytes = emulatorInstance.readMemoryBytes(addr, length)
                const hex = Array.from(bytes)
                    .map((b) => b.toString(16).padStart(2, '0'))
                    .join(' ')
                return $state.snapshot({
                    success: true,
                    address: `0x${addr.toString(16)}`,
                    length,
                    hex
                })
            }
        }),
        ...externalTools
    ])

    const initialCodes = Object.entries(BASE_CODE)
        .map(([lang, code]) => `#${lang}\n\`\`\`${lang}\n${code}\n\`\`\``)
        .join('\n\n')

    let avatarInstructions = $derived(`You are an assembly language assistant with access to an interactive code editor and emulator.

# Tools

## set_code tool
Use this tool to create or update the code editor with assembly code. Call it whenever you want to show the user a code example, answer a coding question, or demonstrate a concept.${canUpdateLanguage ? '\n- Always set the correct language matching the code you are writing.' : ''}
- Prefer updating the existing editor code rather than describing code in text when possible.
- Writing code in a markdown code block does NOT update the editor. Never say you wrote, pasted, or updated code in the editor unless you actually called set_code successfully. If you choose not to call set_code, make it clear that the code is only shown in the chat.
- This returns any type errors.

## get_code tool
Returns the current code and language in the editor. Use this when you need to read or reference the source code (e.g. the user says "this code" or "fix this").
The tool will return the full code currently in the editor, for each line, it will also return the line number (1-based) and if there is a breakpoint on that line (will have a B next to it).

## get_emulator_state tool
Returns the full emulator execution state. Use this to inspect registers, flags, call stack, breakpoints, errors, and execution status. Call this after stepping or running to see the result.

Returned fields:
- errors: Array of compilation/assembler error messages.
- terminated: Whether the program has finished executing.
- currentInterrupt: If the program is paused at an interrupt, describes which one.
- stdOut: The standard output produced by the program so far.
- breakpoints: Array of line numbers where breakpoints are set.
- canExecute: Whether the program can be executed/stepped.
- canUndo: Whether the last execution step can be undone (stepped back).
- callStack: Array of stack frames showing the current call hierarchy, each with address, name, line, destinationAddress, and stackPointer.
- currentLine: The formatted source line (line number and text) the program counter is currently pointing to during execution.
- stackPointer: The current value of the stack pointer register.
- programCounter: The current value of the program counter register.
- statusRegisters: The current state of CPU status/flag registers
- registers: List of all CPU registers with their name and decimal/hex value.
- latestSteps: The last 10 execution steps, each containing the source line number and a list of mutations (register writes, memory writes, call stack pushes/pops) showing what that instruction changed.

## compile tool
Compiles the current code in the editor. Returns any compilation errors. Use this after modifying code via set_code if you need to recompile, or to check for errors without running.

## step tool
Steps the emulator forward by a given number of instructions (default 1). Use this for single-stepping through code or executing a few instructions at a time. Returns the state after stepping, including whether the program terminated.

## run_to_completion tool
Runs the program until it terminates or hits a breakpoint. You MUST compile the code first (use the compile tool). Use this when the user wants to execute the entire program. Returns the final state.

## undo tool
Undoes the last execution step(s), stepping backwards through execution. Only works when the program has been compiled, is not terminated, has no active interrupt, and has execution history to undo. Only the latest 100 steps are stored in history. 

## update_breakpoints tool
Adds and/or removes breakpoints on the given 1-based line numbers. Accepts two optional arrays: \`add\` (lines to add breakpoints on) and \`remove\` (lines to remove breakpoints from). Returns the updated breakpoint list.

## get_line_from_address tool
Maps a hex memory address to a source line. Useful for understanding which instruction the program counter or a call stack address corresponds to.

## read_memory tool
Reads a region of memory starting at a hex address for a given number of bytes (max 1024). Returns the bytes as a hex string. Useful for inspecting data sections, the stack, or memory-mapped values.

# Guidelines
When starting new code, use those templates as a base for each language (except the initial example instruction):
${initialCodes}

# Emulators information
- The M68K emulator uses the Easy68K syntax, it stops running automatically once execution reaches the bottom of the code and does not support self-modifying code (modifying code while it's running) since it interprets the code separately from the runtime. There is no END START directive in this M68K syntax. END: is just a normal label name that is often placed near the bottom of the code. To terminate a program, jump to the bottom of the code (often by jumping to that label) or just fall through to it. SIMHALT does not exist in M68K. The memory is big endian
- The M68K emulator implements the basic syscalls for input/output, search the trap instruction for more info. 
- The MIPS emulator is the same emulator in the MARS MIPS emulator and uses the same syntax and system calls. The memory is little endian
- The RISC-V emulator is the same emulator in the RARS RISC-V emulator and uses the same syntax and system calls. It supports both 32-bit and 64-bit RISC-V code. The "RISC-V" language is 32 bits, the "RISC-V-64" language is 64 bits. The memory is little endian
- The X86 emulator is highly experimental and has many bugs and doesn't have many features. Dont suggest x86 unless explicitly asked, and warn the user that the emulator is not finalised.
# Editor and environment information 
- The editor is running in a browser, the UI is the same for every emulator. The UI Shows a coding editor, a section to see registers and their values, a section to show status registers (if the environment has them), a memory viewer which shows a section of the memory (has a base address and then shows the bytes in that page, usually it is the next 256 bytes. An output only console, NO graphics and NO screens.
- The emulator can call I/O operations to print/read characters, integers etc... and many syscalls are implemented for the different emulators.
- There is only one assembly coding file available to edit and no binaries are created. No roms can be imported or executed, only textual code.
${additionalInstructions ? `\n${additionalInstructions}` : ''}
`)
</script>

<AiAgent
    tools={allTools}
    theme="dark"
    {accent}
    avatarContext={avatarInstructions}
    style={`width: 100%;
            border-radius: 1.2rem;
            border: solid 1px var(--tertiary);
            height: 100%; 
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            ${style}
    `}
/>
