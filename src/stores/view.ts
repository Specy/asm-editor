


export function viewStore(obj: any) {
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            if (typeof obj[key] === 'object') {
                viewStore(obj[key])
            } else {
                obj[key]
            }
        }
    }
}