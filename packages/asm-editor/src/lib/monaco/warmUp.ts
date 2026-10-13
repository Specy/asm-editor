/**
 * Starts loading Monaco and the assembly languages once the browser is idle, so that opening a
 * project from the page that calls this does not wait for the editor. Only the pages that lead
 * straight into an editor call it: Monaco and its languages are several megabytes, and a page
 * that never opens one should not pay for it.
 *
 * It also loads the instruction tables `detectAssemblyLanguage` uses, so importing a file on
 * these pages does not wait for them either.
 *
 * Nothing waits on it. Every editor still registers the language it shows itself, and
 * `Monaco.registerLanguage` is memoized, so whichever of the two runs second reuses the first.
 * Returns a function that cancels the warm-up if it has not started yet.
 */
export function warmUpMonaco(): () => void {
    let cancelled = false
    const start = () => {
        if (cancelled) return
        import('#lib/monaco/Monaco.ts')
            .then(({ Monaco }) => Monaco.registerLanguages())
            .catch((error) => console.error('Monaco warm-up failed', error))
        import('#lib/languages/languageDetector.ts')
            .then(({ preloadLanguageDetector }) => preloadLanguageDetector())
            .catch((error) => console.error('Language detector warm-up failed', error))
    }
    if ('requestIdleCallback' in window) {
        const handle = window.requestIdleCallback(start, { timeout: 4000 })
        return () => {
            cancelled = true
            window.cancelIdleCallback(handle)
        }
    }
    const handle = setTimeout(start, 1000)
    return () => {
        cancelled = true
        clearTimeout(handle)
    }
}
