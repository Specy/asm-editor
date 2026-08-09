export function viewStore(obj: object) {
    const record = obj as Record<string, unknown>
    for (const key in record) {
        if (Object.prototype.hasOwnProperty.call(record, key)) {
            if (typeof record[key] === 'object') {
                viewStore(record[key] as object)
            } else {
                void record[key]
            }
        }
    }
}
