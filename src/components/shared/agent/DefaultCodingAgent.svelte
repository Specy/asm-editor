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

    let allTools = $derived([
        createSetCodeTool(canUpdateLanguage),
        tool({
            name: 'get_code',
            description: 'Returns the current code and language in the editor.',
            schema: z.object({}),
            execute: async () => {
                return {
                    language: editorLanguage,
                    code: editorCode
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
                    breakpoints: emulatorInstance.breakpoints,
                    canExecute: emulatorInstance.canExecute,
                    canUndo: emulatorInstance.canUndo,
                    callStack: emulatorInstance.callStack.map((frame) => ({
                        address: `decimal: ${String(frame.address)} hex: 0x${frame.address.toString(16)}`,
                        name: frame.name,
                        line: frame.line,
                        color: frame.color,
                        destinationAddress: `decimal: ${String(frame.address)} hex: 0x${frame.address.toString(16)}`,
                        stackPointer: `decimal: ${String(frame.sp)} hex: 0x${frame.sp.toString(16)}`
                    })),
                    currentLineNumber: emulatorInstance.line,
                    stackPointer: `decimal: ${String(emulatorInstance.sp)} hex: 0x${emulatorInstance.sp.toString(16)}`,
                    programCounter: `decimal: ${String(emulatorInstance.pc)} hex: 0x${emulatorInstance.pc.toString(16)}`,
                    statusRegisters: emulatorInstance.statusRegisters,
                    registers: emulatorInstance.registers.map((r) => ({
                        name: r.name,
                        value: `decimal: ${String(r.value)} hex: 0x${r.value.toString(16)}`
                    }))
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
                let terminated = false
                for (let i = 0; i < steps && !terminated; i++) {
                    terminated = await emulatorInstance.step()
                }
                return $state.snapshot({
                    success: true,
                    terminated,
                    currentLineNumber: emulatorInstance.line,
                    programCounter: `decimal: ${String(emulatorInstance.pc)} hex: 0x${emulatorInstance.pc.toString(16)}`,
                    stackPointer: `decimal: ${String(emulatorInstance.sp)} hex: 0x${emulatorInstance.sp.toString(16)}`,
                    registers: emulatorInstance.registers.map((r) => ({
                        name: r.name,
                        value: `decimal: ${String(r.value)} hex: 0x${r.value.toString(16)}`
                    })),
                    statusRegisters: emulatorInstance.statusRegisters,
                    stdOut: emulatorInstance.stdOut
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
                const status = await emulatorInstance.run(1000000)
                return $state.snapshot({
                    success: true,
                    status,
                    terminated: emulatorInstance.terminated,
                    currentLineNumber: emulatorInstance.line,
                    programCounter: `decimal: ${String(emulatorInstance.pc)} hex: 0x${emulatorInstance.pc.toString(16)}`,
                    stackPointer: `decimal: ${String(emulatorInstance.sp)} hex: 0x${emulatorInstance.sp.toString(16)}`,
                    registers: emulatorInstance.registers.map((r) => ({
                        name: r.name,
                        value: `decimal: ${String(r.value)} hex: 0x${r.value.toString(16)}`
                    })),
                    statusRegisters: emulatorInstance.statusRegisters,
                    stdOut: emulatorInstance.stdOut
                })
            }
        }),
        tool({
            name: 'toggle_breakpoint',
            description:
                'Toggles a breakpoint on the given line index. If a breakpoint exists on that line it is removed, otherwise it is added.',
            schema: z.object({
                lineIndex: z
                    .number()
                    .int()
                    .min(0)
                    .describe('The 0-based line index to toggle the breakpoint on')
            }),
            execute: async ({ lineIndex }) => {
                if (!emulatorInstance) {
                    return { success: false, error: 'Emulator not loaded yet' }
                }
                emulatorInstance.toggleBreakpoint(lineIndex)
                return $state.snapshot({ success: true, breakpoints: emulatorInstance.breakpoints })
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
                const line = emulatorInstance.getLineFromAddress(addr)
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
                await emulatorInstance.compile(20)
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

## Tools

### set_code tool
Use this tool to create or update the code editor with assembly code. Call it whenever you want to show the user a code example, answer a coding question, or demonstrate a concept.${canUpdateLanguage ? '\n- Always set the correct language matching the code you are writing.' : ''}
- Prefer updating the existing editor code rather than describing code in text when possible.
- This returns any type errors.

### get_code tool
Returns the current code and language in the editor. Use this when you need to read or reference the source code (e.g. the user says "this code" or "fix this").

### get_emulator_state tool
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
- currentLineNumber: The line number the program counter is currently pointing to during execution.
- stackPointer: The current value of the stack pointer register.
- programCounter: The current value of the program counter register.
- statusRegisters: The current state of CPU status/flag registers
- registers: List of all CPU registers with their name and decimal/hex value.

### compile tool
Compiles the current code in the editor. Returns any compilation errors. Use this after modifying code via set_code if you need to recompile, or to check for errors without running.

### step tool
Steps the emulator forward by a given number of instructions (default 1). Use this for single-stepping through code or executing a few instructions at a time. Returns the state after stepping, including whether the program terminated.

### run_to_completion tool
Runs the program until it terminates or hits a breakpoint. You MUST compile the code first (use the compile tool). Use this when the user wants to execute the entire program. Returns the final state.

### toggle_breakpoint tool
Toggles a breakpoint on a given 0-based line index. If a breakpoint already exists on that line it is removed, otherwise it is added. Returns the updated breakpoint list.

### get_line_from_address tool
Maps a hex memory address to a source line number. Useful for understanding which instruction the program counter or a call stack address corresponds to.

### read_memory tool
Reads a region of memory starting at a hex address for a given number of bytes (max 1024). Returns the bytes as a hex string. Useful for inspecting data sections, the stack, or memory-mapped values.

# Guidelines
When starting new code, use those templates as a base for each language (except the initial example instruction):
${initialCodes}
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
