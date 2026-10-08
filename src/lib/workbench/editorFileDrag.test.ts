import { describe, expect, it } from 'vitest'
import { EDITOR_FILE_DRAG_TYPE, readEditorFileDrag, writeEditorFileDrag } from './editorFileDrag'

import { fileTransfer } from './__fixtures__/fileTransfer'

describe('Project file drag payloads', () => {
    it('opens sidebar files as copies and transfers tabs as moves', () => {
        const transfer = fileTransfer()
        const file = { sessionId: 'project', path: 'src/main.cpp' }
        writeEditorFileDrag(transfer, file)
        expect(transfer.effectAllowed).toBe('copy')
        expect(readEditorFileDrag(transfer, 'project')).toEqual(file)
        writeEditorFileDrag(transfer, { ...file, groupId: 'editor-1' })
        expect(transfer.effectAllowed).toBe('move')
        expect(readEditorFileDrag(transfer, 'project')?.groupId).toBe('editor-1')
    })
    it('rejects a different project session, malformed payloads and invalid paths', () => {
        const transfer = fileTransfer()
        for (const file of [
            { sessionId: 'other', path: 'main.c' },
            { sessionId: 'project', path: '../main.c' },
            { sessionId: 'project', path: 'main.c', groupId: 1 },
            null
        ]) {
            transfer.setData(EDITOR_FILE_DRAG_TYPE, JSON.stringify(file))
            expect(readEditorFileDrag(transfer, 'project')).toBeUndefined()
        }
        transfer.setData(EDITOR_FILE_DRAG_TYPE, 'broken JSON')
        expect(readEditorFileDrag(transfer, 'project')).toBeUndefined()
    })
})
