import { memoryLayoutFromItems } from '../memoryRegions'
import {
    ccrToFlagsArray,
    type CodeWrite,
    type DeviceEvent,
    type ExecutionStep as CoreExecutionStep,
    type FileDialogMode,
    type InputSettings,
    type InstructionLine,
    Interpreter,
    type MachineState,
    type MemoryRange,
    InterpreterStatus as CoreInterpreterStatus,
    type Interrupt,
    type OpenedFile,
    type PokeWrite as CorePokeWrite,
    type Processor,
    type RegisterOperand,
    type Program,
    type StackFrame as CoreStackFrame,
    type SystemRegisters,
    S68k,
    Size
} from '@specy/s68k'
import { type CompileResult, type Instruction } from '#lib/languages/BaseEmulator.svelte.ts'
import {
    type ExecutionSlice,
    type ExecutionSliceRequest,
    sliceDeadline,
    sliceInstructionBudget
} from '#lib/languages/ExecutionSlice.ts'
import {
    type BuildArtifact,
    type ChangedCode,
    type CycleCount,
    type DataLabel,
    type Diagnostic,
    type EmulatorDecoration,
    type EmulatorSettings,
    type ExecutionStep,
    isLineBreakpoint,
    type MachineRegion,
    makeLabelColor,
    type MemoryLayout,
    type MemoryLayoutItem,
    type MutationOperation,
    type PokeWrite,
    type RegisterFileDescriptor,
    RegisterSize,
    type StackFrame
} from '#lib/languages/commonLanguageFeatures.svelte.ts'
import {
    ANIMATING_PANEL_REFRESH_MS,
    GenericEmulator
} from '#lib/languages/GenericEmulator.svelte.ts'
import type { OpenedSound } from '#lib/languages/peripherals/audio/Audio.ts'
import type { SynthBus } from '#lib/languages/peripherals/audio/Synth.ts'
import { SYNTH_BASES, SYNTH_BLOCK_SIZE } from '#lib/languages/synthRegisters.ts'
import { preferencesStore } from '#stores/preferencesStore.svelte.ts'
import type { Termination } from '#lib/languages/termination.ts'
import { WITH_BIT_FIELDS } from '#lib/languages/cycles.ts'
import type { ExecutionGeneration } from '#lib/languages/ExecutionController.ts'
import { getM68kErrorMessage, getM68kTerminationMessage } from '#lib/languages/M68K/M68kUtils.ts'
import {
    M68K_FIRST_USER_VECTOR,
    M68K_VECTOR_TABLE_SIZE,
    m68kAutovectorLevel,
    m68kExceptionName,
    m68kInterruptAbove,
    m68kInterruptMask,
    m68kIrqGetsThrough,
    m68kVectorAddress,
    m68kVectorLocation,
    m68kVectorName,
    m68kVectorTableStart
} from '#lib/languages/M68K/M68K-vectors.ts'
import {
    easy68kColorOf,
    M68K_DRAWING_MODES,
    M68K_MIN_SCREEN_HEIGHT,
    M68K_MIN_SCREEN_WIDTH,
    M68K_MOUSE_FLAGS,
    M68K_MOUSE_MODES,
    screenColorOf
} from '#lib/languages/M68K/M68K-traps.ts'
import {
    type FileDescriptorOptions,
    FileSystemGuestError,
    type FileSystemSession
} from '#lib/languages/peripherals/FileSystem.ts'
import type { MouseEventKind, MouseSnapshot } from '#lib/languages/peripherals/Mouse.ts'
import type { TerminalReadOptions } from '#lib/languages/peripherals/Terminal.svelte.ts'
import { echoToScreen } from '#lib/languages/peripherals/screen/textEcho.ts'
import { ScreenInstructionHistory } from '#lib/languages/peripherals/screen/ScreenInstructionHistory.ts'
import type { BuildInput, BuildSources } from '#lib/projectFiles.ts'
import { buildOutputPath } from '#lib/buildOutput.ts'
import { IrqTimers } from './irqTimers'
import { m68kAssemblyFiles } from './m68kAssemblyFiles'
import { s68kDiagnosticToDiagnostic } from './m68kDiagnostics'

const registerName = [
    'D0',
    'D1',
    'D2',
    'D3',
    'D4',
    'D5',
    'D6',
    'D7',
    'A0',
    'A1',
    'A2',
    'A3',
    'A4',
    'A5',
    'A6',
    'A7'
] as const

type M68KRegisterName = (typeof registerName)[number]

/** One instruction the Build laid out: where, the bytes it placed, and the line it came from. */
type PlacedInstruction = {
    address: number
    bytes: readonly number[]
    file: string
    line: number
    assembledAs?: string
}

/** Instructions laid out back to back, which one read of memory covers. */
type PlacedRun = { start: number; length: number; instructions: PlacedInstruction[] }

const M68K_FLAG_NAMES = ['X', 'N', 'Z', 'V', 'C']

/** The Register file of the 68000's system registers, beside the CPU file. */
const SYSTEM_FILE_ID = 'system'

/** SR's supervisor bit: set, A7 is the SSP; clear, the program is in user mode and A7 is the USP. */
const SR_SUPERVISOR = 0x2000
/** SR's master bit, the 68020's: in supervisor mode, set, A7 is the MSP, and clear, the ISP. */
const SR_MASTER = 0x1000
/**
 * The bits of SR's system byte a processor has: on the 68000 and the 68010 trace, supervisor and
 * the interrupt mask, `$A7`, and on the 68020 its second trace bit and M too, `$F7`. The others
 * always read 0, so a change of these is a change of the system byte on every processor.
 */
const SR_SYSTEM_BITS = 0xf700

/** A Status flag of the System file: its name and its bit in SR. */
type SystemFlag = { name: string; bit: number }

/** SR's system byte as the System file's Status flags show it, from its high bit down. */
const M68K_SYSTEM_FLAGS: readonly SystemFlag[] = [
    { name: 'T', bit: 15 },
    { name: 'S', bit: 13 },
    { name: 'I2', bit: 10 },
    { name: 'I1', bit: 9 },
    { name: 'I0', bit: 8 }
]

/**
 * The 68020's: T1, the 68000's T, which traces every instruction, and T0, which traces a change of
 * flow, then S and M, which choose between its three stack pointers, and the mask.
 */
const M68K_020_SYSTEM_FLAGS: readonly SystemFlag[] = [
    { name: 'T1', bit: 15 },
    { name: 'T0', bit: 14 },
    { name: 'S', bit: 13 },
    { name: 'M', bit: 12 },
    { name: 'I2', bit: 10 },
    { name: 'I1', bit: 9 },
    { name: 'I0', bit: 8 }
]

/** Each Status flag's bit in SR, by the name a System file gives it. */
const SYSTEM_FLAG_BITS = new Map(
    [...M68K_SYSTEM_FLAGS, ...M68K_020_SYSTEM_FLAGS].map(({ name, bit }) => [name, bit])
)

/** The 68000's system registers, as the System file names them. */
const SYSTEM_REGISTERS_68000 = [
    { name: 'SR', size: RegisterSize.Word },
    { name: 'USP' },
    { name: 'SSP' }
] as const

/**
 * The 68010's control registers after them: the vector base register, where the vector table
 * starts, and the source and destination function codes, three bits each, drawn as bytes.
 */
const SYSTEM_REGISTERS_68010 = [
    ...SYSTEM_REGISTERS_68000,
    { name: 'VBR' },
    { name: 'SFC', size: RegisterSize.Byte },
    { name: 'DFC', size: RegisterSize.Byte }
] as const

/**
 * The 68020's: its three stack pointers, the SSP under its 68020 name, the interrupt stack pointer,
 * beside the master stack pointer, then the 68010's control registers and its own cache registers,
 * which hold what `movec` writes with no cache behind them. ISP's hover says it is the 68000's SSP.
 */
const SYSTEM_REGISTERS_68020 = [
    { name: 'SR', size: RegisterSize.Word },
    { name: 'USP' },
    { name: 'ISP' },
    { name: 'MSP' },
    { name: 'VBR' },
    { name: 'SFC', size: RegisterSize.Byte },
    { name: 'DFC', size: RegisterSize.Byte },
    { name: 'CACR' },
    { name: 'CAAR' }
] as const

type SystemRegisterName =
    | (typeof SYSTEM_REGISTERS_68010)[number]['name']
    | (typeof SYSTEM_REGISTERS_68020)[number]['name']

/** Where each row of the System file is in the Core's `getSystem()`. */
const SYSTEM_FIELDS: Record<SystemRegisterName, keyof SystemRegisters> = {
    SR: 'sr',
    USP: 'usp',
    SSP: 'ssp',
    ISP: 'isp',
    MSP: 'msp',
    VBR: 'vbr',
    SFC: 'sfc',
    DFC: 'dfc',
    CACR: 'cacr',
    CAAR: 'caar'
}

/**
 * What each of the System file's registers is, which its name shows on hover, for the learner who
 * meets it there first.
 */
const SYSTEM_REGISTER_DESCRIPTIONS: Record<SystemRegisterName, string> = {
    SR: 'The status register: the condition codes in its low byte, and in its high byte the trace and supervisor bits and the interrupt mask, shown as the flags above.',
    USP: 'The user stack pointer: A7 in user mode.',
    SSP: 'The supervisor stack pointer: A7 in supervisor mode, where exceptions push their frames.',
    ISP: 'The interrupt stack pointer, which the 68000 calls the SSP: A7 in supervisor mode while M is clear, and the stack interrupts push their frames on.',
    MSP: 'The master stack pointer: A7 in supervisor mode while M is set. It starts at 0, so set it with movec before setting M.',
    VBR: 'The vector base register: where the vector table starts. Every exception reads its vector at VBR + 4 × its number.',
    SFC: 'The source function code: the address space moves reads from, three bits.',
    DFC: 'The destination function code: the address space moves writes to, three bits.',
    CACR: 'The cache control register. This 68020 has no cache, so only bits 0 (E, enable) and 1 (F, freeze) are kept, and they change nothing.',
    CAAR: 'The cache address register, which names a cache entry for CACR’s commands. This 68020 has no cache, so it only holds what is written.'
}

/**
 * The 68000's system registers as a Register file of their own, "System"
 * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decisions 3 and 25): the
 * whole status register, with its system byte as Status flags (trace, supervisor, the interrupt
 * mask), then the stack pointers, and in a program for the 68010 or the 68020 the 68010's control
 * registers VBR, SFC and DFC, and the 68020's MSP, CACR and CAAR, its SSP named ISP. A7 in the CPU
 * file is whichever stack pointer S, and on a 68020 M, makes active, and the CPU file's Status flags
 * stay the condition codes. Every register takes Pokes through the Core's own setters, which journal
 * them.
 */
function systemFiles(
    registers: readonly { name: SystemRegisterName; size?: RegisterSize }[],
    flags: readonly SystemFlag[]
) {
    return [
        {
            id: SYSTEM_FILE_ID,
            label: 'System',
            size: RegisterSize.Long,
            formats: ['hex'],
            flagNames: flags.map((flag) => flag.name),
            registers: registers.map((register) => ({
                ...register,
                description: SYSTEM_REGISTER_DESCRIPTIONS[register.name]
            }))
        }
    ] satisfies RegisterFileDescriptor[]
}

/** The Register files of a program for the 68000, which every program is until its Build. */
const M68K_REGISTER_FILES: RegisterFileDescriptor[] = systemFiles(
    SYSTEM_REGISTERS_68000,
    M68K_SYSTEM_FLAGS
)
/** Of a program for the 68010. */
const M68K_010_REGISTER_FILES: RegisterFileDescriptor[] = systemFiles(
    SYSTEM_REGISTERS_68010,
    M68K_SYSTEM_FLAGS
)
/** And of one for the 68020, with its second trace bit and M among the flags. */
const M68K_020_REGISTER_FILES: RegisterFileDescriptor[] = systemFiles(
    SYSTEM_REGISTERS_68020,
    M68K_020_SYSTEM_FLAGS
)

/** The Register files of a program for `processor`. */
function registerFilesOf(processor: Processor): RegisterFileDescriptor[] {
    return processor === '68020'
        ? M68K_020_REGISTER_FILES
        : processor === '68010'
          ? M68K_010_REGISTER_FILES
          : M68K_REGISTER_FILES
}

/**
 * The ranges of EASy68K's memory map as the memory view names them, with what each does to the
 * program's accesses as the Core enforces them
 * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 15): reads against
 * invalid and protected, writes against all four, and an instruction's fetch as a read. The
 * debugger is not the program: a Poke still writes into every one of them.
 */
const MEMORY_MAP_REGIONS: Record<MemoryRange['kind'], Omit<MachineRegion, 'start' | 'end'>> = {
    rom: {
        kind: 'rom',
        name: 'ROM',
        reason: 'The program can read and run code here, and its writes are ignored, so the bytes stay as they are; a Poke still changes them.'
    },
    read: {
        kind: 'readOnly',
        name: 'Read only',
        reason: 'The program can read and run code here, and a write by it raises a bus error; a Poke still changes it.'
    },
    protected: {
        kind: 'protected',
        name: 'Protected',
        reason: 'Only supervisor mode can use it: in user mode, any access by the program here, a read, a write or running code, raises a bus error. A Poke still changes it.'
    },
    invalid: {
        kind: 'invalid',
        name: 'Invalid',
        reason: 'Any access by the program here, a read, a write or running code, raises a bus error; a Poke still changes it.'
    }
}

/** The vector table's region, whose data labels are the vectors' names. */
const VECTORS_REGION_NAME = 'Exception vectors'
const VECTORS_REASON =
    'Each long word is the address of an exception’s handler. An odd one, as every vector holds until the program writes it, means there is no handler.'

/**
 * How many instructions the s68k interpreter runs in a millisecond, used to turn a slice's time
 * budget into a halt limit. Measured again on 2026-10-28 with the measurement harness, once the
 * Core ran from its decode cache: 13,000 to 14,000 on the compute-only loop under node (phase 8's
 * Core did about eighteen thousand there), and a program of 10,000 instructions now runs at 11,000
 * to 13,000 where it ran at about 6,000, since a step no longer searches the program for its
 * instruction. Rounded down, as a program that does more per instruction is slower, and a
 * trap-heavy one is bounded by the slice's deadline instead (see `_runSlice`); the scheduler's
 * speed correction takes up the rest.
 */
const M68K_INSTRUCTIONS_PER_MS = 12_000

/** The Synth's block, beside EASy68K's hardware devices at $E00000. */
const SYNTH_BASE = SYNTH_BASES.m68k
/** The 68000's address space: 24 bits. */
const M68K_MEMORY_SIZE = 0x100_0000

const READ_CHAR_QUESTION = 'Enter a character'
const READ_NUMBER_QUESTION = 'Enter a number'
const READ_STRING_QUESTION = 'Enter a string'
const FILE_DIALOG_QUESTION = 'Choose a File'

const INTERRUPT_INPUT_QUESTIONS: Partial<Record<Interrupt['type'], string>> = {
    ReadChar: READ_CHAR_QUESTION,
    ReadNumber: READ_NUMBER_QUESTION,
    ReadKeyboardString: READ_STRING_QUESTION,
    DisplayStringAndReadNumber: READ_NUMBER_QUESTION,
    FileDialog: FILE_DIALOG_QUESTION
}

/**
 * EASy68K's file numbers, which the FileSystem session hands out: the lowest free one from 0, and
 * at most eight open at once (`MAXFILES`, `SIMOPS2.CPP`), so a ninth open is answered with null.
 */
const EASY68K_FILE_DESCRIPTORS: FileDescriptorOptions = { firstDescriptor: 0, maxOpen: 8 }

/**
 * The switch for the M68K Build output: whether a Build saves its program as the S-record
 * EASy68K's assembler writes, `main.S68`, through the Build output host of
 * [ADR 0056](../../../../../../docs/adr/0056-a-build-saves-the-program-it-links-as-a-file.md),
 * and says in the Log when EASy68K cannot run it. Off until the owner picks the Build output
 * format, an ELF or a Build output option
 * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 32): while it is
 * off a Build saves no File, presents none to the program and says nothing of one. The code it
 * guards is kept so that choice need not rebuild it, and its tests turn the switch on.
 */
export const m68kSRecordOutput = { enabled: false }

/**
 * How the program ended when the editor answered a task with `Terminate`, which it no longer does for
 * any task since sound plays; kept so the Core's account of such an end still reads as an error.
 */
const ENDED_BY_THE_EDITOR = 'The editor ended the program at a trap #15 task it cannot carry out'

/** The Core's name for each Mouse event a program can ask an IRQ for with task 60. */
const MOUSE_DEVICE_EVENTS: Record<MouseEventKind, DeviceEvent> = {
    down: 'mouseDown',
    up: 'mouseUp',
    move: 'mouseMove'
}

const sizeMap = {
    [Size.Byte]: RegisterSize.Byte,
    [Size.Word]: RegisterSize.Word,
    [Size.Long]: RegisterSize.Long
} satisfies Record<Size, RegisterSize>

/**
 * The width a mutation names, as the panels count it. The Core's types declare the numeric `Size`
 * enum, but a step crosses the wasm boundary through serde, which spells the variant by name
 * (`"Long"`), so the name is looked up through the enum's reverse mapping before the table; a
 * history row would otherwise carry no width at all and read as "undefined bytes".
 */
function mutationSize(size: Size | keyof typeof Size): RegisterSize {
    return sizeMap[typeof size === 'string' ? Size[size] : size]
}

export function M68KEmulator(source: BuildInput, options: EmulatorSettings = {}) {
    return new AsmEditorM68KEmulator(source, options)
}

class AsmEditorM68KEmulator extends GenericEmulator<Interpreter, M68KRegisterName> {
    private program: Program | null = null
    /**
     * The processor the Build's program is written for, read once from it, since every read of
     * the Program's information copies its symbols out of the Core.
     */
    private programProcessor: Processor = '68000'
    /**
     * Whether the Build's program counts its processor's exact cycles, the 68000's and the
     * 68010's, rather than an estimate, the 68020's or a bit field's under `opt bit`: the Core's
     * `cyclesExact`, read with `programProcessor`.
     */
    private programCyclesExact = true
    private interpreter: Interpreter | null = null
    private screenInstructions: ScreenInstructionHistory | null = null
    /**
     * EASy68K's drawing mode 2, "move cursor but do not draw": the Windows GDI `R2_NOP` the
     * simulator sets, where a drawing operation leaves every pixel alone but still moves the drawing
     * point. Mode 4 puts it back; the other modes never reach the editor, the Core rejects them.
     */
    private penOnly = false
    /**
     * Whether the program has used the Screen, the Keyboard or the Mouse in this run. It is what
     * decides where the Terminal's interactive reads come from
     * ([ADR 0009](../../../../../../docs/adr/0009-share-screen-keyboard-input-with-terminal.md)).
     */
    private graphical = false
    /** What the Build laid out as code, read from the Core once per Build (`placedCode`). */
    private placed: PlacedRun[] | null = null
    /** The bytes of each instruction in `placed`, by its address (`ranAsBuilt`). */
    private placedBytes: Map<number, readonly number[]> | null = null
    /**
     * The addresses whose code changed since the Build, with what runs there now, as read at a
     * step id and a count of instructions run: the step id names one state of memory, which Undo
     * also comes back to, and the count moves with every instruction, as the step id does not
     * without an Undo history, where it stays 0. The reading stands until another instruction, an
     * Undo, a direct write or an answered trap changes memory.
     */
    private changedReading: {
        step: number
        executed: number
        changed: Map<number, string>
    } | null = null
    /** The program's labels by address, for the handler an exception went to (`labelAt`). */
    private labels: Map<number, string> | null = null
    /** The timers the program set with task 32, which the editor runs during a Run. */
    private readonly irqTimers = new IrqTimers()
    /** Ends the wait of a processor `stop` stopped, when a key or the mouse woke it. */
    private wakeFromStop: (() => void) | undefined
    /** Stops hearing the Screen's Keyboard and Mouse, once the Emulator is disposed. */
    private readonly stopHearingDevices: () => void

    constructor(source: BuildInput, options: EmulatorSettings) {
        super(
            source,
            {
                systemSize: RegisterSize.Long,
                registerNames: [...registerName],
                endianness: 'big',
                registerFiles: M68K_REGISTER_FILES
            },
            {
                ...options,
                language: options.language ?? 'M68K',
                baseAddress: options.baseAddress ?? 0x1000n,
                stackAddress: options.stackAddress ?? 0x2000n,
                initialMemoryValue: options.initialMemoryValue ?? 0xff
            }
        )
        //a key or the mouse on the Screen is told to the Core as it happens, which raises the IRQ
        //the program asked for on it ([ADR 0065](../../../../../../docs/adr/0065-m68k-devices-deliver-irqs.md))
        const { keyboard, mouse } = this._peripherals
        const fromKeyboard = keyboard.onKeyEvent((event) => this.reportDeviceEvent(event))
        const fromMouse = mouse.onMouseEvent((event) =>
            this.reportDeviceEvent(MOUSE_DEVICE_EVENTS[event])
        )
        this.stopHearingDevices = () => {
            fromKeyboard()
            fromMouse()
        }
    }

    protected getInstance(): Interpreter | null {
        return this.interpreter ?? null
    }

    clear(): void {
        super.clear()
        this.screenInstructions?.clear()
        //the interpreter outlives clear(), so the flags have to be zeroed explicitly like the legacy emulator did
        this.state.statusRegisters = M68K_FLAG_NAMES.map((name) => ({
            name,
            value: 0,
            prev: 0
        }))
        //the trap state of the run that just ended must not colour the next one: a program stopped
        //while drawing in mode 2 would otherwise start the next run unable to draw
        this.penOnly = false
        this.graphical = false
    }

    _beginPoke(): void {
        this.requireInterpreter().beginPoke()
    }

    _endPoke(): boolean {
        const interpreter = this.requireInterpreter()
        const changed = interpreter.endPoke()
        //a Poke into the Synth's block plays its registers as the program's own stores would
        this.takeSynthWrites(interpreter)
        return changed
    }

    _canUndo(): boolean {
        const interpreter = this.interpreter
        if (!interpreter?.canUndo()) return false
        //a Poke on top is the Core's alone to roll back: it drew nothing, touched no File, and it
        //holds a step id of its own that neither journal ever hung an effect on
        //([ADR 0022](../../../../../../docs/adr/0022-core-native-poke-records.md))
        if (interpreter.getUndoHistory(1)[0]?.kind === 'poke') return true
        const step = interpreter.getLastStepId()
        //both journals are asked before anything rolls back: one whose inverse is gone under its
        //budget stops Undo before this instruction ([ADR 0015](../../../../../../docs/adr/0015-restore-file-operations-on-undo.md))
        return (
            (this.screenInstructions?.canUndoAfter(step - 1) ?? true) &&
            (this.fileSystemSession?.canUndoAfter(step) ?? true)
        )
    }

    /** EASy68K's eight file numbers, from 0, rather than the 3 upward of MARS, RARS and Linux. */
    protected fileDescriptorOptions(): FileDescriptorOptions {
        return EASY68K_FILE_DESCRIPTORS
    }

    _checkCode(sources: BuildSources): Diagnostic[] {
        const result = S68k.assemble({ files: m68kAssemblyFiles(sources), entry: sources.entry })
        result.program?.dispose()
        return result.diagnostics.map((diagnostic) =>
            s68kDiagnosticToDiagnostic(diagnostic, sources)
        )
    }

    /**
     * How the Synth reaches this Target: big-endian, and an upload reads the 68000's 24-bit address
     * space, where an address past its 16 MB reads as 0.
     */
    private readonly synthBus: SynthBus = {
        littleEndian: false,
        read: (address, length) => {
            const bytes = new Uint8Array(length)
            const start = address & (M68K_MEMORY_SIZE - 1)
            const readable = Math.min(length, M68K_MEMORY_SIZE - start)
            const interpreter = this.interpreter
            if (interpreter && readable > 0) bytes.set(interpreter.readMemoryBytes(start, readable))
            return bytes
        }
    }

    _compile(sources: BuildSources): CompileResult {
        //Both hold WebAssembly memory the host never reclaims on its own, so the Interpreter is
        //disposed here as well as in `_dispose`: a Build replaces it, and the edit/Build loop would
        //otherwise abandon one interpreter's linear memory per Build.
        this.interpreter?.dispose()
        this.program?.dispose()
        this.program = null
        this.interpreter = null
        this.forgetPlacedCode()
        const result = S68k.assemble({ files: m68kAssemblyFiles(sources), entry: sources.entry })
        const diagnostics = result.diagnostics.map((diagnostic) =>
            s68kDiagnosticToDiagnostic(diagnostic, sources)
        )
        if (!result.program) {
            return {
                ok: false,
                diagnostics,
                report: diagnostics.map((diagnostic) => diagnostic.formatted).join('\n')
            }
        }
        this.program = result.program
        //a program written for the 68010 or the 68020 says so beside the registers, and of its
        //S-record that EASy68K cannot run it; one for the 68000, which is every program without
        //an `opt p=` line, says nothing, unless `opt bit` gave it the bit fields. Read in one copy
        //of the Program's information, which carries its symbols too
        const { processor, bitFields, cyclesExact } = result.program.getInfo()
        this.programProcessor = processor
        this.programCyclesExact = cyclesExact
        const shown = processorShown(processor, bitFields)
        const line = shown === undefined ? {} : { processor: shown }
        //its System file follows the processor too, but only once the Build is the current one,
        //in `_initialize`
        if (!m68kSRecordOutput.enabled) return { ok: true, diagnostics, ...line }
        //the Build output, while its switch is on: the S-record EASy68K's assembler writes,
        //`main.S68`, which EASy68K's simulator loads and runs
        const program = new TextEncoder().encode(result.program.toSRecord())
        if (processor === '68000') {
            return { ok: true, diagnostics, program, programFormat: 'srecord', ...line }
        }
        const note = laterProcessorOutputNote(buildOutputPath(sources, 'srecord'), processor)
        return {
            ok: true,
            diagnostics,
            program,
            programFormat: 'srecord',
            ...line,
            outputNotes: [{ tone: 'info', text: note }]
        }
    }

    _initialize(undoSize: number): void {
        const program = this.program
        if (!program) throw new Error('Interpreter not initialized')
        //the System file has the 68010's control registers, which the 68000 has not, and the
        //68020's stack pointers and cache registers. Declared here, which only the current Build
        //reaches, so that one a Stop or a newer Build cancelled leaves them as they were; they
        //stay as this Build made them until the next one, a Stop included, so that they do not
        //shrink and grow back while a Build clears them
        this.redeclareRegisterFiles(registerFilesOf(this.programProcessor))
        //a run starts reading what is typed in the Terminal; the first graphics, keyboard or mouse
        //task moves input to the focused Screen instead (see `useScreenInput`)
        this._peripherals.terminal.useTerminalInput((text) =>
            echoToScreen(this._peripherals.screen, text)
        )
        const interpreter = new Interpreter(program, {
            history_size: undoSize,
            keep_history: undoSize > 0
        })
        this.interpreter = interpreter
        this.forgetPlacedCode()
        //the program sets its timers itself, with task 32
        this.irqTimers.clear()
        this.wakeFromStop = undefined
        //the Synth's registers start at 0, as a chip's do at power-on, where the Core's memory
        //starts at $FF, except where the program put code or data of its own, which is left alone;
        //then every store into them stops the Core, which hands it over as it happens
        //([waveform-sound.md](../../../../../../docs/design/waveform-sound.md#memory-mapped-registers))
        const occupied = this.programInSynthBlock()
        let free: number = SYNTH_BASE
        for (const [start, end] of [...occupied, [SYNTH_BASE + SYNTH_BLOCK_SIZE, 0]]) {
            if (start > free) interpreter.writeMemoryBytes(free, new Uint8Array(start - free))
            free = Math.max(free, end)
        }
        if (occupied.length > 0) {
            this.addNote({
                tone: 'warning',
                text: "The program puts code or data at $E00100 to $E002FF, where the Synth's registers are: those bytes are left as the program put them, and storing there plays the Synth"
            })
        }
        interpreter.watchMemory(SYNTH_BASE, SYNTH_BASE + SYNTH_BLOCK_SIZE)
        this.screenInstructions = new ScreenInstructionHistory(this._peripherals.screen, undoSize)
        //a trap's output and reads are journaled under its step id, as its drawing is
        //([ADR 0057](../../../../../../docs/adr/0057-restore-the-terminal-on-undo.md))
        this._peripherals.terminal.trackHistory(() => interpreter.getLastStepId(), undoSize)
        //and so are the Sounds it plays and the slots it loads
        //([ADR 0059](../../../../../../docs/adr/0059-undo-takes-back-the-sounds-an-instruction-made.md))
        this._peripherals.audio.track(() => interpreter.getLastStepId(), undoSize)
    }

    _dispose(): void {
        this.stopHearingDevices()
        this.interpreter?.dispose()
        this.program?.dispose()
        this.interpreter = null
        this.program = null
        this.forgetPlacedCode()
    }

    private forgetPlacedCode(): void {
        this.placed = null
        this.placedBytes = null
        this.changedReading = null
        this.labels = null
    }

    /** The label the program put at `address`, the first it defined there, or undefined. */
    private labelAt(address: number): string | undefined {
        if (!this.labels) {
            // eslint-disable-next-line svelte/prefer-svelte-reactivity -- A lookup table rebuilt per Build; nothing renders from it.
            const labels = new Map<number, string>()
            for (const symbol of Object.values(this.program?.getSymbols() ?? {})) {
                if (symbol.kind === 'label' && !labels.has(symbol.value))
                    labels.set(symbol.value, symbol.name)
            }
            this.labels = labels
        }
        return this.labels.get(address)
    }

    /**
     * The code the Build laid out, in runs of instructions back to back: what `getInstructionAt`
     * answers of each address, which is what the Build placed and never what memory holds now.
     */
    private placedCode(): PlacedRun[] {
        if (this.placed) return this.placed
        const interpreter = this.interpreter
        const program = this.program
        if (!interpreter || !program) return []
        const runs: PlacedRun[] = []
        let run: PlacedRun | undefined
        for (const address of program.getInstructionAddresses()) {
            const instruction = interpreter.getInstructionAt(address)
            if (!instruction || instruction.size <= 0) continue
            if (!run || run.start + run.length !== address) {
                run = { start: address, length: 0, instructions: [] }
                runs.push(run)
            }
            run.instructions.push({
                address,
                bytes: instruction.bytes,
                file: instruction.location.file,
                line: instruction.location.line,
                ...(instruction.assembledAs ? { assembledAs: instruction.assembledAs } : {})
            })
            run.length += instruction.bytes.length
        }
        this.placed = runs
        return runs
    }

    /**
     * Each laid-out address whose bytes differ from what the Build placed, with the instruction
     * memory holds there now: one read of memory per run of code, and a disassembly only of what
     * changed, so a refresh costs a copy of the program's code.
     */
    private changedCodeAt(): Map<number, string> {
        const interpreter = this.interpreter
        if (!interpreter) return new Map()
        const step = interpreter.getLastStepId()
        const executed = interpreter.getExecutedInstructions()
        const reading = this.changedReading
        if (reading?.step === step && reading.executed === executed) return reading.changed
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- A reading copied into `changedCode`; nothing renders from it.
        const changed = new Map<number, string>()
        for (const run of this.placedCode()) {
            const now = interpreter.readMemoryBytes(run.start, run.length)
            for (const instruction of run.instructions) {
                const offset = instruction.address - run.start
                const same = instruction.bytes.every((byte, i) => now[offset + i] === byte)
                if (!same)
                    changed.set(
                        instruction.address,
                        interpreter.disassembleAt(instruction.address).text
                    )
            }
        }
        this.changedReading = { step, executed, changed }
        return changed
    }

    /**
     * Whether `bytes`, what a step ran at `address`, are what the Build placed there: a line that
     * the program changed and changed back ran other words in between, which its text does not say.
     */
    private ranAsBuilt(address: number, bytes: readonly number[]): boolean {
        if (!this.placedBytes) {
            // eslint-disable-next-line svelte/prefer-svelte-reactivity -- A lookup table rebuilt per Build; nothing renders from it.
            const placed = new Map<number, readonly number[]>()
            for (const run of this.placedCode())
                for (const instruction of run.instructions)
                    placed.set(instruction.address, instruction.bytes)
            this.placedBytes = placed
        }
        const built = this.placedBytes.get(address)
        return (
            built !== undefined &&
            built.length === bytes.length &&
            built.every((byte, i) => byte === bytes[i])
        )
    }

    /** Memory changed without a step of its own: a direct write, or the answer to a trap. */
    private forgetChangedCode(): void {
        this.changedReading = null
    }

    _getChangedCode(): ChangedCode[] {
        const changed = this.changedCodeAt()
        if (changed.size === 0) return []
        return this.placedCode().flatMap((run) =>
            run.instructions.flatMap((instruction) => {
                const runsNow = changed.get(instruction.address)
                return runsNow === undefined
                    ? []
                    : [
                          {
                              file: instruction.file,
                              line: instruction.line,
                              address: BigInt(instruction.address),
                              runsNow
                          }
                      ]
            })
        )
    }

    /**
     * The frames entered and not returned from: each `bsr` and `jsr` by the label it called, and
     * each exception taken by what raised it and its handler, `TRAP #3 → trap3_handler`, which
     * `rte` pops ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 28).
     * Its vector is where the table was when it was taken, the frame's own VBR, which a handler
     * that moves the table leaves as it was.
     */
    _getCallStack(): StackFrame[] {
        return (
            this.interpreter?.getCallStack().map((frame, i) => {
                const vector = frame.kind === 'exception' ? frame.vector : undefined
                const handler =
                    frame.label_location === undefined
                        ? m68kAddress(frame.address)
                        : frame.label_name
                //an IRQ's frame is named for its level, `IRQ 2 → timer`
                const level = vector === undefined ? undefined : m68kAutovectorLevel(vector)
                const what = level === undefined ? 'An exception' : `An IRQ at level ${level}`
                return {
                    address: BigInt(frame.address),
                    name:
                        vector === undefined
                            ? frame.label_name
                            : `${m68kExceptionName(vector, frame.cause, this.conditionalTrapOf(frame))} → ${handler}`,
                    ...(vector === undefined
                        ? {}
                        : {
                              detail: `${what}, taken through vector ${vector} at ${m68kVectorAddress(vector, frame.vbr ?? 0)}: \`rte\` returns to ${m68kAddress(frame.source_address)}`
                          }),
                    line: frame.label_location?.line ?? -1,
                    file: frame.label_location?.file,
                    sp: BigInt(frame.registers[15]),
                    destination: BigInt(frame.source_address),
                    color: makeLabelColor(i, frame.address)
                }
            }) ?? []
        )
    }

    /**
     * The `trap<cc>` that raised an exception frame, as the disassembler prints it, `TRAPEQ.W #$3`,
     * which names the frame after its condition: the 68020 stacks the instruction's own address
     * at +8 of its format $2 frame, where A7 pointed as the handler was entered. Undefined for a
     * frame that something else raised, and where memory no longer holds a whole address there.
     */
    private conditionalTrapOf(frame: CoreStackFrame): string | undefined {
        const interpreter = this.interpreter
        if (!interpreter || frame.cause !== 'ConditionalTrap') return undefined
        const stacked = interpreter.readMemoryBytes((frame.registers[15] + 8) >>> 0, 4)
        if (stacked.length < 4) return undefined
        const address = new DataView(stacked.buffer, stacked.byteOffset).getUint32(0)
        return interpreter.disassembleAt(address).text
    }

    /**
     * SR, USP and SSP, VBR, SFC and DFC where the program's processor has them, and the 68020's
     * ISP, MSP, CACR and CAAR.
     */
    _getRegisterFileValues(id: string): bigint[] {
        if (id !== SYSTEM_FILE_ID) throw new Error(`Unknown register file: ${id}`)
        const system = this.interpreter?.getSystem()
        return this.systemRegisterNames().map((name) =>
            BigInt((system?.[SYSTEM_FIELDS[name]] ?? 0) >>> 0)
        )
    }

    /** The rows of the System file the last Build declared. */
    private systemRegisterNames(): SystemRegisterName[] {
        const file = this.getRegisterFileDescriptors().find((file) => file.id === SYSTEM_FILE_ID)
        return (file?.registers ?? []).map((register) => register.name as SystemRegisterName)
    }

    /**
     * SR's system byte, T S I2 I1 I0, or on a 68020 T1 T0 S M I2 I1 I0, the flags the last Build
     * declared, with the SR the newest step found as the previous value, as the CPU file's
     * condition codes take theirs (`_getFlags`).
     */
    _getRegisterFileFlags(id: string): { name: string; value: number; prev?: number }[] {
        if (id !== SYSTEM_FILE_ID) throw new Error(`Unknown register file: ${id}`)
        const interpreter = this.interpreter
        const sr = interpreter?.getSr() ?? 0
        const prev = interpreter?.getUndoHistory(1)[0]?.old_sr ?? sr
        const file = this.getRegisterFileDescriptors().find((file) => file.id === SYSTEM_FILE_ID)
        return (file?.flagNames ?? []).map((name) => {
            const bit = SYSTEM_FLAG_BITS.get(name) ?? 0
            return { name, value: (sr >>> bit) & 1, prev: (prev >>> bit) & 1 }
        })
    }

    /**
     * A Poke of SR, the USP, the SSP, of the 68010's VBR, SFC and DFC, or of the 68020's ISP, MSP,
     * CACR and CAAR, through the Core's setters, which journal it inside a Poke: SR is cut to the
     * bits the processor has, a change of S, or on a 68020 of M, makes A7 another stack pointer, a
     * function code keeps its three bits and CACR its two.
     */
    _setRegisterFileValue(id: string, register: string, value: bigint): void {
        if (id !== SYSTEM_FILE_ID) throw new Error(`Unknown register file: ${id}`)
        const interpreter = this.requireInterpreter()
        const word = Number(BigInt.asUintN(32, value))
        if (register === 'SR') interpreter.setSr(word)
        else if (register === 'USP') interpreter.setUsp(word)
        else if (register === 'SSP') interpreter.setSsp(word)
        else if (register === 'VBR') interpreter.setVbr(word)
        else if (register === 'SFC') interpreter.setSfc(word)
        else if (register === 'DFC') interpreter.setDfc(word)
        else if (register === 'ISP') interpreter.setIsp(word)
        else if (register === 'MSP') interpreter.setMsp(word)
        else if (register === 'CACR') interpreter.setCacr(word)
        else if (register === 'CAAR') interpreter.setCaar(word)
        else throw new Error(`No System register named ${register}`)
    }

    _getCompiledCode(): { decorations: EmulatorDecoration[]; code: string } {
        //M68K has no pseudo instructions, so there is nothing to expand below a line. What a line
        //assembled as, where the assembler chose another form (`bra loop` is `BRA.S loop`), is
        //one instruction and the Build hover says it (`_getBuildArtifacts`)
        return { decorations: [], code: '' }
    }

    protected _getBuildArtifacts(): BuildArtifact[] {
        return this.placedCode().flatMap((run) =>
            run.instructions.map((instruction) => ({
                file: instruction.file,
                line: instruction.line,
                address: BigInt(instruction.address),
                opcode: hexBytes(instruction.bytes),
                //what the assembler chose where the line did not say: `bra loop` is `BRA.S loop`
                ...(instruction.assembledAs ? { assembledAs: instruction.assembledAs } : {})
            }))
        )
    }

    _getFlags(): { name: string; value: number; prev?: number }[] {
        const interpreter = this.interpreter
        if (!interpreter) {
            return M68K_FLAG_NAMES.map((name) => ({ name, value: 0, prev: 0 }))
        }
        const flags = interpreter
            .getFlagsAsArray()
            .map((flag) => (flag ? 1 : 0))
            .reverse()
        const last = interpreter.getUndoHistory(1)[0]
        if (last) {
            const old = ccrToFlagsArray(last.old_ccr.bits).reverse()
            return M68K_FLAG_NAMES.map((name, i) => ({
                name,
                value: flags[i],
                prev: Number(old[i])
            }))
        }
        return M68K_FLAG_NAMES.map((name, i) => ({ name, value: flags[i], prev: flags[i] }))
    }

    _getInstructionAt(address: bigint): Instruction | null {
        return toInstruction(this.interpreter?.getInstructionAt(Number(address)))
    }

    _getNextInstruction(): Instruction | null {
        return toInstruction(this.interpreter?.getNextInstruction())
    }

    _getLastInstruction(): Instruction | null {
        return toInstruction(this.interpreter?.getLastInstruction())
    }

    _getPc(): bigint {
        return BigInt(this.interpreter?.getPc() ?? 0)
    }

    _getMemoryLayout() {
        const values = this.program!.getLayoutItems()
        const items: MemoryLayoutItem[] = []
        for (let i = 0; i < values.length; i += 5)
            items.push({
                start: BigInt(values[i]),
                length: BigInt(values[i + 1]),
                kind: (['code', 'data', 'reserved'] as const)[values[i + 2]],
                section: `Section ${values[i + 3]}`,
                alignment: BigInt(values[i + 4])
            })
        const labels = Object.values(this.program!.getSymbols())
            .filter((symbol) => symbol.kind === 'label')
            .map((symbol) => ({
                name: symbol.name,
                address: BigInt(symbol.value),
                fromLibrary: false
            }))
        return withMachineRegions(
            memoryLayoutFromItems(items, labels),
            this.program!.getMemoryMap(),
            this.program!.getProcessor(),
            this.vectorBase()
        )
    }

    /** The vector table follows VBR, which `movec` moves, so the layout is read again when it does. */
    _getMemoryLayoutKey(): number {
        return this.vectorBase()
    }

    /** VBR, where the vector table starts: 0 on a 68000, which has none, and before a Build. */
    private vectorBase(): number {
        return this.interpreter?.getSystem().vbr ?? 0
    }
    _getStackTop() {
        return BigInt(this.interpreter?.getStackTop() ?? 0)
    }
    /** The parts of the Synth's block the program's own code and data take, start and end, in order. */
    private programInSynthBlock(): [number, number][] {
        const values = this.program?.getLayoutItems() ?? new Uint32Array()
        const parts: [number, number][] = []
        for (let i = 0; i < values.length; i += 5) {
            const start = Math.max(values[i], SYNTH_BASE)
            const end = Math.min(values[i] + values[i + 1], SYNTH_BASE + SYNTH_BLOCK_SIZE)
            if (start < end) parts.push([start, end])
        }
        return parts.sort((a, b) => a[0] - b[0])
    }

    /** The Synth's registers, which the memory view names and tints as a device. */
    _getDeviceRegions() {
        return [
            { name: 'Synth', start: BigInt(SYNTH_BASE), end: BigInt(SYNTH_BASE + SYNTH_BLOCK_SIZE) }
        ]
    }
    _resolveMemoryLabel(name: string) {
        const symbol = this.program?.getSymbols()[name]
        return symbol?.kind === 'label' ? BigInt(symbol.value) : undefined
    }

    _getSp(): bigint {
        return BigInt(this.interpreter?.getSp() ?? 0)
    }

    _getRegisterValues(): bigint[] {
        const interpreter = this.interpreter
        if (!interpreter) return new Array(this._registerNames.length).fill(0n)
        return interpreter
            .getCpuSnapshot()
            .getRegistersValues()
            .map((value) => BigInt(value))
    }

    _getUndoHistory(max: number): ExecutionStep[] {
        const interpreter = this.interpreter
        if (!interpreter) return []
        const steps = interpreter.getUndoHistory(max)
        //read only when a step ran on a line, which is when the line's own text could mislead
        const changed = steps.some((step) => step.kind === 'instruction' && step.location)
            ? this.changedCodeAt()
            : new Map<number, string>()
        //a 68020 program's cycles are an estimate, which each row marks
        const estimate = this.cyclesAreAnEstimate() ? { cyclesEstimate: true } : {}
        return steps.map((step): ExecutionStep => {
            if (step.kind === 'poke') {
                //a Poke ran no instruction, so it has no line to go to and no mutations of its
                //own: its row is what it wrote
                const writes = step.writes.map(convertPokeWrite)
                return {
                    kind: 'poke',
                    pc: step.pc,
                    old_ccr: step.old_ccr,
                    new_ccr: step.new_ccr,
                    line: -1,
                    writes,
                    mutations: writes.map(pokeWriteToMutation)
                }
            }
            const mutations = this.stepMutations(step)
            //an IRQ ran no instruction: its row is the request it took and the handler it went to,
            //"IRQ 2 → timer at $102C", on no line ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md),
            //decision 28)
            if (step.kind === 'irq') {
                return {
                    kind: 'irq',
                    pc: step.pc,
                    old_ccr: step.old_ccr,
                    new_ccr: step.new_ccr,
                    line: -1,
                    cycles: step.cycles,
                    ...estimate,
                    mutations,
                    ...(mutations.some((mutation) => mutation.type === 'TakeException')
                        ? {}
                        : { title: this.unhandledIrqTitle(step) })
                }
            }
            //the row of an instruction that wrote into code says so, as the Run's pause did
            if (step.wroteCode) {
                mutations.push({
                    type: 'Other',
                    value: `Wrote into its code at ${this.describeCodeWrite(step.wroteCode).replaceAll('`', '')}`
                })
            }
            //what ran where the source does not say: on no line, as in data, or on a line whose
            //bytes have changed since the Build, now or by the time it ran. The text is the step's
            //own, from the words it ran, so a later write into its code leaves it right; a step
            //that ran nothing, an instruction fetched from an odd address, has none
            const ran = step.ran
            const disassembly =
                ran &&
                (!step.location || changed.has(step.pc) || !this.ranAsBuilt(ran.address, ran.bytes))
                    ? ran.text
                    : undefined
            return {
                kind: 'instruction',
                pc: step.pc,
                old_ccr: step.old_ccr,
                new_ccr: step.new_ccr,
                line: step.location?.line ?? -1,
                file: step.location?.file,
                cycles: step.cycles,
                ...estimate,
                mutations,
                ...(disassembly === undefined ? {} : { disassembly })
            }
        })
    }

    /**
     * What an instruction did, as its History row lists it
     * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 28). An exception
     * it raised comes first, since that is what the row is about, with the handler's label, and the
     * frame the processor pushed follows it. A swap of the stack pointers says which mode the
     * processor went into, and on a 68020 which of its three stacks A7 became, a write of SR's
     * system byte by the instruction itself is a write of SR, `move An,usp` is a write of the USP,
     * and `movec` a write of the register it names; the 68010's loop mode, which changes only the
     * cycles, says when a loop enters and leaves it.
     */
    private stepMutations(step: CoreExecutionStep): MutationOperation[] {
        const exceptions: MutationOperation[] = []
        const rest: MutationOperation[] = []
        const m68020 = this.programProcessor === '68020'
        //what each swap of the stack pointers did, in the step's order
        const swaps = stackSwaps(step, m68020)
        let swap = 0
        for (const mutation of step.mutations) {
            switch (mutation.type) {
                case 'PushException': {
                    const { vector, from, handler, cause } = mutation.value
                    const label = this.labelAt(handler)
                    exceptions.push({
                        type: 'TakeException',
                        value: {
                            vector,
                            //named after the instruction where two share a vector: `TRAPEQ`
                            name: m68kExceptionName(vector, cause, step.ran?.text),
                            from: BigInt(from),
                            handler: BigInt(handler),
                            ...(label === undefined ? {} : { label })
                        }
                    })
                    break
                }
                case 'PopException':
                    rest.push({
                        type: 'ReturnFromException',
                        value: { from: BigInt(mutation.value.from), to: BigInt(mutation.value.to) }
                    })
                    break
                case 'WriteStackPointers': {
                    const { old, new: next } = mutation.value
                    //the 68020 calls the SSP its ISP, as the System file does
                    const writes = (['usp', 'ssp', 'msp'] as const).flatMap((register) =>
                        old[register] === next[register]
                            ? []
                            : [
                                  stackPointerWrite(
                                      m68020 && register === 'ssp' ? 'isp' : register,
                                      old[register],
                                      next[register]
                                  )
                              ]
                    )
                    if (writes.length > 0) {
                        rest.push(...writes)
                        break
                    }
                    //a change of S, or of M, moves no value: A7 becomes another stack pointer
                    rest.push({ type: 'Other', value: swaps[swap++] ?? 'Switched stacks' })
                    break
                }
                case 'SetMachineState':
                    rest.push(
                        ...machineStateChanges(mutation.value.old, mutation.value.new, step.new_sr)
                    )
                    break
                default:
                    rest.push(convertMutation(mutation))
            }
        }
        //`move #n,sr` and the like; an exception taken or returned from says what it did to SR
        const tookOrReturned = exceptions.length > 0 || rest.some(isReturnFromException)
        if (((step.old_sr ^ step.new_sr) & SR_SYSTEM_BITS) !== 0 && !tookOrReturned) {
            rest.unshift({
                type: 'WriteRegister',
                value: {
                    register: 'sr',
                    old: BigInt(step.old_sr),
                    new: BigInt(step.new_sr),
                    size: RegisterSize.Word
                }
            })
        }
        return [...exceptions, ...rest]
    }

    /**
     * The row of an IRQ the program ended on, whose autovector held no handler, so that it pushed
     * nothing to name it by: "IRQ 3: vector 27 at $00006C holds no handler", the level read from how
     * the program ended. Only the newest step can be that one.
     */
    private unhandledIrqTitle(step: CoreExecutionStep): string {
        const interpreter = this.interpreter
        const ended = interpreter?.getTermination()
        const newest = interpreter?.getUndoHistory(1)[0]
        if (
            ended?.type !== 'Exception' ||
            ended.value.cause.type !== 'Irq' ||
            newest?.id !== step.id
        )
            return 'IRQ'
        const { level } = ended.value.cause.value
        const vector = ended.value.vector
        return vector === undefined
            ? `IRQ ${level}`
            : `IRQ ${level}: vector ${vector} at ${m68kVectorAddress(vector, this.vectorBase())} holds no handler`
    }

    _hasTerminated(): boolean {
        return this.interpreter?.hasTerminated() ?? false
    }

    /**
     * Why the Core says the program ended, which Undo takes back with the step that ended it: task
     * 9 is an exit, which EASy68K gives no status; running past the last instruction is the end;
     * a runtime error is an error. `Terminate` from the editor, its answer to a sound task, is an
     * error too, since the program asked for something that did not happen. The Core also throws
     * every error it ends on, and `GenericEmulator` reports what was thrown, with the line, so this
     * says the same thing for a reader that only asks the Core. `simhalt` only pauses the program.
     */
    _getTermination(): Termination | undefined {
        const interpreter = this.interpreter
        const termination = interpreter?.getTermination()
        if (!interpreter || !termination) return undefined
        switch (termination.type) {
            case 'TerminateTask':
                return { kind: 'exit' }
            //EASy68K's SIMHALT outside the bytes the program placed: where a program that does
            //not end itself runs to, one past its last instruction or on through its data
            case 'EndOfProgram':
                return { kind: 'end', unwrittenMemory: m68kAddress(termination.value.address) }
            case 'TerminatedByHost':
                return { kind: 'error', message: ENDED_BY_THE_EDITOR }
            //an exception whose vector held no handler, or a double fault, which halts the CPU
            case 'Exception':
            case 'Halted': {
                const line = interpreter.getLastInstruction()?.location.line
                return {
                    kind: 'error',
                    message: this._stringifyRuntimeError(
                        termination.value.cause,
                        line === undefined ? undefined : line + 1
                    )
                }
            }
        }
    }

    _readMemoryBytes(address: bigint, length: bigint): Uint8Array {
        return this.requireInterpreter().readMemoryBytes(Number(address), Number(length))
    }

    _writeMemoryBytes(address: bigint, data: Uint8Array): void {
        this.requireInterpreter().writeMemoryBytes(Number(address), data)
        //outside a Poke this records no step, so the step id alone would not tell
        this.forgetChangedCode()
    }

    _setRegisterValue(
        register: M68KRegisterName,
        value: bigint,
        size: RegisterSize | undefined = RegisterSize.Long
    ): void {
        this.requireInterpreter().setRegisterValue(
            registerNameToType(register),
            Number(value),
            toCoreSize(size)
        )
    }

    async _step(): Promise<{ terminated: boolean }> {
        const interpreter = this.requireInterpreter()
        const execution = this.executionController.capture()
        //a processor `stop` stopped runs nothing until an IRQ above its mask comes, and a Step,
        //which meets no timer, does not wait for one: it says so ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md),
        //decision 29). One that a pending request woke takes that IRQ, a step of its own
        if (interpreter.getStatus() === CoreInterpreterStatus.Stopped) {
            const mask = m68kInterruptMask(interpreter.getSr())
            this.addNote({
                tone: 'info',
                text: `Step ran nothing: the processor is stopped, waiting for ${m68kInterruptAbove(mask)}, and ${heldBack(interpreter.getMachineState().pendingIrqs)}. Run waits for one, from a timer, a key or the mouse.`
            })
            return { terminated: false }
        }
        interpreter.step()
        if (interpreter.getStatus() === CoreInterpreterStatus.Interrupt) {
            const wait = await this.handleInterrupt(
                interpreter.getCurrentInterrupt(),
                interpreter,
                execution
            )
            //a step has no scheduler to hand the wait to, so it is awaited here; a testcase's
            //virtual clock makes that immediate (ADR 0010)
            if (wait) await this.executionController.waitFor(execution, () => wait)
            this.forgetChangedCode()
        }
        this.takeSynthWrites(interpreter)
        this.executionController.ensureCurrent(execution)
        return { terminated: interpreter.hasTerminated() }
    }

    _stringifyError(error: unknown, line?: number): string {
        return getM68kErrorMessage(
            error,
            line,
            undefined,
            this.program?.getMemoryMap(),
            this.programProcessor
        )
    }

    /**
     * The error the program ended on, at the address it ran when no line was laid out there. The
     * Core throws only the cause; its termination adds the vector that held no handler, "Division
     * by zero at line 12: vector 5 at $000014 holds no handler", or the exception whose frame
     * halted the CPU. A bus error names the range of the memory map that refused it.
     */
    _stringifyRuntimeError(error: unknown, line?: number): string {
        const address = line === undefined ? this.failedOutsideTheSource() : undefined
        const memoryMap = this.program?.getMemoryMap()
        const termination = this.interpreter?.getTermination()
        if (
            (termination?.type === 'Exception' || termination?.type === 'Halted') &&
            typeof error === 'object' &&
            error !== null &&
            (error as { type?: unknown }).type === termination.value.cause.type
        ) {
            return getM68kTerminationMessage(
                termination,
                line,
                address,
                memoryMap,
                this.vectorBase(),
                this.programProcessor
            )
        }
        return getM68kErrorMessage(error, line, address, memoryMap, this.programProcessor)
    }

    /**
     * Where the instruction that ended the program ran, when no line was laid out there: in data
     * the program ran into, or in bytes it changed. Undefined for any other end, and without a
     * history, which is what remembers the address. Read only for the error the program ended on,
     * since the end stays the Core's until an Undo takes it back, while other errors come and go.
     */
    private failedOutsideTheSource(): number | undefined {
        const interpreter = this.interpreter
        if (!interpreter) return undefined
        const ended = interpreter.getTermination()?.type
        if (ended !== 'Exception' && ended !== 'Halted') return undefined
        const [step] = interpreter.getUndoHistory(1)
        return step?.kind === 'instruction' && !step.location ? step.pc : undefined
    }

    _undo(): void {
        const interpreter = this.requireInterpreter()
        //the FileSystem cannot refuse half way through, so the step about to be rolled back is
        //checked first, as `_canUndo` checked it; a Poke never touched a File
        if (interpreter.getUndoHistory(1)[0]?.kind === 'instruction') {
            const id = interpreter.getLastStepId()
            if (!(this.screenInstructions?.canUndoAfter(id - 1) ?? true)) {
                throw new Error('Screen Undo history exhausted')
            }
            if (!(this.fileSystemSession?.canUndoAfter(id) ?? true)) {
                throw new Error('FileSystem Undo history exhausted')
            }
        }
        const step = interpreter.undo()
        //a timer the step set, or turned off, is as the Core now has it
        this.irqTimers.sync(interpreter.getMachineState().autoIrqs, this._peripherals.clock.now())
        //the Synth plays its block as the Core rewound it, a Poke's included
        const readSynth = () => interpreter.readMemoryBytes(SYNTH_BASE, SYNTH_BLOCK_SIZE)
        //a Poke has no instruction identity, so no journal hung anything on it and each must be
        //left where it is ([ADR 0022](../../../../../../docs/adr/0022-core-native-poke-records.md))
        if (step.kind === 'poke') return this._peripherals.audio.resyncSynth(readSynth)
        this.screenInstructions?.undoAfter(step.id - 1)
        this.fileSystemSession?.undoAfter(step.id)
        this._peripherals.terminal.undoAfter(step.id - 1)
        this._peripherals.audio.undoAfter(step.id - 1, readSynth)
    }

    /**
     * The Core counts the instructions it runs, so a slice's progress is the difference of two
     * readings whatever stopped each call: a trap, a `simhalt`, a store into the Synth's block. The
     * budget is the halt limit of every call, less what the slice has run, and an exhausted one is
     * reported by throwing. Only the last slice of a run carries the user's own instruction limit,
     * and only that one lets the error through.
     */
    async _runSlice(request: ExecutionSliceRequest): Promise<ExecutionSlice> {
        const interpreter = this.requireInterpreter()
        const budget = sliceInstructionBudget(request, M68K_INSTRUCTIONS_PER_MS)
        const isLastSlice = budget >= request.instructionBudget
        //a Listing's address Breakpoints are x86's alone
        const parsedBreakpoints = request.breakpoints.filter(isLineBreakpoint)
        const hasBreakpoints = parsedBreakpoints.length > 0
        const execution = this.executionController.capture()
        //a trap is one instruction of progress but can be a whole screen of work, so the budget says
        //nothing about how long this slice will hold the host: a program that clears and repaints in
        //a loop charged five instructions a frame and ran for minutes on the budget alone. The clock
        //is looked at once per trap, which is this loop's own granularity (phase 8)
        const deadline = sliceDeadline(request)
        const first = interpreter.getExecutedInstructions()
        const ran = () => interpreter.getExecutedInstructions() - first
        //every call below the first resumes the program with the program counter on an instruction
        //that has not run, so only the first may be told to skip a breakpoint on it: the Core's
        //`runWithBreakpoints` skips the instruction it starts on, and re-entering after a trap with
        //that skip on is what made the instruction after every trap unbreakable
        let startsTheRun = request.skipBreakpointAtPc
        //a store into the program's own code pauses the Run after it, unless the person turned
        //that off; a Testcase and a Step never pause for it
        const stopOnCodeWrite = this.pausesOnCodeWrite
        //the timers run during a Run only, counted from its start as EASy68K's are, and what
        //fired since the last slice reaches the Core here, between two slices
        this.runTimers(interpreter, request.startsRun === true)
        //an IRQ ready as the Run starts is its first step, past the Breakpoint it starts on
        const irqFirst = startsTheRun && hasBreakpoints && this.irqReady(interpreter)
        const startPc = interpreter.getPc()
        while (!interpreter.hasTerminated()) {
            const remaining = budget - ran()
            if (remaining <= 0) {
                //a stop on the last instruction the budget allowed, answered above, and the
                //program would run on: past the run's own limit when this slice ends it
                if (isLastSlice)
                    throw { type: 'ExecutionLimit', value: request.runInstructionLimit }
                return { reason: 'budget', instructions: ran() }
            }
            //never without progress: a slice that ran nothing ends the whole run
            if (ran() > 0 && performance.now() >= deadline) {
                return { reason: 'budget', instructions: ran() }
            }
            try {
                if (hasBreakpoints || stopOnCodeWrite) {
                    const status = interpreter.runWithBreakpoints(parsedBreakpoints, remaining, {
                        skipBreakpointAtPc: startsTheRun,
                        stopOnCodeWrite
                    })
                    startsTheRun = false
                    //the instruction that wrote into code has run, and the next one has not
                    if (status === CoreInterpreterStatus.CodeWrite) {
                        return this.pauseForCodeWrite(interpreter.getCodeWrite(), ran())
                    }
                    //here we might have reached a breakpoint. It is paused if the status is running
                    if (status === CoreInterpreterStatus.Running) {
                        if (irqFirst && returnedTo(interpreter, startPc)) {
                            this.noteIrqBeforeBreakpoint()
                        }
                        return { reason: 'breakpoint', instructions: ran() }
                    }
                } else {
                    interpreter.runWithLimit(remaining)
                }
            } catch (error) {
                if (!isExecutionLimitError(error)) throw error
                if (!isLastSlice) return { reason: 'budget', instructions: ran() }
                //the Core names the halt limit it was given, which is this slice's share of the
                //run; the user set the whole run's limit and that is the number they recognize
                throw { type: 'ExecutionLimit', value: request.runInstructionLimit }
            }
            //`simhalt` is a resumable program pause. End this Run here; the Core advances past the
            //directive before pausing, so a later Run or Step continues with the next instruction.
            if (interpreter.getStatus() === CoreInterpreterStatus.Paused) {
                return { reason: 'paused', instructions: ran() }
            }
            //`stop`: the processor waits for an IRQ, and the Run with it, without running anything
            if (interpreter.getStatus() === CoreInterpreterStatus.Stopped) {
                return {
                    reason: 'wait',
                    instructions: ran(),
                    wait: this.waitForIrq(interpreter, execution)
                }
            }
            const stopped = interpreter.getStatus()
            const wait = await this.handleInterpreterInterruption(interpreter, execution)
            //a Delay is program time, not execution: the scheduler awaits it between slices, so the
            //GUI keeps repainting and Stop still answers while it runs (ADR 0007, ADR 0010)
            if (wait) return { reason: 'wait', instructions: ran(), wait }
            //a trap's answer writes for the program, a line read into its own code included; and
            //a store into the Synth's block stops the Core as a watched write before it says that
            //the same instruction wrote into code, which the next call would forget
            const wrote =
                stopOnCodeWrite &&
                (stopped === CoreInterpreterStatus.Interrupt ||
                    stopped === CoreInterpreterStatus.WatchedWrite)
                    ? interpreter.getCodeWrite()
                    : null
            if (wrote && !interpreter.hasTerminated()) return this.pauseForCodeWrite(wrote, ran())
        }
        return { reason: 'terminated', instructions: ran() }
    }

    /**
     * The program's timers, task 32's, against the Core's settings, and the IRQs of those that
     * fired by now raised: a firing reaches the Core between two slices, at most a slice late
     * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 19). `restart` counts
     * every timer from now, as a Run starts.
     */
    private runTimers(interpreter: Interpreter, restart: boolean): void {
        const now = this._peripherals.clock.now()
        this.irqTimers.sync(interpreter.getMachineState().autoIrqs, now)
        if (restart) this.irqTimers.restart(now)
        if (interpreter.hasTerminated()) return
        for (const level of this.irqTimers.due(now)) interpreter.raiseIrq(level)
    }

    /** Whether a request is pending above the interrupt mask, which the next step takes. */
    private irqReady(interpreter: Interpreter): boolean {
        const mask = m68kInterruptMask(interpreter.getSr())
        return interpreter
            .getMachineState()
            .pendingIrqs.some((level) => m68kIrqGetsThrough(level, mask))
    }

    /**
     * Says why a Run stopped at once on the Breakpoint it started from: an IRQ was ready, so it was
     * the Run's first step rather than the Breakpoint's instruction, and its handler came back to
     * that instruction, whose Breakpoint stops it as any other does
     * ([ADR 0023](../../../../../../docs/adr/0023-run-continues-past-the-breakpoint-it-is-parked-on.md)).
     */
    private noteIrqBeforeBreakpoint(): void {
        this.addNote({
            tone: 'info',
            text: 'Run took a pending IRQ first, and its handler returned to the Breakpoint the Run started from, so the Run stopped there again. Run again to go on.'
        })
    }

    /**
     * The wait of a processor `stop` stopped ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md),
     * decisions 17 and 29). It ends when the next timer fires, when a key or the mouse raises an
     * IRQ that wakes the processor, at a Pause or at Stop, and spends none of the host's time
     * meanwhile; the slice after it takes the IRQ. A timer the interrupt mask holds back does not
     * end it: its firings are latched when the wait ends, as the next slice latches them. Meanwhile
     * the panels show where the program stopped, and the status line what it waits for. A Pause
     * leaves the processor stopped, and the status line saying so.
     *
     * A wait the next timer ends sooner than the panels' slowest refresh is a program pacing
     * itself, a game's frame, and refreshes them at the running rate: forcing them every frame read
     * the whole Core sixty times a second. A longer one, or one only a key or the mouse ends, shows
     * them current, as an input prompt does.
     */
    private waitForIrq(interpreter: Interpreter, execution: ExecutionGeneration): Promise<void> {
        const clock = this._peripherals.clock
        this.irqTimers.sync(interpreter.getMachineState().autoIrqs, clock.now())
        const mask = m68kInterruptMask(interpreter.getSr())
        const untilTimer = this.irqTimers.untilNext(clock.now(), (level) =>
            m68kIrqGetsThrough(level, mask)
        )
        this.refreshInputState(
            toInstruction(interpreter.getLastInstruction()),
            untilTimer === undefined || untilTimer > ANIMATING_PANEL_REFRESH_MS
        )
        //the status line says it whether or not the panels were read
        this.state.runStatus = this._getRunStatus()
        const timer = new AbortController()
        const woken = new Promise<void>((resolve) => {
            this.wakeFromStop = resolve
            //an aborted timer is one the wait no longer needs
            if (untilTimer !== undefined)
                clock.wait(untilTimer, timer.signal).then(resolve, () => {})
        })
        const over = () => {
            timer.abort()
            this.wakeFromStop = undefined
        }
        return this.executionController.whileUnpaused(execution, woken).then(
            () => {
                over()
                //what fired meanwhile, masked timers included, is latched now: a Pause takes no
                //slice after the wait, and the next Run counts the timers afresh
                this.runTimers(interpreter, false)
                //woken: the program runs on, and says what it does next once it is read again
                if (!this.executionController.pauseRequested) this.state.runStatus = undefined
            },
            (error: unknown) => {
                over()
                throw error
            }
        )
    }

    /**
     * A key or the mouse on the Screen, told to the Core as it happens: the Core latches the IRQ the
     * program asked for on that event with task 62 or 60, if it asked for one, and a processor
     * `stop` stopped wakes when that request gets past its mask
     * ([ADR 0065](../../../../../../docs/adr/0065-m68k-devices-deliver-irqs.md)). A Testcase has no
     * keyboard or mouse, and a program that has ended takes no request.
     */
    private reportDeviceEvent(event: DeviceEvent): void {
        const interpreter = this.interpreter
        if (!interpreter || this._peripherals.clock.isVirtual || interpreter.hasTerminated()) return
        if (interpreter.deviceEvent(event) === null) return
        if (interpreter.getStatus() !== CoreInterpreterStatus.Stopped) this.wakeFromStop?.()
    }

    /**
     * What the program waits for while `stop` has stopped the processor, for the status line
     * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 29): "Stopped:
     * waiting for an interrupt above level 3", adding when nothing the program set up can raise
     * one, and once a request has woken it, that the next step takes it.
     */
    _getRunStatus(): string | undefined {
        const interpreter = this.interpreter
        if (!interpreter || interpreter.hasTerminated()) return undefined
        const machine = interpreter.getMachineState()
        if (!machine.stopped) return undefined
        const mask = m68kInterruptMask(interpreter.getSr())
        if (interpreter.getStatus() !== CoreInterpreterStatus.Stopped) {
            const ready = machine.pendingIrqs.filter((level) => m68kIrqGetsThrough(level, mask))
            return ready.length > 0
                ? `Stopped: IRQ ${Math.max(...ready)} is pending, and the next step takes it`
                : 'Stopped: woken, and the next step goes on'
        }
        const waiting = `Stopped: waiting for ${m68kInterruptAbove(mask)}`
        const sources = [
            ...machine.autoIrqs.filter((timer) => timer.intervalMs > 0).map((timer) => timer.level),
            ...Object.values(machine.keyboardLevels),
            ...Object.values(machine.mouseLevels)
        ]
        return sources.some((level) => level > 0 && m68kIrqGetsThrough(level, mask))
            ? waiting
            : `${waiting}, which nothing the program set up can raise`
    }

    /**
     * The cycle counter under the registers ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md),
     * decisions 23 and 30): the 68000's clock cycles since the program started or task 30 cleared
     * it, which Undo takes back, and what the newest step took, an IRQ's 44 included. A Poke ran
     * nothing, so after one the counter shows no step's cost.
     */
    _getCycles(): CycleCount | undefined {
        const interpreter = this.interpreter
        if (!interpreter) return undefined
        const newest = interpreter.getUndoHistory(1)[0]
        const total = interpreter.getCycles()
        const estimate = this.cyclesAreAnEstimate() ? { estimate: true } : {}
        return newest && newest.kind !== 'poke'
            ? { total, last: newest.cycles, ...estimate }
            : { total, ...estimate }
    }

    /**
     * Whether the counts are an estimate rather than the processor's own time
     * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decisions 3 and 30): a
     * 68020 program's, which the Core counts from the manual's cache case, the 68020 overlapping
     * instructions in ways no table can follow (Core milestone C13d), and a 68000 or 68010
     * program's whose `opt bit` gave it a bit field, which takes that same time. The Core says
     * which, as `Program.hasExactCycles()`, read at the Build.
     */
    private cyclesAreAnEstimate(): boolean {
        return this.program !== null && !this.programCyclesExact
    }

    /** The Preference that pauses a Run after the program writes into its code, on by default. */
    private get pausesOnCodeWrite(): boolean {
        return preferencesStore.values.pauseOnCodeWrite?.value !== false
    }

    /**
     * Ends a slice after an instruction that wrote into the program's code, with a note naming what
     * it overwrote ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 4):
     * the Run pauses as at a Breakpoint, and the next Run goes on, the overwritten instruction
     * running as its new bytes decode.
     */
    private pauseForCodeWrite(write: CodeWrite | null, instructions: number): ExecutionSlice {
        if (write) {
            this.addNote({
                tone: 'warning',
                text: `The program wrote into its own code at ${this.describeCodeWrite(write)}. Run again to go on with the new bytes.`
            })
        }
        return { reason: 'codeWrite', instructions }
    }

    /**
     * Where a code write landed, as the History and the Log say it: the address, and the line laid
     * out there with its source, `$1008, line 4: \`add.w d1,d2\``, the File named when it is not the
     * Entry. An address alone for code no line was laid out at, as in data the program ran.
     */
    private describeCodeWrite(write: CodeWrite): string {
        const address = m68kAddress(write.address)
        const instruction =
            write.instructionIndex === undefined
                ? null
                : this.interpreter?.getInstructionAt(write.address)
        if (!instruction) return address
        const { file, line } = instruction.location
        const where = file === this.buildSources?.entry ? '' : ` of \`${file}\``
        return `${address}, line ${line + 1}${where}: \`${operationText(instruction.source)}\``
    }

    async _runTestcase(limit: number): Promise<void> {
        const interpreter = this.requireInterpreter()
        const execution = this.executionController.capture()
        const first = interpreter.getExecutedInstructions()
        while (!interpreter.hasTerminated()) {
            //a Testcase's timers fire on its virtual clock, which only waits move
            this.runTimers(interpreter, false)
            //one limit for the whole Testcase, however often a trap or a store into the Synth's
            //block stops the Core: a program looping on either would otherwise never end
            const remaining = limit - (interpreter.getExecutedInstructions() - first)
            if (remaining <= 0) throw { type: 'ExecutionLimit', value: limit }
            try {
                interpreter.runWithLimit(remaining)
            } catch (error) {
                //the Core names what was left of the limit; the Testcase's is the one it set
                if (isExecutionLimitError(error)) throw { type: 'ExecutionLimit', value: limit }
                throw error
            }
            //`simhalt` pauses rather than terminating, and that is where an interactive Run stops.
            //A Testcase has to observe the same state: resuming past it ran whatever follows the
            //halt — a subroutine in the usual EASy68K layout — and asserted against registers the
            //program never produced.
            if (interpreter.getStatus() === CoreInterpreterStatus.Paused) return
            //`stop`: the virtual clock jumps to the next timer that can wake the processor, so a
            //program driven by its timers runs at once, and one nothing can wake fails saying so
            //([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decisions 19 and 29)
            if (interpreter.getStatus() === CoreInterpreterStatus.Stopped) {
                await this.skipToNextTimer(interpreter, execution)
                continue
            }
            //a testcase runs unsliced, so a wait is awaited here; its clock is the virtual one, on
            //which waits complete at once (ADR 0010)
            const wait = await this.handleInterpreterInterruption(interpreter, execution)
            if (wait) await this.executionController.waitFor(execution, () => wait)
        }
    }

    /**
     * A Testcase's `stop`: its clock moves on to the next firing of a timer whose level gets past
     * the interrupt mask, which the loop then raises. A Testcase has no keyboard or mouse, so with
     * no such timer nothing can ever wake the processor, and the Testcase fails saying why rather
     * than running into its instruction limit.
     */
    private async skipToNextTimer(
        interpreter: Interpreter,
        execution: ExecutionGeneration
    ): Promise<void> {
        const clock = this._peripherals.clock
        const now = clock.now()
        this.irqTimers.sync(interpreter.getMachineState().autoIrqs, now)
        const mask = m68kInterruptMask(interpreter.getSr())
        const until = this.irqTimers.untilNext(now, (level) => m68kIrqGetsThrough(level, mask))
        if (until === undefined)
            throw { type: 'Raw', value: this.unwakeableStop(interpreter, mask) }
        await this.executionController.waitFor(execution, () => clock.wait(until))
    }

    /**
     * Why a Testcase's program can never wake from its `stop`: "The program stopped at line 9
     * waiting for an interrupt above level 0, which nothing in a Testcase can raise: it set no
     * timer with task 32, and a Testcase has no keyboard or mouse".
     */
    private unwakeableStop(interpreter: Interpreter, mask: number): string {
        const line = interpreter.getLastInstruction()?.location.line
        const where = line === undefined ? '' : ` at line ${line + 1}`
        const levels = this.irqTimers.levels
        const timers =
            levels.length === 0
                ? 'it set no timer with task 32'
                : levels.length === 1
                  ? `its timer, at level ${levels[0]}, is held back by the interrupt mask`
                  : `its timers, at levels ${levelList(levels)}, are held back by the interrupt mask`
        return `The program stopped${where} waiting for ${m68kInterruptAbove(mask)}, which nothing in a Testcase can raise: ${timers}, and a Testcase has no keyboard or mouse`
    }

    /**
     * Answers whatever the Core stopped for, and hands back the program-requested wait when the trap
     * was a Delay, for the caller to await where it belongs. A store into the Synth's block stops
     * the Core too, and answering a trap can write there, so the Synth is handed its writes after
     * either.
     */
    private async handleInterpreterInterruption(
        interpreter: Interpreter,
        execution: ExecutionGeneration
    ): Promise<Promise<void> | undefined> {
        const wait = await this.answerInterruption(interpreter, execution)
        //an answer writes for the instruction that asked, under that instruction's step id
        this.forgetChangedCode()
        this.takeSynthWrites(interpreter)
        return wait
    }

    /** Hands the Synth the stores the Core watched in its block, in the order they were made. */
    private takeSynthWrites(interpreter: Interpreter): void {
        const writes = interpreter.takeWatchedWrites()
        if (writes.length === 0) return
        const synth = this._peripherals.audio.synth
        for (const write of writes) {
            synth.store(write.address - SYNTH_BASE, write.size, write.value, this.synthBus)
        }
    }

    private async answerInterruption(
        interpreter: Interpreter,
        execution: ExecutionGeneration
    ): Promise<Promise<void> | undefined> {
        switch (interpreter.getStatus()) {
            case CoreInterpreterStatus.Terminated: {
                //not marked terminated here: the run that ends says so once it is over, with how
                //the program ended and its running time, which the Log reads together
                const ins = interpreter.getLastInstruction()
                this.state.line = ins?.location.line ?? -1
                if (ins) this.state.currentFile = ins.location.file
                break
            }
            case CoreInterpreterStatus.Interrupt: {
                if (this.state.terminated || !this.state.canExecute) break
                const ins = interpreter.getLastInstruction()
                this.state.line = ins?.location.line ?? -1
                if (ins) this.state.currentFile = ins.location.file
                const interrupt = interpreter.getCurrentInterrupt()
                //a trap is not a display frame: a graphical program reaches this a few hundred
                //times a second and the panels can only be seen sixty times a second. The traps
                //that stop and ask the user something are refreshed whatever the rate limit says
                this.refreshRunningPanels(
                    interrupt !== null && INTERRUPT_INPUT_QUESTIONS[interrupt.type] !== undefined
                )
                return await this.handleInterrupt(interrupt, interpreter, execution)
            }
            //nothing to answer: the caller hands the Synth a watched write, a run that pauses at a
            //`simhalt` or stops at a breakpoint ends before asking, and one that raises an
            //exception throws it
            case CoreInterpreterStatus.WatchedWrite:
            case CoreInterpreterStatus.CodeWrite:
            case CoreInterpreterStatus.Paused:
            case CoreInterpreterStatus.Running:
            case CoreInterpreterStatus.TerminatedWithException:
            case CoreInterpreterStatus.Stopped:
                break
        }
        return undefined
    }

    /**
     * The whole `trap #15` interface, task by task: EASy68K's tasks as the Core decodes them, each
     * routed to the peripheral that owns it
     * ([ADR 0003](../../../../../../docs/adr/0003-preserve-simulator-graphics-conventions.md)). The Core
     * owns what a task means: a display task hands over finished text, a read task takes what was
     * typed as it was typed, a file task what the FileSystem did, and the Core formats, parses and
     * writes EASy68K's results itself ([ADR 0035](../../../../../../docs/adr/0035-environments-match-their-reference.md)).
     * Answering is what resumes the Core, so every branch ends in `answerInterrupt`, with the answer
     * of the interrupt's own type; the Delay branch answers first and returns its wait, because the
     * program is not blocked on the trap any more, only on time passing.
     *
     * The whole task is associated with this trap's execution ID, including tasks like 18 that
     * print a prompt and then echo every character the user types. The compound journal makes
     * eviction of those effects atomic (ADR 0005), and a file task's changes are one FileSystem
     * frame under the same ID (ADR 0015).
     */
    private async handleInterrupt(
        interrupt: Interrupt | null,
        interpreter: Interpreter,
        execution: ExecutionGeneration
    ): Promise<Promise<void> | undefined> {
        if (!interrupt) throw new Error('Expected interrupt')
        this.executionController.ensureCurrent(execution)
        const terminal = this._peripherals.terminal
        const screen = this._peripherals.screen
        const before = screen.history.sequence
        const penOnlyBefore = this.penOnly
        const { type } = interrupt
        const question = INTERRUPT_INPUT_QUESTIONS[type]
        this.state.interrupt = question ? { type, message: question } : { type }
        screen.beginCompoundOperation()
        try {
            switch (type) {
                // ------------------------------------------------------------- text
                case 'DisplayStringWithCRLF': {
                    this.print(`${interrupt.value}\n`)
                    interpreter.answerInterrupt({ type })
                    break
                }
                //finished text: decoded from Windows-1252 and, for a number, formatted the way
                //EASy68K formats it (task 15 in upper case, task 20 in its signed field)
                case 'DisplayStringWithoutCRLF':
                case 'DisplayChar':
                case 'DisplayNumber':
                case 'DisplayNumberInBase':
                case 'DisplaySignedNumberInField':
                case 'DisplayStringAndNumber': {
                    this.print(interrupt.value)
                    interpreter.answerInterrupt({ type })
                    break
                }
                //the line as it was typed: the Core reads it with EASy68K's `atoi` (task 18 shows
                //its prompt first) and stores task 2's first 79 characters
                case 'DisplayStringAndReadNumber':
                case 'ReadNumber':
                case 'ReadKeyboardString': {
                    if (type === 'DisplayStringAndReadNumber') this.print(interrupt.value)
                    const line = await this.requestInput(
                        type === 'ReadKeyboardString' ? READ_STRING_QUESTION : READ_NUMBER_QUESTION,
                        execution,
                        this.readOptions(interpreter)
                    )
                    this.executionController.ensureCurrent(execution)
                    interpreter.answerInterrupt({ type, value: line })
                    break
                }
                case 'ReadChar': {
                    //one keystroke, from the Terminal or, once the Screen's Keyboard is the source,
                    //from the Screen (ADR 0009); Enter is EASy68K's $0D, the Terminal's Enter code
                    //for this Target (ADR 0036), which the Core also takes as a line feed
                    const char = await this.requestCharacter(
                        READ_CHAR_QUESTION,
                        execution,
                        this.readOptions(interpreter)
                    )
                    if (!char) throw new Error(`Expected a character, got "${char}"`)
                    this.executionController.ensureCurrent(execution)
                    interpreter.answerInterrupt({ type, value: char })
                    break
                }
                case 'Terminate': {
                    //task 9 ends the program in the Core without waiting for an answer; any other
                    //interrupt of this type is answered in kind, which also ends the program
                    interpreter.answerInterrupt({ type })
                    break
                }

                // ------------------------------------------------------------ files
                case 'CloseAllFiles': {
                    const closed = this.fileTask(interpreter, false, (files) => {
                        files.closeAll()
                        return true
                    })
                    interpreter.answerInterrupt({ type, value: closed })
                    break
                }
                case 'OpenFile': {
                    const path = interrupt.value
                    const opened = this.fileTask(interpreter, null, (files) =>
                        openExistingFile(files, path)
                    )
                    interpreter.answerInterrupt({ type, value: opened })
                    break
                }
                case 'NewFile': {
                    const path = interrupt.value
                    //`fopen(name, "w+b")`: created, or emptied, and open for reading and writing
                    const handle = this.fileTask(interpreter, null, (files) =>
                        files.open(path, { access: 'read-write', create: true, truncate: true })
                    )
                    interpreter.answerInterrupt({ type, value: handle })
                    break
                }
                case 'ReadFile': {
                    const { handle, count } = interrupt.value
                    //no bytes is the end of the file, which the Core reports as 1 in D0.W
                    const bytes = this.fileTask(interpreter, null, (files) =>
                        files.read(handle, count)
                    )
                    interpreter.answerInterrupt({ type, value: bytes })
                    break
                }
                case 'WriteFile': {
                    const { handle, bytes } = interrupt.value
                    //a full FileSystem is an error the program sees as 2, like any other
                    const written = this.fileTask(interpreter, false, (files) => {
                        files.write(handle, bytes)
                        return true
                    })
                    interpreter.answerInterrupt({ type, value: written })
                    break
                }
                case 'PositionFile': {
                    const { handle, offset } = interrupt.value
                    const moved = this.fileTask(interpreter, false, (files) => {
                        files.seek(handle, offset, 0)
                        return true
                    })
                    interpreter.answerInterrupt({ type, value: moved })
                    break
                }
                case 'CloseFile': {
                    const handle = interrupt.value
                    const closed = this.fileTask(interpreter, false, (files) => {
                        files.close(handle)
                        return true
                    })
                    interpreter.answerInterrupt({ type, value: closed })
                    break
                }
                case 'DeleteFile': {
                    const path = interrupt.value
                    const deleted = this.fileTask(interpreter, false, (files) => {
                        files.remove(path)
                        return true
                    })
                    interpreter.answerInterrupt({ type, value: deleted })
                    break
                }
                case 'FileExists': {
                    const path = interrupt.value
                    //every File of a Project can be written, and a Directory is not a File
                    const found = this.fileTask(interpreter, 'Missing' as const, (files) =>
                        files.stat(path)?.kind === 'file' ? 'Writable' : 'Missing'
                    )
                    interpreter.answerInterrupt({ type, value: found })
                    break
                }
                case 'FileDialog': {
                    //modal in its reference, so it is the app's Prompt rather than the console
                    const { mode, title, filter, path } = interrupt.value
                    //what the program played is heard while the dialog waits
                    this._peripherals.audio.flush()
                    const answer = await this._peripherals.terminal.inputDialog(
                        fileDialogQuestion(mode, title, filter),
                        execution,
                        path
                    )
                    this.executionController.ensureCurrent(execution)
                    //an empty answer cancels, as the dialog's Cancel does
                    interpreter.answerInterrupt({ type, value: answer || null })
                    break
                }

                // ------------------------------------------------------------ sound
                //the outcome is the editor's, D0.W the Core's: EASy68K leaves it alone for a File
                //that is not there, which only the Core knows to do
                //([audio.md](../../../../../../docs/design/audio.md#easy68ks-files-and-answers))
                case 'PlaySound':
                case 'PlaySoundDirectX': {
                    const sound = await this.openSound(interrupt.value, execution)
                    const player = type === 'PlaySound' ? 'standard' : 'directx'
                    const value = this._peripherals.audio.playFile(player, sound)
                    interpreter.answerInterrupt({ type, value })
                    break
                }
                case 'LoadSound':
                case 'LoadSoundDirectX': {
                    const sound = await this.openSound(interrupt.value.path, execution)
                    const player = type === 'LoadSound' ? 'standard' : 'directx'
                    const value = this._peripherals.audio.loadSlot(
                        player,
                        interrupt.value.index,
                        sound
                    )
                    if (type === 'LoadSound') interpreter.answerInterrupt({ type })
                    else interpreter.answerInterrupt({ type, value })
                    break
                }
                case 'PlayLoadedSound':
                case 'PlayLoadedSoundDirectX': {
                    const player = type === 'PlayLoadedSound' ? 'standard' : 'directx'
                    const value = this._peripherals.audio.playSlot(player, interrupt.value)
                    interpreter.answerInterrupt({ type, value })
                    break
                }
                case 'ControlSound':
                case 'ControlSoundDirectX': {
                    const player = type === 'ControlSound' ? 'standard' : 'directx'
                    const { index, control } = interrupt.value
                    const value = this._peripherals.audio.control(player, index, control)
                    interpreter.answerInterrupt({ type, value })
                    break
                }

                // --------------------------------------------------- keyboard and mouse
                case 'CheckKeyboardInput': {
                    this.useScreenInput()
                    //through the Terminal rather than straight to the Keyboard, so the poll and the
                    //read after it see the same pending input, scripted input included (ADR 0009)
                    interpreter.answerInterrupt({ type, value: terminal.hasPendingInput() })
                    break
                }
                case 'GetKeyState': {
                    this.useScreenInput()
                    const keyboard = this._peripherals.keyboard
                    const request = interrupt.value
                    if (request.type === 'Keys') {
                        const [first, second, third, fourth] = keyboard.areKeysDown(request.value)
                        interpreter.answerInterrupt({
                            type,
                            value: { type: 'Keys', value: [first, second, third, fourth] }
                        })
                        break
                    }
                    const { down, up } = keyboard.lastKeys()
                    interpreter.answerInterrupt({
                        type,
                        value: { type: 'LastKeys', value: { up, down } }
                    })
                    break
                }
                case 'ReadMouse': {
                    this.useScreenInput()
                    const mouse = this._peripherals.mouse
                    const mode = interrupt.value
                    const snapshot =
                        mode === M68K_MOUSE_MODES.LAST_UP
                            ? mouse.lastUp()
                            : mode === M68K_MOUSE_MODES.LAST_DOWN
                              ? mouse.lastDown()
                              : mouse.state()
                    interpreter.answerInterrupt({
                        type,
                        value: {
                            flags: mouseFlagsOf(snapshot),
                            x: snapshot.x,
                            y: snapshot.y
                        }
                    })
                    break
                }
                case 'SetSimulatorShortcuts': {
                    //nothing to give up: the Screen panel already hands every key it takes to the
                    //program, so enabling and disabling the shortcuts are both no-ops (ADR 0008)
                    interpreter.answerInterrupt({ type })
                    break
                }

                // ----------------------------------------------------------- the screen
                case 'SetPenColor': {
                    this.useScreenInput()
                    screen.setPenColor(screenColorOf(interrupt.value))
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'SetFillColor': {
                    this.useScreenInput()
                    screen.setFillColor(screenColorOf(interrupt.value))
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'DrawPixel': {
                    this.useScreenInput()
                    const [x, y] = interrupt.value
                    if (!this.penOnly) screen.drawPixel(x, y)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'GetPixelColor': {
                    this.useScreenInput()
                    const [x, y] = interrupt.value
                    interpreter.answerInterrupt({
                        type,
                        value: easy68kColorOf(screen.getPixel(x, y))
                    })
                    break
                }
                case 'DrawLine': {
                    this.useScreenInput()
                    const [x1, y1, x2, y2] = interrupt.value
                    //mode 2 draws nothing but still moves the drawing point, which tasks 84 and 85
                    //leave at their end point
                    if (this.penOnly) screen.moveTo(x2, y2)
                    else screen.drawLine(x1, y1, x2, y2)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'DrawLineTo': {
                    this.useScreenInput()
                    const [x, y] = interrupt.value
                    if (this.penOnly) screen.moveTo(x, y)
                    else screen.lineTo(x, y)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'MoveTo': {
                    this.useScreenInput()
                    const [x, y] = interrupt.value
                    screen.moveTo(x, y)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'DrawRectangle': {
                    this.useScreenInput()
                    const [x1, y1, x2, y2] = interrupt.value
                    if (!this.penOnly) screen.drawRectangle(x1, y1, x2, y2)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'DrawUnfilledRectangle': {
                    this.useScreenInput()
                    const [x1, y1, x2, y2] = interrupt.value
                    if (!this.penOnly) screen.drawUnfilledRectangle(x1, y1, x2, y2)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'DrawEllipse': {
                    this.useScreenInput()
                    const [x1, y1, x2, y2] = interrupt.value
                    if (!this.penOnly) screen.drawEllipse(x1, y1, x2, y2)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'DrawUnfilledEllipse': {
                    this.useScreenInput()
                    const [x1, y1, x2, y2] = interrupt.value
                    if (!this.penOnly) screen.drawUnfilledEllipse(x1, y1, x2, y2)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'FloodFill': {
                    this.useScreenInput()
                    const [x, y] = interrupt.value
                    if (!this.penOnly) screen.floodFill(x, y)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'DrawText': {
                    this.useScreenInput()
                    const [x, y, text] = interrupt.value
                    if (!this.penOnly) screen.drawText(x, y, text)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'SetPenWidth': {
                    this.useScreenInput()
                    screen.setPenWidth(interrupt.value)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'SetDrawingMode': {
                    this.useScreenInput()
                    this.setDrawingMode(interrupt.value)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'Repaint': {
                    this.useScreenInput()
                    screen.present()
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'GetPenPosition': {
                    this.useScreenInput()
                    interpreter.answerInterrupt({ type, value: [screen.penX, screen.penY] })
                    break
                }
                case 'SetScreenSize': {
                    this.useScreenInput()
                    const [width, height] = interrupt.value
                    //EASy68K's own minimum output window, which its help states for task 33
                    screen.resize(
                        Math.max(M68K_MIN_SCREEN_WIDTH, width),
                        Math.max(M68K_MIN_SCREEN_HEIGHT, height)
                    )
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'GetScreenSize': {
                    this.useScreenInput()
                    interpreter.answerInterrupt({ type, value: [screen.width, screen.height] })
                    break
                }
                case 'SetScreenMode': {
                    //windowed and full screen are the simulator window's business; here the Screen
                    //is a panel the user sizes, so both requests are accepted and ignored
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'ClearScreen': {
                    this.useScreenInput()
                    //text and graphics share one image, so clearing clears both and homes the cursor
                    screen.clear()
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'SetTextCursorPosition': {
                    this.useScreenInput()
                    const [column, row] = interrupt.value
                    screen.setCursor(column, row)
                    interpreter.answerInterrupt({ type })
                    break
                }
                case 'GetTextCursorPosition': {
                    this.useScreenInput()
                    interpreter.answerInterrupt({
                        type,
                        value: [screen.cursorColumn, screen.cursorRow]
                    })
                    break
                }

                // ------------------------------------------------------- program time
                case 'GetTime': {
                    //EASy68K counts hundredths since local midnight; Testcases use UTC.
                    interpreter.answerInterrupt({
                        type,
                        value: this._peripherals.clock.calendarHundredths()
                    })
                    break
                }
                case 'Delay': {
                    //answered before the wait: the program is no longer stopped on the trap, only on
                    //time passing, which the scheduler awaits between slices
                    interpreter.answerInterrupt({ type })
                    return this._peripherals.clock.waitHundredths(interrupt.value)
                }
                default:
                    return unknownInterrupt(type)
            }
        } finally {
            screen.endCompoundOperation()
            if (this.executionController.isCurrent(execution)) {
                this.screenInstructions?.record(
                    interpreter.getLastStepId(),
                    before,
                    this.penOnly === penOnlyBefore
                        ? undefined
                        : () => {
                              this.penOnly = penOnlyBefore
                          }
                )
            }
            this.state.interrupt = undefined
        }
        return undefined
    }

    /**
     * Reads a Sound File the program named, through the Build's FileSystem as the file tasks do, and
     * holds the program while its sound decodes or the sound bank loads. Undefined, and a note in
     * the Log as EASy68K's Message window had it, when no File has the path.
     */
    private async openSound(
        path: string,
        execution: ExecutionGeneration
    ): Promise<OpenedSound | undefined> {
        const audio = this._peripherals.audio
        const bytes = this.fileSystemSession?.readWhole(path)
        if (bytes === undefined) {
            audio.noteMissing(path)
            return undefined
        }
        const sound = audio.open({ path, bytes })
        const loading = sound && audio.prepare(sound)
        if (loading) await this.executionController.waitFor(execution, () => loading)
        this.executionController.ensureCurrent(execution)
        return sound
    }

    /**
     * Console output goes to the Terminal transcript and to the Screen's text cursor at once:
     * EASy68K has one output window where text and graphics share the image, and the transcript is
     * what testcases assert on (ADR 0003).
     */
    private print(text: string): void {
        this._peripherals.terminal.write(text)
        this._peripherals.screen.writeText(text)
    }

    /**
     * How the program set its reads to show what is typed: task 12's echo and task 16's prompt and
     * line feed. The Core keeps them and Undo puts them back, so they are asked for at each read.
     */
    private readOptions(interpreter: Interpreter): TerminalReadOptions {
        const { echo, prompt, line_feed } = interpreter.getInputSettings()
        return { echo, prompt, lineFeed: line_feed }
    }

    /**
     * One file task on the Build's FileSystem session, inside the Undo frame of the trap that asked
     * for it. The frame is keyed by the Core's step id, as the Screen journal's records are, so Undo
     * of that step puts back the Files, the open files and their positions with the registers
     * ([ADR 0015](../../../../../../docs/adr/0015-restore-file-operations-on-undo.md)). A failure the
     * program can be told about answers `failed`, which the Core turns into EASy68K's 2 in D0.W;
     * anything else, such as a session that has ended, ends the run.
     */
    private fileTask<T>(
        interpreter: Interpreter,
        failed: T,
        operation: (files: FileSystemSession) => T
    ): T {
        const files = this.fileSystemSession
        if (!files) throw new Error('The FileSystem is not running')
        return files.performInstruction(interpreter.getLastStepId(), () => {
            try {
                return operation(files)
            } catch (error) {
                if (error instanceof FileSystemGuestError) return failed
                throw error
            }
        })
    }

    /** Task 92, of whose modes the Core only ever forwards these four. */
    private setDrawingMode(mode: number): void {
        switch (mode) {
            case M68K_DRAWING_MODES.MOVE_WITHOUT_DRAWING:
                this.penOnly = true
                return
            case M68K_DRAWING_MODES.DRAW:
                this.penOnly = false
                return
            case M68K_DRAWING_MODES.DOUBLE_BUFFERING_OFF:
                this._peripherals.screen.setDoubleBuffering(false)
                return
            case M68K_DRAWING_MODES.DOUBLE_BUFFERING_ON:
                this._peripherals.screen.setDoubleBuffering(true)
                return
        }
    }

    /**
     * The Terminal's interactive source is chosen by what the program does, once per run: a program
     * that only prints reads what is typed in the Terminal, and the first graphics, keyboard or
     * mouse task moves reads to the focused Screen's Keyboard, echoing what is typed at the text
     * cursor as well as into the transcript (ADR 0003, ADR 0009). The switch happens at most once
     * and never goes back, so the source is still fixed for the run.
     */
    private useScreenInput(): void {
        if (this.graphical) return
        this.graphical = true
        const { terminal, keyboard, screen } = this._peripherals
        terminal.useKeyboardInput(keyboard, (text) => echoToScreen(screen, text))
    }

    private requireInterpreter(): Interpreter {
        if (!this.interpreter) throw new Error('Interpreter not initialized')
        return this.interpreter
    }
}

/**
 * Task 51 as EASy68K does it (`openFile`, `SIMOPS2.CPP`): for reading and writing, and failing that
 * for reading only, which the program learns as 3 in D0.W. Every File of a Project can be written
 * today, so the second open fails for the reason the first did; it is there for a File that cannot.
 */
function openExistingFile(files: FileSystemSession, path: string): OpenedFile {
    try {
        return { handle: files.open(path, { access: 'read-write' }), read_only: false }
    } catch (error) {
        if (!(error instanceof FileSystemGuestError)) throw error
        return { handle: files.open(path, { access: 'read' }), read_only: true }
    }
}

/**
 * Task 58's dialog as the Prompt asks it: whether it opens or saves, with the program's title and
 * filter, for a path from the Project root.
 */
function fileDialogQuestion(mode: FileDialogMode, title: string, filter: string): string {
    const action = mode === 'Open' ? 'The File to open' : 'The File to save to'
    const kinds = filter ? ` (${filter})` : ''
    const question = `${action}${kinds}, as a path from the Project root`
    return title ? `${title}: ${question.charAt(0).toLowerCase()}${question.slice(1)}` : question
}

/** A Core interrupt this adapter does not know, which the type checker says cannot happen. */
function unknownInterrupt(type: never): never {
    throw new Error(`Unknown interrupt type "${type}"`)
}

/** Task 61's flags byte: `Ctrl, Alt, Shift, Double, Middle, Right, Left` from bit 6 down. */
function mouseFlagsOf(snapshot: MouseSnapshot): number {
    return (
        (snapshot.left ? M68K_MOUSE_FLAGS.LEFT : 0) |
        (snapshot.right ? M68K_MOUSE_FLAGS.RIGHT : 0) |
        (snapshot.middle ? M68K_MOUSE_FLAGS.MIDDLE : 0) |
        (snapshot.double ? M68K_MOUSE_FLAGS.DOUBLE : 0) |
        (snapshot.shift ? M68K_MOUSE_FLAGS.SHIFT : 0) |
        (snapshot.alt ? M68K_MOUSE_FLAGS.ALT : 0) |
        (snapshot.ctrl ? M68K_MOUSE_FLAGS.CTRL : 0)
    )
}

/** IRQ levels in a sentence, lowest first: "2", "2 and 5", "1, 2 and 5". */
function levelList(levels: readonly number[]): string {
    const sorted = [...levels].sort((a, b) => a - b)
    const last = sorted.pop()
    return sorted.length === 0 ? `${last}` : `${sorted.join(', ')} and ${last}`
}

/**
 * What a stopped processor has pending, for a Step's note: "none is pending", or "IRQ 2 is pending
 * but held back by the interrupt mask". Every request it has is held back, since one past the mask
 * would have woken it.
 */
function heldBack(pending: readonly number[]): string {
    if (pending.length === 0) return 'none is pending'
    return pending.length === 1
        ? `IRQ ${pending[0]} is pending but held back by the interrupt mask`
        : `IRQs ${levelList(pending)} are pending but held back by the interrupt mask`
}

/** Whether the newest step is an `rte` back to `address`, as an IRQ handler's return. */
function returnedTo(interpreter: Interpreter, address: number): boolean {
    const [newest] = interpreter.getUndoHistory(1)
    return !!newest?.mutations.some(
        (mutation) => mutation.type === 'PopException' && mutation.value.to === address
    )
}

/** The Core's way of saying "the limit I was given ran out": `{ type: 'ExecutionLimit', value }`. */
function isExecutionLimitError(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        (error as { type?: unknown }).type === 'ExecutionLimit'
    )
}

/** A line's instruction as it was written, without its label and comment: `add.w d1,d2`. */
function operationText(source: string): string {
    const span = S68k.parseLine(source).operation?.span
    return (span ? source.slice(span.start, span.end) : source).trim()
}

/**
 * What the line beside the registers says the program is written for
 * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 3): a later processor,
 * `68020`, or one before the 68020 that `opt bit` gave the 68020's bit fields, `68000 with bit
 * fields`; nothing for a plain 68000 program, which is every program without an `opt` line.
 */
function processorShown(processor: Processor, bitFields: boolean): string | undefined {
    if (bitFields && processor !== '68020') return `${processor} ${WITH_BIT_FIELDS}`
    return processor === '68000' ? undefined : processor
}

/**
 * What the Log says of the S-record of a program for a later processor: EASy68K loads it, but its
 * simulator is a 68000's, with the 68020's bit fields of `opt bit` and nothing else of the later
 * processors ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 32).
 */
function laterProcessorOutputNote(path: string, processor: '68010' | '68020'): string {
    const runs =
        processor === '68020'
            ? "the 68000's instructions and, of the 68020's, only the bit fields, so the program stops there at the first other instruction the 68000 lacks"
            : "the 68000's instructions alone, so the program stops there at the first instruction the 68000 lacks"
    return `\`${path}\` is a program for the ${processor} (\`opt p=${processor}\`), which EASy68K does not simulate: it runs ${runs}.`
}

/**
 * The layout with what the 68000 and the program's memory map give a meaning
 * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decisions 3 and 31): the
 * vector table where VBR puts it, at 0 unless a program for the 68010 moved it, with a data label
 * for each of the processor's own vectors (0 to 63) and one for the user vectors, which only
 * vectored interrupts use and EASy68K has none of; and each range the program's `memory` lines
 * declare, `end` included. A table that VBR puts against the top of the 16 MB wraps round to
 * address 0, as the 24-bit bus does, so it is two regions of one name, the vectors past `$FFFFFF`
 * in the second. Vectors 0 and 1 are the reset stack pointer and program counter, which a
 * processor reads only from address 0, so where VBR moved the table they are named by their
 * numbers, and the region's hover says why. A Poke still writes into all of them (decision 15), so
 * none is read only memory.
 */
function withMachineRegions(
    layout: MemoryLayout,
    map: readonly MemoryRange[],
    processor: Processor,
    vbr: number
): MemoryLayout {
    const start = m68kVectorTableStart(vbr)
    const end = start + M68K_VECTOR_TABLE_SIZE
    const moved = (where: string): string =>
        `${VECTORS_REASON} The vector base register, VBR, ${where}. Vectors 0 and 1, the reset stack pointer and program counter, are read only from address 0, at reset, so VBR + 0 and VBR + 4 are not used.`
    const region = (from: number, to: number, reason: string): MachineRegion => ({
        kind: 'vectors',
        name: VECTORS_REGION_NAME,
        start: BigInt(from),
        end: BigInt(to),
        reason
    })
    //a VBR of a multiple of 16 MB puts the table at 0 too, the reset vectors where reset reads them
    const atZero = start === 0
    const tables = atZero
        ? [region(start, end, VECTORS_REASON)]
        : end <= M68K_MEMORY_SIZE
          ? [region(start, end, moved(`puts the table here, at ${m68kAddress(start)}`))]
          : [
                region(
                    start,
                    M68K_MEMORY_SIZE,
                    moved(
                        `puts the table here, at ${m68kAddress(start)}, and its last vectors past $FFFFFF, the top of the 24-bit bus, wrap round to $0`
                    )
                ),
                region(
                    0,
                    end - M68K_MEMORY_SIZE,
                    moved(
                        `puts the table at ${m68kAddress(start)}, and these are its last vectors, which run past $FFFFFF, the top of the 24-bit bus, and wrap round to $0`
                    )
                )
            ]
    const vector = (name: string, number: number): DataLabel => ({
        name,
        address: BigInt(m68kVectorLocation(number, vbr)),
        section: VECTORS_REGION_NAME,
        fromLibrary: false
    })
    const vectors = Array.from({ length: M68K_FIRST_USER_VECTOR }, (_, number) =>
        vector(
            !atZero && number < 2 ? `Vector ${number}` : m68kVectorName(number, processor),
            number
        )
    )
    vectors.push(vector('User vectors', M68K_FIRST_USER_VECTOR))
    const ranges = map
        .filter((range) => range.end >= range.start)
        .map((range) => ({
            ...MEMORY_MAP_REGIONS[range.kind],
            start: BigInt(range.start),
            end: BigInt(range.end) + 1n
        }))
    return {
        ...layout,
        dataLabels: [...layout.dataLabels, ...vectors].sort((a, b) =>
            a.address < b.address ? -1 : a.address > b.address ? 1 : a.name.localeCompare(b.name)
        ),
        machineRegions: [...tables, ...ranges]
    }
}

/** An address as EASy68K writes one, `$1012`. */
function m68kAddress(address: number): string {
    return `$${address.toString(16).toUpperCase()}`
}

/** An instruction's encoding as the Build hover shows machine code: `60 f6`. */
function hexBytes(bytes: readonly number[]): string {
    return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join(' ')
}

function toCoreSize(size: RegisterSize | undefined): Size {
    switch (size) {
        case RegisterSize.Byte:
            return Size.Byte
        case RegisterSize.Word:
            return Size.Word
        case RegisterSize.Long:
        default:
            return Size.Long
    }
}

function toInstruction(instruction: InstructionLine | null | undefined): Instruction | null {
    if (!instruction) return null
    return {
        address: BigInt(instruction.address),
        lineNumber: instruction.location.line,
        file: instruction.location.file,
        code: instruction.source
    }
}

type CoreMutation = CoreExecutionStep['mutations'][number]

/** The mutations that convert one for one; the stack pointers' and the exceptions' read the step. */
function convertMutation(
    mutation: Exclude<
        CoreMutation,
        { type: 'WriteStackPointers' | 'PushException' | 'PopException' | 'SetMachineState' }
    >
): MutationOperation {
    switch (mutation.type) {
        case 'WriteRegister':
            return {
                type: 'WriteRegister',
                value: {
                    old: BigInt(mutation.value.old),
                    new: BigInt(mutation.value.new),
                    size: mutationSize(mutation.value.size),
                    register: registerOperandToString(mutation.value.register)
                }
            }
        case 'WriteMemoryBytes':
            return {
                type: 'WriteMemoryBytes',
                value: {
                    address: BigInt(mutation.value.address),
                    old: mutation.value.old,
                    new: mutation.value.new
                }
            }
        case 'WriteMemory':
            return {
                type: 'WriteMemory',
                value: {
                    address: BigInt(mutation.value.address),
                    old: BigInt(mutation.value.old),
                    new: BigInt(mutation.value.new),
                    size: mutationSize(mutation.value.size)
                }
            }
        case 'PushCall':
            return {
                type: 'PushCallStack',
                value: {
                    to: BigInt(mutation.value.to),
                    from: BigInt(mutation.value.from)
                }
            }
        case 'PopCall':
            return {
                type: 'PopCallStack',
                value: {
                    to: BigInt(mutation.value.to),
                    from: BigInt(mutation.value.from)
                }
            }
        case 'SetInputSettings':
            return {
                type: 'Other',
                value: inputSettingsChange(mutation.value.old, mutation.value.new)
            }
        //`movec` into VBR, SFC, DFC, CACR or CAAR, as a write of that register: "Wrote long to
        //VBR"; a function code is three bits, drawn as a byte as the System file draws it
        case 'WriteControlRegister': {
            const { register, old, new: next } = mutation.value
            return {
                type: 'WriteRegister',
                value: {
                    register,
                    old: BigInt(old >>> 0),
                    new: BigInt(next >>> 0),
                    size:
                        register === 'sfc' || register === 'dfc'
                            ? RegisterSize.Byte
                            : RegisterSize.Long
                }
            }
        }
        case 'SetLoopMode':
            return { type: 'Other', value: loopModeChange(mutation.value) }
        default:
            return unsupportedMutation(mutation)
    }
}

/**
 * The 68010's loop mode, which changes only the cycles a loop takes, as the History says it: "Entered
 * loop mode at $1010: the loop's next turns fetch no instructions, so they take fewer cycles", and
 * "Left loop mode". The Core names the `DBcc` that loops, and leaves a side out when it is none.
 */
function loopModeChange(value: { new?: number | null }): string {
    const loop = value.new ?? null
    return loop === null
        ? 'Left loop mode'
        : `Entered loop mode at ${m68kAddress(loop)}: the loop's next turns fetch no instructions, so they take fewer cycles`
}

/** `move An,usp`, `movec` of a stack pointer, or a poke of one, as a write of that register. */
function stackPointerWrite(
    register: 'usp' | 'ssp' | 'isp' | 'msp',
    old: number,
    next: number
): MutationOperation {
    return {
        type: 'WriteRegister',
        value: {
            register,
            old: BigInt(old >>> 0),
            new: BigInt(next >>> 0),
            size: RegisterSize.Long
        }
    }
}

/** A stack pointer A7 can be: the USP, the ISP, which is the 68000's SSP, or the 68020's MSP. */
type Stack = 'usp' | 'isp' | 'msp'

/** Which stack pointer A7 is under status register `sr`. */
function activeStack(sr: number): Stack {
    return (sr & SR_SUPERVISOR) === 0 ? 'usp' : (sr & SR_MASTER) === 0 ? 'isp' : 'msp'
}

/**
 * What made a swap of the stack pointers, which says how the History tells it: the throwaway frame
 * of a 68020's interrupt in the master state, which clears M after its frame; the throwaway frame
 * `rte` pops, whose status register it writes before the frame under it; or any other write of
 * SR, an exception's entry, an instruction's, or `rte`'s of the frame it returns from.
 */
type SwapCause = 'throwaway' | 'unwind' | 'write'

/**
 * What each swap of the stack pointers in a step did, in the step's order, as the History says it
 * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decisions 25 and 28): "Switched
 * to user mode, so A7 is the USP", and on a 68020, whose M chooses between two supervisor stacks,
 * "Switched to the master stack, so A7 is the MSP".
 *
 * A swap moves no value, and the Core says which pointer each made A7, `a7`, the 68020's ISP
 * named `ssp` as on every processor; the first leaves the one the step's old SR has. What made
 * it is read from where it falls in the step: after the frame of an IRQ, the throwaway frame of
 * the master state, and before the frame `rte` pops, the throwaway frame `rte` popped first.
 */
function stackSwaps(step: CoreExecutionStep, m68020: boolean): string[] {
    const mutations = step.mutations
    const isSwap = (mutation: CoreMutation) =>
        mutation.type === 'WriteStackPointers' &&
        (['usp', 'ssp', 'msp'] as const).every(
            (register) => mutation.value.old[register] === mutation.value.new[register]
        )
    let from = activeStack(step.old_sr)
    return mutations.flatMap((mutation, at) => {
        if (mutation.type !== 'WriteStackPointers' || !isSwap(mutation)) return []
        const to: Stack = mutation.value.a7 === 'ssp' ? 'isp' : mutation.value.a7
        //what the swap comes before: the frame `rte` pops, or nothing more of the step
        const next = mutations
            .slice(at + 1)
            .find((later) => later.type === 'PopException' || isSwap(later))
        const afterFrame = mutations
            .slice(0, at)
            .some((earlier) => earlier.type === 'PushException')
        const cause: SwapCause =
            step.kind === 'irq' && afterFrame
                ? 'throwaway'
                : next?.type === 'PopException'
                  ? 'unwind'
                  : 'write'
        const text = stackSwapText(from, to, cause, m68020)
        from = to
        return [text]
    })
}

/** One swap of the stack pointers as the History says it, from `from` to `to`. */
function stackSwapText(from: Stack, to: Stack, cause: SwapCause, m68020: boolean): string {
    const user = 'user mode, so A7 is the USP'
    //a throwaway frame `rte` popped names a stack, the user stack too in one a program made
    if (cause === 'unwind') {
        const where =
            to === 'usp'
                ? user
                : to === 'msp'
                  ? 'the master stack, so A7 is the MSP'
                  : 'the interrupt stack, so A7 is the ISP'
        return `Popped the throwaway frame and switched to ${where}`
    }
    if (to === 'usp') return `Switched to ${user}`
    if (!m68020) return 'Switched to supervisor mode, so A7 is the SSP'
    const name = to === 'msp' ? 'MSP' : 'ISP'
    const stack = to === 'msp' ? 'the master stack' : 'the interrupt stack'
    if (from === 'usp') return `Switched to supervisor mode on ${stack}, so A7 is the ${name}`
    if (cause === 'throwaway') {
        return `Switched to ${stack} for the handler, so A7 is the ${name}, and pushed the throwaway frame there`
    }
    return `Switched to ${stack}, so A7 is the ${name}`
}

function isReturnFromException(mutation: MutationOperation): boolean {
    return mutation.type === 'ReturnFromException'
}

/**
 * What a step changed of the interrupt state, as the History names it
 * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 28): a timer task 32
 * set or turned off, "Set the level-2 timer to 500 ms"; a level task 62 or 60 gave an event,
 * "Key down raises IRQ 5"; a `stop`, "Stopped until an interrupt above level 0"; and the IRQ that
 * woke the processor, "Woke from stop". The requests the host latched and the IRQ taken say nothing
 * here: the row of the IRQ names it already. `sr` is the status register after the step.
 */
function machineStateChanges(
    old: MachineState,
    next: MachineState,
    sr: number
): MutationOperation[] {
    const changes: string[] = []
    const before = new Map(old.autoIrqs.map((timer) => [timer.level, timer.intervalMs]))
    const after = new Map(next.autoIrqs.map((timer) => [timer.level, timer.intervalMs]))
    for (const [level, intervalMs] of after) {
        if (before.get(level) !== intervalMs) {
            changes.push(`Set the level-${level} timer to ${intervalMs} ms`)
        }
    }
    for (const level of before.keys()) {
        if (!after.has(level)) changes.push(`Turned the level-${level} timer off`)
    }
    const levels = (name: string, from: number, to: number) => {
        if (from !== to) changes.push(`${name} raises ${to === 0 ? 'no IRQ' : `IRQ ${to}`}`)
    }
    levels('Key down', old.keyboardLevels.keyDown, next.keyboardLevels.keyDown)
    levels('Key up', old.keyboardLevels.keyUp, next.keyboardLevels.keyUp)
    levels('Mouse button down', old.mouseLevels.down, next.mouseLevels.down)
    levels('Mouse button up', old.mouseLevels.up, next.mouseLevels.up)
    levels('Mouse move', old.mouseLevels.move, next.mouseLevels.move)
    if (!old.stopped && next.stopped) {
        changes.push(`Stopped until ${m68kInterruptAbove(m68kInterruptMask(sr))}`)
    }
    if (old.stopped && !next.stopped) changes.push('Woke from stop')
    return changes.map((value) => ({ type: 'Other', value }))
}

/**
 * What task 12 or 16 changed, as the History names it: "Turned the echo off". The Core journals a
 * change only, so at least one of the three differs.
 */
function inputSettingsChange(old: InputSettings, next: InputSettings): string {
    const turned = (name: string, on: boolean) => `turned ${name} ${on ? 'on' : 'off'}`
    const changes = [
        old.echo !== next.echo ? turned('the echo', next.echo) : '',
        old.prompt !== next.prompt ? turned('the input prompt', next.prompt) : '',
        old.line_feed !== next.line_feed ? turned('the line feed after Enter', next.line_feed) : ''
    ].filter(Boolean)
    const text = changes.join(', ') || 'set the input settings'
    return text[0].toUpperCase() + text.slice(1)
}

/**
 * One value a Poke wrote, as the panels show it: unsigned bit patterns, and the register named the
 * way the Register file draws it (`D0`) rather than the way the Core spells it (`d0`).
 */
function convertPokeWrite(write: CorePokeWrite): PokeWrite {
    if (write.type === 'register') {
        return {
            type: 'register',
            name: pokeRegisterName(write.name),
            old: BigInt(write.old >>> 0),
            new: BigInt(write.new >>> 0)
        }
    }
    return {
        type: 'memory',
        address: BigInt(write.address),
        old: [...write.old],
        new: [...write.new]
    }
}

/** The mutation list a poked value reads as, so the coding agent sees a Poke as it sees a write. */
function pokeWriteToMutation(write: PokeWrite): MutationOperation {
    if (write.type === 'register') {
        return {
            type: 'WriteRegister',
            //a Poke writes the whole register, which is what `pokeRegisters` hands the Core
            value: { register: write.name, old: write.old, new: write.new, size: RegisterSize.Long }
        }
    }
    return {
        type: 'WriteMemoryBytes',
        value: { address: write.address, old: write.old, new: write.new }
    }
}

/**
 * The Core names a register the way the assembler does; the Register files draw it `D0`, `A7`, and
 * the System file's `SR`, `USP`, `SSP`, `VBR`, `SFC` and `DFC`.
 */
function pokeRegisterName(name: string): string {
    const upper = name.toUpperCase()
    return (registerName as readonly string[]).includes(upper) ||
        Object.hasOwn(SYSTEM_FIELDS, upper)
        ? upper
        : name
}

function unsupportedMutation(mutation: never): never {
    throw new Error(`Unsupported mutation: ${JSON.stringify(mutation)}`)
}

function registerNameToType(name: string) {
    return {
        value: Number(name[1]),
        type: name[0] === 'A' ? 'Address' : 'Data'
    } satisfies RegisterOperand
}

function registerOperandToString(op: RegisterOperand) {
    return op.type === 'Address' ? `a${op.value}` : `d${op.value}`
}
