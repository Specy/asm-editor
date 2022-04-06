import { get, writable, Writable } from "svelte/store"
import { Emulator } from 'm68k-js'

type RegisterHex = [ hi: string, lo: string]
export type Register = {
    value: number,
    name: string,
    hex: RegisterHex
    diff:{
        value: number,
        hex: RegisterHex
    }
}
type EmulatorStore = {
    registers: Register[]
    terminated: boolean
    line: number,
}

const registerName = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7',]
export function M68KEmulator(code: string, haltLimit = 1000000) {
    const { subscribe, set, update } = writable<EmulatorStore>({
        registers: [],
        terminated: false,
        line: -1
    })
    let emulator = new Emulator()
    function setCode(code: string) {
        emulator = new Emulator(code)
        setRegisters()
        update(data => { 
            data.terminated = false
            data.line = -1
            return data
        })
    }
    function setRegisters() {
        const registers = Array.from(emulator.registers).map((reg, i) => {
            const hex = (reg >>> 0).toString(16).padStart(8, '0')
            const hexArray = [hex.slice(0,4), hex.slice(4,8)] as RegisterHex
            return {
                value: reg as number,
                name: registerName[i],
                hex: hexArray,
                diff:{
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
            const { registers } = data
            
            Array.from(emulator.registers).forEach((reg, i) => {
                registers[i].diff.value = registers[i].value
                registers[i].diff.hex = registers[i].hex
                if (registers[i].value !== reg) { 
                    registers[i].value = reg
                    const hex = (reg >>> 0).toString(16).padStart(8, '0')
                    registers[i].hex = [hex.slice(0,4), hex.slice(4,8)] as RegisterHex
                }
            })
            return data
        })
    }
    function run() {
        let i = 0
        while (!emulator.emulationStep()) {
            if (i++ > haltLimit) throw new Error('Halt limit reached')
        }
        updateRegisters()
        update(data => {
            data.terminated = true
            data.line = emulator.line
            return data
        })
        return emulator
    }
    function step(){
       const done = emulator.emulationStep()
        updateRegisters()
        update(data => {
            data.terminated = done
            data.line = emulator.line
            return data   
        })
        return done
    }

    setRegisters()
    return {
        subscribe,
        setCode,
        run,
        step
    }
}
