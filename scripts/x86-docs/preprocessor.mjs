/**
 * Just enough of the C preprocessor to tell which parts of a blink source the compiler sees: the
 * conditional directives, and the `defined`, `!`, `&&`, `||` conditions blink guards its syscall
 * table with. Anything outside that grammar is an error rather than a guess, so a blink update that
 * guards a call some new way stops the generator instead of listing the wrong calls.
 *
 * Macros are a `{ defined, unset }` pair: `defined` maps each defined macro to its replacement text,
 * `unset` names the macros known to be undefined. A condition that reads any other macro throws,
 * because "undefined" and "nobody said" are different answers and only the first one is known.
 */

const DIRECTIVE = /^\s*#\s*(ifdef|ifndef|if|elifdef|elifndef|elif|else|endif)\b(.*)$/

/** The condition text of a directive, without the comment that often follows it. */
const conditionText = (rest) =>
    rest
        .replace(/\/\*.*?\*\//g, ' ')
        .replace(/\/\/.*$/, '')
        .trim()

/** The condition `#ifdef NAME` and its relatives stand for. */
function definedTest(directive, rest) {
    const name = conditionText(rest)
    if (!/^[A-Za-z_]\w*$/.test(name)) throw new Error(`#${directive} needs one macro name`)
    return directive.endsWith('ndef') ? `!defined(${name})` : `defined(${name})`
}

/** One open `#if`, as the expression its current branch is compiled under. */
const branchCondition = ({ earlier, current }) =>
    [
        ...earlier.map((condition) => `!(${condition})`),
        ...(current === null ? [] : [`(${current})`])
    ].join(' && ')

/**
 * The conditions in force at each point of a C source, as a lookup from a character offset to its
 * line and the conditions of every `#if` branch around it. An `#elif` or `#else` branch is compiled
 * when the branches before it were not, and its condition says so.
 */
export function conditionLookup(text) {
    const lines = text.split('\n')
    const byLine = []
    /** One per open `#if`: the conditions of its earlier branches, and of the current one. */
    const open = []
    let inForce = []
    for (let index = 0; index < lines.length; index += 1) {
        const match = DIRECTIVE.exec(lines[index])
        if (!match) {
            byLine.push(inForce)
            continue
        }
        const first = index
        const directive = match[1]
        let rest = match[2]
        // A directive continues onto the next line after a trailing backslash.
        while (rest.endsWith('\\') && index + 1 < lines.length) {
            index += 1
            rest = `${rest.slice(0, -1)} ${lines[index]}`
        }
        try {
            const top = open.at(-1)
            if (directive === 'if') {
                open.push({ earlier: [], current: conditionText(rest) })
            } else if (directive === 'ifdef' || directive === 'ifndef') {
                open.push({ earlier: [], current: definedTest(directive, rest) })
            } else if (!top) {
                throw new Error(`#${directive} without #if`)
            } else if (directive === 'endif') {
                open.pop()
            } else if (top.current === null) {
                throw new Error(`#${directive} after #else`)
            } else {
                top.earlier.push(top.current)
                top.current =
                    directive === 'else'
                        ? null
                        : directive === 'elif'
                          ? conditionText(rest)
                          : definedTest(directive.slice(2), rest)
            }
        } catch (error) {
            throw new Error(`line ${first + 1}: ${error.message}`, { cause: error })
        }
        inForce = open.map(branchCondition)
        for (let line = first; line <= index; line += 1) byLine.push(inForce)
    }
    if (open.length > 0) throw new Error(`${open.length} #if without #endif`)

    const starts = [0]
    for (let offset = text.indexOf('\n'); offset !== -1; offset = text.indexOf('\n', offset + 1)) {
        starts.push(offset + 1)
    }
    return (offset) => {
        let low = 0
        let high = starts.length - 1
        while (low < high) {
            const middle = (low + high + 1) >> 1
            if (starts[middle] <= offset) low = middle
            else high = middle - 1
        }
        return { line: low + 1, conditions: byLine[low] }
    }
}

const TOKEN = /\s*(?:(0[xX][0-9A-Fa-f]+|\d+)[uUlL]*|([A-Za-z_]\w*)|(&&|\|\||!|\(|\)))/y

function tokenize(expression) {
    const tokens = []
    TOKEN.lastIndex = 0
    while (expression.slice(TOKEN.lastIndex).trim()) {
        const start = TOKEN.lastIndex
        const match = TOKEN.exec(expression)
        if (!match) {
            throw new Error(
                `cannot read \`${expression.slice(start).trim()}\` in \`${expression}\``
            )
        }
        const [, number, name, operator] = match
        if (number !== undefined) tokens.push({ number: Number(number) })
        else if (name !== undefined) tokens.push({ name })
        else tokens.push({ operator })
    }
    return tokens
}

/**
 * Evaluates one `#if` condition against a set of macros, as the compiler would, except that both
 * sides of `&&` and `||` must name known macros even when one side already decides the answer.
 */
export function evaluateCondition(expression, macros) {
    const tokens = tokenize(expression)
    let position = 0
    const peek = () => tokens[position]
    const take = (operator) => {
        const token = tokens[position]
        if (operator !== undefined && token?.operator !== operator) {
            throw new Error(`expected \`${operator}\` in \`${expression}\``)
        }
        position += 1
        return token
    }
    const known = (name) => {
        if (macros.defined.has(name) || macros.unset.has(name)) return
        throw new Error(`\`${name}\` in \`${expression}\` is a macro the configuration never names`)
    }
    const primary = () => {
        const token = take()
        if (token === undefined) throw new Error(`\`${expression}\` ends too early`)
        if (token.operator === '(') {
            const value = or()
            take(')')
            return value
        }
        if (token.operator === '!') return primary() ? 0 : 1
        if (token.number !== undefined) return token.number
        if (token.name === 'defined') {
            const parenthesised = peek()?.operator === '('
            if (parenthesised) take('(')
            const name = take()?.name
            if (name === undefined) throw new Error(`\`defined\` needs a name in \`${expression}\``)
            if (parenthesised) take(')')
            known(name)
            return macros.defined.has(name) ? 1 : 0
        }
        if (token.name !== undefined) {
            known(token.name)
            if (!macros.defined.has(token.name)) return 0
            const value = macros.defined.get(token.name).trim()
            if (!/^\d+$/.test(value)) {
                throw new Error(
                    `\`${token.name}\` is \`${value}\`, not a number, in \`${expression}\``
                )
            }
            return Number(value)
        }
        throw new Error(`unexpected \`${token.operator}\` in \`${expression}\``)
    }
    const and = () => {
        let value = primary()
        while (peek()?.operator === '&&') {
            take()
            const right = primary()
            value = value && right ? 1 : 0
        }
        return value
    }
    const or = () => {
        let value = and()
        while (peek()?.operator === '||') {
            take()
            const right = and()
            value = value || right ? 1 : 0
        }
        return value
    }
    const value = or()
    if (position !== tokens.length) throw new Error(`cannot read the end of \`${expression}\``)
    return value !== 0
}
