import searchModel from './searchModel.json'

/**
 * The search model, pinned ([ADR 0026](../../../docs/adr/0026-hybrid-search-in-the-browser-over-a-build-time-index.md)).
 * `searchModel.json` is the one place its revision and files are named: `scripts/search-model.mjs`
 * downloads and checks them, the Vite plugin serves them, and everything here reads them.
 */
export const SEARCH_MODEL = searchModel

export type SearchModelFile = keyof typeof searchModel.files

/** Where the build and the tests find the model files, relative to the repository root. */
export const SEARCH_MODEL_DIRECTORY = `.cache/search-model/${searchModel.revision}`

/** The model's vectors have 768 dimensions; it is trained so that the first 256 still work. */
export const VECTOR_DIMS = searchModel.dims

/** URLs of the model files in the browser: hashed assets in a build, a dev route otherwise. */
export type SearchModelUrls = Record<SearchModelFile, string>
