import { get, writable } from "svelte/store"
import {
    InterpreterStatus,
    Size,
    type Interrupt,
    type ParsedLine,
    type Label,
    type ExecutionStep,
    ccrToFlagsArray
} from 's68k'
import { S68k, Interpreter } from "s68k"
import { MEMORY_SIZE, PAGE_SIZE, PAGE_ELEMENTS_PER_ROW } from "$lib/Config"
import { Prompt } from "$stores/promptStore"
import { createDebouncer, getErrorMessage } from "../utils"
import { settingsStore } from "$stores/settingsStore"
export type RegisterHex = [hi: string, lo: string]

export type RegisterChunk = {
    hex: string,
    value: number
    valueSigned: number
    groupSize: number
    prev: {
        hex: string,
        value: number
    }
}
export class Register {
    value: number
    name: string
    prev: number
    constructor(name: string, value: number) {
        this.name = name
        this.value = value
        this.prev = value
    }
    setValue(value: number) {
        this.prev = this.value
        this.value = value
    }
    toHex() {
        return (this.value >>> 0).toString(16).padStart(8, '0')
    }
    toSizedGroups(size: Size): RegisterChunk[] {
        const groupLength = size === Size.Byte ? 2 : size === Size.Word ? 4 : 8
        const hex = this.toHex()
        const prevHex = (this.prev >>> 0).toString(16).padStart(8, '0')
        const chunks: RegisterChunk[] = []
        for (let i = 0; i < hex.length; i += groupLength) {
            const groupValue = parseInt(hex.slice(i, i + groupLength), 16)
            chunks.push({
                hex: hex.slice(i, i + groupLength),
                value: groupValue,
                valueSigned: groupValue << (32 - groupLength * 4) >> (32 - groupLength * 4),
                groupSize: groupLength,
                prev: {
                    hex: prevHex.slice(i, i + groupLength),
                    value: parseInt(prevHex.slice(i, i + groupLength), 16)
                }
            })
        }
        return chunks
    }
}

export type StatusRegister = {
    name: string
    value: number
    prev: number
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
    latestSteps: ExecutionStep[]
    callStack: Label[]
    line: number,
    executionTime: number,
    code: string,
    sp: number,
    stdOut: string,
    canExecute: boolean,
    canUndo: boolean,
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
type M68kEditorOptions = {
    globalPageSize?: number
    globalPageElementsPerRow?: number
}

export function M68KEmulator(baseCode: string, options: M68kEditorOptions = {}) {
    options = {
        globalPageSize: PAGE_SIZE,
        globalPageElementsPerRow: PAGE_ELEMENTS_PER_ROW,
        ...options
    }
    const { subscribe, update } = writable<EmulatorStore>({
        registers: [],
        terminated: false,
        line: -1,
        code: baseCode,
        statusRegister: ["X", "N", "Z", "V", "C"].map(n => ({ name: n, value: 0, prev: 0 })),
        compilerErrors: [],
        callStack: [],
        errors: [],
        sp: 0,
        latestSteps: [],
        stdOut: "",
        executionTime: -1,
        canUndo: false,
        canExecute: false,
        breakpoints: [],
        memory: {
            global: createMemoryTab(options.globalPageSize, "Global", 0x1000, options.globalPageElementsPerRow),
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
    const [debouncer, clearDebouncer] = createDebouncer(500)
    function compile(historySize: number, codeOverride?: string): Promise<void> {
        return new Promise((res, rej) => {
            try {
                clear()
                s68k = new S68k(codeOverride ?? current.code)
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
                interpreter = s68k.createInterpreter(MEMORY_SIZE, {
                    history_size: historySize,
                    keep_history: historySize > 0,
                })
                const stackTab = current.memory.tabs.find(e => e.name === "Stack")
                if (stackTab) stackTab.address = interpreter.getSp() - stackTab.pageSize
                const next = interpreter.getNextInstruction()
                update(s => ({
                    ...s,
                    canExecute: true,
                    line: next ? next.parsed_line.line_index : -1,
                    terminated: interpreter.getStatus() !== InterpreterStatus.Running,
                    canUndo: false
                }))
                updateMemory()
                res()
            } catch (e) {
                addError(getErrorMessage(e))
                clearDebouncer() //stop semantic checker from overriding errors
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
    function resetSelectedLine() {
        update(s => ({ ...s, line: -1 }))
    }
    function semanticCheck(code?: string) {
        const currentCode = get({ subscribe }).code
        code = code ?? currentCode
        try {
            const errors = S68k.semanticCheck(code).map(e => {
                return {
                    line: e.getLine(),
                    lineIndex: e.getLineIndex(),
                    message: e.getError(),
                    formatted: e.getMessage()
                } as MonacoError
            })
            update(s => ({ ...s, code, compilerErrors: errors, errors: [] }))
        } catch (e) {
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
        if (current.interrupt) Prompt.cancel()
        update(state => {
            return {
                ...state,
                terminated: false,
                line: -1,
                stdOut: "",
                code: state.code,
                interrupt: undefined,
                errors: [],
                canUndo: false,
                executionTime: -1,
                canExecute: false,
                latestSteps: [],
                callStack: [],
                compilerErrors: [],
                memory: {
                    global: createMemoryTab(options.globalPageSize, "Global", 0x1000, options.globalPageElementsPerRow),
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

        const flags = (override ?? interpreter?.getFlagsAsArray().map(f => f ? 1 : 0) ?? new Array(5).fill(0)).reverse()
        if (settings.values.maxVisibleHistoryModifications.value > 0 && interpreter && !override) {
            const last = interpreter.getUndoHistory(1)[0]
            if (last) {
                const old = ccrToFlagsArray(last.old_ccr.bits).reverse()
                return update(state => {
                    return {
                        ...state,
                        statusRegister: state.statusRegister.map((s, i) => ({
                            ...s,
                            value: flags[i],
                            prev: Number(old[i])
                        }))
                    }
                })
            }
        }
        update(state => {
            return {
                ...state,
                statusRegister: state.statusRegister.map((s, i) => ({
                    ...s,
                    value: flags[i] ?? -1,
                    prev: flags[i] ?? -1
                })),
            }
        })
    }
    function setRegisters(override?: number[]) {
        if (!interpreter && !override) {
            override = new Array(registerName.length).fill(0)
        }
        const registers = (override ?? getRegistersValue()).map((reg, i) => {
            return new Register(registerName[i], reg)
        })
        update(d => ({ ...d, registers }))
    }
    function updateRegisters() {
        update(data => {
            if (data.registers.length === 0) return data
            const { registers } = data
            getRegistersValue().forEach((reg, i) => {
                registers[i].setValue(reg)
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
            data.callStack = interpreter.getCallStack()
            data.latestSteps = interpreter.getUndoHistory(settings.values.maxVisibleHistoryModifications.value)

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
            interpreter.step()
            const ins = interpreter.getNextInstruction()
            switch (interpreter.getStatus()) {
                case InterpreterStatus.Interrupt: {
                    const interrupt = interpreter.getCurrentInterrupt()
                    update(d => ({ ...d, interrupt }))
                    await handleInterrupt(interrupt)
                    break
                }
            }
            update(data => {
                data.line = ins?.parsed_line?.line_index ?? data.line
                data.canUndo = interpreter?.canUndo() ?? false
                return data
            })
        } catch (e) {
            console.error(e)
            addError(getErrorMessage(e, lastLine + 1))
            update(d => ({ ...d, terminated: true, line: lastLine }))
            throw e
        }
        updateRegisters()
        updateStatusRegisters()
        updateMemory()
        updateData()
        scrollStackTab()
        return interpreter.getStatus() != InterpreterStatus.Running
    }
    function undo(amount = 1) {
        try {
            for (let i = 0; i < amount && interpreter?.canUndo(); i++) {
                interpreter?.undo()
            }
            const instruction = interpreter?.getNextInstruction()
            update(d => ({
                ...d,
                line: instruction?.parsed_line.line_index ?? -1,
                canUndo: interpreter?.canUndo() ?? false,
            }))
            updateRegisters()
            updateMemory()
            updateStatusRegisters()
            updateData()
            scrollStackTab()
        } catch (e) {
            addError(getErrorMessage(e))
            update(d => ({ ...d, terminated: true }))
            console.error(e)
            throw e
        }
    }
    async function handleInterrupt(interrupt: Interrupt | null) {
        if (!interrupt || !interpreter) throw new Error("Expected interrupt")
        update(d => ({ ...d, interrupt }))
        const { type } = interrupt
        switch (type) {
            case "DisplayStringWithCRLF": {
                update(d => ({ ...d, stdOut: `${d.stdOut}${interrupt.value}\n` }))
                interpreter.answerInterrupt({ type })
                break
            }
            case "DisplayStringWithoutCRLF":
            case "DisplayChar":
            case "DisplayNumber": {
                update(d => ({ ...d, stdOut: `${d.stdOut}${interrupt.value}` }))
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
                interpreter.answerInterrupt({ type, value: Math.round(Date.now() / 1000) }) //unix seconds
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
    async function run(haltLimit: number) {
        if (haltLimit <= 0) haltLimit = Number.MAX_SAFE_INTEGER
        const start = performance.now()
        const breakpoints = new Uint32Array(get({ subscribe }).breakpoints)
        const hasBreakpoints = breakpoints.length > 0
        try {
            if (!interpreter) throw new Error("Interpreter not initialized")
            let status = interpreter.getStatus()
            while (!interpreter.hasTerminated()) {
                if (!hasBreakpoints) {
                    interpreter.runWithLimit(haltLimit)
                    status = interpreter.getStatus()
                } else {
                    interpreter.runWithBreakpoints(breakpoints, haltLimit)
                    status = interpreter.getStatus()
                    //here we might have reached a breakpoint. It is paused if the status is running
                    if (status === InterpreterStatus.Running) break
                }
                switch (status) {
                    case InterpreterStatus.Terminated: {
                        const ins = interpreter.getLastInstruction()
                        update(d => ({ ...d, terminated: true, line: ins?.parsed_line?.line_index ?? -1 }))
                        break
                    }
                    case InterpreterStatus.TerminatedWithException: {
                        const ins = interpreter.getLastInstruction()
                        update(data => {
                            data.terminated = true
                            data.line = ins?.parsed_line?.line_index ?? -1
                            data.canUndo = false
                            data.errors.push("Program terminated with errors")
                            return data
                        })
                        break
                    }
                    case InterpreterStatus.Interrupt: {
                        if (current.terminated || !current.canExecute) break
                        const ins = interpreter.getLastInstruction()
                        update(d => ({ ...d, line: ins.parsed_line.line_index }))
                        updateRegisters()
                        updateStatusRegisters()
                        updateMemory()
                        updateData()
                        scrollStackTab()
                        await handleInterrupt(interpreter.getCurrentInterrupt())
                        break
                    }
                }
            }
            update(data => {
                const ins = interpreter.getNextInstruction()
                const last = interpreter.getLastInstruction()
                //shows the next instruction, if it't not available it means the code has terminated, so show the last instruction
                const line = ins?.parsed_line?.line_index ?? last?.parsed_line?.line_index
                data.line = line ?? -1
                data.canUndo = interpreter?.canUndo() ?? false
                return data
            })
            updateRegisters()
            updateStatusRegisters()
            updateMemory()
            updateData()
            scrollStackTab()
            update(d => ({ ...d, executionTime: performance.now() - start }))
            return interpreter.getStatus()
        } catch (e) {
            console.error(e)
            let line = -1
            try {
                line = interpreter?.getLastInstruction()?.parsed_line.line_index ?? -1
            } catch (e) { console.error(e) }
            addError(getErrorMessage(e, line + 1))
            update(d => ({ ...d, terminated: true, line }))
        }
        return InterpreterStatus.TerminatedWithException
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
        toggleBreakpoint,
        undo,
        resetSelectedLine
    }
}
