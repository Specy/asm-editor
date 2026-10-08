import { describe, expect, it, vi } from 'vitest'
import { FileSystem } from '../peripherals/FileSystem'
import { canUndoMarsHistoryRange } from './marsUndo'

describe('MARS grouped Undo preflight', () => {
    it('fetches only two boundary groups, preserving serial precision and gaps', () => {
        const newest = 9007199254750000n
        const core = {
            getUndoGroupsRange: vi.fn((skip: number) => [{ serial: String(newest - BigInt(skip)) }])
        }
        const fs = new FileSystem()
        const session = fs.beginSession(0)
        session.performInstruction(String(newest - 1000n), () => session.open('created', 'write'))
        session.performInstruction(String(newest), () => undefined)
        expect(canUndoMarsHistoryRange(core, session, 5, 5000)).toBe(false)
        expect(core.getUndoGroupsRange.mock.calls).toEqual([
            [5004, 1],
            [5, 1]
        ])
        // The unavailable effect is outside this newer window.
        expect(canUndoMarsHistoryRange(core, session, 0, 100)).toBe(true)
        expect(fs.readText('created')).toBe('')
        expect(session.canUndo(newest.toString())).toBe(true)
        session.stop()
    })

    it('rejects missing boundary groups without touching the FileSystem', () => {
        const core = { getUndoGroupsRange: vi.fn(() => []) }
        const session = new FileSystem().beginSession()
        const preflight = vi.spyOn(session, 'canUndoSerialRange')
        expect(canUndoMarsHistoryRange(core, session, 0, 100)).toBe(false)
        expect(preflight).not.toHaveBeenCalled()
        expect(canUndoMarsHistoryRange(core, session, 0, 0)).toBe(true)
        expect(canUndoMarsHistoryRange(null, session, 0, 1)).toBe(false)
        expect(canUndoMarsHistoryRange(core, session, -1, 1)).toBe(false)
        session.stop()
    })
})
