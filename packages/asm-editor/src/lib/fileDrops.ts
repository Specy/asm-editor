import { toast } from '#stores/toastStore.ts'

/**
 * Set while something on the page itself is dragged: an image dragged off it carries files too,
 * which are no files from the computer. A drop on the page can remove the element dragged, such as
 * a tab moved to the other pane, whose `dragend` then never reaches the window, so a drop clears it
 * as well, once the drop's own handlers have read it.
 */
let draggingFromPage = false
if (typeof window !== 'undefined') {
    window.addEventListener('dragstart', () => (draggingFromPage = true), true)
    window.addEventListener('dragend', () => (draggingFromPage = false), true)
    window.addEventListener('drop', () => setTimeout(() => (draggingFromPage = false)), true)
}

/** Whether a drag carries files from the computer, rather than something dragged on the page. */
export function carriesComputerFiles(event: DragEvent): boolean {
    return !draggingFromPage && !!event.dataTransfer?.types.includes('Files')
}

/**
 * The files a drop brings from the computer. A folder is refused with a toast, as it has no bytes
 * to read. Call it while the drop event is dispatched: its items are gone once it returns.
 */
export function droppedFiles(transfer: DataTransfer): File[] {
    const files: File[] = []
    for (const item of transfer.items) {
        if (item.kind !== 'file') continue
        const file = item.getAsFile()
        if (!file) continue
        if (item.webkitGetAsEntry?.()?.isDirectory) {
            toast.error(`${file.name} is a folder: drop the files in it instead`)
            continue
        }
        files.push(file)
    }
    return files
}
