import { expect, it } from 'vite-plus/test'
import { HERO_DATA_BASE, HERO_PROGRAM, heroTrace } from './heroProgram.ts'

it('ends with eight Fibonacci numbers stored as words in fib', () => {
    const states = heroTrace()
    const last = states.at(-1)!
    const words = Array.from({ length: 8 }, (_, i) =>
        last.memory.slice(i * 4, i * 4 + 4).reduce((sum, byte, b) => sum + byte * 256 ** b, 0)
    )
    expect(words).toEqual([1, 1, 2, 3, 5, 8, 13, 21])
    expect(last.registers).toMatchObject({ t0: 34, t1: 55, t2: HERO_DATA_BASE + 32, t3: 0, a7: 10 })
    // the state before the first instruction, 1 la + 3 li, 4 loops of 7, then li and ecall
    expect(states).toHaveLength(1 + 4 + 4 * 7 + 2)
    expect(last.line).toBe(HERO_PROGRAM.split('\n').length)
})

it('starts on the first instruction, past the directives and labels', () => {
    const [first, second] = heroTrace()
    expect(HERO_PROGRAM.split('\n')[first.line].trim()).toBe('la   t2, fib')
    // la assembles to two instructions
    expect(second.pc - first.pc).toBe(8)
})

it('changes memory with every store, none of them writing the zero already there', () => {
    const states = heroTrace()
    const stores = states.filter(
        (state, i) => i > 0 && state.memory.join() !== states[i - 1].memory.join()
    )
    expect(stores).toHaveLength(8)
})
