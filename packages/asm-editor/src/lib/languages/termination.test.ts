import { describe, expect, it } from 'vite-plus/test'
import { describeTermination, terminationSummary, type Termination } from './termination'

const SEGFAULT: Termination = {
    kind: 'signal',
    number: 11,
    name: 'SIGSEGV',
    description: 'Segmentation fault'
}

const AVX: Termination = {
    kind: 'signal',
    number: 4,
    name: 'SIGILL',
    description: 'Illegal instruction',
    unsupported: "stopped: AVX-512 isn't supported yet"
}

describe('describeTermination', () => {
    it('says how each kind of end happened', () => {
        expect(describeTermination({ kind: 'exit', code: 3 })).toBe('exited with code 3')
        expect(describeTermination({ kind: 'exit', code: 0 })).toBe('exited with code 0')
        expect(describeTermination({ kind: 'exit' })).toBe('exited')
        expect(describeTermination({ kind: 'end' })).toBe('ran past its last instruction')
        //an M68K program, at EASy68K's SIMHALT outside the bytes it placed
        expect(describeTermination({ kind: 'end', unwrittenMemory: '$1012' })).toBe(
            'ran into memory the program never wrote, at $1012'
        )
        expect(describeTermination(SEGFAULT)).toBe('Segmentation fault (signal 11)')
        //what the emulator cannot run, in place of the signal it raised
        expect(describeTermination(AVX)).toBe("stopped: AVX-512 isn't supported yet")
        expect(describeTermination({ kind: 'error', message: 'Bad load' })).toBe(
            'stopped by an error: Bad load'
        )
    })

    it('leaves an error’s message out where the console already shows it', () => {
        expect(
            describeTermination({ kind: 'error', message: 'Bad load' }, { errorMessage: false })
        ).toBe('stopped by an error')
    })
})

describe('terminationSummary', () => {
    it('leads with the running time a Run measured', () => {
        expect(terminationSummary({ kind: 'exit', code: 3 }, 12)).toBe(
            'Ran in 12ms, exited with code 3'
        )
        expect(terminationSummary(SEGFAULT, 2500)).toBe(
            'Ran in 2.500s, Segmentation fault (signal 11)'
        )
        expect(terminationSummary(AVX, 12)).toBe(
            "Ran in 12ms, stopped: AVX-512 isn't supported yet"
        )
        expect(
            terminationSummary({ kind: 'error', message: 'Bad load' }, 3, { errorMessage: false })
        ).toBe('Ran in 3ms, stopped by an error')
        //where an M68K program that did not end itself got to
        expect(terminationSummary({ kind: 'end', unwrittenMemory: '$1012' }, 12)).toBe(
            'Ran in 12ms, ran into memory the program never wrote, at $1012'
        )
        expect(terminationSummary({ kind: 'end', unwrittenMemory: '$1012' }, -1)).toBe(
            'Ran into memory the program never wrote, at $1012'
        )
    })

    it('says nothing more of an end that every finished program has', () => {
        expect(terminationSummary({ kind: 'end' }, 12)).toBe('Ran in 12ms')
        expect(terminationSummary({ kind: 'exit' }, 12)).toBe('Ran in 12ms')
        expect(terminationSummary(undefined, 12)).toBe('Ran in 12ms')
    })

    it('starts with how it ended when no Run measured it', () => {
        expect(terminationSummary({ kind: 'exit', code: 0 }, -1)).toBe('Exited with code 0')
        expect(terminationSummary(SEGFAULT, -1)).toBe('Segmentation fault (signal 11)')
        expect(terminationSummary(AVX, -1)).toBe("Stopped: AVX-512 isn't supported yet")
        expect(terminationSummary({ kind: 'error', message: 'Bad load' }, -1)).toBe(
            'Stopped by an error: Bad load'
        )
        expect(terminationSummary({ kind: 'end' }, -1)).toBe('Program ended')
        expect(terminationSummary({ kind: 'exit' }, -1)).toBe('Program ended')
    })
})
