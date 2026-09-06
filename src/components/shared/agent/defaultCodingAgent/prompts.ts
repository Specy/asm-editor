import { BASE_CODE } from '$lib/Config'
import {
    M68K_REJECTED_TRAP_TASKS,
    M68K_TRAP_DOCS,
    M68K_TRAP_GROUP_DOCS
} from '$lib/languages/M68K/M68K-traps'
import {
    Z80_PORT_DOCS,
    Z80_PORT_GROUP_DOCS,
    Z80_SCREEN_COMMAND_DOCS
} from '$lib/languages/Z80/Z80-model'
import type {
    AgentWorkflow,
    DefaultCodingAgentToolName,
    DefaultCodingAgentWorkflowName
} from './types'

export const DEFAULT_CODING_AGENT_WORKFLOW_DEFINITIONS = {
    debug_broken_code: {
        name: 'Debug broken code',
        intentTriggers: [
            'wrong result',
            'incorrect output',
            'bug',
            'fix this',
            "doesn't work",
            'unexpected behavior',
            'why is my code wrong'
        ],
        requiredTools: [
            'get_code',
            'compile',
            'update_breakpoints',
            'run_to_completion',
            'step',
            'get_emulator_state',
            'set_code'
        ],
        verification:
            'Re-run or step the corrected region and compare stdout/registers/memory with the expected behavior.',
        description: `When the user says something is broken, produces the wrong result, crashes, or behaves unexpectedly.
1. Call get_code to read the current editor contents and breakpoints.
2. Compile first. If there are assembler errors and set_code is available, fix those before debugging runtime behavior.
3. State one concrete hypothesis about the wrong line or region.
4. Set a breakpoint just before or inside the suspected region, then run_to_completion to reach it.
5. Step through the region and use returned latestSteps, registers, stdout, flags, and memory to test the hypothesis.
6. If you overshoot, use undo and step 1 to re-observe the mutation.
7. Explain the bug using observed values, then patch with set_code and verify the behavior.`
    },
    write_new_code_from_scratch: {
        name: 'Write new code from scratch',
        intentTriggers: [
            'write a program',
            'create a program',
            'generate code',
            'make an example',
            'new program',
            'example',
            'snippet',
            'from scratch',
            'show me code'
        ],
        requiredTools: ['set_code', 'compile', 'run_to_completion', 'step'],
        verification:
            'For examples/snippets, compile only and report assembler validity; do not run or step unless the user explicitly asks for execution.',
        description: `When the user asks for a fresh program or snippet.
1. Pick the requested language, or choose the best supported language when the user leaves it open.
2. Start from the matching template in <templates> and call set_code with the complete program.
3. If set_code reports compile_error, fix the code before explaining it.
4. Compile and report whether it is valid.
5. Do not call run_to_completion or step for examples/snippets unless the user explicitly asks to execute/debug it.
6. If the user explicitly asks to execute/debug, compile first, then use run_to_completion or step and validate behavior.`
    },
    modify_or_extend_existing_code: {
        name: 'Modify or extend existing code',
        intentTriggers: [
            'modify',
            'extend',
            'refactor',
            'add to my code',
            'change this',
            'update my code',
            'make this code',
            'adapt my code',
            'optimize this',
            'simplify this',
            'preserve my code',
            'insert this into the program',
            'add a feature to the current program'
        ],
        requiredTools: ['get_code', 'set_code', 'compile', 'run_to_completion', 'step'],
        verification:
            'If behavior changed, run or step the changed path. Syntax alone is not enough.',
        description: `When the user asks to add, change, or refactor code already in the editor.
1. Call get_code first.
2. Make the smallest complete edit that satisfies the request. Preserve unrelated labels, comments, data, and structure.
3. Call set_code with the full updated program.
4. Compile before calling run_to_completion or step.
5. If behavior changed, verify with run_to_completion or step. If verification fails, debug before reporting success.`
    },
    diagnose_runtime_errors_or_interrupts: {
        name: 'Diagnose runtime errors or interrupts',
        intentTriggers: [
            'runtime error',
            'exception',
            'interrupt',
            'stuck',
            'error',
            'paused',
            'waiting for input',
            'terminated unexpectedly',
            'halts early',
            'does not stop',
            'infinite loop',
            'stack problem',
            'bad address',
            'program counter',
            'pc is wrong',
            'crashes while running'
        ],
        requiredTools: [
            'compile',
            'get_emulator_state',
            'get_line_from_address',
            'step',
            'read_memory'
        ],
        verification:
            'Ground the diagnosis in currentInterrupt, latestSteps, callStack, pc, stdout, and mapped source lines.',
        description: `When execution errors, terminates unexpectedly, waits for I/O, or pauses on an interrupt.
1. Compile first if you plan to use step or if canExecute is false.
2. Call get_emulator_state and inspect errors, terminated, currentInterrupt, callStack, currentLine, and latestSteps.
3. If currentInterrupt is set, explain what the emulator is waiting for and what the user can provide or change.
4. If pc or call stack addresses are unclear, use get_line_from_address to map them back to source.
5. If memory is relevant, read the exact stack/data address rather than guessing.
6. Once you have a specific suspect, continue with the Debug broken code workflow from the hypothesis step.`
    }
} satisfies Record<DefaultCodingAgentWorkflowName, AgentWorkflow>

type PromptOptions = {
    enabledToolNames: DefaultCodingAgentToolName[]
    enabledWorkflows: AgentWorkflow[]
    additionalInstructions?: string
}

function hasTool(enabledToolNames: DefaultCodingAgentToolName[], name: DefaultCodingAgentToolName) {
    return enabledToolNames.includes(name)
}

function renderWorkflow(workflow: AgentWorkflow) {
    const metadata = [
        workflow.intentTriggers?.length
            ? `Intent triggers: ${workflow.intentTriggers.join(', ')}`
            : '',
        workflow.requiredTools?.length
            ? `Expected tools: ${workflow.requiredTools.join(', ')}`
            : '',
        workflow.verification ? `Verification: ${workflow.verification}` : ''
    ]
        .filter(Boolean)
        .join('\n')

    return [`## ${workflow.name}`, metadata, workflow.description.trim()].filter(Boolean).join('\n')
}

function renderWorkflowInstructions(enabledWorkflows: AgentWorkflow[]) {
    if (enabledWorkflows.length === 0) {
        return 'No built-in workflow is active for this context. Use the available tools and context-specific instructions.'
    }

    return enabledWorkflows.map(renderWorkflow).join('\n\n')
}

function renderTemplates(enabledToolNames: DefaultCodingAgentToolName[]) {
    if (!hasTool(enabledToolNames, 'set_code')) return ''

    const initialCodes = Object.entries(BASE_CODE)
        .map(([language, code]) => `\`\`\`${language}\n${code}\n\`\`\``)
        .join('\n\n')

    return `# Starting Templates
When writing fresh code, start from the matching template unless the user gave an explicit full program.
<templates>
${initialCodes}
</templates>`
}

function renderCorePrinciples(enabledToolNames: DefaultCodingAgentToolName[]) {
    const canSetCode = hasTool(enabledToolNames, 'set_code')
    const canUpdateBreakpoints = hasTool(enabledToolNames, 'update_breakpoints')

    return [
        '- Observe before claiming. When diagnosing behavior, use emulator tools to inspect actual registers, flags, stdout, memory, pc, and latestSteps.',
        canSetCode
            ? '- Preserve user work. Before changing existing code, call get_code. Never replace unrelated code unless the user explicitly asks for a rewrite.'
            : '- Read-only code context. You cannot edit the editor here; analyze the visible code and suggest changes in chat only.',
        canSetCode
            ? '- set_code checks assembler syntax. If it succeeds, do not compile again just for syntax. If behavior matters, run or step and verify observed results.'
            : '',
        '- Tool results are authoritative. Do not say the editor changed, the code compiles, or the bug is fixed unless a tool result confirms it.',
        '- Follow tool errorKind and nextAction fields. A compile_error means fix assembler errors; execution_state usually means compile/reset first; emulator_unavailable means wait or explain that the emulator is still loading.',
        canUpdateBreakpoints
            ? '- Use breakpoints as inspection points. The emulator stops at the breakpoint line before executing that instruction. Breakpoints only work on lines with executable instructions; comments/empty lines/non-instruction lines will not stop execution.'
            : ''
    ]
        .filter(Boolean)
        .join('\n')
}

function renderToolSelectionTips(enabledToolNames: DefaultCodingAgentToolName[]) {
    const tips = [
        hasTool(enabledToolNames, 'step') && hasTool(enabledToolNames, 'run_to_completion')
            ? '- step and run_to_completion already return registers, pc, sp, status registers, stdout, current line, and latestSteps. Call get_emulator_state after them only when you need callStack, breakpoints, canUndo, currentInterrupt, or a full refresh.'
            : '',
        hasTool(enabledToolNames, 'read_memory')
            ? '- Use read_memory only when register/stdout state is insufficient, such as inspecting arrays, strings, the stack, or data sections.'
            : '',
        hasTool(enabledToolNames, 'run_to_completion') &&
        hasTool(enabledToolNames, 'update_breakpoints')
            ? '- run_to_completion respects breakpoints and halts before executing the instruction on the breakpoint line. Set breakpoints on real instruction lines, not comments or blank lines.'
            : '',
        hasTool(enabledToolNames, 'step') && hasTool(enabledToolNames, 'undo')
            ? '- undo plus step 1 is the pattern for re-observing a single mutation.'
            : '',
        hasTool(enabledToolNames, 'get_line_from_address')
            ? '- Use get_line_from_address to map pc and call stack addresses back to source lines.'
            : '',
        hasTool(enabledToolNames, 'compile')
            ? `- If canExecute is false, compile before stepping or running${hasTool(enabledToolNames, 'set_code') ? ', or fix compile_error results from set_code' : ''}.`
            : ''
    ].filter(Boolean)

    return tips.length ? `# Tool Selection\n${tips.join('\n')}` : ''
}

/**
 * Generated from the port map itself so the prompt cannot drift from what the device actually does
 * (see `Z80-model.ts`). Grouped like the documentation page, because the agent has to pick a
 * peripheral before it picks a port.
 */
const Z80_PORT_INFORMATION = Z80_PORT_GROUP_DOCS.map((group) =>
    [
        `### ${group.title} ports (${group.range})`,
        group.description,
        ...Z80_PORT_DOCS.filter((port) => port.group === group.group).map(
            (port) =>
                `- Port ${toPortNumber(port.port)} (${port.title}): out -> ${port.write} in -> ${port.read}`
        )
    ].join('\n')
).join('\n\n')

/**
 * Generated from the trap task table itself (see `M68K-traps.ts`), grouped like the documentation
 * page, so the prompt says exactly what the adapter implements and no more.
 */
const M68K_TRAP_INFORMATION = M68K_TRAP_GROUP_DOCS.map((group) =>
    [
        `### ${group.title} tasks`,
        group.description,
        ...M68K_TRAP_DOCS.filter((task) => task.group === group.group).map((task) =>
            [
                `- Task ${task.task} (${task.title}): ${task.description}`,
                task.input ? ` In: ${task.input}.` : '',
                task.output ? ` Out: ${task.output}.` : '',
                task.deviation ? ` ${task.deviation}` : ''
            ].join('')
        )
    ].join('\n')
).join('\n\n')

/** The tasks that stop the program, so the agent does not reach for one and then debug the error. */
const M68K_REJECTED_TRAP_INFORMATION = M68K_REJECTED_TRAP_TASKS.map(
    (task) => `${task.task} (${task.title})`
).join(', ')

/** The commands the Screen's command port runs, the other half of the Screen interface. */
const Z80_SCREEN_COMMAND_INFORMATION = Z80_SCREEN_COMMAND_DOCS.map(
    (command) => `- ${command.command}: ${command.description}`
).join('\n')

function toPortNumber(port: number): string {
    //the ports are written in hexadecimal everywhere else, and a program writes `out (0x17), a`
    return `0x${port.toString(16).padStart(2, '0').toUpperCase()}`
}

const EMULATOR_INFORMATION = `# Emulator Information
The editor supports one editable assembly file, an output-only console and, for M68K, MIPS, RISC-V and Z80, a pixel screen with a keyboard and a mouse. There are no imported ROMs and no produced binaries.

## M68K
- Uses Easy68K-style syntax and big-endian memory.
- Execution stops when it reaches the bottom of the code. There is no END START directive and no SIMHALT instruction.
- END: is only a normal label often placed at the bottom; jump or fall through to terminate.
- Data/global memory starts at 0x1000. The stack pointer starts at 0x2000 and grows downward.
- All I/O is "trap #15" with the task number in D0.B, EASy68K's interface. Text and graphics share one window: what a program prints is drawn on the screen at the text cursor as well as appended to the console transcript. The screen starts at 640 by 480 and only the program resizes it, with task 33.
- These tasks stop the program with an error, so do not use them: ${M68K_REJECTED_TRAP_INFORMATION}. Task 92's bitwise drawing modes (0, 1, 3 and 5 to 15) stop it too.
${M68K_TRAP_INFORMATION}

## MIPS
- Uses the MARS assembler/emulator syntax and syscalls. Memory is little-endian.
- .data starts at 0x10010000. $sp starts at 0x7ffffffc and grows downward.

## RISC-V
- Uses the RARS assembler/emulator syntax and syscalls. Memory is little-endian.
- RISC-V is 32-bit; RISC-V-64 is 64-bit.
- .data starts at 0x10010000. sp starts at 0x7ffffffc and grows downward.

## X86
- The X86 emulator is experimental and incomplete. It uses the NASM syntax and assembler. Uses Blink as the emulator.

## Z80
- Uses the z80-asm syntax: ";" comments, labels ending with ":", directives like .org, .byte, .asciz and equ. Memory is 64 KB and little-endian.
- The default program is assembled at 0x8000. SP starts at 0xFFFF and grows downward, the stack is empty at that address.
- Execution stops on "halt", on a top-level "ret", or when the program counter runs past the end of the assembled code.
- There are no syscalls or TRAPs: every peripheral is a set of IO ports, written with "out (port), a" and read with "in a, (port)". The "(c)" forms take the port from C and put B on the high byte of the address bus, which is how a read carries a parameter. An "in" on an input port pauses the program until input is available, which is taken from the testcase input when running tests; an "in" on a wait port pauses it until the time has passed.
- Ports outside the map are an empty bus: writes are dropped and reads answer 0xFF.
${Z80_PORT_INFORMATION}

### Screen commands, written to port 0x17
${Z80_SCREEN_COMMAND_INFORMATION}`

export function buildDefaultCodingAgentPrompt({
    enabledToolNames,
    enabledWorkflows,
    additionalInstructions = ''
}: PromptOptions) {
    const sections = [
        'You are an assembly language assistant with access to an interactive editor and emulator.',
        `# Core Principles\n${renderCorePrinciples(enabledToolNames)}`,
        `# Workflows\nPick the workflow that matches the user request. These are playbooks, not rigid scripts; skip steps only when they are clearly irrelevant. Context-specific workflows appended by the page take precedence.\n\n${renderWorkflowInstructions(enabledWorkflows)}`,
        renderToolSelectionTips(enabledToolNames),
        renderTemplates(enabledToolNames),
        EMULATOR_INFORMATION,
        additionalInstructions.trim()
    ].filter(Boolean)

    return sections.join('\n\n')
}
