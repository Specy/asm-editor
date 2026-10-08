import { isValidFilePath } from '$lib/projectFiles'

export const EDITOR_FILE_DRAG_TYPE = 'application/x-asm-editor-file'
export type EditorFileDrag = { sessionId: string; path: string; groupId?: string }

export function writeEditorFileDrag(transfer: DataTransfer, file: EditorFileDrag) {
    transfer.setData(EDITOR_FILE_DRAG_TYPE, JSON.stringify(file))
    transfer.effectAllowed = file.groupId ? 'move' : 'copy'
}

export function readEditorFileDrag(
    transfer: DataTransfer,
    sessionId: string
): EditorFileDrag | undefined {
    try {
        const file = JSON.parse(transfer.getData(EDITOR_FILE_DRAG_TYPE))
        if (
            file?.sessionId !== sessionId ||
            typeof file.path !== 'string' ||
            !isValidFilePath(file.path) ||
            (file.groupId !== undefined && typeof file.groupId !== 'string')
        )
            return undefined
        return { sessionId, path: file.path, ...(file.groupId ? { groupId: file.groupId } : {}) }
    } catch {
        return undefined
    }
}
