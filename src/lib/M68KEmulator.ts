import { writable } from "svelte/store"
import { Emulator } from 'm68k-js'

type RegisterHex = [hi: string, lo: string]
export type Register = {
    value: number,
    name: string,
    hex: RegisterHex
    diff: {
        value: number,
        hex: RegisterHex
    }
}
export type Memory = {
    [key in string]: string
}
type EmulatorStore = {
    registers: Register[]
    terminated: boolean
    line: number,
    code: string,
    errors: string[],
    numOfLines: number,
    memory: Memory
}

const registerName = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7']
export function M68KEmulator(code: string, haltLimit = 100000) {
    const { subscribe, set, update } = writable<EmulatorStore>({
        registers: [],
        terminated: false,
        line: -1,
        code: '',
        errors: [],
        numOfLines: 0,
        memory: {}
    })
    let emulator = new Emulator()
    function setCode(code: string) {
        emulator = new Emulator(code)
        update(data => {
            data.terminated = false
            data.line = -1
            data.code = code
            data.errors = []
            data.numOfLines = 0
            data.registers = []
            return data
        })
        setRegisters()
    }
    function setRegisters() {
        const registers = Array.from(emulator.registers).map((reg, i) => {
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
            if(data.registers.length === 0) return data
            const { registers } = data
            Array.from(emulator.registers).forEach((reg, i) => {
                registers[i].diff.value = registers[i].value
                registers[i].diff.hex = registers[i].hex
                if (registers[i].value !== reg) {
                    registers[i].value = reg
                    const hex = (reg >>> 0).toString(16).padStart(8, '0')
                    registers[i].hex = [hex.slice(0, 4), hex.slice(4, 8)] as RegisterHex
                }
            })
            return data
        })
    }
    function updateMemory(){
        update(data => {
            data.memory = emulator.memory.memory
            return data
        })
    }
    function run() {
        let i = 0
        let error
        try {
            while (!emulator.emulationStep()) {
                if (i++ > haltLimit) throw new Error('Halt limit reached')
                if (emulator.errors.length) break
            }
        } catch (e) {
            console.error(e)
            error = e
        }
        updateRegisters()
        updateData()
        updateMemory()
        if (error){
            addError(error?.message)
            throw error
        }
        return emulator
    }
    function undo(){
        emulator.undoFromStack()
        updateRegisters()
        updateData()
    }
    function updateData(){
        update(data => {
            data.terminated = true
            data.line = emulator.line
            data.errors = emulator.errors
            data.numOfLines = emulator.instructions.length
            return data
        })
    }
    function addError(error:string){
        update(data => {
            data.errors.push(error)
            return data
        })
    }
    function step() {
        if (emulator.errors.length) return
        let error:Error
        let done = false
        try {
            done = emulator.emulationStep()
        } catch (e) {
            console.error(e)
            error = e
        }
        updateRegisters()
        updateMemory()
        updateData()
        if (error) {
            addError(error?.message)
            throw error
        }
        return done
    }

    setRegisters()
    return {
        subscribe,
        setCode,
        run,
        step,
        undo
    }
}

