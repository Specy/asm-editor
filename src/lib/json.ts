//if it includes bigints, then it needs superjson
import _superjson from 'superjson'
import type { SuperJSONResult } from 'superjson'

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function isSuperJsonResult(value: unknown): value is SuperJSONResult {
    return isRecord(value) && 'json' in value
}

function needsSuperJson(obj: unknown): boolean {
    if (isRecord(obj)) {
        for (const key in obj) {
            const value = obj[key]
            if (value instanceof BigInt || typeof value === 'bigint') {
                return true
            }
            if (typeof value === 'object') {
                if (needsSuperJson(value)) {
                    return true
                }
            }
        }
    }
    return false
}
export const serializer = {
    stringify: (obj: unknown, _?: null, indent?: number) => {
        if (needsSuperJson(obj)) {
            return _superjson.stringify(obj)
        } else {
            return JSON.stringify(obj, _, indent)
        }
    },
    parse: <T>(str: string): T => {
        const result: T | SuperJSONResult = JSON.parse(str)
        return isSuperJsonResult(result) ? _superjson.deserialize<T>(result) : result
    }
}
