/**
 * A random id of ASCII letters. Kept apart from the database (`storage/db.ts`), which imports
 * Dexie and the Project: the root layout's theme store makes ids, so whatever this module imports,
 * every page of the site downloads.
 */
export function id(length = 7) {
    let result = ''
    for (let i = 0; i < length; i++) {
        const random = Math.random()
        result += String.fromCharCode(Math.floor(random * 26) + (random < 0.5 ? 65 : 97))
    }
    return result
}
