import { get, writable } from "svelte/store"
import { InterpreterStatus, type Interrupt, type ParsedLine } from "s68k"
import { S68k, Interpreter } from "s68k"
import { MEMORY_SIZE, PAGE_SIZE, PAGE_ELEMENTS_PER_ROW } from "$lib/Config"
import { Prompt } from "$stores/promptStore"
import { createDebouncer, getErrorMessage } from "../utils"
import { settingsStore } from "$stores/settingsStore"
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
    line: ParsedLine
    message: string
    formatted: string
}

export type MemoryTab = {
    id: number
    name: string
    address: number
    rowSize: number
    pageSize: number
    data: DiffedMemory
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
    canExecute: boolean,
    breakpoints: number[],
    memory: {
        global: MemoryTab
        tabs: MemoryTab[]
    }
}
export type DiffedMemory = {
    current: Uint8Array
    prevState: Uint8Array
}

let currentTabId = 0
function createMemoryTab(pageSize: number, name: string, address: number, rowSize: number): MemoryTab {
    return {
        name,
        address,
        id: currentTabId++,
        rowSize,
        pageSize,
        data: {
            current: new Uint8Array(pageSize).fill(0xFF),
            prevState: new Uint8Array(pageSize).fill(0xFF)
        }
    }
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
        canExecute: false,
        breakpoints: [],
        memory: {
            global: createMemoryTab(PAGE_SIZE, "Global", 0x1000, PAGE_ELEMENTS_PER_ROW),
            tabs: [
                createMemoryTab(8 * 4, "Stack", 0x2000, 4),
            ]
        },
        interrupt: undefined
    })
    let current = get({ subscribe })
    let settings = get(settingsStore)
    settingsStore.subscribe(s => settings = s)
    subscribe(s => current = s)
    let s68k: S68k | null = null
    let interpreter: Interpreter | null = null
    const debouncer = createDebouncer(500)
    function compile(): Promise<void> {
        return new Promise((res, rej) => {
            try {
                clear()
                s68k = new S68k(current.code)
                const errors = s68k.semanticCheck().map(e => {
                    return {
                        line: e.getLine(),
                        lineIndex: e.getLineIndex(),
                        message: e.getError(),
                        formatted: e.getMessage()
                    } as MonacoError
                })
                if (errors.length > 0) {
                    s68k = null
                    interpreter = null
                    return update(s => ({ ...s, compilerErrors: errors }))
                }
                interpreter = s68k.createInterpreter(MEMORY_SIZE)
                const stackTab = current.memory.tabs.find(e => e.name === "Stack")
                if (stackTab) stackTab.address = interpreter.getSp() - stackTab.pageSize
                update(s => ({ ...s, canExecute: true, terminated: interpreter.getStatus() !== InterpreterStatus.Running }))
                updateMemory()
                res()
            } catch (e) {
                console.error(e)
                addError(getErrorMessage(e))
                rej(e)
            }

        })
    }

    function toggleBreakpoint(line: number) {
        update(s => {
            const index = s.breakpoints.indexOf(line)
            if (index === -1) s.breakpoints.push(line)
            else s.breakpoints.splice(index, 1)
            return s
        })
    }
    function semanticCheck(code?: string) {
        code = code || get({ subscribe }).code
        try{
            const errors = S68k.semanticCheck(code).map(e => (
                {
                    line: e.getLine(),
                    lineIndex: e.getLineIndex(),
                    message: e.getError(),
                    formatted: e.getMessage()
                } as MonacoError
            ))
            update(s => ({ ...s, code, compilerErrors: errors }))
        }catch(e){
            console.error(e)
            addError(getErrorMessage(e))
        }

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
                interrupt: undefined,
                errors: [],
                canExecute: false,
                compilerErrors: [],
                memory: {
                    global: createMemoryTab(PAGE_SIZE, "Global", 0x1000, PAGE_ELEMENTS_PER_ROW),
                    tabs: [
                        createMemoryTab(8 * 4, "Stack", 0x2000, 4),
                    ]
                },
            }
        })
    }
    function getRegistersValue() {
        if (!interpreter) return []
        const cpu = interpreter.getCpuSnapshot()
        return cpu.getRegistersValues()
    }
    function scrollStackTab() {
        if (!settings.values.autoScrollStackTab.value || !interpreter) return
        const stackTab = current.memory.tabs.find(e => e.name === "Stack")
        const sp = interpreter.getSp()
        if (stackTab) stackTab.address = sp - (sp % stackTab.pageSize)
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
        update(d => ({ ...d, registers }))
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
            const temp = data.memory.global.data.current
            const memory = interpreter.readMemoryBytes(data.memory.global.address, data.memory.global.pageSize)
            data.memory.global.data.current = memory
            data.memory.global.data.prevState = temp
            data.memory.tabs.forEach(tab => {
                const temp = tab.data.current
                const memory = interpreter.readMemoryBytes(tab.address, tab.pageSize)
                tab.data.current = memory
                tab.data.prevState = temp
            })
            return data
        })
    }
    function updateData() {
        update(data => {
            data.terminated = interpreter.hasReachedBottom()
            return data
        })
    }
    function addError(error: string) {
        update(data => {
            data.errors = [...data.errors, error]
            return data
        })
    }
    async function step() {
        let lastLine = -1
        try {
            if (!interpreter) throw new Error("Interpreter not initialized")
            lastLine = interpreter.getCurrentLineIndex()
            const [ins] = interpreter.step()
            switch (interpreter.getStatus()) {
                case InterpreterStatus.Interrupt: {
                    const interrupt = interpreter.getCurrentInterrupt()
                    update(d => ({ ...d, interrupt }))
                    await handleInterrupt(interrupt)
                    break
                }
            }
            update(data => {
                data.line = ins.parsed_line.line_index
                return data
            })
        } catch (e) {
            console.error(e)
            addError(getErrorMessage(e))
            update(d => ({ ...d, terminated: true, line: lastLine }))
            throw e
        }
        updateRegisters()
        updateMemory()
        updateData()
        scrollStackTab()
        return interpreter.getStatus() != InterpreterStatus.Running
    }

    async function handleInterrupt(interrupt: Interrupt | null) {
        if (!interrupt || !interpreter) throw new Error("Expected interrupt")
        update(d => ({ ...d, interrupt }))
        const { type } = interrupt
        switch (type) {
            case "DisplayStringWithCRLF": {
                update(d => ({ ...d, stdOut: d.stdOut + interrupt.value + "\n" }))
                interpreter.answerInterrupt({ type })
                break
            }
            case "DisplayStringWithoutCRLF":
            case "DisplayChar":
            case "DisplayNumber": {
                update(d => ({ ...d, stdOut: d.stdOut + interrupt.value }))
                interpreter.answerInterrupt({ type })
                break
            }
            case "ReadChar": {
                const char = (await Prompt.askText("Enter a character") as string)[0]
                if (!char) throw new Error("Expected a character")
                interpreter.answerInterrupt({ type, value: char })
                break
            }
            case "ReadNumber": {
                const number = Number(await Prompt.askText("Enter a number"))
                if (Number.isNaN(number)) throw new Error("Invalid number")
                interpreter.answerInterrupt({ type, value: number })
                break
            }
            case "ReadKeyboardString": {
                const string = await Prompt.askText("Enter a string") as string
                interpreter.answerInterrupt({ type, value: string })
                break
            }
            case "GetTime": {
                interpreter.answerInterrupt({ type, value: Date.now() })
                break
            }
            case "Terminate": {
                interpreter.answerInterrupt({ type })
                break
            }
        }
        update(data => {
            data.interrupt = undefined
            return data
        })
    }
    async function run() {
        let i = 0
        const breakpoints = new Map(get({ subscribe }).breakpoints.map(e => [e, true]))
        let lastLine = -1
        try {
            if (!interpreter) throw new Error("Interpreter not initialized")
            while (!interpreter.hasTerminated()) {
                lastLine = interpreter.getCurrentLineIndex()
                if (breakpoints.get(lastLine) && i > 0) break
                const [ins] = interpreter.step()
                switch (interpreter.getStatus()) {
                    case InterpreterStatus.Terminated: {
                        update(d => ({ ...d, terminated: true, line: ins.parsed_line.line_index }))
                        break
                    }
                    case InterpreterStatus.TerminatedWithException: {
                        update(data => {
                            data.terminated = true
                            data.line = ins.parsed_line.line_index
                            data.errors.push("Program terminated with errors")
                            return data
                        })
                        break
                    }
                    case InterpreterStatus.Interrupt: {
                        update(d => ({ ...d, line: ins.parsed_line.line_index }))
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
            addError(getErrorMessage(e))
            update(d => ({ ...d, terminated: true, line: lastLine }))
        }
        updateRegisters()
        updateData()
        updateMemory()
        scrollStackTab()
        return interpreter.getStatus()
    }
    function setGlobalMemoryAddress(address: number) {
        update(data => {
            data.memory.global.address = address
            data.memory.global.data.current = interpreter?.readMemoryBytes(address, data.memory.global.pageSize) ?? new Uint8Array(data.memory.global.pageSize).fill(0xFF)
            data.memory.global.data.prevState = data.memory.global.data.current
            return data
        })
    }
    function setTabMemoryAddress(address: number, tabId: number) {
        update(data => {
            const tab = data.memory.tabs.find(e => e.id == tabId)
            if (!tab) return data
            tab.address = address
            tab.data.current = interpreter?.readMemoryBytes(address, tab.pageSize) ?? new Uint8Array(tab.pageSize).fill(0xFF)
            tab.data.prevState = tab.data.current
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
        setGlobalMemoryAddress,
        setCode,
        clear,
        setTabMemoryAddress,
        toggleBreakpoint
    }
}
