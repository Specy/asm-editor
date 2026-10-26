import { makeRiscVCore } from './RISC-V-core'
import {
    BackStepAction,
    bigintToHighLow,
    highLowToBigint,
    isRuntimeError,
    type JsBackStep,
    type JsRiscV,
    registerHandlers,
    type RegisterName,
    RISCV,
    RISCV_REGISTERS,
    StopReason
} from '@specy/risc-v'
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
    riscvCsrRegisterName,
    RISCVCsrRegisterNames,
    RISCVFloatingPointRegisterNames,
    RISCVRegisterNames,
    type RISCVRegisterName
} from './RISC-V-registers'

/**
 * How many instructions the TeaVM compiled Core runs in a millisecond, used to turn a slice's time
 * budget into a halt limit. Measured on a compute-only loop under node, built with the shipped undo
 * history: about 4 800 (`npm run measure`, three runs of 4 700 to 5 000, after the undo recorder
 * stopped counting in longs; the harness measured about 1 600 on the same loop before that). The
 * estimate of 2 800 before that was taken while the Core kept the program
 * counter in a long Register and added one to the cycle and instret counters on every instruction -
 * TeaVM compiles long arithmetic into BigInt operations, each of which allocates - read the
 * self-modifying-code setting out of a map on every instruction fetch, fetched through four calls
 * that re-checked alignment and the text segment, and assembled every aligned word load and store a
 * byte at a time. The estimate of 25 before that was taken before four faults in RARS were
 * fixed, each worth several times the throughput of the one before it: `BackStepper.BackStep.assign`
 * threw an `AddressErrorException` per backstep entry for any loop branching to the first
 * instruction of the text segment, which is where `main` sits in every example; the cycle, instret
 * and time counters were resolved by name and recorded an undo entry even when the value did not
 * change; and a monitor was entered on every register access, every memory table access, every
 * backstep push and once more around each instruction, which TeaVM compiles to real monitor enter
 * and exit calls on a Core that is single threaded; and the two counters recorded an undo entry
 * each, where one entry covers both.
 */
const RISCV_INSTRUCTIONS_PER_MS = 4_800

/**
 * How much wall time one `simulate*` call aims at, which is also about how far a chunk can carry the
 * slice past its deadline before the next check (`marsSlice.ts`). Four
 * milliseconds is about twenty thousand instructions of this Core's compute and a dozen calls in a
 * compute slice: the Core spends under a fifth of a microsecond on each instruction, so a chunk
 * that large hides the call.
 */
const RISCV_CHUNK_TARGET_MS = 4

export function RISCVEmulator(source: BuildInput, options: EmulatorSettings = {}) {
    return new AsmEditorRISCVEmulator(source, options)
}

/** RARS's Emulator (`MarsEmulator`), RV32 or RV64, with its FPU and CSR files. */
class AsmEditorRISCVEmulator extends MarsEmulator<JsRiscV, JsBackStep, RISCVRegisterName> {
    constructor(source: BuildInput, options: EmulatorSettings) {
        const systemSize =
            options.language === 'RISC-V-64' ? RegisterSize.Double : RegisterSize.Long
        super(
            source,
            {
                systemSize,
                registerNames: [...RISCVRegisterNames],
                hiddenRegisters: ['zero'],
                registerFiles: riscvRegisterFileDescriptors(systemSize)
            },
            { ...options, language: options.language ?? 'RISC-V' },
            {
                instructionsPerMs: RISCV_INSTRUCTIONS_PER_MS,
                chunkTargetMs: RISCV_CHUNK_TARGET_MS,
                makeCore: (files, entry, profile, link, target) =>
                    makeRiscVCore(files, entry, profile, target === 'RISC-V-64', link),
                checkProgramArguments: (argv, target) =>
                    RISCV.checkProgramArguments(argv, target === 'RISC-V-64'),
                registerHandlers,
                isRuntimeError,
                stopReasons: StopReason,
                formatStatement
            }
        )
        //`pc` is readable in testcase expectations but the core has no setter for it, so it must not
        //be offered as a starting register (see `_setRegisterValue`)
        this.state.startingRegisterNames = [...RISCV_REGISTERS]
    }

    /** Whether this Emulator's Cores are RV64: a getter, as `target` has to be. */
    private get is64Bit(): boolean {
        return this._emulatorOptions.language === 'RISC-V-64'
    }

    protected get target(): MarsTarget {
        return this.is64Bit ? 'RISC-V-64' : 'RISC-V'
    }

    _getPc(): bigint {
        const riscv = this.core
        if (!riscv) return 0n
        return this.is64Bit ? BigInt(riscv.programCounterLong) : BigInt(riscv.programCounter)
    }

    _getSp(): bigint {
        const riscv = this.core
        if (!riscv) return 0n
        return this.is64Bit ? BigInt(riscv.stackPointerLong) : BigInt(riscv.stackPointer)
    }

    _getRegisterValues(): bigint[] {
        const riscv = this.core
        if (!riscv) return new Array(this._registerNames.length).fill(0n)
        //`pc` is appended as the last register, mirroring `RISCVRegisterNames`.
        //`Array.from` and not `.map()`: the typings say `number[]` but `getRegistersValues()` hands
        //back an `Int32Array` (it was a plain array in v1), whose `map()` refuses a bigint result.
        if (this.is64Bit) {
            //the 64 bit values only survive as decimal strings, the number based getters truncate
            return [
                ...Array.from(riscv.getRegistersValuesLong(), (value) => BigInt(value)),
                BigInt(riscv.programCounterLong)
            ]
        }
        return [
            ...Array.from(riscv.getRegistersValues(), (value) => BigInt(value)),
            BigInt(riscv.programCounter)
        ]
    }

    _setRegisterValue(register: RISCVRegisterName, value: bigint, _size?: RegisterSize): void {
        const name = toCoreRegisterName(register)
        //the core takes 64 bit values as a high/low pair, which is also correct for RV32
        this.requireCore().setRegisterValue(name, ...bigintToHighLow(value))
    }

    /**
     * The FPU and the CSRs, each read out of the Core in one flat call per panel refresh
     * ([ADR 0021](../../../../../../docs/adr/0021-register-files-from-core-exports.md)). Both are handed
     * over as high/low pairs of 32 bit halves rather than as decimal strings, because a 64 bit
     * conversion per register per refresh is the kind of work that costs in the compiled Core.
     *
     * A method and not a field holding an arrow function: `GenericEmulator` demands this hook from
     * its own constructor, which runs before this class's field initialisers would.
     */
    _getRegisterFileValues(id: string): bigint[] {
        const riscv = this.requireCore()
        if (id === 'fpu') {
            return composeHighLowPairs(riscv.getFloatingPointRegistersValues())
        }
        if (id === 'csr') {
            const values = composeHighLowPairs(riscv.getControlAndStatusRegistersValues())
            //the Core always hands back the whole 64 bit value; on the 32 bit target RARS shows a
            //CSR's low word and keeps the high half of a counter in its `*h` register, which is a
            //register of this file in its own right
            if (this.is64Bit) return values
            return values.map((value) => value & 0xffffffffn)
        }
        throw new Error(`Unknown register file: ${id}`)
    }

    /**
     * Writes one register of either file, which the Core takes as a high/low pair like the CPU
     * ones.
     */
    _setRegisterFileValue(id: string, register: string, value: bigint): void {
        const riscv = this.requireCore()
        const [high, low] = bigintToHighLow(value)
        if (id === 'fpu') {
            const index = RISCVFloatingPointRegisterNames.findIndex((name) => name === register)
            if (index === -1) throw new Error(`Unsupported register: ${register}`)
            riscv.setFloatingPointRegisterValue(index, high, low)
            return
        }
        if (id === 'csr') {
            const index = RISCVCsrRegisterNames.findIndex((name) => name === register)
            if (index === -1) throw new Error(`Unsupported register: ${register}`)
            riscv.setControlAndStatusRegisterValue(index, high, low)
            return
        }
        throw new Error(`Unknown register file: ${id}`)
    }

    /**
     * A general register and a CSR are read as the target's word, exactly as `_getRegisterValues`
     * and `_getRegisterFileValues` narrow them, while a single lives NaN-boxed in the high word, so
     * the FPU file is 64 bits wide on both targets.
     */
    protected pokeRegisterSize(register: string): RegisterSize {
        const floating = (RISCVFloatingPointRegisterNames as readonly string[]).includes(register)
        return floating ? RegisterSize.Double : this._systemSize
    }

    /**
     * One back step as a mutation of its instruction's row, or none for the Core's own bookkeeping.
     * Every action has a case, so a new one is a type error here rather than a row nobody chose.
     */
    protected backstepToMutation(step: JsBackStep): MutationOperation | null {
        switch (step.action) {
            case BackStepAction.REGISTER_RESTORE:
                //`registers[i].name` is `_registerNames[i]` by construction, reading the names
                //directly avoids depending on the register list being built already
                return registerBackstepMutation(
                    step,
                    this._registerNames[step.param1] ?? `x${step.param1}`,
                    this._systemSize
                )
            case BackStepAction.FLOATING_POINT_REGISTER_RESTORE:
                //`param1` is the register number, which is this file's own order, and the file is
                //64 bit wide on both targets, a single being NaN-boxed into it
                return registerBackstepMutation(
                    step,
                    RISCVFloatingPointRegisterNames[step.param1] ?? `f${step.param1}`,
                    RegisterSize.Double
                )
            case BackStepAction.MEMORY_RESTORE_BYTE:
                return memoryBackstepMutation(step, RegisterSize.Byte)
            case BackStepAction.MEMORY_RESTORE_HALF:
                return memoryBackstepMutation(step, RegisterSize.Word)
            case BackStepAction.MEMORY_RESTORE_WORD:
            case BackStepAction.MEMORY_RESTORE_RAW_WORD:
                return memoryBackstepMutation(step, RegisterSize.Long)
            case BackStepAction.MEMORY_RESTORE_DOUBLE_WORD:
                return memoryBackstepMutation(step, RegisterSize.Double)
            //the address the restore puts back, and the one the instruction set
            case BackStepAction.PC_RESTORE:
                return registerBackstepMutation(step, 'pc', this._systemSize)
            //the only writer of a backdoor entry is an instruction reading the `time` CSR (or
            //`timeh`), which the Core sets to the program time as it is read and journals against
            //that instruction, so the reading is one of the instruction's writes like any other
            case BackStepAction.CONTROL_AND_STATUS_REGISTER_BACKDOOR:
            case BackStepAction.CONTROL_AND_STATUS_REGISTER_RESTORE: {
                //`param1` is the CSR *number*, the sparse architectural address the `csrr*`
                //instructions take, and not a position in the file (see `riscvCsrRegisterName`)
                const name = riscvCsrRegisterName(step.param1)
                if (name) return registerBackstepMutation(step, name, this._systemSize)
                const kind =
                    step.action === BackStepAction.CONTROL_AND_STATUS_REGISTER_BACKDOOR
                        ? 'backdoor'
                        : 'restore'
                return {
                    type: 'Other',
                    value: `Control and status register ${kind} 0x${step.param1.toString(16)}`
                }
            }
            //the cycle and instret counters are bookkeeping the program did not ask for, and the
            //Core advances them once per instruction, so the entry that undoes them is not a
            //mutation the diff should show; nor is the heap break the Core keeps of its layout
            case BackStepAction.CONTROL_AND_STATUS_COUNTERS_DECREMENT:
            case BackStepAction.HEAP_RESTORE:
                return null
            //the two a Poke records: the whole Poke, and the restore of a CSR written through its
            //own value. A poke group is rendered from its `writes` instead
            //([ADR 0022](../../../../../../docs/adr/0022-core-native-poke-records.md)), so neither
            //reaches this list
            case BackStepAction.POKE:
            case BackStepAction.CONTROL_AND_STATUS_REGISTER_POKE_RESTORE:
                return null
            case BackStepAction.DO_NOTHING:
                return { type: 'Other', value: 'Do nothing' }
            //`newValue` is the code the exit set: 0 for exit, `a0` for exit2
            case BackStepAction.EXIT_RESTORE:
                return { type: 'Other', value: exitStepText(step.newValue) }
            case BackStepAction.RANDOM_STREAM_RESTORE:
                return { type: 'Other', value: randomStreamStepText(step.param1) }
            //the Core reports -1 for a back step without an action, which its type leaves out
            default:
                return unknownBackStep(step.action)
        }
    }
}

/**
 * The Register files this adapter reads out of the Core beyond the CPU one, as the design record
 * lists them ([docs/design/register-files.md](../../../../../../docs/design/register-files.md)). The FPU
 * is 64 bits wide on both targets, where a single lives NaN-boxed in the high word, while the CSR
 * file has the target's word size, so RV32 shows the `*h` halves as RARS does.
 */
function riscvRegisterFileDescriptors(systemSize: RegisterSize): RegisterFileDescriptor[] {
    return [
        {
            id: 'fpu',
            label: 'FPU',
            size: RegisterSize.Double,
            formats: ['double', 'single', 'hex'],
            nanBoxedSingles: true,
            registers: RISCVFloatingPointRegisterNames.map((name) => ({ name }))
        },
        {
            id: 'csr',
            label: 'CSR',
            size: systemSize,
            formats: ['hex'],
            registers: RISCVCsrRegisterNames.map((name) => ({ name }))
        }
    ]
}

/**
 * One 64 bit value per pair of halves, the high one first, as both file getters return them. The
 * Core hands the array over as an `Int32Array` of *signed* halves, so a half with its top bit set
 * reads back negative: `highLowToBigint` takes both unsigned, which mapping over the typed array
 * could not do (its `map` truncates every result back to an int32).
 */
function composeHighLowPairs(halves: Int32Array): bigint[] {
    const values: bigint[] = []
    for (let i = 0; i + 1 < halves.length; i += 2) {
        values.push(highLowToBigint(halves[i], halves[i + 1]))
    }
    return values
}

function isRISCVCoreRegisterName(register: string): register is RegisterName {
    return RISCV_REGISTERS.some((candidate) => candidate === register)
}

/**
 * `pc` is exposed as a register so it shows up in the register list and in testcase expectations,
 * but the core only addresses the 32 general purpose ones.
 */
function toCoreRegisterName(register: RISCVRegisterName): RegisterName {
    if (!isRISCVCoreRegisterName(register)) {
        throw new Error(`Unsupported register: ${register}`)
    }
    return register
}

function formatStatement(statement: string) {
    statement = statement.replace(/,/g, ', ')
    RISCV_REGISTERS.forEach((register, index) => {
        statement = statement.replace(new RegExp(`\\bx${index}\\b`, 'g'), register)
    })
    //replaces all empty hex like 0x0000ffff with 0xffff
    statement = statement.replace(/0x0*(?=[0-9a-fA-F])/g, '0x')
    return statement
}

/** No row for a back step without an action; `never` keeps the switch that calls it exhaustive. */
function unknownBackStep(_action: never): null {
    return null
}
