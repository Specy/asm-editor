export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

type Timer = NodeJS.Timeout | number;

export function createDebouncer(delay:number){
    let timeoutId:Timer
    return function(callback:() => void){
        clearTimeout(timeoutId)
        timeoutId = setTimeout(callback, delay)
    }
}

export function getErrorMessage(error: any): string{
    if(typeof error !== "object"){
        return error
    }
    if(error.message) return error.message
    return JSON.stringify(error)
}