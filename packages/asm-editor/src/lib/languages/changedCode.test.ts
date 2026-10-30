import { describe, expect, it } from 'vite-plus/test'
import { changedLinesOf, sameChangedCode, withChangedCode } from './changedCode'
import type { ChangedCode } from './commonLanguageFeatures.svelte'

const NOP: ChangedCode = { file: 'main.x68', line: 4, address: 0x100cn, runsNow: 'NOP' }

describe('code changed at run time', () => {
    it('adds what runs now to the Build hover of the address it changed, and leaves the rest', () => {
        const artifacts = [
            { file: 'main.x68', line: 3, address: 0x100an, opcode: '72 01' },
            { file: 'main.x68', line: 4, address: 0x100cn, opcode: '5a 81' }
        ]
        expect(withChangedCode(artifacts, [NOP])).toEqual([
            artifacts[0],
            { ...artifacts[1], runsNow: 'NOP' }
        ])
        expect(withChangedCode(artifacts, [])).toEqual(artifacts)
    })

    it('marks a line once, in its own File, whichever copy of it changed first', () => {
        //a File included twice is laid out twice, at two addresses, from one line
        const again = { ...NOP, address: 0x200cn, runsNow: 'RTS' }
        expect(changedLinesOf([NOP, again], 'main.x68')).toEqual([{ line: 4, runsNow: 'NOP' }])
        expect(changedLinesOf([NOP], 'lib.x68')).toEqual([])
    })

    it('tells a reading that changed nothing from one that did', () => {
        expect(sameChangedCode([NOP], [{ ...NOP }])).toBe(true)
        expect(sameChangedCode([NOP], [{ ...NOP, runsNow: 'RTS' }])).toBe(false)
        expect(sameChangedCode([NOP], [])).toBe(false)
    })
})
