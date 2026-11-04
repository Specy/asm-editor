/**
 * How many Projects the browser keeps, counted from their keys without reading one: what a page
 * that only links to the Projects needs, where reading the list would read and check every
 * Project. Undefined when the browser's storage cannot be read. The database is imported when
 * asked, so the pages that ask do not download it with themselves.
 */
export async function storedProjectCount(): Promise<number | undefined> {
    try {
        const { db } = await import('./db')
        return await db.projects.count()
    } catch (error) {
        console.error(error)
        return undefined
    }
}
