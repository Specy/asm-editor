<script lang="ts" module>
    export const SUPPORTED_LANGUAGES = ['M68K', 'MIPS', 'X86', 'RISC-V', 'RISC-V-64'] as const
    export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]
    export const DEFAULT_CODING_AGENT_TOOL_NAMES = [
        'set_code',
        'get_code',
        'get_emulator_state',
        'step',
        'run_to_completion',
        'undo',
        'update_breakpoints',
        'get_line_from_address',
        'compile',
        'read_memory'
    ] as const
    export type DefaultCodingAgentToolName = (typeof DEFAULT_CODING_AGENT_TOOL_NAMES)[number]
    export type AgentToolAllowList = 'all' | DefaultCodingAgentToolName[]

    export const DEFAULT_CODING_AGENT_WORKFLOW_NAMES = [
        'debug_broken_code',
        'write_new_code_from_scratch',
        'modify_or_extend_existing_code',
        'diagnose_runtime_errors_or_interrupts'
    ] as const
    export type DefaultCodingAgentWorkflowName =
        (typeof DEFAULT_CODING_AGENT_WORKFLOW_NAMES)[number]
    export type AgentWorkflowAllowList = 'all' | DefaultCodingAgentWorkflowName[]

    export type AgentWorkflow = {
        name: string
        description: string
    }
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
        workflows?: AgentWorkflow[]
        allowToolList?: AgentToolAllowList
        allowWorkflowList?: AgentWorkflowAllowList
    }

    let {
        editorLanguage = $bindable(),
        editorCode = $bindable(),
        emulatorInstance,
        style,
        canUpdateLanguage = true,
        additionalInstructions = '',
        tools: externalTools = [],
        workflows = [],
        allowToolList = 'all',
        allowWorkflowList = 'all'
    }: Props = $props()

    let accent = $derived(ThemeStore.get('accent').color)

    function createSetCodeTool(withLanguage: boolean) {
        if (withLanguage) {
            return tool({
                name: 'set_code',
                description: `Creates or updates the code editor with the given code and assembly language.
Use this whenever you want to show the user a code example, answer a coding question, or demonstrate a concept.
- Always set the correct language matching the code you are writing.
- Prefer updating the existing editor code rather than only describing code in chat when possible.
- Writing code in a markdown code block does NOT update the editor. Never claim the editor changed unless this tool succeeded.
- Returns any compilation errors after setting the code.`,
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
            description: `Creates or updates the code editor with the given code.
Use this whenever you want to show the user a code example, answer a coding question, or demonstrate a concept.
- Prefer updating the existing editor code rather than only describing code in chat when possible.
- Writing code in a markdown code block does NOT update the editor. Never claim the editor changed unless this tool succeeded.
- Returns any compilation errors after setting the code.`,
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

    function allowListAllows<T extends string>(allowList: 'all' | T[], name: T) {
        return allowList === 'all' || allowList.includes(name)
    }

    const defaultToolFactories = $derived.by(() => {
        return {
            set_code: createSetCodeTool(canUpdateLanguage),
            get_code: tool({
            name: 'get_code',
            description: `Returns the current code and language in the editor.
Use this when you need to read or reference the source code, for example when the user says "this code" or asks to fix something already in the editor.
Each line is prefixed with its 1-based line number and a "B" marker if a breakpoint is set on that line.`,
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
            get_emulator_state: tool({
            name: 'get_emulator_state',
            description: `Returns the full emulator execution state.
Use this to inspect registers, flags, call stack, breakpoints, errors, and execution status. Call it after stepping or running to inspect the result.
Returned fields:
- errors: compilation or runtime error messages.
- terminated: whether the program has finished executing.
- currentInterrupt: the active interrupt if execution is paused on one.
- stdOut: program output produced so far.
- breakpoints: 1-based lines with active breakpoints.
- canExecute: whether the program can be executed or stepped.
- canUndo: whether the last execution step can be undone.
- callStack: stack frames with address, name, line, destinationAddress, and stackPointer.
- currentLine: the formatted source line currently pointed to by the program counter.
- stackPointer: the current stack pointer value.
- programCounter: the current program counter value.
- statusRegisters: the current CPU status or flag registers.
- registers: all CPU registers with their decimal and hex values.
- latestSteps: the last 10 execution steps and their mutations.`,
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
            step: tool({
            name: 'step',
            description:
                'Steps the emulator forward by a given number of instructions (default 1). Use this for single-stepping or executing a few instructions at a time. Returns the emulator state after stepping, including whether the program terminated.',
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
            run_to_completion: tool({
            name: 'run_to_completion',
            description:
                'Runs the program until it terminates or hits a breakpoint. You MUST compile the code first by using the compile tool. Use this when the user wants to execute the entire program. Returns the final emulator state.',
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
            undo: tool({
            name: 'undo',
            description:
                'Undoes the last execution step(s), stepping backwards through execution. Only works when the program has been compiled, is not terminated, has no active interrupt, and has execution history to undo. Only the latest 100 steps are stored in history.',
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
            update_breakpoints: tool({
            name: 'update_breakpoints',
            description:
                'Adds and/or removes breakpoints on the given 1-based line numbers. Accepts two optional arrays: add for lines to add breakpoints on and remove for lines to remove breakpoints from. Returns the updated breakpoint list.',
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
            get_line_from_address: tool({
            name: 'get_line_from_address',
            description:
                'Returns the source line number corresponding to a given memory address. Use this to understand which instruction a program counter value or call stack address maps back to.',
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
            compile: tool({
            name: 'compile',
            description: allowListAllows(allowToolList, 'set_code')
                ? 'Compiles the current code in the editor. Use this after modifying code via set_code if you need to recompile, or when you want to check for errors without running. Returns any compilation errors and whether the program can execute.'
                : 'Compiles the current code in the editor. Use this when you want to check for assembler errors without running. Returns any compilation errors and whether the program can execute.',
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
            read_memory: tool({
            name: 'read_memory',
            description:
                'Reads a region of memory starting at a hex address for a given number of bytes, up to 1024. Returns the bytes as a hex string. Use this to inspect data sections, the stack, or memory-mapped values.',
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
        })
        } satisfies Record<DefaultCodingAgentToolName, RegisteredTool>
    })

    const enabledDefaultToolNames = $derived.by(() =>
        DEFAULT_CODING_AGENT_TOOL_NAMES.filter((name) => allowListAllows(allowToolList, name))
    )
    const allTools = $derived([
        ...enabledDefaultToolNames.map((name) => defaultToolFactories[name]),
        ...externalTools
    ])
    const hasSetCodeTool = $derived(enabledDefaultToolNames.includes('set_code'))
    const hasStepTool = $derived(enabledDefaultToolNames.includes('step'))
    const hasRunTool = $derived(enabledDefaultToolNames.includes('run_to_completion'))
    const hasUpdateBreakpointsTool = $derived(enabledDefaultToolNames.includes('update_breakpoints'))
    const hasReadMemoryTool = $derived(enabledDefaultToolNames.includes('read_memory'))
    const hasGetLineFromAddressTool = $derived(
        enabledDefaultToolNames.includes('get_line_from_address')
    )
    const hasCompileTool = $derived(enabledDefaultToolNames.includes('compile'))

    const initialCodes = Object.entries(BASE_CODE)
        .map(([lang, code]) => `\`\`\`${lang}\n${code}\n\`\`\``)
        .join('\n\n')

    const defaultWorkflowDefinitions = {
        debug_broken_code: {
            name: 'Debug broken code',
            description: `
When the user says something isn't working, produces the wrong result, crashes, or behaves unexpectedly.
1. \`get_code\` to read what's actually in the editor right now.
2. \`compile\` (or inspect errors from \`get_emulator_state\`). If there are compile errors, fix them first via \`set_code\` and stop here if that resolves the issue.
3. Form a concrete hypothesis about which line or region is wrong. State it briefly.
4. \`update_breakpoints\` with \`add\` on the line(s) just before or inside the suspected region.
5. \`run_to_completion\` to execute up to the breakpoint.
6. \`get_emulator_state\` / \`read_memory\` to inspect registers, flags, stack, stdout.
7. \`step\` through the region, re-reading state after each step (or every few steps). Use \`latestSteps\` from the return value to see what mutated.
8. If you overshoot an interesting point, \`undo\` and re-observe.
9. Report the bug grounded in the **observed** values, not speculation. Then apply a fix via \`set_code\` and re-verify as in *Write new code from scratch* from step 3 onward.
`
        },
        write_new_code_from_scratch: {
            name: 'Write new code from scratch',
            description: `
When the user asks for a new program or snippet and the editor is empty or the user explicitly wants a fresh program.
1. Confirm or pick the assembly language. Start from the template in \`<templates>\` below.
2. \`set_code\` with the full program. Fix any compile errors it returns.
3. If the program is non-trivial (has branches, loops, arithmetic, I/O, or a specific expected output), \`run_to_completion\` and check stdout / registers against the expected result.
4. If the result is wrong, switch to the *Debug broken code* workflow.
`
        },
        modify_or_extend_existing_code: {
            name: 'Modify or extend existing code',
            description: `
When the user asks to add, change, or refactor something in the current editor.
1. \`get_code\` first — always.
2. Produce the minimal change: keep the user's structure, labels, comments, and unrelated code intact. Call \`set_code\` with the full updated program.
3. If behavior (not just syntax) changed, verify as in *Write new code from scratch* step 3.
`
        },
        diagnose_runtime_errors_or_interrupts: {
            name: 'Diagnose runtime errors or interrupts',
            description: `
When execution has errored, terminated unexpectedly, or is paused on an interrupt.
1. \`get_emulator_state\` to see \`errors\`, \`terminated\`, \`currentInterrupt\`, \`callStack\`, \`latestSteps\`.
2. If \`currentInterrupt\` is set, explain what the emulator is waiting for (usually I/O) and how to resolve it.
3. If the program terminated or errored unexpectedly, use \`latestSteps\` and \`callStack\` to locate the cause. Use \`get_line_from_address\` to map \`pc\` or stack frame addresses back to source lines.
4. Once you have a concrete suspect, fall back to the *Debug broken code* workflow from step 3.
`
        }
    } satisfies Record<DefaultCodingAgentWorkflowName, AgentWorkflow>

    const enabledWorkflows = $derived.by(() => [
        ...DEFAULT_CODING_AGENT_WORKFLOW_NAMES.filter((name) =>
            allowListAllows(allowWorkflowList, name)
        ).map((name) => defaultWorkflowDefinitions[name]),
        ...workflows
    ])

    const workflowInstructions = $derived(
        enabledWorkflows.length === 0
            ? 'No built-in workflow is active for this context. Use the available tools and context-specific instructions.'
            : enabledWorkflows.map((w) => `## ${w.name}\n${w.description.trim()}`).join('\n\n')
    )

    const setCodeCoreInstructions = $derived(
        hasSetCodeTool
            ? `- **Syntactic vs semantic verification.** \`set_code\` already reports compile errors, so after it succeeds the code is syntactically valid. You do NOT need to re-run \`compile\` for that. If correctness of the logic matters (branches, loops, arithmetic, I/O, anything the user cares about behaviorally), also \`run_to_completion\` or \`step\` and verify the resulting registers / stdout / memory match the expected result.
- **Preserve user work.** Before editing existing code, call \`get_code\` to read it. Never wholesale-replace the editor contents unless the user explicitly asks for a rewrite.`
            : `- **Read-only code context.** You cannot edit the editor in this context. Analyze the current code and give suggested changes in chat only.`
    )

    const breakpointCoreInstructions = $derived(
        hasUpdateBreakpointsTool
            ? `- **Breakpoints are inspection points.** Add them with \`update_breakpoints\` when you need to pause at a specific line.`
            : ''
    )

    const toolSelectionTips = $derived.by(() =>
        [
            hasStepTool && hasRunTool
                ? '- `step` and `run_to_completion` already return registers, pc, sp, status registers, stdout, and `latestSteps` — **do not** immediately follow them with `get_emulator_state` unless you specifically need `callStack`, `breakpoints`, `canUndo`, or `currentInterrupt`.'
                : '',
            hasReadMemoryTool
                ? '- Use `read_memory` only when registers alone don\'t explain the state (inspecting the stack, arrays, or data sections).'
                : '',
            hasRunTool && hasUpdateBreakpointsTool
                ? '- `run_to_completion` respects breakpoints, so combine it with `update_breakpoints` to fast-forward to an interesting point instead of stepping one-by-one.'
                : '',
            hasStepTool && enabledDefaultToolNames.includes('undo')
                ? '- `undo` + `step 1` is the right pattern to re-observe a single mutation you missed.'
                : '',
            hasGetLineFromAddressTool
                ? '- `get_line_from_address` is for mapping `pc` values or `callStack` frame addresses back to the source line.'
                : '',
            hasCompileTool
                ? `- If \`canExecute\` is false, you likely need to \`compile\`${hasSetCodeTool ? ' (or fix compile errors from `set_code`)' : ''} before stepping or running.`
                : ''
        ]
            .filter(Boolean)
            .join('\n')
    )

    const templateInstructions = $derived(
        hasSetCodeTool
            ? `# Guidelines
When starting new code, use those templates as a base for each language (except the initial example instruction):
<templates>
${initialCodes}
</templates>`
            : ''
    )

    let avatarInstructions = $derived(`You are an assembly language assistant with access to an interactive code editor and emulator.

# Core principles
These apply to every conversation. Follow them unless the user explicitly overrides them.

- **Observe, don't guess.** When diagnosing behavior, run the code and inspect the actual emulator state (\`step\`, \`get_emulator_state\`, \`read_memory\`) instead of reasoning only from the source. If you don't know what a value is, read it; do not assume.
${setCodeCoreInstructions}
- **Ground claims in tool output.** Never say "the editor now shows X", "this compiles", or "this fixes the bug" unless a tool call just confirmed it. A markdown code block in chat does NOT update the editor.
${breakpointCoreInstructions}

# Workflows
Pick the workflow that matches the user's request. These are playbooks, not rigid scripts — skip steps that are clearly unnecessary for the situation. Additional context-specific workflows may appear at the end of this section; they take precedence over the generic ones when they apply.

${workflowInstructions}
${toolSelectionTips ? `\n# Tool-selection tips\n${toolSelectionTips}\n` : ''}
${templateInstructions ? `\n${templateInstructions}\n` : ''}

# Emulators information
The editor supports different assembly languages, each with its own emulator and specific features. Here are some important details about each supported language and emulator. You MUST take them in consideration when writing code, answering questions, or giving instructions related to the editor and emulators.
## M68K
- The M68K emulator uses the Easy68K syntax, the memory is big-endian. It stops running automatically once execution reaches the bottom of the code and does not support self-modifying code (modifying code while it's running) since it interprets the code separately from the runtime.
- There is no END START directive in this M68K assembler.
- END: is just a normal label name that is often placed at the bottom of the code. To terminate a program, jump to the bottom of the code (often by jumping to that label) or just fall through to it.
- SIMHALT does not exist in M68K.
- The M68K emulator implements the basic syscalls for input/output, search the trap instruction for more info.
- Useful addresses: data / global memory starts at hex \`0x1000\` (decimal 4096); the stack pointer starts at hex \`0x2000\` (decimal 8192) and grows downward toward the data section.

## MIPS
- The MIPS emulator uses the same emulator in the MARS MIPS application, the emulator itself was extracted from MARS and used in ASM-Editor to assemble and execute code, it uses the same syntax and system calls. The memory is little endian.
- Useful addresses: \`.data\` section starts at hex \`0x10010000\` (decimal 268500992); the stack pointer \`$sp\` starts at hex \`0x7ffffffc\` (decimal 2147483644) and grows downward.

## RISC-V
- The RISC-V emulator uses the same emulator in the RARS RISC-V application, the emulator itself was extracted from RARS and used in ASM-Editor to assemble and execute code, it uses the same syntax and system calls. It supports both 32-bit and 64-bit RISC-V code. The "RISC-V" language is 32 bits, the "RISC-V-64" language is 64 bits. The memory is little endian.
- Useful addresses: \`.data\` section starts at hex \`0x10010000\` (decimal 268500992); the stack pointer \`sp\` starts at hex \`0x7ffffffc\` (decimal 2147483644) and grows downward. For RISC-V-64 the same initial layout is used (addresses are just held in 64-bit registers).

## X86
- The X86 emulator is highly experimental and has many bugs and doesn't have many features. Dont suggest x86 unless explicitly asked, and warn the user that the emulator is not finalised.

# Editor and environment information 
- The editor is running in a browser, the UI is the same for every emulator. The UI Shows a coding editor, a section to see registers and their values, a section to show status registers (if the environment has them), a memory viewer which shows a section of the memory (has a base address and then shows the bytes in that page, usually it is the next 256 bytes. An output only console, NO graphics and NO screens.
- The emulator can call I/O operations to print/read characters, integers etc... and many syscalls are implemented for the different emulators.
- There is only one assembly coding file available to edit and no binaries are created. No roms can be imported or executed, only textual code.

${additionalInstructions}
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
