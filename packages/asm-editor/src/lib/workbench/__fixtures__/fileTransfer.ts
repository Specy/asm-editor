/** The DataTransfer operations used by native Project-file dragging. */
export function fileTransfer() {
    const data = new Map<string, string>()
    return {
        get types() {
            return [...data.keys()]
        },
        effectAllowed: 'none',
        dropEffect: 'none',
        setData(type: string, value: string) {
            data.set(type, value)
        },
        getData(type: string) {
            return data.get(type) ?? ''
        }
    } as unknown as DataTransfer
}
