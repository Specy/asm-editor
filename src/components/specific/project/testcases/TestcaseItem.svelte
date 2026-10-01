<script lang="ts">
    /**
     * One Testcase in the list: a row with its outcome in the last test run, unfolding into its
     * name, registers, memory, input and expected output, all edited in place when the list is
     * editable. Once unfolded its body stays built and is only hidden, so a row added to a table or
     * a memory value half written survives folding it.
     */
    import { onMount, untrack } from 'svelte'
    import type { AvailableLanguages, Testcase, TestcaseResult } from '$lib/Project.svelte'
    import {
        checkCount,
        describeCharacter,
        firstTextDifference,
        testcaseLabel
    } from '$lib/testcases'
    import FaCaretRight from '~icons/fa-solid/caret-right'
    import Header from '$cmp/shared/layout/Header.svelte'
    import RegistersTable from './RegistersTable.svelte'
    import MemoryTable from './MemoryTable.svelte'
    import InputCells from './InputCells.svelte'

    interface Props {
        testcase: Testcase
        /** Its place in the list, which names a Testcase without a name. */
        index: number
        /** The last test run's result for exactly this content, if there is one. */
        result: TestcaseResult | undefined
        editable: boolean
        initiallyOpen: boolean
        /** Puts the cursor in the name, for a Testcase just created. */
        focusName?: boolean
        registerNames: string[]
        startingRegisterNames: string[]
        hiddenRegistersNames: string[]
        registerSizes: Record<string, number> | undefined
        systemSize: number
        language: AvailableLanguages
        onDelete: () => void
        onDuplicate: () => void
    }

    let {
        testcase = $bindable(),
        index,
        result,
        editable,
        initiallyOpen,
        focusName = false,
        registerNames,
        startingRegisterNames,
        hiddenRegistersNames,
        registerSizes,
        systemSize,
        language,
        onDelete,
        onDuplicate
    }: Props = $props()

    const id = $props.id()
    let open = $state(untrack(() => initiallyOpen))
    //built the first time it unfolds, then only folded away
    let built = $state(untrack(() => initiallyOpen))

    //whether the body is unfolded, which slides it open and shut as a CollapsibleSection's does. A
    //body built by this opening is laid out folded once first, so that it has somewhere to slide
    //open from
    let fold: HTMLDivElement | undefined = $state()
    let shown = $state(untrack(() => initiallyOpen))
    $effect(() => {
        if (!open) {
            shown = false
            return
        }
        if (fold && !untrack(() => shown)) fold.getBoundingClientRect()
        shown = true
    })

    const status = $derived(result === undefined ? 'not-run' : result.passed ? 'passed' : 'failed')
    const statusText = $derived.by(() => {
        if (result === undefined) return 'not run'
        if (result.passed) {
            const checks = checkCount(testcase)
            return `${checks} check${checks === 1 ? '' : 's'} passed`
        }
        const mismatches = result.errors.length
        return `${mismatches} mismatch${mismatches === 1 ? '' : 'es'}`
    })

    const hasRegisters = $derived(
        Object.keys(testcase.startingRegisters).length +
            Object.keys(testcase.expectedRegisters).length >
            0
    )
    const hasMemory = $derived(testcase.startingMemory.length + testcase.expectedMemory.length > 0)
    const outputError = $derived.by(() => {
        const error = result?.errors.find((candidate) => candidate.type === 'wrong-output')
        return error?.type === 'wrong-output' ? error : undefined
    })
    const difference = $derived.by(() => {
        if (!outputError) return ''
        const at = firstTextDifference(outputError.expected, outputError.got)
        const expected = describeCharacter(outputError.expected, at)
        const got = describeCharacter(outputError.got, at)
        return `First difference at character ${at + 1}: expected ${expected}, got ${got}.`
    })

    function toggle() {
        open = !open
        built = true
    }

    let nameInput: HTMLInputElement | undefined = $state()
    onMount(() => {
        if (focusName) nameInput?.focus()
    })
</script>

<article class="testcase" class:open>
    <button class="header" aria-expanded={open} aria-controls="{id}-body" onclick={toggle}>
        <span class="chevron" aria-hidden="true"><FaCaretRight /></span>
        <span class="dot {status}" aria-hidden="true"></span>
        <span class="title ellipsis" class:unnamed={!testcase.name?.trim()}>
            {testcaseLabel(testcase, index)}
        </span>
        <span class="status {status}">{statusText}</span>
    </button>
    {#if built}
        <div class="body-fold" class:shown bind:this={fold}>
            <div class="body-clip">
                <div class="body" id="{id}-body">
                    {#if editable}
                        <div class="section">
                            <Header type="h3" noMargin id="{id}-name">Name</Header>
                            <input
                                aria-labelledby="{id}-name"
                                class="field"
                                bind:this={nameInput}
                                bind:value={testcase.name}
                                placeholder="Testcase {index + 1}"
                                spellcheck="false"
                                autocomplete="off"
                            />
                        </div>
                    {/if}
                    {#if editable || hasRegisters}
                        <div class="section">
                            <Header type="h3" noMargin>Registers</Header>
                            <RegistersTable
                                bind:testcase
                                {result}
                                {editable}
                                {registerNames}
                                {startingRegisterNames}
                                {hiddenRegistersNames}
                                {registerSizes}
                                {systemSize}
                                {language}
                            />
                        </div>
                    {/if}
                    {#if editable || hasMemory}
                        <div class="section">
                            <Header type="h3" noMargin>Memory</Header>
                            <MemoryTable
                                bind:testcase
                                {result}
                                {editable}
                                {systemSize}
                                {language}
                            />
                        </div>
                    {/if}
                    {#if editable || testcase.input.length > 0}
                        <div class="section">
                            <div class="title-row">
                                <Header type="h3" noMargin>Input</Header>
                                <span class="caption">one box per input request, in order</span>
                            </div>
                            <InputCells bind:testcase {editable} />
                        </div>
                    {/if}
                    {#if editable || testcase.expectedOutput !== '' || outputError}
                        <div class="section">
                            <div class="title-row">
                                <Header type="h3" noMargin id="{id}-output">Expected output</Header>
                                {#if result}
                                    <span class="verdict" class:differs={outputError}>
                                        {outputError ? '✗ differs' : '✓ match'}
                                    </span>
                                {/if}
                            </div>
                            {#if editable}
                                <textarea
                                    aria-labelledby="{id}-output"
                                    class="field output"
                                    bind:value={testcase.expectedOutput}
                                    rows={Math.min(8, testcase.expectedOutput.split('\n').length)}
                                    placeholder="The program prints nothing"
                                    spellcheck="false"></textarea>
                            {:else}
                                <pre
                                    class="field output"
                                    aria-labelledby="{id}-output">{testcase.expectedOutput}</pre>
                            {/if}
                            {#if outputError}
                                <Header type="h3" noMargin>Actual output</Header>
                                <pre class="field output got">{#if outputError.got === ''}<span
                                            class="nothing">Nothing was printed</span
                                        >{:else}{outputError.got}{/if}</pre>
                                <p class="difference">{difference}</p>
                            {/if}
                        </div>
                    {/if}
                    {#if editable}
                        <div class="footer">
                            <button class="text-button delete" onclick={onDelete}
                                >Delete testcase</button
                            >
                            <button class="text-button" onclick={onDuplicate}>Duplicate</button>
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    {/if}
</article>

<style lang="scss">
    @use './testcases.scss' as *;

    .testcase {
        border-bottom: 1px solid var(--tc-line);
    }

    .header {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        width: 100%;
        padding: 0.75rem 1rem;
        text-align: left;
        font-family: Rubik, sans-serif;
        color: var(--secondary-text);
        background-color: transparent;
        cursor: pointer;
        transition: background-color 0.15s;

        &:hover,
        &:focus-visible {
            background-color: var(--tc-hover);
        }
    }

    .chevron {
        display: flex;
        flex: none;
        width: 0.45rem;
        color: var(--hint);
        transition: transform 0.15s;
    }

    .open .chevron {
        transform: rotate(90deg);
    }

    .dot {
        flex: none;
        width: 0.55rem;
        height: 0.55rem;
        border-radius: 50%;
        border: 1.5px solid var(--hint);

        &.passed {
            border-color: var(--tc-pass);
            background-color: var(--tc-pass);
        }

        &.failed {
            border-color: var(--tc-fail);
            background-color: var(--tc-fail);
        }
    }

    .title {
        flex: 1;
        min-width: 0;
        font-weight: 600;
        font-size: 0.95rem;

        &.unnamed {
            font-weight: 500;
            color: var(--hint);
        }
    }

    .status {
        flex: none;
        font-size: 0.8rem;
        color: var(--hint);

        &.passed {
            color: var(--tc-pass);
        }

        &.failed {
            color: var(--tc-fail);
        }
    }

    /* the body folds through its grid row, from 0fr to 1fr, which slides it open and shut; folded
       it is hidden once the slide is over, so nothing in it can take the focus. Unfolded it
       inherits rather than being visible: the Interactive editor's window hides the whole list
       with visibility when it closes, and a visible body would stay there, unseen but clickable */
    .body-fold {
        display: grid;
        grid-template-rows: 0fr;
        min-height: 0;
        visibility: hidden;
        transition:
            grid-template-rows 0.2s ease,
            visibility 0s 0.2s;

        &.shown {
            grid-template-rows: 1fr;
            visibility: inherit;
            transition:
                grid-template-rows 0.2s ease,
                visibility 0s;
        }

        @media (prefers-reduced-motion: reduce) {
            transition: none;

            &.shown {
                transition: none;
            }
        }
    }

    /* the row's one item, clipped so that it can be shorter than what it holds */
    .body-clip {
        min-height: 0;
        overflow: hidden;
    }

    // the body lines up with the dot, under the row it unfolds from
    .body {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 0.15rem 1rem 1rem 2rem;
    }

    .section {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
    }

    /* titled as the Settings panel's forms are, a step above the text they head */
    .section :global(h3) {
        font-size: 0.95rem;
    }

    .title-row {
        display: flex;
        align-items: baseline;
        gap: 0.6rem;
    }

    .caption {
        font-size: 0.75rem;
        color: var(--hint);
        opacity: 0.8;
    }

    .verdict {
        margin-left: auto;
        font-size: 0.78rem;
        color: var(--tc-pass);

        &.differs {
            color: var(--tc-fail);
        }
    }

    .field {
        @include field;
    }

    .output {
        @include mono;
        min-height: 2.25rem;
        margin: 0;
        font-size: 0.85rem;
        line-height: 1.35;
        resize: vertical;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
    }

    pre.output {
        resize: none;
    }

    .got {
        color: var(--tc-fail);
        background-color: var(--tc-fail-bg);
        border-color: color-mix(in srgb, var(--tc-fail) 40%, transparent);
    }

    .nothing {
        font-family: Rubik, sans-serif;
        font-style: italic;
        opacity: 0.8;
    }

    .difference {
        font-size: 0.78rem;
        color: var(--hint);
    }

    .footer {
        display: flex;
        justify-content: space-between;
    }

    .text-button {
        @include text-button;
    }

    .delete:hover {
        color: var(--tc-fail);
    }
</style>
