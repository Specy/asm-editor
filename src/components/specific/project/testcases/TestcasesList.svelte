<script lang="ts">
    /**
     * The Testcases of a Project, each a row that unfolds into everything it sets and expects,
     * edited in place when `editable`, with the outcome of the last test run beside it and inside
     * it. A result belongs to the content it was run on, so a Testcase edited since reads as not run
     * until the next run. The Workbench shows the list as its Testcases panel, with
     * `TestcasesSummary` in the panel's header; `TestcasesEditor` puts both in a floating window
     * for the Interactive editor.
     */
    import type { AvailableLanguages, Testcase, TestcaseResult } from '$lib/Project.svelte'
    import type { RegisterSize } from '$lib/languages/commonLanguageFeatures.svelte'
    import { makeEmptyTestcase, matchResults, testcaseLabel } from '$lib/testcases'
    import { Prompt } from '$stores/promptStore.svelte'
    import TestcaseItem from './TestcaseItem.svelte'

    interface Props {
        testcases: Testcase[]
        testcasesResult: TestcaseResult[]
        registerNames: string[]
        startingRegisterNames: string[]
        hiddenRegistersNames?: string[]
        /** The width of each register, for the ones narrower than `systemSize` (Z80's `a`). */
        registerSizes?: Record<string, number>
        editable?: boolean
        systemSize: RegisterSize
        /** The Target, which decides how its numbers are written. */
        language: AvailableLanguages
        style?: string
    }

    let {
        testcases = $bindable(),
        testcasesResult,
        registerNames,
        startingRegisterNames,
        hiddenRegistersNames = [],
        registerSizes,
        editable = true,
        systemSize,
        language,
        style = ''
    }: Props = $props()

    const results = $derived(matchResults(testcases, testcasesResult))
    /**
     * The Testcase created or duplicated last, which opens with the cursor in its name. Raw, so that
     * it is the very object the list holds rather than a proxy of its own around it.
     */
    let created = $state.raw<Testcase>()

    function add() {
        testcases = [...testcases, makeEmptyTestcase()]
        created = testcases[testcases.length - 1]
    }

    function duplicate(index: number) {
        const copy = $state.snapshot(testcases[index]) as Testcase
        const name = copy.name?.trim()
        if (name) copy.name = `${name} (copy)`
        testcases = [...testcases.slice(0, index + 1), copy, ...testcases.slice(index + 1)]
        created = testcases[index + 1]
    }

    async function remove(testcase: Testcase, index: number) {
        const label = testcaseLabel(testcase, index)
        if (!(await Prompt.confirm(`Delete the testcase "${label}"?`))) return
        testcases = testcases.filter((candidate) => candidate !== testcase)
    }
</script>

<div class="testcases" {style}>
    {#if testcases.length === 0}
        <p class="empty">
            {editable ? 'You have not added any testcases yet.' : 'There are no testcases.'}
        </p>
    {/if}
    <!-- keyed by the Testcase itself, so an unfolded one stays unfolded when one above it goes -->
    {#each testcases as testcase, i (testcase)}
        <TestcaseItem
            bind:testcase={testcases[i]}
            index={i}
            result={results[i]}
            {editable}
            initiallyOpen={i === 0 || testcase === created}
            focusName={testcase === created}
            {registerNames}
            {startingRegisterNames}
            {hiddenRegistersNames}
            {registerSizes}
            {systemSize}
            {language}
            onDelete={() => remove(testcase, i)}
            onDuplicate={() => duplicate(i)}
        />
    {/each}
    {#if editable}
        <button class="new-testcase" onclick={add}>+ New testcase</button>
    {/if}
</div>

<style lang="scss">
    .testcases {
        // the colours every part of a Testcase is drawn in, from the theme
        --tc-line: color-mix(in srgb, var(--tertiary) 75%, transparent);
        --tc-field: color-mix(in srgb, var(--secondary) 80%, var(--tertiary));
        --tc-table: color-mix(in srgb, var(--secondary) 92%, var(--tertiary));
        --tc-head: color-mix(in srgb, var(--background) 55%, var(--secondary));
        --tc-form: color-mix(in srgb, var(--secondary) 70%, var(--tertiary));
        --tc-hover: color-mix(in srgb, var(--tertiary) 35%, transparent);
        //the theme's green brightened as the Log brightens its marks, where the browser can
        --tc-pass: color-mix(in srgb, var(--green), white 40%);
        --tc-pass: rgb(from var(--green) calc(r * 1.6) calc(g * 1.6) calc(b * 1.6));
        --tc-fail: var(--red);
        --tc-fail-bg: color-mix(in srgb, var(--red) 15%, transparent);
        --tc-start: color-mix(in srgb, var(--accent2) 40%, #7ab8f5);
        --tc-expect: var(--accent);
        --tc-string: color-mix(in srgb, #e5c07b 85%, var(--secondary-text));
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        background-color: var(--secondary);
        color: var(--secondary-text);
    }

    .empty {
        padding: 1rem;
        font-size: 0.9rem;
        color: var(--hint);
    }

    // outlined in its own colour, so it reads as the one thing to press under the list
    .new-testcase {
        margin: 0.8rem 1rem;
        padding: 0.55rem 1rem;
        border: 1px solid var(--accent);
        border-radius: 0.4rem;
        text-align: center;
        font-family: Rubik, sans-serif;
        font-size: 0.9rem;
        color: var(--accent);
        background-color: transparent;
        cursor: pointer;
        transition: background-color 0.15s;

        &:hover,
        &:focus-visible {
            background-color: color-mix(in srgb, var(--accent) 12%, transparent);
        }
    }
</style>
