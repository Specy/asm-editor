/** Measurements the chip tests make on rendered sound. */

/** Renders `seconds` of a chip at `rate`. */
export function renderSeconds(
    chip: { render(out: Float32Array, start?: number, end?: number): void },
    rate: number,
    seconds: number
): Float32Array {
    const out = new Float32Array(Math.round(rate * seconds))
    //in render quanta, as the worklet does
    for (let start = 0; start < out.length; start += 128) {
        chip.render(out, start, Math.min(out.length, start + 128))
    }
    return out
}

/** How many times the signal crosses zero going up. */
export function risingCrossings(signal: Float32Array): number {
    let count = 0
    for (let i = 1; i < signal.length; i++) if (signal[i - 1] < 0 && signal[i] >= 0) count++
    return count
}

/** The largest absolute value between two times. */
export function peak(signal: Float32Array, rate: number, from: number, to: number): number {
    let peak = 0
    const end = Math.min(signal.length, Math.round(to * rate))
    for (let i = Math.round(from * rate); i < end; i++) peak = Math.max(peak, Math.abs(signal[i]))
    return peak
}
