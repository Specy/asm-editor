

//if it includes bigints, then it needs superjson
import _superjson from 'superjson'

function needsSuperJson(obj: unknown): boolean {
    if (typeof obj === 'object' && obj !== null) {
        for (const key in obj) {
            if (obj[key] instanceof BigInt || typeof obj[key] === 'bigint') {
                return true
            }
            if (typeof obj[key] === 'object') {
                if (needsSuperJson(obj[key])) {
                    return true
                }
            }
        }
    }
    return false
}
export const serializer = {
    stringify: (obj: unknown, _?: null, indent?: number) => {
        if(needsSuperJson(obj)) {
            return _superjson.stringify(obj)
        }else {
            return JSON.stringify(obj, _, indent)
        }
    },
    parse: <T>(str: string): T => {
        const result = JSON.parse(str)
        return "json" in result
            ? _superjson.deserialize(result)
            : result
    }
}