import type { ExecutionStep } from '$lib/languages/commonLanguageFeatures.svelte'
import type { AvailableLanguages } from '$lib/Project.svelte'

/**
 * Reactive props for a mounted History row, so that a test can hand it the next step the way a
 * refresh does and watch what it keeps. A rune needs a `.svelte.ts` module, which a test file is not.
 */
export function historyRowProps(step: ExecutionStep, language: AvailableLanguages = 'M68K') {
    const props = $state({ step, flags: [] as string[], language })
    return props
}
