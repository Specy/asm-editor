import { BASE_CODE } from '#lib/Config.ts'
import {
    M68K_REJECTED_TRAP_TASKS,
    M68K_TRAP_DOCS,
    M68K_TRAP_GROUP_DOCS
} from '#lib/languages/M68K/M68K-traps.ts'
import {
    Z80_PORT_DOCS,
    Z80_PORT_GROUP_DOCS,
    Z80_SCREEN_COMMAND_DOCS
} from '#lib/languages/Z80/Z80-model.ts'
import { TRS80_KEY_ROW_DOCS, TRS80_MEMORY_DOCS } from '#lib/languages/Z80/trs80/trs80Display.ts'
import {
    DEFAULT_PROJECT_DISPLAY,
    DISPLAY_SIZE_MAX,
    DISPLAY_SIZE_MIN,
    formatMarsBaseAddress,
    MARS_BASE_ADDRESS_CHOICES,
    MARS_DISPLAY_SIZE_CHOICES,
    MARS_UNIT_SIZE_CHOICES,
    UNIT_SIZE_MAX,
    UNIT_SIZE_MIN
} from '#lib/languages/mars/marsDisplay.ts'
import { MARS_RECEIVER_CONTROL } from '#lib/languages/mars/MarsDevices.ts'
import {
    SYNTH_BASES,
    SYNTH_CHANNEL_REGISTERS,
    SYNTH_UPLOAD_REGISTERS,
    SYNTH_WAVEFORMS
} from '#lib/languages/synthRegisters.ts'
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
            'set_breakpoint',
            'remove_breakpoint',
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
    sourceCompilationAvailable?: boolean
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
When writing fresh assembly code, start from the matching template unless the user gave an explicit full program.
<templates>
${initialCodes}
</templates>`
}

function renderCorePrinciples(enabledToolNames: DefaultCodingAgentToolName[]) {
    const canEditCode =
        hasTool(enabledToolNames, 'replace_file_content') ||
        hasTool(enabledToolNames, 'write_to_file')
    const canManageBreakpoints =
        hasTool(enabledToolNames, 'set_breakpoint') ||
        hasTool(enabledToolNames, 'remove_breakpoint') ||
        hasTool(enabledToolNames, 'list_breakpoints')

    return [
        '- Observe before claiming. When diagnosing behavior, use emulator tools to inspect actual registers, flags, stdout, memory, pc, and latestSteps.',
        canEditCode
            ? '- Preserve user work. Before changing existing code, call view_file (or list_files). Never replace unrelated code or files unless the user explicitly asks for a rewrite.'
            : '- Read-only code context. You cannot edit the editor here; analyze the visible code and suggest changes in chat only.',
        canEditCode
            ? '- Code edits: Use replace_file_content for surgical edits (providing exact target_content and replacement_content) and write_to_file for fresh files or full rewrites. Assembly edits check assembler syntax immediately. C/C++ and header edits require compile_source to check source syntax and regenerate assembly, then compile to build. If an edit succeeds, do not compile again just for syntax. If behavior matters, run or step and verify observed results.'
            : '',
        '- Tool results are authoritative. Do not say the editor changed, the code compiles, or the bug is fixed unless a tool result confirms it.',
        '- Follow tool errorKind and nextAction fields. A compile_error means fix the reported source or assembler errors; execution_state usually means compile/reset first; emulator_unavailable means wait or explain that the emulator is still loading.',
        canManageBreakpoints
            ? '- Use breakpoints as inspection points. Set breakpoints with set_breakpoint (by instruction, address, or line) and remove them with remove_breakpoint. Inspect active breakpoints with list_breakpoints (which shows surrounding instructions). The emulator stops at the breakpoint line before executing that instruction. Specify the file path when working with multiple files.'
            : ''
    ]
        .filter(Boolean)
        .join('\n')
}

/**
 * The Register files the emulators expose
 * ([the design record](../../../../../../../docs/design/register-files.md)), as one tip beside the other
 * register guidance: the model has to know the other files exist and that a float one reads as a
 * number before it can ask for them. Example names rather than full lists, since the file it opens
 * comes back naming its own registers. Which tool holds the complete state and which ones
 * abbreviate it is written from the allow list, as the neighbouring tips are, so the tip never
 * sends the model to a tool it does not have.
 */
function renderRegisterFileInformation(enabledToolNames: DefaultCodingAgentToolName[]) {
    const abbreviating = (['step', 'run_to_completion', 'undo'] as const).filter((name) =>
        hasTool(enabledToolNames, name)
    )
    const listed =
        abbreviating.length > 1
            ? `${abbreviating.slice(0, -1).join(', ')} and ${abbreviating[abbreviating.length - 1]}`
            : abbreviating[0]
    //the sentence names as many tools as the allow list holds, so both of its verbs follow the
    //count: the subject is one tool, or two of them, or all three
    const several = abbreviating.length > 1
    const listVerb = several ? 'list' : 'lists'
    const skipVerb = several ? 'skip' : 'skips'
    const whereTheStateIs = [
        abbreviating.length
            ? `${listed} ${listVerb} only the registers that are not zero, plus the even half of a live MIPS double pair, and ${skipVerb} a row that holds nothing, such as an empty x87 stack slot`
            : '',
        hasTool(enabledToolNames, 'get_emulator_state')
            ? 'get_emulator_state lists every file in full, where a row that holds nothing reads empty'
            : ''
    ].filter(Boolean)

    return [
        "- Register files: registers is the CPU file, and registerFiles holds the language's other files.",
        'MIPS has FPU ($f0 to $f31, with condition flags) and CP0; RISC-V has FPU (ft0, fa0, fs0 and the rest of f0 to f31) and CSR (fcsr, cycle, instret and more); x86 has SSE (xmm0 to xmm15) and x87 (st0 to st7).',
        'A float register reads as a decimal such as 3.5, a wide one as its lanes, with the raw hex and the other precision in other; integer registers such as mxcsr keep the usual decimal/hex shape.',
        whereTheStateIs.length ? `${whereTheStateIs.join('; ')}.` : ''
    ]
        .filter(Boolean)
        .join(' ')
}

/**
 * Pokes ([the design record](../../../../../../../docs/design/pokes.md)), as one paragraph beside the
 * other execution guidance: a Poke is the debugger changing a value the program is about to read,
 * it is a step of the same history the instructions are in, and it has two things it never writes.
 * Written from the allow list like the neighbouring tips, so it names only the tools the agent has.
 */
function renderPokeInformation(enabledToolNames: DefaultCodingAgentToolName[]) {
    const poking = (['poke_register', 'poke_memory'] as const).filter((name) =>
        hasTool(enabledToolNames, name)
    )
    const listed = poking.length > 1 ? poking.join(' and ') : poking[0]
    const verb = poking.length > 1 ? 'change' : 'changes'

    return [
        `- Pokes: ${listed} ${verb} a value of the paused program between two instructions, which is what a debugger does when it tries a fix without editing the code, reaches a branch the program never takes, or sets up a state that would take many instructions to arrive at.`,
        'A Poke is one step of the same history the instructions are in: undo reverts it like an instruction, and latestSteps lists it with kind poke and the old and new value of everything it wrote.',
        'The program counter and the status flags are never pokeable, nor is a register the emulator cannot set such as $zero; poke the values an instruction reads and step to see what it does with them.',
        'Poke only what you are testing, and say what you poked when you report results: those values are yours, not the program’s.'
    ].join(' ')
}

function renderToolSelectionTips(enabledToolNames: DefaultCodingAgentToolName[]) {
    const tips = [
        hasTool(enabledToolNames, 'search_documentation')
            ? '- Use search_documentation before relying on an instruction, directive, syscall or trap task you are not sure of: it returns the documentation entries and the lecture sections that match, by name or by a question in words. The emulator information in these instructions stays the authority for service numbers.'
            : '',
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
        hasTool(enabledToolNames, 'set_breakpoint')
            ? '- Use set_breakpoint to set breakpoints by instruction text, address, or line number without manual counting.'
            : '',
        hasTool(enabledToolNames, 'remove_breakpoint')
            ? '- Use remove_breakpoint to remove a breakpoint by instruction, address, line, or pass all: true to clear all breakpoints.'
            : '',
        hasTool(enabledToolNames, 'step') && hasTool(enabledToolNames, 'run_to_completion')
            ? '- step and run_to_completion already return registers, pc, sp, status registers, stdout, current line, and latestSteps. Call get_emulator_state after them only when you need callStack, breakpoints, canUndo, currentInterrupt, or a full refresh.'
            : '',
        hasTool(enabledToolNames, 'get_emulator_state') ||
        hasTool(enabledToolNames, 'step') ||
        hasTool(enabledToolNames, 'run_to_completion') ||
        hasTool(enabledToolNames, 'undo')
            ? renderRegisterFileInformation(enabledToolNames)
            : '',
        hasTool(enabledToolNames, 'read_memory')
            ? '- Use read_memory only when register/stdout state is insufficient, such as inspecting arrays, strings, the stack, or data sections.'
            : '',
        hasTool(enabledToolNames, 'poke_register') || hasTool(enabledToolNames, 'poke_memory')
            ? renderPokeInformation(enabledToolNames)
            : '',
        hasTool(enabledToolNames, 'run_to_completion') &&
        (hasTool(enabledToolNames, 'set_breakpoint') ||
            hasTool(enabledToolNames, 'list_breakpoints'))
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

/**
 * The tasks that stop the program, so the agent does not reach for one and then debug the error.
 */
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
        `- The grid has the tool's own five parameters: unit width and height (${MARS_UNIT_SIZE_CHOICES.join(', ')} in the real tool, any from ${UNIT_SIZE_MIN} to ${UNIT_SIZE_MAX} here), display width and height (${MARS_DISPLAY_SIZE_CHOICES.join(', ')} in the real tool, any from ${DISPLAY_SIZE_MIN} to ${DISPLAY_SIZE_MAX} here) and a base address, which the user can pick in the screen panel among ${MARS_BASE_ADDRESS_CHOICES.map((choice) => formatMarsBaseAddress(choice.address)).join(', ')}. Default: ${DEFAULT_PROJECT_DISPLAY.unitWidth} by ${DEFAULT_PROJECT_DISPLAY.unitHeight} units, ${DEFAULT_PROJECT_DISPLAY.width} by ${DEFAULT_PROJECT_DISPLAY.height} pixels at ${formatMarsBaseAddress(DEFAULT_PROJECT_DISPLAY.baseAddress)}, so ${DEFAULT_PROJECT_DISPLAY.width} by ${DEFAULT_PROJECT_DISPLAY.height} words.`,
        `- **Any program that draws must configure them itself**, with a comment directive the editor reads at every build, before the first instruction: \`# @screen unit=1 width=256 height=256 base=display\`. \`base\` takes a label the program defines (preferred: the program never has to know the address) or an address such as 0x10010000; \`unit\` sets both unit sizes, \`unitWidth\` and \`unitHeight\` set them apart. Order and spacing are free, anything left out keeps its current value, and a bad value is a warning on that line, not an error. It is a comment, so the file still assembles in the real simulator.`,
        `- Keyboard and console are four words: 0x${base.toString(16)} receiver control (bit 0 Ready, a character is waiting), 0x${(base + 4).toString(16)} receiver data (the character, reading it takes it), 0x${(base + 8).toString(16)} transmitter control (bit 0 Ready, always set) and 0x${(base + 12).toString(16)} transmitter data (storing a character prints it, ASCII 12 clears the console).`,
        `- Setting bit 1 of either control register, the interrupt-enable bit, stops the program with an error: poll the Ready bit instead.`,
        `- Service 30 (${service} = 30) answers the program time in milliseconds since the run started, low word in ${argument} and high word in the next register; service 32 (${service} = 32, ${argument} = milliseconds) waits. A wait costs no instructions, so a polling loop should sleep about 10 ms instead of spinning, or it will hit the execution limit.`,
        `- Services 31 and 33 play a Note: pitch in ${argument} (0 to 127, 60 is middle C), then the duration in milliseconds, the General MIDI instrument (0 to 127) and the volume (0 to 127) in the next three registers. 31 returns at once, so Notes overlap; 33 waits for the duration like 32, so a melody is a series of 33s. A testcase plays nothing, and 33 advances its virtual clock.`
    ].join('\n')
}

/**
 * The Synth, the same chip for MIPS, RISC-V and the M68K at their own base: generated from the
 * register model the device reads, so the agent writes exactly the registers that exist.
 */
function SYNTH_INFORMATION(base: string, half: string, byte: string, wait: string): string {
    const registers = [...SYNTH_CHANNEL_REGISTERS, ...SYNTH_UPLOAD_REGISTERS]
        .map(
            (register) =>
                `0x${register.offset.toString(16)} ${register.name.toLowerCase().replaceAll('_', ' ')} (${register.bytes * 8} bits: ${register.description})`
        )
        .join('; ')
    return [
        `- Waveform sound is the Synth, an extension of this editor that the reference simulator does not have: eight channels whose registers are memory from ${base}, written with plain stores (${half} for a 16-bit register, ${byte} for an 8-bit one) in the target's byte order. Channel n's 32 bytes are at ${base} + n * 0x20; the upload registers are at ${base} + 0x180.`,
        `- Registers, as offsets: ${registers}.`,
        `- Waveforms: ${SYNTH_WAVEFORMS.map((waveform, value) => `${value} ${waveform}`).join(', ')}. The frequency register is in Hz (440 is A4), or samples a second for the sample waveform. Set waveform, volume, sustain and the envelope, then turn the gate (control bit 0) on to start a note and off to release it; to strike a note again, turn the gate off and on. A note sounds until its gate goes off, so pace a melody with ${wait}. Each channel's wavetable is 16 bytes at ${base} + 0x100 + n * 0x10, 32 four-bit samples, high half first. Sample memory is 64 KB of signed 8-bit samples, filled by an upload, which copies when its start register is written.`,
        "- The registers read back what was written. The program's end releases every gate; a testcase is silent."
    ].join('\n')
}

const EMULATOR_INFORMATION = `# Emulator Information
The editor supports projects with assembly, C/C++ sources, local headers and data files, an output-only console and, for M68K, MIPS, RISC-V and Z80, a pixel screen with a keyboard and a mouse, and sound. There are no imported ROMs and no produced binaries.

## M68K
- Uses Easy68K-style syntax and big-endian memory.
- End a program with task 9 (move.b #9,d0 then trap #15), or pause it with SIMHALT, which assembles as $FFFF $FFFF; Run resumes after a SIMHALT. A program that does neither runs on into whatever follows its last instruction, as a 68000 does: data placed right after the code runs as the instructions its words decode to, usually ending in an exception, and memory the program never wrote ends it.
- END START ends the source and names the entry point; without it the entry is a label named START, else the first instruction.
- Code is memory: each instruction is placed at its real size, 2 to 10 bytes (up to 22 with the 68020's addressing modes), and a program can read and overwrite its own code, which then runs as its new bytes decode. A store into its own code pauses a Run, unless the person turned that Preference off.
- As in EASy68K, the assembler picks a short form (BRA.S, MOVEQ, ADDQ, SUBQ, a .W absolute address) only for a back reference that fits: a number, or symbols all defined above the line. A label or constant defined below always gets the word or long form, so a forward BRA is BRA.W and MOVE.L #LATER,D0 stays a MOVE.L.
- Data/global memory starts at 0x1000. The stack pointer starts at 0x1000000, the top of the 16 MB of memory, and grows downward.
- Exceptions go through the 68000's vector table at 0x000-0x3FF, vector n at address 4*n. A program installs a handler by writing its address there before the cause can happen (MOVE.L #handler,$14 for a division by zero, $80+4*n for TRAP #n with n from 0 to 14) and ends the handler with RTE. A vector it did not fill reads $FFFFFFFF, and the exception then ends the program with an error naming the vector. The frame is the SR word at (SP) and the return address at 2(SP); illegal instructions, line A/F words and privilege violations stack the faulting instruction's own address, so their handler adds its size before RTE. Address errors push a 14-byte frame.
- OPT P=68010 makes the program a 68010's: RTD, BKPT (vector 4), and MOVEC and MOVES, both privileged, with the control registers VBR, SFC and DFC, which the System register file shows. Every exception reads its vector at VBR + 4*n (VBR starts at 0, MOVEC D0,VBR moves the table), frames are 8 bytes with a format/vector word at 6(SP) (address and bus errors push 58 bytes, format $8), RTE refuses any other format with a format error (vector 14), and MOVE SR,<ea> is privileged, so user code reads the flags with MOVE CCR,<ea>.
- OPT P=68020 makes the program a 68020's, with the 68010's instructions and the 68020's own: EXTB.L; CHK.L; LINK.W and LINK.L (a 68000 or 68010 program writes LINK with no size); TST of An, #imm and d(PC), CMPI #imm,d(PC); TRAPcc (TRAPEQ, TRAPNE.W #n, TRAPT, TRAPF..., vector 7 like TRAPV, with no size and no operand or .W/.L #n); MULS.L/MULU.L <ea>,Dl or <ea>,Dh:Dl (64-bit product); DIVS.L/DIVU.L <ea>,Dq or <ea>,Dr:Dq (64-bit dividend), DIVSL.L/DIVUL.L <ea>,Dr:Dq (32-bit dividend, remainder in Dr); PACK/UNPK Dx,Dy,#adj or -(Ax),-(Ay),#adj; CHK2/CMP2 <ea>,Rn (bounds pair at <ea>, lower first; CHK2 traps through vector 6); CAS Dc,Du,<ea> and CAS2 Dc1:Dc2,Du1:Du2,(Rn1):(Rn2); and the bit fields BFTST, BFEXTU, BFEXTS, BFFFO, BFCHG, BFCLR, BFSET, BFINS, written <ea>{offset:width} (offset from the top bit, width 1-32, either a number or a Dn: BFEXTU D0{24:8},D1 is D0's low byte). OPT BIT gives a 68000 or 68010 program the bit fields alone, with its own addressing modes, as in EASy68K. CALLM and RTM are refused. Wherever an instruction takes d8(An,Xn) or d8(PC,Xn), it also takes the 68020's indexed modes, in vasm's syntax: a scaled index (4,A0,D1.W*4), a base displacement of a word or a long (1000,A0,D1.L), and memory indirect, ([bd,An,Xn],od) preindexed and ([bd,An],Xn,od) postindexed, which read a long pointer at the address in brackets and add the rest to it (LEA ([TABLE,PC,D0.W*4]),A1 loads entry D0 of a pointer table); any part can be left out, and ZA0-ZA7, ZD0-ZD7 and ZPC suppress a register inside the parentheses only, where a label of that name still reads as the label (a 68020 program is warned). An index without a size is .W, so (D0) uses D0's low word: write (D0.L); a 68000 program refuses (D0). BRA.L, BSR.L and Bcc.L are 32-bit branches (on the 68000, .L is .W). A line the 68000 can encode keeps its 68000 form; a wider displacement or a long branch is picked only for a back reference, so write .L after a label defined below.
- The 68020's supervisor model: SR has T1 (bit 15, the 68000's T, traces every instruction), T0 (bit 14, traces only a branch taken, a jump, a return, a write of SR, or ANDI/ORI/EORI to CCR; not MOVE to CCR) and M (bit 12). In supervisor mode A7 is the ISP (the 68000's SSP, at 0x1000000) while M is clear and the MSP (0 at the start: set it with MOVEC An,MSP before ORI #$1000,SR) while M is set; the System register file shows USP, ISP, MSP, VBR, SFC, DFC, CACR and CAAR. MOVEC also reaches MSP, ISP, CACR (only bits 0 and 1 kept, no cache behind it) and CAAR. An interrupt taken with M set pushes its frame on the MSP, clears M and pushes a throwaway frame (format $1) on the ISP, where the handler runs; its RTE pops the throwaway frame, which sets M again, then the real frame. Frames are format $0 (8 bytes), or $2 (12 bytes, the faulting instruction's address at 8(SP)) for CHK, CHK2, TRAPcc, TRAPV, a division by zero and trace; bus and address errors push $B (92 bytes) or $A (32). RTE takes $0, $1, $2, $A and $B and raises a format error on any other, a 68010's $8 included. Words and longs at odd addresses are read and written; only an instruction fetched from an odd address is an address error. MSP, ISP, CACR and CAAR are reserved names in every program.
- A program starts in supervisor mode (SR $2000, A7 the supervisor stack pointer at 0x1000000). ANDI #$DFFF,SR enters user mode, where A7 is the user stack pointer (0x00FF0000 unless set first with MOVE.L An,USP) and MOVE/ANDI/ORI/EORI to SR, MOVE USP and RTE raise a privilege violation (vector 8). Only an exception, such as a TRAP, returns to supervisor mode. TRAP #15 works in both modes. STOP and RESET are privileged too; RESET does nothing.
- IRQs, interrupt requests at levels 1 to 7, come from timers (task 32 with D1.B = 6) and from key and mouse events on the screen (tasks 62 and 60). Each goes through its level's autovector at $60+4*level ($68 for level 2), once its level is above the interrupt mask in SR bits 8-10, or is 7; the handler ends with RTE. STOP #$2000 loads SR and waits, running nothing, until one comes. Timers run only during a Run; a Testcase has no keyboard or mouse, and its virtual clock jumps to the next timer firing while the program waits in STOP. An IRQ handler runs between any two instructions, so it saves with MOVEM every register it changes. Key state changes the moment a key goes down or up, as in EASy68K, so a key handler reads the key that raised it with task 19 (D1.L = 0: last key up in the high word, last key down in the low word).
- The editor counts the clock cycles a 68000 takes: each instruction's own time from the 68000 manual, its data included (a multiplication by its bits, a shift by its count, a branch taken or not), 34 for TRAP #0-#14, 44 for an IRQ, 4 for STOP however long it waits, and none for a TRAP #15 task. The counter shows under the registers, each step of the history has its cycles, and the exit line says the total. Task 30 clears the counter and task 31 reads it into D1.L; the MOVEQ #31,D0 before the read counts too (4 cycles on the 68000 and the 68010, 2 on the 68020), so time code by clearing just before it and reading just after it, then subtracting the MOVEQ's cycles. A 68010 program counts a 68010's cycles (38 for an exception, 46 for an IRQ, 24 for RTE, and loop mode makes a DBRA loop over one short instruction cheaper), and a 68020 program's count is an estimate, the 68020 manual's time for each instruction with it already in the cache, as no table can follow how the chip overlaps instructions, and so is a 68000 or 68010 program's once OPT BIT gives it a bit field, which takes that same 68020 time: the panels mark it ≈, the exit line says "about", and the state's cycles carry estimate: true.
- All I/O is "trap #15" with the task number in D0.B, EASy68K's interface. Text and graphics share one window: what a program prints is drawn on the screen at the text cursor as well as appended to the console transcript. The screen starts at 640 by 480 and only the program resizes it, with task 33.
- These tasks stop the program with an error, so do not use them: ${M68K_REJECTED_TRAP_INFORMATION}. Task 92's bitwise drawing modes (0, 1, 3 and 5 to 15) stop it too.
${M68K_TRAP_INFORMATION}
${SYNTH_INFORMATION(`0x${SYNTH_BASES.m68k.toString(16).toUpperCase()} ($${SYNTH_BASES.m68k.toString(16).toUpperCase()})`, 'move.w', 'move.b', 'task 23 (delay)')}

## MIPS
- Uses the MARS assembler/emulator syntax and syscalls. Memory is little-endian.
- .data starts at 0x10010000. $sp starts at 0x7ffffffc and grows downward.
${MARS_SCREEN_INFORMATION('$v0', '$a0')}
${SYNTH_INFORMATION(`0x${SYNTH_BASES.mips.toString(16)}`, 'sh', 'sb', 'service 32 (sleep)')}

## RISC-V
- Uses the RARS assembler/emulator syntax and syscalls. Memory is little-endian.
- RISC-V is 32-bit; RISC-V-64 is 64-bit.
- .data starts at 0x10010000. sp starts at 0x7ffffffc and grows downward.
${MARS_SCREEN_INFORMATION('a7', 'a0')}
${SYNTH_INFORMATION(`0x${SYNTH_BASES.riscv.toString(16)}`, 'sh', 'sb', 'service 32 (sleep)')}

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

function renderSourceInstructions(
    enabledToolNames: DefaultCodingAgentToolName[],
    available: boolean
) {
    if (!available || !hasTool(enabledToolNames, 'compile_source')) {
        return '# C/C++\nC/C++ examples can be explained in chat. Source compilation is unavailable in this context; do not send C to the assembler or claim it was compiled.'
    }
    return `# C/C++ source workflow
These instructions take precedence over assembly workflow steps when editing C/C++.
- The project language is the target architecture; C is the source language of a .c file. Do not pass "C" as write_to_file's language. Write to an explicit path such as main.c or main.cpp, preserving existing assembly files.
- C/C++ compilation supports MIPS, RISC-V, RISC-V-64 and X86. Keep a saved project's target; for a fresh C example without a requested target, choose RISC-V using write_to_file's language parameter. M68K and Z80 do not support source compilation.
- Read existing source before editing. Edit the original C/C++ source or local headers rather than generated assembly. Source and header writes are saved without assembler checks and invalidate execution.
- Call compile_source with the .c/.cpp path after source or header edits. This sends one source file and the Project files its quoted includes reach to Compiler Explorer, requires internet, and generates assembly with compilation records and source maps. Other .c/.cpp files are not compiled or linked separately; put helpers in headers, or #include "helpers.c" from the source, which pastes the file in as one compilation.
- Start with optimization "0". When the source defines main, compile_source makes its generated assembly the selected program's Entry file. Then call compile (the assembly Build) before running or stepping. Compiler errors must be fixed in the source and recompiled; a saved source edit alone does not prove validity.
- MIPS and RISC-V support C17 with a supplied runtime, including printf/scanf, malloc/free, strings and math. Include the appropriate standard header. X86 is freestanding: use <sim.h> for I/O; printf, malloc and the hosted runtime are unavailable.
- <sim.h> declares simulator services; use search_documentation to find their signatures rather than guessing. C++ uses C++17 with compatibility headers and no full standard library, exceptions or RTTI.
- Debug execution through the generated assembly. Use generated assembly paths and instruction lines for breakpoints; registers and memory describe the target architecture. Keep user-facing explanations tied to the original source.
- For a fresh C example on MIPS or RISC-V, start with:
\`\`\`c
#include <stdio.h>

int main(void) {
    printf("Hello from C\\n");
    return 0;
}
\`\`\``
}

export function buildDefaultCodingAgentPrompt({
    enabledToolNames,
    enabledWorkflows,
    additionalInstructions = '',
    sourceCompilationAvailable = false
}: PromptOptions) {
    const sections = [
        'You are an assembly and C/C++ coding assistant with access to an interactive editor and emulator.',
        `# Core Principles\n${renderCorePrinciples(enabledToolNames)}`,
        `# Workflows\nPick the workflow that matches the user request. These are playbooks, not rigid scripts; skip steps only when they are clearly irrelevant. Context-specific workflows appended by the page take precedence.\n\n${renderWorkflowInstructions(enabledWorkflows)}`,
        renderToolSelectionTips(enabledToolNames),
        renderTemplates(enabledToolNames),
        renderSourceInstructions(enabledToolNames, sourceCompilationAvailable),
        EMULATOR_INFORMATION,
        additionalInstructions.trim()
    ].filter(Boolean)

    return sections.join('\n\n')
}
