import type monaco from 'monaco-editor'
import {
    labelHoverMarkdown,
    lineHoverMarkdown,
    listingTokenAt
} from '#lib/listing/listingNavigation.ts'
import { LINE_KIND } from '#lib/listing/listing.ts'
import type { MonacoType } from './Monaco'
import { modelListing } from './listingModels'

/**
 * Navigation in a Listing
 * ([binary-import.md](../../../../../docs/design/binary-import.md), decision 5): go to a label from
 * any name of it (`call FUN_brave_otter`, `jne .LAB_2`, `strcmp@plt`, `[rel s_hunter2+0x2]`) or
 * to the line of a run-time address, every line naming a label, and a hover with a line's address
 * and bytes or a label's address and origin. They answer for Listing models only, and the x86
 * providers that read Project Files answer for every other model (`withoutListings`).
 */
export function createListingProviders(monacoInstance: MonacoType) {
    const range = (line: number, start: number, end: number) =>
        new monacoInstance.Range(line + 1, start + 1, line + 1, end + 1)

    const definition: monaco.languages.DefinitionProvider = {
        provideDefinition(model, position) {
            const found = listingNameAt(model, position)
            if (!found) return null
            const { label, addressLine } = found
            if (label)
                return {
                    uri: model.uri,
                    range: range(label.line, 0, label.name.length)
                }
            return { uri: model.uri, range: range(addressLine, 0, 0) }
        }
    }

    const references: monaco.languages.ReferenceProvider = {
        provideReferences(model, position, context) {
            const found = listingNameAt(model, position)
            if (!found?.label) return null
            const { label, registered } = found
            return registered.index
                .references(label)
                .filter(
                    (span) =>
                        context.includeDeclaration || span.line !== label.line || span.start !== 0
                )
                .map((span) => ({ uri: model.uri, range: range(span.line, span.start, span.end) }))
        }
    }

    const hover: monaco.languages.HoverProvider = {
        provideHover(model, position) {
            const registered = modelListing(model.uri)
            if (!registered) return null
            const line = position.lineNumber - 1
            const contents: monaco.IMarkdownString[] = []
            const found = listingNameAt(model, position)
            if (found?.label)
                contents.push({ value: labelHoverMarkdown(registered.listing, found.label) })
            const bytes = lineHoverMarkdown(
                registered.listing,
                registered.bytes,
                line,
                registered.patches?.get(line)
            )
            if (bytes) contents.push({ value: bytes })
            if (!contents.length) return null
            return {
                range: found
                    ? range(line, found.token.start, found.token.end)
                    : new monacoInstance.Range(
                          position.lineNumber,
                          1,
                          position.lineNumber,
                          model.getLineMaxColumn(position.lineNumber)
                      ),
                contents
            }
        }
    }

    const documentSymbols: monaco.languages.DocumentSymbolProvider = {
        provideDocumentSymbols(model) {
            const registered = modelListing(model.uri)
            if (!registered) return null
            const { listing } = registered
            return listing.functions.map((fn) => {
                const end = Math.max(fn.line, fn.endLine - 1)
                return {
                    name: fn.name,
                    detail: `0x${(fn.address + listing.base).toString(16)}`,
                    kind: monacoInstance.languages.SymbolKind.Function,
                    tags: [],
                    range: new monacoInstance.Range(fn.line + 1, 1, end + 1, 1),
                    selectionRange: range(fn.line, 0, fn.name.length)
                }
            })
        }
    }

    const folding: monaco.languages.FoldingRangeProvider = {
        provideFoldingRanges(model) {
            const registered = modelListing(model.uri)
            if (!registered) return null
            const { listing } = registered
            const { kinds } = listing.lines
            const ranges: monaco.languages.FoldingRange[] = []
            //each function from its label, and each section from its `section` line
            for (const fn of listing.functions) {
                let end = fn.endLine - 1
                while (end > fn.line && kinds[end] === LINE_KIND.blank) --end
                if (end > fn.line) ranges.push({ start: fn.line + 1, end: end + 1 })
            }
            let section = -1
            const close = (next: number) => {
                let end = next - 1
                while (end > section && kinds[end] === LINE_KIND.blank) --end
                if (section >= 0 && end > section)
                    ranges.push({
                        start: section + 1,
                        end: end + 1,
                        kind: monacoInstance.languages.FoldingRangeKind.Region
                    })
            }
            for (let line = 0; line < kinds.length; ++line)
                if (kinds[line] === LINE_KIND.section) {
                    close(line)
                    section = line
                }
            close(kinds.length)
            return ranges
        }
    }

    return { definition, references, hover, documentSymbols, folding }
}

/**
 * The label or address under a position of a Listing model, which Go to Definition goes to: the
 * label's definition, or the line of the address.
 */
export function listingNameAt(
    model: monaco.editor.ITextModel,
    position: Pick<monaco.Position, 'lineNumber' | 'column'>
) {
    const registered = modelListing(model.uri)
    if (!registered) return undefined
    const line = position.lineNumber - 1
    const text = model.getLineContent(position.lineNumber)
    const token = listingTokenAt(text, position.column - 1)
    //a comment's demangled name is text, whose words are no names
    if (!token || registered.index.inDemangledComment(text, line, token.start)) return undefined
    const label = registered.index.label(token.text, line)
    const addressLine = label ? -1 : registered.index.addressLine(token.text)
    if (!label && addressLine < 0) return undefined
    return { registered, line, token, label, addressLine }
}

type ModelProvider = Record<string, unknown>

/**
 * A provider that answers nothing for a Listing model and as before for every other: the x86
 * providers that read the Project's Files (their labels, their includes) or format text would
 * read a Listing as a File it is not, and some scan every line, which libc's Listing has half a
 * million of.
 */
export function withoutListings<T extends object>(
    provider: T,
    method: keyof T & string,
    nothing: unknown = null
): T {
    const original = (provider as ModelProvider)[method] as (
        model: monaco.editor.ITextModel,
        ...rest: unknown[]
    ) => unknown
    const wrapped = Object.create(provider) as ModelProvider
    wrapped[method] = (model: monaco.editor.ITextModel, ...rest: unknown[]) =>
        modelListing(model.uri) ? nothing : original.call(provider, model, ...rest)
    return wrapped as T
}
