import type { RuntimeError } from "s68k";

export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export type Timer = NodeJS.Timeout | number;

export function createDebouncer(delay:number): [(callback:() => void) => void, () => void]{
    let timeoutId:Timer
    function clear(){
        clearTimeout(timeoutId)
    }
    function debounce(callback:() => void){
        clearTimeout(timeoutId)
        timeoutId = setTimeout(callback, delay)
    }
    return [debounce, clear]
}
export function blobDownloader(blob:Blob,fileName:string){
    const a = document.createElement('a')
    a.style.display = 'none'
    document.body.appendChild(a)
    a.href = URL.createObjectURL(blob)
    a.download = fileName
    a.click()
    a.remove()
    URL.revokeObjectURL(a.href)
}
export function textDownloader(text: string, fileName){
    blobDownloader(new Blob([text], { type: "text/json" }), fileName)
}
export function getErrorMessage(error: any, lineNumber?: number): string{
    const prepend = lineNumber ? `Error at line ${lineNumber}:` : ""
    if(typeof error !== "object"){
        return `${prepend}${error}`
    }
    const maybeError = error as RuntimeError
    if(maybeError){
        switch (maybeError.type) {
            case "Raw": return maybeError.value
            case "Unimplemented": return `${prepend} Unimplemented`
            case "DivisionByZero" : return `${prepend} Division by zero`
            case "ExecutionLimit": return `${prepend} Execution limit of ${maybeError.value} instructions reached`
            case "OutOfBounds" : return `${prepend} Memory read out of bounds: ${maybeError.value}`
            case "IncorrectAddressingMode": return `${prepend} Incorrect addressing mode: ${maybeError.value}`
        } 
    }  
    if(error.message) {
        if(error.message === "unreachable"){
            return `${prepend} WASM panicked (unreachable)` 
        }
        return  `${prepend} ${error.message}` 
    }
    return `${prepend} ${JSON.stringify(error)}`
}

export function delay(ms:number){
    return new Promise(resolve => setTimeout(resolve, ms))
}


export function capitalize(word:string){
    return word[0].toUpperCase() + word.slice(1)
}