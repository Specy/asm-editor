/** Split only commas at the prototype's outer argument level, including function pointers. */
export function parametersOf(declaration, name) {
    const opening = declaration.indexOf('(', declaration.indexOf(name) + name.length)
    if (opening < 0) return undefined
    const parameters = []
    let start = opening + 1
    let depth = 0
    for (let index = start; index < declaration.length; index++) {
        const char = declaration[index]
        if (char === '(' || char === '[') depth++
        if ((char === ')' && depth === 0) || (char === ',' && depth === 0)) {
            const raw = declaration.slice(start, index)
            const label = raw.trim()
            if (label && label !== 'void') {
                const from = start + raw.indexOf(label)
                parameters.push({ label, range: [from, from + label.length] })
            }
            start = index + 1
            if (char === ')') return parameters
        } else if (char === ')' || char === ']') depth--
    }
    throw new Error(`Unbalanced declaration: ${declaration}`)
}
