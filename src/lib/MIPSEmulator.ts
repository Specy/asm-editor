import { writable } from "svelte/store"
import { MIPSProgram } from '$lib/MIPSInterpreter'
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

const registerName = ["zero", "at", "v0", "v1", "a0", "a1", "a2", "a3", "t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7", "s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "t8", "t9", "k0", "k1", "gp", "sp", "fp", "ra"]
export function MIPSEmulator(code: string, haltLimit = 1000000) {
    const { subscribe, set, update } = writable<EmulatorStore>({
        registers: [],
        terminated: false,
        line: -1,
        code: '',
        errors: [],
        numOfLines: 0,
        memory: {}
    })
    let emulator = new MIPSProgram('')
    function setCode(code: string) {
        emulator = new MIPSProgram(code)
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
            if (data.registers.length === 0) return data
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
    function updateMemory() {
        update(data => {
            data.memory = emulator.memory.memory
            return data
        })
    }
    function run() {
        let i = 0
        let hasError = false
        try {
            while (emulator.pc / 4 < emulator.insns.length) {
                emulator.step()
                if (i++ > haltLimit) throw new Error('Halt limit reached')
                if (emulator.errors.length) break
            }
        } catch (e) {
            console.error(e)
            hasError = true
        }
        updateRegisters()
        updateData()
        updateMemory()
        if (hasError) throw new Error('Program terminated with error')
        return emulator
    }
    function undo() {
        //emulator.undoFromStack()
        updateRegisters()
        updateData()
    }
    function updateData() {
        update(data => {
            data.terminated = true
            data.line = emulator.line
            data.errors = emulator.errors
            data.numOfLines = emulator.insns.length
            return data
        })
    }
    function step() {
        if (emulator.errors.length) return
        let hasError = false
        let done = false
        try {
            emulator.step()
            done = emulator.pc / 4 < emulator.insns.length
        } catch (e) {
            console.error(e)
            hasError = true
        }

        updateRegisters()
        updateMemory()
        updateData()
        if (hasError) throw new Error('Program terminated with error')
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

