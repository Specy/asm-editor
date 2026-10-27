/**
 * The RISC-V Unified Database (https://github.com/riscv/riscv-unified-db), read for the facts it
 * holds about each instruction: the extension that defines it, whether only one width has it, and
 * its encoding. `riscv-docs-generate.mjs` uses the extension to find the instruction in the manual;
 * `riscv-docs-udb-audit.mjs` checks our pages and the Core's encodings against the rest.
 *
 * The instruction files under `spec/std/isa/inst` are BSD-3-Clause-Clear (each says so in its
 * header, and `REUSE.toml` agrees); nothing of them is committed here beyond the extension names in
 * the extract, which are the specification's own names. They are YAML, read here with patterns
 * rather than a parser: only a handful of fields are wanted, and their layout is regular.
 *
 * A checkout is untrusted data: this module reads its text files and runs nothing in it.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { checkoutCommit } from '../x86-docs/xed.mjs'

export const UDB_REPOSITORY = 'https://github.com/riscv/riscv-unified-db'

/** Every `.yaml` file under a directory, in a stable order. */
function yamlFiles(directory) {
    const found = []
    for (const name of readdirSync(directory).sort()) {
        const path = join(directory, name)
        if (statSync(path).isDirectory()) found.push(...yamlFiles(path))
        else if (name.endsWith('.yaml')) found.push(path)
    }
    return found
}

/** The lines of a top-level key's block: the key's own line and every more indented one after it. */
function block(text, key) {
    const lines = text.split('\n')
    const start = lines.findIndex((line) => line.startsWith(`${key}:`))
    if (start === -1) return ''
    const body = [lines[start]]
    for (const line of lines.slice(start + 1)) {
        if (line.trim() && !/^\s/.test(line)) break
        body.push(line)
    }
    return body.join('\n')
}

/**
 * One instruction file: `{ name, longName, extension, xlen, encodings }`. `extension` is the first
 * one `definedBy` names (`andn` is Zbb or Zbkb, and the manual describes it under Zbb); `xlen` is
 * 32 or 64 when only that width has the instruction, else null; `encodings` maps a width to its
 * `match` pattern, `{ 32, 64 }` alike when one pattern serves both.
 */
export function parseUdbInstruction(text) {
    const name = /^name:\s*(\S+)/m.exec(text)?.[1]
    if (!name) return null
    const defined = block(text, 'definedBy')
    const encoding = block(text, 'encoding')
    const match = (scope) => /match:\s*"?([01-]{16,32})"?/.exec(scope)?.[1]
    const widths = {}
    for (const width of [32, 64]) {
        const own = new RegExp(`\\n\\s+RV${width}:\\n([\\s\\S]*?)(?=\\n\\s+RV\\d+:|$)`).exec(
            encoding
        )
        const pattern = own ? match(own[1]) : match(encoding)
        if (pattern) widths[width] = pattern
    }
    const xlen = /xlen:\s*(32|64)/.exec(defined)?.[1]
    return {
        name,
        longName: /^long_name:\s*(.+)$/m.exec(text)?.[1].trim() ?? '',
        extension: /extension:[\s\S]*?name:\s*(\S+)/.exec(defined)?.[1] ?? '',
        xlen: xlen ? Number(xlen) : null,
        encodings: widths
    }
}

/** Every instruction a checkout defines, by name, with the commit it is at. */
export function readUdbCheckout(root) {
    const instructions = new Map()
    for (const path of yamlFiles(join(root, 'spec', 'std', 'isa', 'inst'))) {
        const text = readFileSync(path, 'utf8')
        if (!/SPDX-License-Identifier:\s*BSD-3-Clause-Clear/.test(text)) {
            throw new Error(`${path} is no longer BSD-3-Clause-Clear; check before using it`)
        }
        const instruction = parseUdbInstruction(text)
        if (instruction) instructions.set(instruction.name, instruction)
    }
    return { commit: checkoutCommit(root), instructions }
}

/** Whether a 32-bit instruction word fits a `match` pattern, most significant bit first. */
export function matchesEncoding(word, pattern) {
    const offset = 32 - pattern.length
    for (let index = 0; index < pattern.length; index++) {
        const expected = pattern[index]
        if (expected === '-') continue
        const bit = (word >>> (31 - offset - index)) & 1
        if (String(bit) !== expected) return false
    }
    return true
}
