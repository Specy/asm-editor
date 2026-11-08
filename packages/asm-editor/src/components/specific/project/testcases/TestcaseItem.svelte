<script lang="ts">
    /**
     * One Testcase in the list: a row with its outcome in the last test run, unfolding into its
     * name, an x86 program's Arguments, registers, memory, input and expected output, all edited in
     * place when the list is editable. Once unfolded its body stays built and is only hidden, so a row added to a table or
     * a memory value half written survives folding it.
     */
    import { onMount, untrack } from 'svelte'
    import type { AvailableLanguages, Testcase, TestcaseResult } from '#lib/Project.svelte.ts'
    import {
        checkCount,
        describeCharacter,
        firstTextDifference,
        testcaseLabel,
        type TestcaseRegisters
    } from '#lib/testcases.ts'
    import { languageTakesArguments, parseCommandLine } from '#lib/commandLine.ts'
    import FaAngleRight from '~icons/fa-solid/angle-right'
    import Header from '#cmp/shared/layout/Header.svelte'
    import RegistersTable from './RegistersTable.svelte'
    import MemoryTable from './MemoryTable.svelte'
    import InputCells from './InputCells.svelte'
    import TextField from '#cmp/shared/input/TextField.svelte'
    import StatusDot from '#cmp/shared/misc/StatusDot.svelte'

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
        registers: TestcaseRegisters
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
        registers,
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
        if (result.errors.some((error) => error.type === 'runtime-error')) return 'runtime error'
        const mismatches = result.errors.length
        return `${mismatches} mismatch${mismatches === 1 ? '' : 'es'}`
    })

    const runtimeError = $derived(result?.errors.find((error) => error.type === 'runtime-error'))

    const hasRegisters = $derived(
        Object.keys(testcase.startingRegisters).length +
            Object.keys(testcase.expectedRegisters).length >
            0
    )
    const hasMemory = $derived(testcase.startingMemory.length + testcase.expectedMemory.length > 0)
    //a Testcase that sets and expects nothing, which a read-only list would unfold to an empty body:
    //all it checks is that the program prints nothing
    const empty = $derived(
        !hasRegisters &&
            !hasMemory &&
            !testcase.arguments?.trim() &&
            testcase.input.length === 0 &&
            testcase.expectedOutput === ''
    )
    //x86, MIPS and RISC-V programs take Arguments; a Testcase without its own runs with the Project's
    const takesArguments = $derived(languageTakesArguments(language))
    const argumentsProblem = $derived.by(() => {
        const parsed = parseCommandLine(testcase.arguments ?? '')
        return 'error' in parsed ? parsed.error : undefined
    })
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
    <!-- pinned at the top of the list while the body under it scrolls -->
    <div class="bar">
        <button class="header" aria-expanded={open} aria-controls="{id}-body" onclick={toggle}>
            <span class="chevron" aria-hidden="true"><FaAngleRight /></span>
            <StatusDot
                class="dot"
                color={status === 'passed'
                    ? 'var(--tc-pass)'
                    : status === 'failed'
                      ? 'var(--tc-fail)'
                      : undefined}
                hollow={status !== 'passed' && status !== 'failed'}
            />
            <span class="title ellipsis" class:unnamed={!testcase.name?.trim()}>
                {testcaseLabel(testcase, index)}
            </span>
            <span class="status {status}">{statusText}</span>
        </button>
    </div>
    {#if built}
        <div class="body-fold" class:shown bind:this={fold}>
            <div class="body-clip">
                <div class="body" id="{id}-body">
                    {#if runtimeError?.type === 'runtime-error'}
                        <div class="section" role="status">{runtimeError.message}</div>
                    {/if}
                    {#if editable}
                        <div class="section">
                            <Header type="h3" noMargin id="{id}-name">Name</Header>
                            <TextField
                                aria-labelledby="{id}-name"
                                class="testcase-field"
                                bind:el={nameInput}
                                bind:value={testcase.name}
                                placeholder="Testcase {index + 1}"
                                autocomplete="off"
                            />
                        </div>
                    {/if}
                    {#if takesArguments && (editable || testcase.arguments?.trim())}
                        <div class="section">
                            <div class="title-row">
                                <Header type="h3" noMargin id="{id}-arguments">Arguments</Header>
                                <span class="caption"
                                    >after the program's name, as typed in a shell</span
                                >
                            </div>
                            {#if editable}
                                <TextField
                                    aria-labelledby="{id}-arguments"
                                    class="testcase-field arguments"
                                    mono
                                    invalid={!!argumentsProblem}
                                    value={testcase.arguments ?? ''}
                                    oninput={(event) => {
                                        const text = event.currentTarget.value
                                        //an empty field is no Arguments of its own
                                        if (text === '') delete testcase.arguments
                                        else testcase.arguments = text
                                    }}
                                    placeholder="the Project's Arguments"
                                    autocomplete="off"
                                    autocapitalize="off"
                                    aria-invalid={argumentsProblem ? 'true' : undefined}
                                />
                            {:else}
                                <pre class="field arguments">{testcase.arguments}</pre>
                            {/if}
                            {#if argumentsProblem}
                                <p class="difference problem">{argumentsProblem}</p>
                            {/if}
                        </div>
                    {/if}
                    {#if editable || hasRegisters}
                        <div class="section">
                            <Header type="h3" noMargin>Registers</Header>
                            <RegistersTable
                                bind:testcase
                                {result}
                                {editable}
                                {registers}
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
                    {#if !editable && empty && !result?.errors.length}
                        <p class="empty">
                            This Testcase is empty. It only checks that the program prints nothing.
                        </p>
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

    /* the row stays at the top of the list's scroll area while its Testcase's body scrolls under
       it, on the list's own fill, until the end of the Testcase takes it away, so the next open
       one's row pushes it up; the list's top edge is straight in the Workbench panel and in the
       floating window alike, under their bars' rule, so nothing shows round it. Pinned, it draws
       the rule a Testcase draws under itself just below it, where the browser can tell (Chrome's
       scroll-state queries); pushed up, that rule lies on the Testcase's own */
    .bar {
        position: sticky;
        top: 0;
        z-index: 1;
        container-type: scroll-state;
        background-color: var(--tc-surface);
    }

    @container scroll-state(stuck: top) {
        .header {
            box-shadow: 0 1px 0 var(--tc-line);
        }
    }

    /* its focus ring inside its edge, where the list's top cannot cut it off while it is pinned */
    .header {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        width: 100%;
        padding: 0.75rem;
        text-align: left;
        font-family: var(--font-ui);
        color: var(--secondary-text);
        background-color: transparent;
        cursor: pointer;
        transition: background-color var(--dur-fast);

        &:hover,
        &:focus-visible {
            background-color: var(--tc-hover);
        }

        &:focus-visible {
            outline-offset: -2px;
        }
    }

    /* a folding section's arrow (CollapsibleSection's): the same angle, box, dimming and turn. The
       box is shorter than the title's line, so the row keeps the title's height */
    .chevron {
        display: grid;
        place-items: center;
        flex: none;
        width: 0.8rem;
        height: 0.8rem;
        opacity: 0.7;
        transition: transform var(--dur-base);
    }

    .open .chevron {
        transform: rotate(90deg);
    }

    .title {
        flex: 1;
        min-width: 0;
        font-weight: 600;
        font-size: var(--fs-body);

        &.unnamed {
            font-weight: 500;
            color: var(--hint);
        }
    }

    .status {
        flex: none;
        font-size: var(--fs-small);
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
            grid-template-rows var(--dur-base) ease,
            visibility 0s var(--dur-base);

        &.shown {
            grid-template-rows: 1fr;
            visibility: inherit;
            transition:
                grid-template-rows var(--dur-base) ease,
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

    // the body lines up with the caret, under the row it unfolds from, with the room round it the
    // row has at its sides, so that the tables have as much of the width as can be given
    .body {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 0.15rem 0.75rem 0.75rem;
    }

    .section {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
    }

    /* titled as the Settings panel's forms are, a step above the text they head */
    .section :global(h3) {
        font-size: var(--fs-body);
    }

    .title-row {
        display: flex;
        align-items: baseline;
        gap: 0.6rem;
    }

    .caption {
        font-size: var(--fs-caption);
        color: var(--hint);
    }

    .empty {
        margin: 0;
        font-size: var(--fs-small);
        color: var(--text-muted);
    }

    .verdict {
        margin-left: auto;
        font-size: var(--fs-caption);
        color: var(--tc-pass);

        &.differs {
            color: var(--tc-fail);
        }
    }

    .field {
        @include field;
    }

    /* the Testcase's name and Arguments, fields as every one is (styles/field.scss), the width of
       the section */
    .section :global(.testcase-field) {
        width: 100%;
        font-size: var(--fs-small);
    }

    .arguments {
        @include mono;
        margin: 0;
        font-size: var(--fs-small);
    }

    .problem {
        color: var(--tc-fail);
    }

    .output {
        @include mono;
        min-height: 2.25rem;
        margin: 0;
        font-size: var(--fs-small);
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

    /* in the failed output's red, its italics setting it apart */
    .got .nothing {
        font-family: var(--font-ui);
        font-style: italic;
        color: var(--tc-fail);
    }

    .difference {
        font-size: var(--fs-caption);
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
