export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export type Timer = NodeJS.Timeout | number;

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
export function blobDownloader(blob: Blob, fileName: string) {
    const a = document.createElement('a')
    a.style.display = 'none'
    document.body.appendChild(a)
    a.href = URL.createObjectURL(blob)
    a.download = fileName
    a.click()
    a.remove()
    URL.revokeObjectURL(a.href)
}
export function textDownloader(text: string, fileName: string) {
    blobDownloader(new Blob([text], { type: "text/json" }), fileName)
}

export function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
}
export function formatTime(s: number) {
    //format in seconds, milliseconds
    const seconds = Math.floor(s / 1000)
    const milliseconds = Math.floor(s % 1000)
    if(seconds === 0) {
        return `${milliseconds}ms`
    }
    return `${seconds}.${`${milliseconds}`.padStart(3, "0")}s`
}


export function capitalize(word: string) {
    return word[0].toUpperCase() + word.slice(1)
}
