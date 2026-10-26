/**
 * The first index from 0 to `length` that is not `before` a boundary, by binary search: `before`
 * holds for every index below the boundary and for none at or past it. Over an ascending array,
 * `(i) => sorted[i] < value` gives the first index at or above `value` and
 * `(i) => sorted[i] <= value` the first above it, so one less is the last at or below it.
 */
export function partitionPoint(length: number, before: (index: number) => boolean): number {
    let low = 0
    let high = length
    while (low < high) {
        const middle = (low + high) >>> 1
        if (before(middle)) low = middle + 1
        else high = middle
    }
    return low
}
