import { PUBLIC_ENTRIES } from './publicEntries.mjs'
import { parametersOf } from './declarations.mjs'

/** Generates only public help data from committed declarations, without filesystem or compiler work. */
export function runtimeHelpCatalog(headers, functions) {
    const entries = functions.functions.map(({ name, header, prototype, doc }) => ({
        name,
        kind: 'function',
        declaration: prototype,
        parameters: parametersOf(prototype, name),
        headers: [header],
        summary: doc,
        definition: 'documentation'
    }))
    for (const item of PUBLIC_ENTRIES) {
        for (const header of item.headers) {
            if (!headers[header] || !new RegExp(`\\b${item.name}\\b`).test(headers[header]))
                throw new Error(`Missing public declaration: ${header}: ${item.name}`)
        }
        entries.push({
            ...item,
            headers: [...item.headers],
            parameters: parametersOf(item.declaration, item.name),
            definition: 'documentation'
        })
    }
    const byName = new Map(entries.map((item) => [item.name, item]))
    if (byName.size !== entries.length) throw new Error('Duplicate public catalog name')
    for (const item of entries) {
        if (!item.summary || !item.headers.every((header) => headers[header]))
            throw new Error(`Invalid entry: ${item.name}`)
        if (
            item.kind === 'function' &&
            !new RegExp(`\\b${item.name}\\s*\\(`).test(headers[item.headers[0]])
        )
            throw new Error(`Missing function: ${item.name}`)
    }
    for (const wrapper of Object.keys(headers)
        .sort()
        .filter((header) => !header.endsWith('.h') && header !== 'new')) {
        // Discover only explicit namespace aliases, never functions from bodies or inline assembly.
        const text = headers[wrapper]
        if (!/namespace\s+std\s*\{/.test(text)) continue
        const includes = [...text.matchAll(/^#include\s+<([^>]+)>/gm)].map((match) => match[1])
        for (const [, name] of text.matchAll(/\busing\s+::(\w+)\s*;/g)) {
            const original = byName.get(name)
            if (!original) throw new Error(`Uncataloged public std alias: ${wrapper}: ${name}`)
            if (!original.headers.some((header) => includes.includes(header)))
                throw new Error(`Alias has no supplied declaration: ${wrapper}: ${name}`)
            if (!original.headers.includes(wrapper)) original.headers.push(wrapper)
            const qualified = `std::${name}`
            const prior = byName.get(qualified)
            if (prior) {
                if (!prior.headers.includes(wrapper)) prior.headers.push(wrapper)
                continue
            }
            const declaration = original.declaration.replace(new RegExp(`\\b${name}\\b`), qualified)
            const alias = {
                ...original,
                name: qualified,
                declaration,
                parameters: parametersOf(declaration, qualified),
                headers: [wrapper],
                languages: ['cpp']
            }
            entries.push(alias)
            byName.set(qualified, alias)
        }
        // Macro names remain unqualified when a wrapper includes their declaring C header.
        for (const original of PUBLIC_ENTRIES) {
            if (original.languages?.every((language) => language === 'c')) continue
            if (original.headers.some((header) => includes.includes(header))) {
                const entry = byName.get(original.name)
                if (!entry.headers.includes(wrapper)) entry.headers.push(wrapper)
            }
        }
    }
    return {
        revision: 1,
        abi: functions.abi,
        entries: entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))
    }
}
