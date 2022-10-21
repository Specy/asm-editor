import { writable } from "svelte/store"
import { MIPSProgram } from '$lib/MIPSInterpreter'
import type { EmulatorStore, RegisterHex } from "./M68KEmulator"
import { PAGE_SIZE } from "$lib/Config"


const registerName = ["zero", "at", "v0", "v1", "a0", "a1", "a2", "a3", "t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7", "s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "t8", "t9", "k0", "k1", "gp", "sp", "fp", "ra"]
export function MIPSEmulator(baseCode: string, haltLimit = 100000) {
    const { subscribe, set, update } = writable<EmulatorStore>({
        registers: [],
        terminated: false,
        line: -1,
        code: baseCode,
        compilerErrors: [],
        sp: 0,
        stdOut: "",
        currentMemoryAddress: 0,
        breakpoints: [],
        currentMemoryPage: new Uint8Array(0),
        interrupt: undefined
    })
    function compile(){
        update(state => {
            emulator = new MIPSProgram(state.code)
            return {
                ...state, 
                terminated: false,
                line: -1,
                code: state.code,
                compilerErrors: [],
                registers: [],
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
    let emulator = new MIPSProgram('')
    function setCode(code: string){
        update(state => {
            return {
                ...state,
                code
            }
        })
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
        const newMemory = new Uint8Array(PAGE_SIZE)
        update(data => {
            data.currentMemoryPage =  newMemory.map((_, i) => 
                emulator?.memory[i] ?? 0
            )
            return data
        })
    }
    function setCurrentMemoryAddress(address: number){
        const newMemory = new Uint8Array(PAGE_SIZE)
        update(data => {
            data.currentMemoryAddress = address
            data.currentMemoryPage = newMemory.map((_, i) => 
            emulator?.memory[i] ?? 0
        )
            return data
        })
    }
    function run() {
        let i = 0
        let error:Error
        try {
            while (emulator.pc / 4 < emulator.insns.length) {
                emulator.step()
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
    function updateData() {
        update(data => {
            data.terminated = true
            data.line = emulator.line
            data.compilerErrors = emulator.errors
            return data
        })
    }
    function addError(error:string){
        update(data => {
            data.compilerErrors.push(error)
            return data
        })
    }

    function step() {
        if (emulator.errors.length) return
        let error:Error
        let done = false
        try {
            emulator.step()
            done = emulator.pc / 4 < emulator.insns.length
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
    function clear(){
        console.log("Implement")
    }
    return {
        subscribe,
        compile,
        step,
        run,
        setCurrentMemoryAddress,
        setCode,
        clear,
        toggleBreakpoint
    }
}
