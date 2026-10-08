import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { mipsSyscalls } from './mipsSyscalls'
import { riscvSyscalls } from './riscvSyscalls'
import { simPrototype, type MarsSyscall } from './syscallBinding'

/**
 * The services' C bindings are what `<sim.h>` is generated from and what the Documentation prints as
 * each service's prototype, so they must agree with the registers the Documentation names, which
 * were checked against MARS's and RARS's sources, and one program must compile for MIPS and RISC-V
 * alike: a service both have gets the same name and the same prototype on both.
 */
const TARGETS = {
    MIPS: { syscalls: mipsSyscalls, register: /^\$(?:v[01]|a[0-3]|f\d+)$/ },
    'RISC-V': { syscalls: riscvSyscalls, register: /^(?:a[0-7]|fa[0-7]|f\d+)$/ }
}
const TYPES = [
    'void',
    'int',
    'unsigned',
    'long long',
    'float',
    'double',
    'char *',
    'const char *',
    'void *',
    'const void *',
    'int *'
]

/** The registers a binding passes arguments in. */
function argumentRegisters(syscall: MarsSyscall): string[] {
    return syscall.binding.parameters
        .filter(
            (parameter) =>
                !parameter.out ||
                syscall.arguments.some((argument) => argument.name === parameter.register)
        )
        .map((parameter) => parameter.register)
}

/** The registers a binding reads back after the service: its return value and out-parameters. */
function resultRegisters(syscall: MarsSyscall): string[] {
    const { binding } = syscall
    const returns = binding.returns
    const value =
        'register' in returns
            ? [returns.register]
            : 'low' in returns
              ? [returns.low, returns.high]
              : []
    const outputs = binding.parameters.filter(
        (parameter) =>
            parameter.out &&
            !syscall.arguments.some((argument) => argument.name === parameter.register)
    )
    return [...value, ...outputs.map((parameter) => parameter.register)]
}

describe.each(Object.entries(TARGETS))('the %s syscall bindings', (_, target) => {
    const syscalls: [string, MarsSyscall][] = Object.entries(target.syscalls)

    it('give every service a complete binding', () => {
        for (const [key, syscall] of syscalls) {
            const { binding } = syscall
            const label = `${syscall.code} ${binding.name}`
            expect(Number(key), label).toBe(syscall.code)
            expect(typeof syscall.implemented, label).toBe('boolean')
            expect(binding.name, label).toMatch(/^sim_[a-z][a-z0-9_]*$/)
            for (const parameter of binding.parameters) {
                expect(parameter.name, label).toMatch(/^[a-z][a-z0-9_]*$/)
                expect(TYPES, label).toContain(parameter.type)
                expect(parameter.type, label).not.toBe('void')
                expect(parameter.register, label).toMatch(target.register)
                //the function stores the register's value through the pointer
                if (
                    parameter.out &&
                    !syscall.arguments.some((argument) => argument.name === parameter.register)
                )
                    expect(parameter.type, label).toBe('int *')
            }
            const returns = binding.returns
            expect(TYPES, label).toContain(returns.type)
            //nothing, two halves of a 64-bit value, or one register
            const shape =
                returns.type === 'void'
                    ? ['type']
                    : returns.type === 'long long'
                      ? ['high', 'low', 'type']
                      : ['register', 'type']
            expect(Object.keys(returns).sort(), label).toEqual(shape)
            for (const register of resultRegisters(syscall))
                expect(register, label).toMatch(target.register)
            for (const register of binding.clobbers ?? []) {
                expect(register, label).toMatch(target.register)
                expect(resultRegisters(syscall), label).not.toContain(register)
            }
            if (binding.noreturn) expect(binding.returns, label).toEqual({ type: 'void' })
        }
    })

    it('name every service once', () => {
        const names = syscalls.map(([, syscall]) => syscall.binding.name)
        expect(new Set(names).size).toBe(names.length)
        const parameters = syscalls.map(([, syscall]) =>
            syscall.binding.parameters.map((parameter) => parameter.name)
        )
        for (const list of parameters) expect(new Set(list).size).toBe(list.length)
    })

    it('bind exactly the registers the Documentation names', () => {
        for (const [, syscall] of syscalls) {
            const label = `${syscall.code} ${syscall.binding.name}`
            expect(argumentRegisters(syscall), label).toEqual(
                syscall.arguments.map((argument) => argument.name)
            )
            expect(resultRegisters(syscall).sort(), label).toEqual(
                (syscall.result.arguments ?? []).map((result) => result.name).sort()
            )
        }
    })

    it('mark only the exit services as never returning', () => {
        const noreturn = syscalls
            .filter(([, syscall]) => syscall.binding.noreturn)
            .map(([, syscall]) => syscall.binding.name)
        expect(noreturn.sort()).toEqual(['sim_exit', 'sim_exit2'])
    })
})

describe('MIPS and RISC-V', () => {
    const byName = (syscalls: Record<number, MarsSyscall>) =>
        new Map(Object.values(syscalls).map((syscall) => [syscall.binding.name, syscall]))
    const mips = byName(mipsSyscalls)
    const riscv = byName(riscvSyscalls)

    it('give a service both have the same name and prototype', () => {
        for (const [name, syscall] of mips) {
            const other = riscv.get(name)
            expect(other, name).toBeDefined()
            expect(simPrototype(other!.binding), name).toBe(simPrototype(syscall.binding))
            expect(other!.binding.noreturn, name).toBe(syscall.binding.noreturn)
            expect(other!.implemented, name).toBe(syscall.implemented)
        }
        expect([...riscv.keys()].filter((name) => !mips.has(name))).toEqual(['sim_get_cwd'])
    })

    it('pass floats in $f12 and fa0, apart from the RARS dialogs', () => {
        //MessageDialogFloat reads fa1, and InputDialogFloat returns in f0, as RARS 1.6 does
        expect(mips.get('sim_print_float')!.binding.parameters[0].register).toBe('$f12')
        expect(riscv.get('sim_print_double')!.binding.parameters[0].register).toBe('fa0')
        expect(riscv.get('sim_message_dialog_float')!.binding.parameters[1].register).toBe('fa1')
        expect(riscv.get('sim_input_dialog_float')!.binding.returns).toEqual({
            type: 'float',
            register: 'f0'
        })
        expect(riscv.get('sim_read_float')!.binding.returns).toEqual({
            type: 'float',
            register: 'fa0'
        })
    })

    it('return in a0 on RISC-V where MIPS returns in $v0', () => {
        for (const name of ['sim_read_int', 'sim_sbrk', 'sim_read_char', 'sim_open', 'sim_lseek']) {
            expect(mips.get(name)!.binding.returns, name).toMatchObject({ register: '$v0' })
            expect(riscv.get(name)!.binding.returns, name).toMatchObject({ register: 'a0' })
        }
    })

    it('lists seed 40 and RISC-V GetCWD 17 with their C bindings', () => {
        const hidden = (syscalls: Record<number, MarsSyscall>) =>
            Object.values(syscalls)
                .filter((syscall) => !syscall.implemented)
                .map((syscall) => syscall.code)
        expect(hidden(mipsSyscalls)).toEqual([])
        expect(mipsSyscalls[40].binding.name).toBe('sim_random_seed')
        expect(hidden(riscvSyscalls)).toEqual([])
        expect(riscvSyscalls[40].binding.name).toBe('sim_random_seed')
        expect(riscvSyscalls[17].binding.name).toBe('sim_get_cwd')
    })
})

describe('simPrototype', () => {
    it('writes the declaration the Documentation and the header share', () => {
        expect(simPrototype(mipsSyscalls[9].binding)).toBe('void *sim_sbrk(int bytes)')
        expect(simPrototype(mipsSyscalls[30].binding)).toBe('long long sim_time(void)')
        expect(simPrototype(mipsSyscalls[53].binding)).toBe(
            'double sim_input_dialog_double(const char *message, int *status)'
        )
        expect(simPrototype(riscvSyscalls[64].binding)).toBe(
            'int sim_write(int fd, const void *buffer, int length)'
        )
    })
})

describe('the syscall data', () => {
    it('loads in plain Node, without a Core or a Vite alias', () => {
        const script = `
            const { mipsSyscalls } = await import('./src/lib/documentation/mars/mipsSyscalls.ts')
            const { riscvSyscalls } = await import('./src/lib/documentation/mars/riscvSyscalls.ts')
            const { simPrototype } = await import('./src/lib/documentation/mars/syscallBinding.ts')
            console.log(JSON.stringify([
                Object.keys(mipsSyscalls).length,
                Object.keys(riscvSyscalls).length,
                simPrototype(riscvSyscalls[1].binding)
            ]))`
        const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
            encoding: 'utf8'
        })
        expect(JSON.parse(output)).toEqual([
            Object.keys(mipsSyscalls).length,
            Object.keys(riscvSyscalls).length,
            'void sim_print_int(int value)'
        ])
    })
})
