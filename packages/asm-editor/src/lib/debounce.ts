/**
 * Kept apart from `utils.ts`, which imports the Project and its stores: the root layout's theme
 * store debounces, so whatever this module imports, every page of the site downloads.
 */
export type Timer = ReturnType<typeof setTimeout>

export function createDebouncer(delay: number): [(callback: () => void) => void, () => void] {
    let timeoutId: Timer
    function clear() {
        clearTimeout(timeoutId)
    }
    function debounce(callback: () => void) {
        clearTimeout(timeoutId)
        timeoutId = setTimeout(callback, delay)
    }
    return [debounce, clear]
}
