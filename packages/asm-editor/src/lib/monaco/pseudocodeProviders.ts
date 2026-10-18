import type monaco from 'monaco-editor'
import { projectSourceUri } from '#lib/languages/service/uri.ts'
import {
    listingLineOfTarget,
    listingNameOfTarget,
    pseudocodeTargetAt
} from '#lib/pseudocode/pseudocodeMap.ts'
import type { MonacoType } from './Monaco'
import { modelPseudocode } from './pseudocodeModels'

/**
 * Navigation in a Pseudocode ([file-views.md](../../../../../docs/design/file-views.md), decision
 * 6): Go to Definition on a called function, a global or a string goes to its line in the
 * Listing, which the Workbench shows in the Listing beside the Pseudocode, moving the Pseudocode
 * to that function; a hover names it as the Listing does. A name the decompiler prints without a
 * target, such as Ghidra's own `syscall`, has neither. They answer for Pseudocode models only.
 */
export function createPseudocodeProviders(monacoInstance: MonacoType) {
    function target(model: monaco.editor.ITextModel, position: monaco.Position) {
        const registered = modelPseudocode(model.uri)
        if (!registered) return undefined
        const line = position.lineNumber - 1
        const token = pseudocodeTargetAt(
            registered.lines,
            registered.firstLine,
            line,
            position.column - 1
        )
        if (!token) return undefined
        const origin = new monacoInstance.Range(
            position.lineNumber,
            token.start + 1,
            position.lineNumber,
            token.end + 1
        )
        return { registered, token, origin }
    }

    const definition: monaco.languages.DefinitionProvider = {
        provideDefinition(model, position) {
            const found = target(model, position)
            if (!found) return null
            const { registered, token, origin } = found
            const line = listingLineOfTarget(registered.listing, token.target)
            if (line < 0) return null
            return [
                {
                    uri: projectSourceUri(monacoInstance, registered.listingIdentity),
                    range: new monacoInstance.Range(line + 1, 1, line + 1, 1),
                    originSelectionRange: origin
                }
            ]
        }
    }

    const hover: monaco.languages.HoverProvider = {
        provideHover(model, position) {
            const found = target(model, position)
            if (!found) return null
            const { registered, token, origin } = found
            const { listing } = registered
            const name = listingNameOfTarget(listing, token.target)
            const address = `0x${(token.target + listing.base).toString(16)}`
            return {
                range: origin,
                contents: [
                    {
                        value: `${name ? `\`${name}\` at ` : ''}\`${address}\` in the Listing: Go to Definition shows it there.`
                    }
                ]
            }
        }
    }

    return { definition, hover }
}

/** Registers the providers for the language Pseudocode models have, C's. */
export function registerPseudocodeProviders(monacoInstance: MonacoType): monaco.IDisposable[] {
    const { definition, hover } = createPseudocodeProviders(monacoInstance)
    return [
        monacoInstance.languages.registerDefinitionProvider('cpp', definition),
        monacoInstance.languages.registerHoverProvider('cpp', hover)
    ]
}
