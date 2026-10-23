/**
 * Short numbers for long strings, so that a cache's keys made from them stay short: a File's
 * content can be megabytes, and a key made by concatenating it would be copied out whole and
 * hashed again on every lookup, where the one string a File keeps is hashed once. One table per
 * kind of string (contents, Annotations), so that many strings of one kind never push out the
 * other's.
 *
 * Ids are never reused, so forgetting a string only costs what was kept under its id, made again
 * when it is asked for again. Past `limit` strings, the one used longest ago is forgotten: a
 * string in use, asked for at each lookup, keeps its id.
 */
export class KeyIds {
    private readonly ids = new Map<string, number>()
    private next = 0

    constructor(private readonly limit: number) {}

    /** The id of `text`: the one it had, or a new one for a text never seen or forgotten since. */
    of(text: string): number {
        let id = this.ids.get(text)
        if (id !== undefined) this.ids.delete(text)
        else {
            id = ++this.next
            if (this.ids.size >= this.limit) this.ids.delete(this.ids.keys().next().value!)
        }
        this.ids.set(text, id)
        return id
    }

    /** Forgets every string; ids given before are still never given again. */
    clear(): void {
        this.ids.clear()
    }
}
