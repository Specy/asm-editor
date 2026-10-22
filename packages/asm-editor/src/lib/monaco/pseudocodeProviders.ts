import type monaco from 'monaco-editor'
import { pseudocodeText, type DemangledName } from '#lib/languages/demangle/demangledNames.ts'
import { projectSourceUri } from '#lib/languages/service/uri.ts'
import type { Listing, ListingLabel } from '#lib/listing/listing.ts'
import {
    demangledNameMarkdown,
    ListingIndex,
    markdownCode,
    nameOrigin
} from '#lib/listing/listingNavigation.ts'
import {
    listingLabelOfTarget,
    listingLineOfTarget,
    pseudocodeTargetAt,
    pseudocodeTokenAt
} from '#lib/pseudocode/pseudocodeMap.ts'
import {
    constantValue,
    ghidraWordMarkdown,
    PSEUDOCODE_LINK
} from '#lib/pseudocode/pseudocodeHovers.ts'
import { numberMarkdown } from './assemblyInsights'
import type { MonacoType } from './Monaco'
import { modelPseudocode } from './pseudocodeModels'

/**
 * Navigation in a Pseudocode ([file-views.md](../../../../../docs/design/file-views.md), decision
 * 6): Go to Definition on a called function, a global or a string goes to its line in the
 * Listing, which the Workbench shows in the Listing beside the Pseudocode, moving the Pseudocode
 * to that function; a hover names it as the Listing does, a C++ name by its signature with its
 * demangled text, variant and mangled name ([cpp-demangling.md](../../../../../docs/design/cpp-demangling.md),
 * decision 10). A qualified name (`std::string::operator+=`) is one token, its namespaces
 * included, so both answer anywhere on it. A name the decompiler prints without a
 * target, such as Ghidra's own `syscall`, has neither. The hover also gives a number the Listing's
 * card and explains Ghidra's own words ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md),
 * decisions 5 and 6). They answer for Pseudocode models only.
 */
export function createPseudocodeProviders(monacoInstance: MonacoType) {
    const range = (position: Pick<monaco.Position, 'lineNumber'>, start: number, end: number) =>
        new monacoInstance.Range(position.lineNumber, start + 1, position.lineNumber, end + 1)

    const definition: monaco.languages.DefinitionProvider = {
        provideDefinition(model, position) {
            const found = pseudocodeNameAt(model, position)
            if (!found) return null
            const { registered, token } = found
            const line = listingLineOfTarget(registered.listing, token.target)
            if (line < 0) return null
            return [
                {
                    uri: projectSourceUri(monacoInstance, registered.listingIdentity),
                    range: new monacoInstance.Range(line + 1, 1, line + 1, 1),
                    originSelectionRange: range(position, token.start, token.end)
                }
            ]
        }
    }

    /** Where a name the Listing made up comes from, as the Listing's own hover says. */
    const invented = (listing: Listing, label: ListingLabel | undefined) =>
        label?.origin === 'invented' ? [nameOrigin(listing, label)] : []
    const runTime = (listing: Listing, address: number) =>
        `0x${(address + listing.base).toString(16)}`

    /**
     * A C++ name's forms under the hover's first line, which gives its signature, in the
     * Listing's hover's words, then how the Pseudocode writes a special name, and the link to the
     * Pseudocode's section, which says how its names read (cpp-demangling.md, decisions 10 and
     * 16).
     */
    const demangledDetails = (label: ListingLabel | undefined) =>
        label?.demangled
            ? [
                  [
                      ...demangledNameMarkdown(label.demangled, label.fullName),
                      ...specialSpelling(label.demangled),
                      PSEUDOCODE_LINK
                  ].join('\n\n')
              ]
            : []
    /** How a hover names a label: a C++ name by its signature, any other as the Listing does. */
    const hoverName = (label: ListingLabel) =>
        markdownCode(label.demangled?.signature ?? label.fullName)

    const hover: monaco.languages.HoverProvider = {
        provideHover(model, position) {
            const found = pseudocodeNameAt(model, position)
            if (found) {
                const { registered, token } = found
                const { listing } = registered
                const label = listingLabelOfTarget(listing, token.target)
                return {
                    range: range(position, token.start, token.end),
                    contents: [
                        {
                            value: `${label ? `${hoverName(label)} at ` : ''}\`${runTime(listing, token.target)}\` in the Listing: Go to Definition shows it there.`
                        },
                        ...invented(listing, label).map((value) => ({
                            value: `${value}\n\n${PSEUDOCODE_LINK}`
                        })),
                        ...demangledDetails(label).map((value) => ({ value }))
                    ]
                }
            }
            const registered = modelPseudocode(model.uri)
            if (!registered) return null
            const line = position.lineNumber - 1
            const token = pseudocodeTokenAt(
                registered.lines,
                registered.firstLine,
                line,
                position.column - 1
            )
            if (!token) return null
            const word = registered.lines[line - registered.firstLine].text.slice(
                token.start,
                token.end
            )
            const at = range(position, token.start, token.end)
            //Ghidra writes a `_` before a name it reads more bytes of than its label covers
            const { listing } = registered
            const widened =
                token.kind === 'variable' && word.startsWith('_')
                    ? widenedLabel(listing, word.slice(1))
                    : undefined
            if (widened)
                return {
                    range: at,
                    contents: [
                        {
                            value: [
                                `${hoverName(widened)} at \`${runTime(listing, widened.address)}\` in the Listing, read here as more bytes than its label covers, which the decompiler marks with a \`_\`.`,
                                ...invented(listing, widened),
                                ...(widened.demangled
                                    ? [
                                          ...demangledNameMarkdown(
                                              widened.demangled,
                                              widened.fullName
                                          ),
                                          ...specialSpelling(widened.demangled)
                                      ]
                                    : []),
                                PSEUDOCODE_LINK
                            ].join('\n\n')
                        }
                    ]
                }
            //a number's card is the Listing's, at its width: Ghidra's constants carry no size
            const value = token.kind === 'constant' ? constantValue(word) : undefined
            const markdown =
                value === undefined
                    ? ghidraWordMarkdown(word, token.kind)
                    : numberMarkdown(value, 64)
            return markdown ? { range: at, contents: [{ value: markdown }] } : null
        }
    }

    return { definition, hover }
}

/**
 * How the Pseudocode writes a special name, which the hover's first line gives in the Listing's
 * words (cpp-demangling.md, decision 16): `vtable for game::Boss` as `game::Boss::vtable`, a thunk
 * by the name of the function it stands for.
 */
function specialSpelling(demangled: DemangledName): string[] {
    if (!demangled.special) return []
    const written = markdownCode(pseudocodeText(demangled.pseudocode))
    return [
        demangled.kind === 'function'
            ? `The Pseudocode writes it ${written}, the name of what it stands for.`
            : `The Pseudocode writes it ${written}.`
    ]
}

/**
 * The label a name the decompiler widened (`_name`) is of: a label of that name, else the one C++
 * name whose own name, without its namespaces, it is, as the decompiler writes a namespaced name
 * it widens (`_cout` for `std::cout`).
 */
function widenedLabel(listing: Listing, name: string): ListingLabel | undefined {
    const named = ListingIndex.of(listing).label(name, 0)
    if (named) return named
    let found: ListingLabel | undefined
    for (const label of listing.labels) {
        const demangled = label.demangled
        if (!demangled || label.kind === 'function') continue
        const own = demangled.pseudocode.name
        if (own !== name && own + demangled.suffix !== name) continue
        if (found) return undefined
        found = label
    }
    return found
}

/**
 * The name under a position of a Pseudocode model that refers to something in the Listing, with
 * the Pseudocode it is in: what Go to Definition goes from.
 */
export function pseudocodeNameAt(
    model: monaco.editor.ITextModel,
    position: Pick<monaco.Position, 'lineNumber' | 'column'>
) {
    const registered = modelPseudocode(model.uri)
    if (!registered) return undefined
    const token = pseudocodeTargetAt(
        registered.lines,
        registered.firstLine,
        position.lineNumber - 1,
        position.column - 1
    )
    return token && { registered, token }
}

/** Registers the providers for the language Pseudocode models have, C's. */
export function registerPseudocodeProviders(monacoInstance: MonacoType): monaco.IDisposable[] {
    const { definition, hover } = createPseudocodeProviders(monacoInstance)
    return [
        monacoInstance.languages.registerDefinitionProvider('cpp', definition),
        monacoInstance.languages.registerHoverProvider('cpp', hover)
    ]
}
