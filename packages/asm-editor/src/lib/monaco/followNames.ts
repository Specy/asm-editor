import type monaco from 'monaco-editor'
import { projectSourceUri } from '#lib/languages/service/uri.ts'
import { listingLineOfTarget } from '#lib/pseudocode/pseudocodeMap.ts'
import { listingNameAt } from './listingProviders'
import type { MonacoType } from './Monaco'
import { pseudocodeNameAt } from './pseudocodeProviders'

/**
 * A name a double-click follows ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md),
 * decision 7): in a Listing a label or an address an operand names, in a Pseudocode a function or
 * data name, with where Go to Definition goes from it. A label where it is defined goes nowhere, so
 * it is no link.
 */
export type FollowableName = {
    /** The name, on its line. */
    range: monaco.IRange
    /** The model Go to Definition opens, and the 1-based line it goes to there. */
    resource: monaco.Uri
    line: number
}

export function followableNameAt(
    monacoInstance: MonacoType,
    model: monaco.editor.ITextModel,
    position: Pick<monaco.Position, 'lineNumber' | 'column'>
): FollowableName | undefined {
    const at = (start: number, end: number) =>
        new monacoInstance.Range(position.lineNumber, start + 1, position.lineNumber, end + 1)
    const listed = listingNameAt(model, position)
    if (listed) {
        const line = listed.label ? listed.label.line : listed.addressLine
        if (line === listed.line) return undefined
        return {
            range: at(listed.token.start, listed.token.end),
            resource: model.uri,
            line: line + 1
        }
    }
    const named = pseudocodeNameAt(model, position)
    if (!named) return undefined
    const { registered, token } = named
    const line = listingLineOfTarget(registered.listing, token.target)
    if (line < 0) return undefined
    return {
        range: at(token.start, token.end),
        resource: projectSourceUri(monacoInstance, registered.listingIdentity),
        line: line + 1
    }
}
