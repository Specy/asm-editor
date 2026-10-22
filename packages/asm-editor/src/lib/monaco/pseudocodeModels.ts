import type { DecompiledLine, DecompiledVariable, LocalName } from '@specy/decompiler'
import type { Listing } from '#lib/listing/listing.ts'
import type { ProjectModelIdentity } from '#lib/languages/service/uri.ts'

/**
 * Which editor models hold a function's Pseudocode, for the providers that read one: Go to
 * Definition and the hover of the names it refers to. Registered by the editor showing the model,
 * as a Listing is.
 */
export type PseudocodeModel = {
    /** The decompiler's lines, the first of them on the model's line `firstLine` (0-based). */
    lines: readonly DecompiledLine[]
    firstLine: number
    /** The Listing it was decompiled from, which shows what its names refer to. */
    listing: Listing
    /** The model of that Listing, where Go to Definition goes. */
    listingIdentity: ProjectModelIdentity
    /**
     * The function's local variables and parameters, as the decompiler reports them, which the
     * hover of one the person renamed says where it is kept from.
     */
    variables?: readonly DecompiledVariable[]
    /** The person's names it was decompiled with, by variable id. */
    locals?: readonly LocalName[]
    /**
     * The names the decompiler gives the function's variables, by id, where known, which the
     * hover of one the person renamed says it was renamed from.
     */
    defaultNames?: ReadonlyMap<string, string>
    /** The function's link-time address, which a variable's first use is counted from. */
    functionAddress?: number
}

const models = new Map<string, PseudocodeModel>()

export function setModelPseudocode(uri: string, model: PseudocodeModel): () => void {
    models.set(uri, model)
    return () => {
        if (models.get(uri) === model) models.delete(uri)
    }
}

export function modelPseudocode(uri: { toString(): string }): PseudocodeModel | undefined {
    return models.get(uri.toString())
}
