/**
 * What a page's `load` returned, for the twin that renders what the page renders. SvelteKit types a
 * load as one that may return nothing; the loads twins call always return their data, or throw.
 */
export async function loaded<T>(data: Promise<T | void> | T | void): Promise<T> {
    const value = await data
    if (!value) throw new Error("The page's load returned nothing")
    return value
}
