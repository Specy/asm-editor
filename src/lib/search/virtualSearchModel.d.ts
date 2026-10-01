declare module 'virtual:search-model' {
    /** The model files' URLs, or `null` where they are not served (see `scripts/search-model-plugin.ts`). */
    const urls: import('./model').SearchModelUrls | null
    export default urls
}
