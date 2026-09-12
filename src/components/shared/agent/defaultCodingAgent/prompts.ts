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
import { TRS80_KEY_ROW_DOCS, TRS80_MEMORY_DOCS } from '$lib/languages/Z80/trs80/trs80Display'
import {
    DEFAULT_PROJECT_DISPLAY,
    formatMarsBaseAddress,
    MARS_BASE_ADDRESS_CHOICES,
    MARS_DISPLAY_SIZE_CHOICES,
    MARS_UNIT_SIZE_CHOICES
} from '$lib/languages/mars/marsDisplay'
import { MARS_RECEIVER_CONTROL } from '$lib/languages/mars/MarsDevices'
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
            'list_files',
            'view_file',
            'compile',
            'list_breakpoints',
            'update_breakpoints',
            'run_to_completion',
            'step',
            'get_emulator_state',
            'replace_file_content',
            'write_to_file'
        ],
        verification:
            'Re-run or step the corrected region and compare stdout/registers/memory with the expected behavior.',
        description: `When the user says something is broken, produces the wrong result, crashes, or behaves unexpectedly.
1. Use list_files or view_file to inspect project files. Use start_line and end_line with view_file to read specific regions (up to 150 lines per call).
2. Compile first. If there are assembler errors, fix them with replace_file_content (or write_to_file) before debugging runtime behavior.
3. State one concrete hypothesis about the wrong line or region.
4. Set a breakpoint just before or inside the suspected region (specifying path for multi-file). Call list_breakpoints to verify where breakpoints are placed and see the surrounding instructions, then run_to_completion to reach it.
5. Step through the region and use returned latestSteps, registers, stdout, flags, and memory to test the hypothesis.
6. If you overshoot, use undo and step 1 to re-observe the mutation.
7. Explain the bug using observed values, then patch with replace_file_content (specifying exact target_content and replacement_content) and verify the behavior.`
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
        requiredTools: ['write_to_file', 'compile', 'run_to_completion', 'step'],
        verification:
            'For examples/snippets, compile only and report assembler validity; do not run or step unless the user explicitly asks for execution.',
        description: `When the user asks for a fresh program or snippet.
1. Pick the requested language, or choose the best supported language when the user leaves it open.
2. Start from the matching template in <templates> and call write_to_file with the complete program.
3. If write_to_file reports compile_error, fix the code before explaining it.
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
        requiredTools: [
            'list_files',
            'view_file',
            'replace_file_content',
            'write_to_file',
            'compile',
            'run_to_completion',
            'step'
        ],
        verification:
            'If behavior changed, run or step the changed path. Syntax alone is not enough.',
        description: `When the user asks to add, change, or refactor code already in the editor.
1. Call list_files or view_file first to inspect existing code. Use start_line and end_line to read the relevant lines.
2. Make the smallest complete edit that satisfies the request. Preserve unrelated labels, comments, data, and structure.
3. Call replace_file_content with the exact target_content to replace and replacement_content. Use write_to_file if creating a new file.
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
    if (!hasTool(enabledToolNames, 'write_to_file')) return ''

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
    const canEditCode =
        hasTool(enabledToolNames, 'replace_file_content') ||
        hasTool(enabledToolNames, 'write_to_file')
    const canManageBreakpoints =
        hasTool(enabledToolNames, 'update_breakpoints') ||
        hasTool(enabledToolNames, 'list_breakpoints')

    return [
        '- Observe before claiming. When diagnosing behavior, use emulator tools to inspect actual registers, flags, stdout, memory, pc, and latestSteps.',
        canEditCode
            ? '- Preserve user work. Before changing existing code, call view_file (or list_files). Never replace unrelated code or files unless the user explicitly asks for a rewrite.'
            : '- Read-only code context. You cannot edit the editor here; analyze the visible code and suggest changes in chat only.',
        canEditCode
            ? '- Code edits: Use replace_file_content for surgical edits (providing exact target_content and replacement_content) and write_to_file for fresh files or full rewrites. Edits check assembler syntax immediately. If an edit succeeds, do not compile again just for syntax. If behavior matters, run or step and verify observed results.'
            : '',
        '- Tool results are authoritative. Do not say the editor changed, the code compiles, or the bug is fixed unless a tool result confirms it.',
        '- Follow tool errorKind and nextAction fields. A compile_error means fix assembler errors; execution_state usually means compile/reset first; emulator_unavailable means wait or explain that the emulator is still loading.',
        canManageBreakpoints
            ? '- Use breakpoints as inspection points. Manage breakpoints with update_breakpoints and inspect active breakpoints with list_breakpoints (which shows surrounding instructions). The emulator stops at the breakpoint line before executing that instruction. Specify the file path when working with multiple files.'
            : ''
    ]
        .filter(Boolean)
        .join('\n')
}

function renderToolSelectionTips(enabledToolNames: DefaultCodingAgentToolName[]) {
    const tips = [
        hasTool(enabledToolNames, 'list_files')
            ? '- Use list_files to see all files in the project, their sizes, line counts, and which file is the entry point.'
            : '',
        hasTool(enabledToolNames, 'view_file')
            ? '- view_file accepts path, start_line, and end_line (1-indexed). It returns raw file lines (at most 150 lines per call). Use start_line and end_line to inspect specific regions.'
            : '',
        hasTool(enabledToolNames, 'replace_file_content')
            ? '- replace_file_content performs exact snippet replacement with target_content and replacement_content. Use start_line and end_line bounds to disambiguate if a snippet appears multiple times.'
            : '',
        hasTool(enabledToolNames, 'write_to_file')
            ? '- write_to_file creates a new file or completely writes an existing file. For existing files, prefer replace_file_content to avoid accidental overwrites.'
            : '',
        hasTool(enabledToolNames, 'list_breakpoints')
            ? '- Use list_breakpoints to see all active breakpoints and the surrounding code (previous and next 3 instructions), clearly marking the breakpoint line.'
            : '',
        hasTool(enabledToolNames, 'update_breakpoints')
            ? '- Use update_breakpoints to add or remove breakpoints by 1-based line number in a file.'
            : '',
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
            ? '- Use get_line_from_address to map pc and call stack addresses back to source lines and files.'
            : '',
        hasTool(enabledToolNames, 'compile')
            ? `- If canExecute is false, compile before stepping or running${
                  hasTool(enabledToolNames, 'replace_file_content') ||
                  hasTool(enabledToolNames, 'write_to_file')
                      ? ', or fix compile_error results from code edit tools'
                      : ''
              }.`
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

/**
 * The TRS-80's memory-mapped display, which has no ports at all: generated from the same tables the
 * documentation page renders, so the agent writes stores rather than reaching for a drawing command
 * that this mode rejects (ADR 0020).
 */
const Z80_TRS80_INFORMATION = [
    ...TRS80_MEMORY_DOCS.map((row) => `- ${row.range} (${row.title}): ${row.description}`),
    `- Keyboard rows, in order: ${TRS80_KEY_ROW_DOCS.map((keys, row) => `row ${row} is ${keys}`).join('; ')}.`,
    '- Characters 0x20 to 0x7F are text; 128 to 191 are 2 by 3 blocks of chunky pixels, the low six bits being the blocks, bit 0 top-left then across and down. 191 is solid, 128 is blank.',
    '- The drawing commands and the text cursor are not available in this mode and stop the program with an error; console output goes to the terminal only. Animate by composing a frame in RAM and copying it in with one `ldir`, which is what this machine does instead of double buffering.',
    "- Port 0x00 is the machine's joystick and is deliberately not in the editor's port map, so a poll of it reads an empty bus: 0xFF, none attached, which is what the machine answers. Everything else the machine decodes is at 0x75 or above, clear of the ports listed here."
].join('\n')

function toPortNumber(port: number): string {
    //the ports are written in hexadecimal everywhere else, and a program writes `out (0x27), a`
    return `0x${port.toString(16).padStart(2, '0').toUpperCase()}`
}

/**
 * The MARS and RARS memory-mapped devices, the same text for both environments: the two simulators'
 * bitmap display and keyboard-and-display simulator are the same two tools, and only the register a
 * service number goes in differs.
 */
function MARS_SCREEN_INFORMATION(service: string, argument: string): string {
    const base = MARS_RECEIVER_CONTROL >>> 0
    return [
        `- Graphics go through memory, not through a syscall: the screen is a grid of words, one word per pixel, whose low 24 bits are the color (red 23-16, green 15-8, blue 7-0). Words run left to right and then top to bottom. The program must reserve that memory itself, usually with \`.space\`.`,
        `- The grid has the tool's own five parameters: unit width and height (${MARS_UNIT_SIZE_CHOICES.join(', ')}), display width and height (${MARS_DISPLAY_SIZE_CHOICES.join(', ')}) and a base address, which the user can pick in the screen panel among ${MARS_BASE_ADDRESS_CHOICES.map((choice) => formatMarsBaseAddress(choice.address)).join(', ')}. Default: ${DEFAULT_PROJECT_DISPLAY.unitWidth} by ${DEFAULT_PROJECT_DISPLAY.unitHeight} units, ${DEFAULT_PROJECT_DISPLAY.width} by ${DEFAULT_PROJECT_DISPLAY.height} pixels at ${formatMarsBaseAddress(DEFAULT_PROJECT_DISPLAY.baseAddress)}, so ${DEFAULT_PROJECT_DISPLAY.width} by ${DEFAULT_PROJECT_DISPLAY.height} words.`,
        `- **Any program that draws must configure them itself**, with a comment directive the editor reads at every build, before the first instruction: \`# @screen unit=1 width=256 height=256 base=display\`. \`base\` takes a label the program defines (preferred: the program never has to know the address) or an address such as 0x10010000; \`unit\` sets both unit sizes, \`unitWidth\` and \`unitHeight\` set them apart. Order and spacing are free, anything left out keeps its current value, and a bad value is a warning on that line, not an error. It is a comment, so the file still assembles in the real simulator.`,
        `- Keyboard and console are four words: 0x${base.toString(16)} receiver control (bit 0 Ready, a character is waiting), 0x${(base + 4).toString(16)} receiver data (the character, reading it takes it), 0x${(base + 8).toString(16)} transmitter control (bit 0 Ready, always set) and 0x${(base + 12).toString(16)} transmitter data (storing a character prints it, ASCII 12 clears the console).`,
        `- Setting bit 1 of either control register, the interrupt-enable bit, stops the program with an error: poll the Ready bit instead.`,
        `- Service 30 (${service} = 30) answers the program time in milliseconds since the run started, low word in ${argument} and high word in the next register; service 32 (${service} = 32, ${argument} = milliseconds) waits. A wait costs no instructions, so a polling loop should sleep about 10 ms instead of spinning, or it will hit the execution limit.`
    ].join('\n')
}

const EMULATOR_INFORMATION = `# Emulator Information
The editor supports assembly projects with one or more assembly files, an output-only console and, for M68K, MIPS, RISC-V and Z80, a pixel screen with a keyboard and a mouse. There are no imported ROMs and no produced binaries.

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
${MARS_SCREEN_INFORMATION('$v0', '$a0')}

## RISC-V
- Uses the RARS assembler/emulator syntax and syscalls. Memory is little-endian.
- RISC-V is 32-bit; RISC-V-64 is 64-bit.
- .data starts at 0x10010000. sp starts at 0x7ffffffc and grows downward.
${MARS_SCREEN_INFORMATION('a7', 'a0')}

## X86
- The X86 emulator is experimental and incomplete. It uses the NASM syntax and assembler. Uses Blink as the emulator.

## Z80
- Uses the z80-asm syntax: ";" comments, labels ending with ":", directives like .org, .byte, .asciz and equ. Memory is 64 KB and little-endian.
- The default program is assembled at 0x8000. SP starts at 0xFFFF and grows downward, the stack is empty at that address.
- Execution stops on "halt", on a top-level "ret", or when the program counter runs past the end of the assembled code.
- There are no syscalls or TRAPs: every peripheral is a set of IO ports, written with "out (port), a" and read with "in a, (port)". The "(c)" forms take the port from C and put B on the high byte of the address bus, which is how a read carries a parameter. An "in" on an input port pauses the program until input is available, which is taken from the testcase input when running tests; an "in" on a wait port pauses it until the time has passed.
- Ports outside the map are an empty bus: writes are dropped and reads answer 0xFF.
${Z80_PORT_INFORMATION}

### Screen commands, written to port 0x27
${Z80_SCREEN_COMMAND_INFORMATION}

### The TRS-80 memory-mapped display
Reached with screen command 14, or before the program starts with a "; @screen trs80" comment line. This is the real machine's interface, so a program written for a TRS-80 elsewhere runs here; use it when the user asks for that machine, and use the ports above otherwise.
${Z80_TRS80_INFORMATION}`

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
