/**
 * The id of a Project that is nobody's yet: one opened from a share link or an example, kept in
 * memory until it is saved. A module of its own, so that what only needs to know it does not load
 * the Projects store.
 */
export const SHARE_ID = '__share__'
