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

