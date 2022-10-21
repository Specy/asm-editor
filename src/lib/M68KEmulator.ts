import { get, writable } from "svelte/store"
import { InterpreterStatus, type Interrupt } from "s68k"
import { S68k, Interpreter } from "s68k"
import { MEMORY_SIZE, PAGE_SIZE } from "$lib/Config"
import { Prompt } from "$cmp/prompt"
import { createDebouncer } from "./utils"
export type RegisterHex = [hi: string, lo: string]
export type Register = {
    value: number,
    name: string,
    hex: RegisterHex
    diff: {
        value: number,
        hex: RegisterHex
    }
}
export type StatusRegister = {
    name: string
    value: number
}
export type MonacoError = {
    lineIndex: number
    line: any
    message: string
    formatted: string
}
export type EmulatorStore = {
    registers: Register[],
    errors: string[]
    compilerErrors: MonacoError[]
    terminated: boolean
    interrupt?: Interrupt
    statusRegister?: StatusRegister[]
    line: number,
    code: string,
    sp: number,
    stdOut: string,
    currentMemoryAddress: number,
    currentMemoryPage: DiffedMemory
}
export type DiffedMemory = {
    current: Uint8Array
    prevState: Uint8Array
}

const registerName = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7']
export function M68KEmulator(baseCode: string, haltLimit = 100000) {
    const { subscribe, set, update } = writable<EmulatorStore>({
        registers: [],
        terminated: false,
        line: -1,
        code: baseCode,
        statusRegister: ["X", "N", "Z", "V", "C"].map(n => ({ name: n, value: 0 })),
        compilerErrors: [],
        errors: [],
        sp: 0,
        stdOut: "",
        currentMemoryAddress: 0,
        currentMemoryPage: {
            current: new Uint8Array(PAGE_SIZE).fill(0xFF),
            prevState: new Uint8Array(PAGE_SIZE).fill(0xFF)
        },
        interrupt: undefined
    })
    let s68k: S68k | null = null
    let interpreter: Interpreter | null = null
    const debouncer = createDebouncer(500)
    function compile(): Promise<void> {
        return new Promise(res => {
            const state = get({ subscribe })
            s68k = new S68k(state.code)
            const errors = s68k.semanticCheck().map(e => {
                return {
                    line: e.getLine(),
                    lineIndex: e.getLineIndex(),
                    message: e.getError(),
                    formatted: e.getMessage()
                } as MonacoError
            })
            clear()
            if (errors.length > 0) {
                s68k = null
                interpreter = null
                return update(s => ({ ...s, compilerErrors: errors }))
            }
            interpreter = s68k.createInterpreter(MEMORY_SIZE)
            res()
        })
    }

    function semanticCheck(code?: string) {
        code = code || get({ subscribe }).code
        const errors = S68k.semanticCheck(code).map(e => (
            {
                line: e.getLine(),
                lineIndex: e.getLineIndex(),
                message: e.getError(),
                formatted: e.getMessage()
            } as MonacoError
        ))
        update(s => ({ ...s, code, compilerErrors: errors }))
    }
    function setCode(code: string) {
        update(s => ({ ...s, code }))
        debouncer(semanticCheck)
    }
    function clear() {
        setRegisters(new Array(registerName.length).fill(0))
        updateStatusRegisters(new Array(5).fill(0))
        update(state => {
            return {
                ...state,
                terminated: false,
                line: -1,
                stdOut: "",
                code: state.code,
                errors: [],
                compilerErrors: [],
                currentMemoryPage: {
                    current: new Uint8Array(PAGE_SIZE).fill(0xFF),
                    prevState: new Uint8Array(PAGE_SIZE).fill(0xFF)
                },
                currentMemoryAddress: 0x1000,
            }
        })
    }
    function getRegistersValue() {
        if (!interpreter) return []
        const cpu = interpreter.getCpuSnapshot()
        return cpu.getRegistersValues()
    }
    function updateStatusRegisters(override?: number[]) {
        const flags = (override ?? interpreter?.getFlagsAsArray().map(f => f ? 1 : 0) ?? new Array(5).fill(0))
        update(state => {
            return {
                ...state,
                statusRegister: state.statusRegister.map(s => ({ ...s, value: flags.shift() ?? -1 }))
            }
        })
    }
    function setRegisters(override?: number[]) {
        if (!interpreter && !override) {
            override = new Array(registerName.length).fill(0)
        }
        const registers = (override ?? getRegistersValue()).map((reg, i) => {
            const hex = (reg >>> 0).toString(16).padStart(8, '0')
            const hexArray = [hex.slice(0, 4), hex.slice(4, 8)] as RegisterHex
            return {
                value: reg as number,
                name: registerName[i],
                hex: hexArray,
                diff: {
                    value: reg as number,
                    hex: hexArray
                }
            }
        })
        update(data => {
            data.registers = registers
            return data
        })
    }
    function updateRegisters() {
        update(data => {
            if (data.registers.length === 0) return data
            const { registers } = data
            getRegistersValue().forEach((reg, i) => {
                registers[i].diff.value = registers[i].value
                registers[i].diff.hex = registers[i].hex
                if (registers[i].value !== reg) {
                    registers[i].value = reg
                    const hex = (reg >>> 0).toString(16).padStart(8, '0')
                    registers[i].hex = [hex.slice(0, 4), hex.slice(4, 8)] as RegisterHex
                }
            })
            data.sp = registers[registers.length - 1].value
            return data
        })
    }
    function updateMemory() {
        if (!interpreter) return
        update(data => {
            const temp = data.currentMemoryPage.current
            const memory = interpreter.readMemoryBytes(data.currentMemoryAddress, PAGE_SIZE)
            data.currentMemoryPage.current = memory
            data.currentMemoryPage.prevState = temp
            return data
        })
    }
    function updateData() {
        update(data => {
            data.terminated = interpreter.hasReachedBottom()
            data.line = interpreter.getCurrentLineIndex()
            return data
        })
    }
    function addError(error: string) {
        update(data => {
            data.errors.push(error)
            return data
        })
    }
    async function step() {
        let error: Error
        try {
            if (!interpreter) throw new Error("Interpreter not initialized")
            interpreter.step()
            switch (interpreter.getStatus()) {
                case InterpreterStatus.Interrupt: {
                    const interrupt = interpreter.getCurrentInterrupt()
                    update(d => ({ ...d, interrupt }))
                    await handleInterrupt(interrupt)
                    break
                }
            }
            update(data => {
                data.line = interpreter.getCurrentLineIndex()
                return data
            })
        } catch (e) {
            console.error(e)
            error = e
        }
        updateRegisters()
        updateMemory()
        updateData()

        if (error) {
            addError(error?.message ?? JSON.stringify(error))
            throw error
        }
        return interpreter.getStatus() != InterpreterStatus.Running
    }

    async function handleInterrupt(interrupt: Interrupt | null) {
        if (!interrupt || !interpreter) throw new Error("Expected interrupt")
        update(data => {
            data.interrupt = interrupt
            return data
        })

        switch (interrupt.type) {
            case "DisplayStringWithCRLF": {
                update(d => ({ ...d, stdOut: d.stdOut + interrupt.value + "\n" }))
                interpreter.answerInterrupt({ type: interrupt.type })
                break
            }
            case "DisplayStringWithoutCRLF":
            case "DisplayChar":
            case "DisplayNumber": {
                update(d => ({ ...d, stdOut: d.stdOut + interrupt.value }))
                interpreter.answerInterrupt({ type: interrupt.type })
                break
            }
            case "ReadChar": {
                const char = (await Prompt.askText("Enter a character", "text") as string)[0]
                interpreter.answerInterrupt({ type: interrupt.type, value: char })
                break
            }
            case "ReadNumber": {
                const number = Number(await Prompt.askText("Enter a number", "text"))
                interpreter.answerInterrupt({ type: interrupt.type, value: number })
                break
            }
            case "ReadKeyboardString": {
                const string = await Prompt.askText("Enter a string", "text") as string
                interpreter.answerInterrupt({ type: interrupt.type, value: string })
                break
            }
            case "GetTime": {
                interpreter.answerInterrupt({ type: interrupt.type, value: Date.now() })
                break
            }
            case "Terminate": {
                interpreter.answerInterrupt({ type: interrupt.type })
            }
        }
    }
    async function run() {
        let i = 0
        let error
        try {
            if (!interpreter) throw new Error("Interpreter not initialized")
            while (!interpreter.hasTerminated()) {
                interpreter.step()
                switch (interpreter.getStatus()) {
                    case InterpreterStatus.Terminated: {
                        update(d => ({ ...d, terminated: true }))
                        break
                    }
                    case InterpreterStatus.TerminatedWithException: {
                        update(data => {
                            data.terminated = true
                            data.errors.push("Program terminated with errors")
                            return data
                        })
                        break
                    }
                    case InterpreterStatus.Interrupt: {
                        await handleInterrupt(interpreter.getCurrentInterrupt())
                    }
                }
                if (i++ > haltLimit) throw new Error('Halt limit reached')
            }
            update(data => {
                data.line = interpreter.getCurrentLineIndex()
                return data
            })
        } catch (e) {
            console.error(e)
            error = e
        }
        updateRegisters()
        updateData()
        updateMemory()

        if (error) {
            addError(error?.message ?? JSON.stringify(error))
            throw error
        }
        return interpreter.getStatus()
    }
    function setCurrentMemoryAddress(address: number) {
        update(data => {
            data.currentMemoryAddress = address
            data.currentMemoryPage.current = interpreter?.readMemoryBytes(address, 16 * 16) ?? new Uint8Array(PAGE_SIZE).fill(0xFF)
            data.currentMemoryPage.prevState = data.currentMemoryPage.current
            return data
        })
    }


    clear()
    semanticCheck()
    return {
        subscribe,
        compile,
        step,
        run,
        setCurrentMemoryAddress,
        setCode,
        clear
    }
}
