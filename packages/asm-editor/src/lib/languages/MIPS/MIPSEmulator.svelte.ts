import { makeMipsCore } from './MIPS-core'
import {
    BackStepAction,
    isRuntimeError,
    type JsBackStep,
    type JsMips,
    MIPS,
    MIPS_COPROCESSOR0_REGISTER_NUMBERS,
    registerHandlers,
    type RegisterName,
    StopReason
} from '@specy/mips'
import {
    type EmulatorSettings,
    type MutationOperation,
    type RegisterFileDescriptor,
    RegisterSize
} from '#lib/languages/commonLanguageFeatures.svelte.ts'
import type { MarsTarget } from '#lib/languages/mars/marsCheck.ts'
import { MarsEmulator } from '#lib/languages/mars/MarsEmulator.svelte.ts'
import { memoryBackstepMutation, registerBackstepMutation } from '#lib/languages/mars/marsUndo.ts'
import { exitStepText, randomStreamStepText } from '#lib/languages/mars/marsHandlers.ts'
import type { BuildInput } from '#lib/projectFiles.ts'
import {
    MIPSCoprocessor0RegisterNames,
    MIPSCoprocessor1RegisterNames,
    MIPSNumericRegisterNames,
    MIPSRegisterNames,
    type MIPSRegisterName
} from './MIPS-registers'

/**
 * How many instructions the TeaVM compiled Core runs in a millisecond, used to turn a slice's time
 * budget into a halt limit. Measured on a compute-only loop under node, built with the shipped undo
 * history: about 7 000 (`npm run measure`, three runs of 6 800 to 7 100, after the undo recorder
 * stopped counting in longs; the 11 000 before it was taken on a Core that has since slowed, and
 * the harness measured about 2 000 on the same loop before the recorder was fixed). The estimate
 * of 6 500 before that was taken while the Core read the
 * self-modifying-code setting out of a string map on every instruction fetch and the delayed
 * branching setting on every branch - each a hash lookup and a `Boolean.parseBoolean`, which
 * lowercases a fresh string - fetched through five calls that re-checked alignment and both text
 * segments, assembled every aligned word load and store a byte at a time, and found a register by
 * scanning all thirty-two. The estimate of 1 000 before that was taken while MARS still entered a
 * monitor on every register access, every memory table access, every backstep push and once more
 * around each instruction; TeaVM compiles those to real monitor enter and exit calls and this Core
 * is single threaded, so dropping them made the same loop about five times faster.
 */
const MIPS_INSTRUCTIONS_PER_MS = 7_000

/**
 * How much wall time one `simulate*` call aims at, which is also about how far a chunk can carry the
 * slice past its deadline before the next check (`marsSlice.ts`). A millisecond
 * is about eleven thousand instructions of compute and fifty calls in a compute slice, which the
 * call overhead measured there puts at half a percent of throughput.
 */
const MIPS_CHUNK_TARGET_MS = 1

/** The compare flags `c.cond.s` writes, numbered as MARS's Coproc 1 tab labels them. */
const MIPS_CONDITION_FLAG_NAMES = ['0', '1', '2', '3', '4', '5', '6', '7']

/**
 * The two Register files MARS holds beside the general registers, named as its Coproc 1 and Coproc 0
 * tabs name them ([the design record](../../../../../../docs/design/register-files.md)). The FPU is 32 bits
 * wide and a double lives in an even/odd pair, so it declares `pairedDoubles`, and the eight compare
 * flags are its own Status flags. CP0 is read as hexadecimal only: its four registers are bit fields,
 * not numbers.
 */
const MIPS_REGISTER_FILES: RegisterFileDescriptor[] = [
    {
        id: 'fpu',
        label: 'FPU',
        size: RegisterSize.Long,
        formats: ['single', 'double', 'hex'],
        pairedDoubles: true,
        flagNames: MIPS_CONDITION_FLAG_NAMES,
        registers: MIPSCoprocessor1RegisterNames.map((name) => ({ name }))
    },
    {
        id: 'cp0',
        label: 'CP0',
        size: RegisterSize.Long,
        formats: ['hex'],
        registers: MIPSCoprocessor0RegisterNames.map((name) => ({ name }))
    }
]

export function MIPSEmulator(source: BuildInput, options: EmulatorSettings = {}) {
    return new AsmEditorMIPSEmulator(source, options)
}

/** MARS's Emulator (`MarsEmulator`), with the HI/LO registers and its FPU and CP0 files. */
class AsmEditorMIPSEmulator extends MarsEmulator<JsMips, JsBackStep, MIPSRegisterName> {
    constructor(source: BuildInput, options: EmulatorSettings) {
        super(
            source,
            {
                systemSize: RegisterSize.Long,
                registerNames: [...MIPSRegisterNames],
                hiddenRegisters: ['$zero'],
                registerFiles: MIPS_REGISTER_FILES
            },
            { ...options, language: options.language ?? 'MIPS' },
            {
                instructionsPerMs: MIPS_INSTRUCTIONS_PER_MS,
                chunkTargetMs: MIPS_CHUNK_TARGET_MS,
                makeCore: makeMipsCore,
                checkProgramArguments: (argv) => MIPS.checkProgramArguments(argv),
                registerHandlers,
                isRuntimeError,
                stopReasons: StopReason,
                formatStatement
            }
        )
        //`pc`, `hi` and `lo` are readable in testcase expectations but the core has no setter for
        //them, so they must not be offered as starting registers (see `_setRegisterValue`)
        this.state.startingRegisterNames = [...MIPSNumericRegisterNames]
    }

    protected get target(): MarsTarget {
        return 'MIPS'
    }

    _getPc(): bigint {
        return BigInt(this.core?.programCounter ?? 0)
    }

    _getSp(): bigint {
        return BigInt(this.core?.stackPointer ?? 0)
    }

    _getRegisterValues(): bigint[] {
        const mips = this.core
        if (!mips) return new Array(this._registerNames.length).fill(0n)
        return [...mips.getRegistersValues(), mips.programCounter, mips.getHi(), mips.getLo()].map(
            (value) => BigInt(value)
        )
    }

    /**
     * One flat Core call per file, as [ADR 0021](../../../../../../docs/adr/0021-register-files-from-core-exports.md)
     * has it. MARS hands both arrays over as `Int32Array` of signed 32 bit ints, so a pattern with
     * the top bit set reads back negative and `>>> 0` is what turns it into the bit pattern the
     * panel renders. Without a Core there is nothing to read and the file shows zeros, as the CPU
     * registers do before a Build.
     */
    _getRegisterFileValues(id: string): bigint[] {
        const mips = this.core
        if (id === 'fpu') {
            if (!mips) return new Array(MIPSCoprocessor1RegisterNames.length).fill(0n)
            return Array.from(mips.getCoprocessor1Values(), (value) => BigInt(value >>> 0))
        }
        if (id === 'cp0') {
            if (!mips) return new Array(MIPSCoprocessor0RegisterNames.length).fill(0n)
            return Array.from(mips.getCoprocessor0Values(), (value) => BigInt(value >>> 0))
        }
        throw new Error(`Unknown register file: ${id}`)
    }

    /**
     * The FPU's eight compare flags, the only file of the two that has any. No `prev` is reported:
     * MARS remembers a previous value only inside its backstep stack, so `GenericEmulator` diffs
     * each flag against what the last refresh read.
     */
    _getRegisterFileFlags(id: string): { name: string; value: number; prev?: number }[] {
        if (id === 'cp0') return []
        if (id !== 'fpu') throw new Error(`Unknown register file: ${id}`)
        const flags = this.core?.getConditionFlags() ?? []
        return MIPS_CONDITION_FLAG_NAMES.map((name, index) => ({
            name,
            value: flags[index] ?? 0
        }))
    }

    /**
     * Writes one register of a Register file, for a preset value. The Core's setters bypass the
     * backstepper, so such a write never becomes an entry the simulation can step back over.
     */
    _setRegisterFileValue(id: string, register: string, value: bigint): void {
        const mips = this.requireCore()
        const word = Number(BigInt.asUintN(32, value))
        if (id === 'fpu') {
            const index = MIPSCoprocessor1RegisterNames.indexOf(register)
            if (index < 0) throw new Error(`No FPU register named ${register}`)
            mips.setCoprocessor1Value(index, word)
            return
        }
        if (id === 'cp0') {
            const index = MIPSCoprocessor0RegisterNames.indexOf(register)
            if (index < 0) throw new Error(`No CP0 register named ${register}`)
            //coprocessor 0 is sparse, so the setter takes the register's MIPS number and not its
            //position in the file
            mips.setCoprocessor0Value(MIPS_COPROCESSOR0_REGISTER_NUMBERS[index], word)
            return
        }
        throw new Error(`Unknown register file: ${id}`)
    }

    _setRegisterValue(register: MIPSRegisterName, value: bigint, _size?: RegisterSize): void {
        const name = toNumericRegisterName(register)
        this.requireCore().setRegisterValue(name, Number(value))
    }

    /** Every MIPS register is a word wide, in all three files. */
    protected pokeRegisterSize(): RegisterSize {
        return RegisterSize.Long
    }

    /**
     * One back step as a mutation of its instruction's row, or none for the Core's own bookkeeping.
     * Every action has a case, so a new one is a type error here rather than a row nobody chose.
     */
    protected backstepToMutation(step: JsBackStep): MutationOperation | null {
        switch (step.action) {
            case BackStepAction.REGISTER_RESTORE:
                return registerBackstepMutation(
                    step,
                    getRegisterFileName(step.param1),
                    RegisterSize.Long
                )
            case BackStepAction.COPROC0_REGISTER_RESTORE:
                return registerBackstepMutation(
                    step,
                    getCP0RegisterName(step.param1),
                    RegisterSize.Long
                )
            case BackStepAction.COPROC1_REGISTER_RESTORE:
                return registerBackstepMutation(
                    step,
                    getCP1RegisterName(step.param1),
                    RegisterSize.Long
                )
            //the address the restore puts back, and the one the instruction set
            case BackStepAction.PC_RESTORE:
                return registerBackstepMutation(step, '$pc', RegisterSize.Long)
            case BackStepAction.MEMORY_RESTORE_BYTE:
                return memoryBackstepMutation(step, RegisterSize.Byte)
            case BackStepAction.MEMORY_RESTORE_HALF:
                return memoryBackstepMutation(step, RegisterSize.Word)
            case BackStepAction.MEMORY_RESTORE_WORD:
            case BackStepAction.MEMORY_RESTORE_RAW_WORD:
                return memoryBackstepMutation(step, RegisterSize.Long)
            case BackStepAction.COPROC1_CONDITION_CLEAR:
                return { type: 'Other', value: `CP1 condition flag ${step.param1} restore: clear` }
            case BackStepAction.COPROC1_CONDITION_SET:
                return { type: 'Other', value: `CP1 condition flag ${step.param1} restore: set` }
            case BackStepAction.DO_NOTHING:
                return { type: 'Other', value: 'Do nothing' }
            //`newValue` is the code the exit set: 0 for exit, `$a0` for exit2
            case BackStepAction.EXIT_RESTORE:
                return { type: 'Other', value: exitStepText(step.newValue) }
            case BackStepAction.RANDOM_STREAM_RESTORE:
                return { type: 'Other', value: randomStreamStepText(step.param1) }
            //a Poke group is rendered from its `writes`
            //([ADR 0022](../../../../../../docs/adr/0022-core-native-poke-records.md)), so its step never
            //reaches this list; the heap break and stack top restores are the Core's bookkeeping of
            //its memory layout, which the program did not write
            case BackStepAction.POKE:
            case BackStepAction.HEAP_RESTORE:
            case BackStepAction.STACK_TOP_RESTORE:
                return null
        }
    }
}

function isMIPSNumericRegisterName(register: string): register is RegisterName {
    return MIPSNumericRegisterNames.some((candidate) => candidate === register)
}

/**
 * `pc`, `hi` and `lo` are exposed as registers so they show up in the register list and in testcase
 * expectations, but the core only addresses the 32 general purpose ones.
 */
function toNumericRegisterName(register: MIPSRegisterName): RegisterName {
    if (!isMIPSNumericRegisterName(register)) {
        throw new Error(`Unsupported register: ${register}`)
    }
    return register
}

function formatStatement(statement: string) {
    statement = statement.replace(/,/g, ', ')
    for (let index = MIPSNumericRegisterNames.length - 1; index >= 0; index--) {
        const register = MIPSNumericRegisterNames[index]
        if (!register) continue
        statement = statement.replace(new RegExp(`\\$${index}\\b`, 'g'), register)
    }
    //replaces all empty hex like 0x0000ffff with 0xffff
    statement = statement.replace(/0x0*(?=[0-9a-fA-F])/g, '0x')
    return statement
}

function getRegisterFileName(index: number) {
    const generalRegister = MIPSNumericRegisterNames[index]
    if (generalRegister) return generalRegister
    if (index === 33) return 'hi'
    if (index === 34) return 'lo'
    return `GPR[${index}]`
}

function getCP0RegisterName(registerNumber: number) {
    //coprocessor 0 is sparse, so a backstep entry carries the register's MIPS number and the file
    //has to be searched for that number rather than indexed by it
    const index = (MIPS_COPROCESSOR0_REGISTER_NUMBERS as readonly number[]).indexOf(registerNumber)
    return MIPSCoprocessor0RegisterNames[index] ?? `CP0[${registerNumber}]`
}

function getCP1RegisterName(index: number) {
    if (Number.isInteger(index) && index >= 0 && index < 32) return `$f${index}`
    return `CP1[${index}]`
}
