/**
 * For the tests that hold a number named again in a script to the token it repeats
 * (`elevation.test.ts`, `iconSizes.test.ts`, `motion.test.ts`): what `tokens.css` and the
 * stylesheets beside it declare, read from their source.
 */
import { readFileSync } from 'node:fs'

const tokens = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')

/** A token's value as `tokens.css` declares it on `:root`, the first declaration of the name. */
export function token(name: string): string | undefined {
    return tokens.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim()
}

/** A Sass variable's value as a stylesheet in `styles/` declares it, such as `$arrow` in `popover.scss`. */
export function sassVariable(file: string, name: string): string | undefined {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
    return source.match(new RegExp(`^\\$${name}:\\s*([^;]+);`, 'm'))?.[1].trim()
}
