/**
 * The program drawn behind the home page's hero, and every state it passes through, worked out by
 * a small interpreter of the few RISC-V instructions it uses, so the registers and memory it shows
 * are the ones RARS would show.
 */

export const HERO_PROGRAM = `# Fill fib with Fibonacci numbers, two per loop
.data
fib:    .space 32
.text
main:
    la   t2, fib
    li   t0, 1
    li   t1, 1
    li   t3, 4
loop:
    sw   t0, 0(t2)
    add  t0, t0, t1
    sw   t1, 4(t2)
    add  t1, t0, t1
    addi t2, t2, 8
    addi t3, t3, -1
    bnez t3, loop
    li   a7, 10
    ecall`

/** The registers the backdrop lists, in the editor's order. */
export const HERO_REGISTERS = [
    'zero',
    'ra',
    'sp',
    'gp',
    't0',
    't1',
    't2',
    't3',
    't4',
    'a0',
    'a7'
] as const
export type HeroRegister = (typeof HERO_REGISTERS)[number]

/** Where RARS puts the text and the data segment, `fib` being the first word of data. */
const TEXT_BASE = 0x0040_0000
export const HERO_DATA_BASE = 0x1001_0000
export const HERO_MEMORY_BYTES = 32
/** The stack and global pointers RARS starts a program with. */
const INITIAL_REGISTERS: Record<HeroRegister, number> = {
    zero: 0,
    ra: 0,
    sp: 0x7fff_effc,
    gp: 0x1000_8000,
    t0: 0,
    t1: 0,
    t2: 0,
    t3: 0,
    t4: 0,
    a0: 0,
    a7: 0
}

export type HeroState = {
    /** The 0-based line about to run; past the last line once the program has ended. */
    line: number
    pc: number
    registers: Record<HeroRegister, number>
    memory: number[]
}

type Instruction = { line: number; op: string; args: string[]; size: number }

function parse(): { instructions: Instruction[]; labels: Map<string, number> } {
    const instructions: Instruction[] = []
    const labels = new Map<string, number>()
    HERO_PROGRAM.split('\n').forEach((text, line) => {
        let code = text.replace(/#.*/, '').trim()
        const label = /^(\w+):/.exec(code)
        if (label) {
            labels.set(label[1], instructions.length)
            code = code.slice(label[0].length).trim()
        }
        // directives place data, which the interpreter starts with already zeroed
        if (!code || code.startsWith('.')) return
        const [op, ...rest] = code.split(/\s+/)
        const args = rest
            .join('')
            .split(',')
            .filter((a) => a)
        // `la` assembles to auipc and addi
        instructions.push({ line, op, args, size: op === 'la' ? 8 : 4 })
    })
    return { instructions, labels }
}

/** Every state from the first instruction to the exit. */
export function heroTrace(): HeroState[] {
    const { instructions, labels } = parse()
    const pcOf = (index: number) =>
        TEXT_BASE + instructions.slice(0, index).reduce((sum, i) => sum + i.size, 0)
    const lastLine = HERO_PROGRAM.split('\n').length
    const registers = { ...INITIAL_REGISTERS }
    const memory = new Array<number>(HERO_MEMORY_BYTES).fill(0)
    const states: HeroState[] = []
    let index = 0
    const snapshot = () =>
        states.push({
            line: index < instructions.length ? instructions[index].line : lastLine,
            pc: pcOf(Math.min(index, instructions.length - 1)),
            registers: { ...registers },
            memory: [...memory]
        })
    snapshot()
    while (index < instructions.length) {
        const { op, args } = instructions[index]
        const reg = (name: string) => registers[name as HeroRegister]
        const set = (name: string, value: number) => (registers[name as HeroRegister] = value | 0)
        let next = index + 1
        switch (op) {
            case 'la':
                set(args[0], HERO_DATA_BASE)
                break
            case 'li':
                set(args[0], Number(args[1]))
                break
            case 'mv':
                set(args[0], reg(args[1]))
                break
            case 'add':
                set(args[0], reg(args[1]) + reg(args[2]))
                break
            case 'addi':
                set(args[0], reg(args[1]) + Number(args[2]))
                break
            case 'sw': {
                const [, offset, base] = /^(-?\d+)\((\w+)\)$/.exec(args[1])!
                const address = reg(base) + Number(offset) - HERO_DATA_BASE
                const value = reg(args[0])
                for (let byte = 0; byte < 4; byte++)
                    memory[address + byte] = (value >>> (byte * 8)) & 0xff
                break
            }
            case 'bnez':
                if (reg(args[0]) !== 0) next = labels.get(args[1])!
                break
            case 'ecall':
                // a7 = 10 is RARS's Exit
                if (reg('a7') === 10) next = instructions.length
                break
            default:
                throw new Error(`The hero program uses ${op}, which heroTrace does not run`)
        }
        index = next
        snapshot()
    }
    return states
}
