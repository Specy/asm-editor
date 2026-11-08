<script lang="ts">
    import { page } from '$app/state'
    import { beforeNavigate, goto } from '$app/navigation'
    import { onMount } from 'svelte'
    import { MediaQuery } from 'svelte/reactivity'
    import { browser } from '$app/env'
    import Page from '#cmp/shared/layout/Page.svelte'
    import DefaultNavbar from '#cmp/shared/layout/DefaultNavbar.svelte'
    import PageMeta from '#cmp/shared/layout/PageMeta.svelte'
    import Select from '#cmp/shared/input/Select.svelte'
    import Button from '#cmp/shared/button/Button.svelte'
    import ButtonLink from '#cmp/shared/button/ButtonLink.svelte'
    import FaExternalLinkAlt from '~icons/fa-solid/external-link-alt'
    import ErrorState from '#cmp/shared/layout/ErrorState.svelte'
    import {
        canonicalExampleId,
        defaultExample,
        destinationPath,
        EXAMPLE_CHANGE_MESSAGE,
        EXAMPLE_LEAVE_MESSAGE,
        exampleSharePath,
        examplesIsa,
        examplesPath,
        isExampleDestination,
        loadExamples,
        type Example
    } from '#lib/examples.ts'
    import { copyText } from '#lib/utils.ts'
    import { languageLabel } from '#lib/languages/languageLabel.ts'
    import '#cmp/specific/workbench/workbench.css'
    import ShareMenu from '#cmp/shared/menu/ShareMenu.svelte'
    import { readShareStart, resolveShareStartup, type ShareStartAction } from '#lib/shareStart.ts'

    let examples = $state<Example[]>([])
    let status = $state<'loading' | 'loaded' | 'error'>('loading')
    let failure = $state<unknown>()
    let frame = $state<HTMLIFrameElement>()
    let dirty = $state(false)
    const requested = $derived(browser ? page.url.searchParams.get('example') : null)
    const startAction = $derived(browser ? readShareStart(page.url.searchParams) : undefined)
    //the link's `isa`, when some example is written for it: `?isa=mips` shares the MIPS examples
    const isa = $derived.by(() => {
        const language = browser ? examplesIsa(page.url.searchParams.get('isa')) : undefined
        return language && examples.some((e) => e.language === language) ? language : undefined
    })
    let isaValue = $derived<string>(isa ?? '')
    const filtered = $derived(examples.filter((e) => !isa || e.language === isa))
    const selected = $derived(
        requested === null
            ? defaultExample(filtered)
            : examples.find((e) => e.id === canonicalExampleId(requested))
    )
    //the editor's link for the selected example, in the frame and behind Open in editor: with the
    //flags this page's own link gives, and the example's own startup for those it leaves out. This
    //page is the one place that puts an example's startup in a link, so a link to the editor that
    //was sent on its own starts as it says and no other way
    const editorPath = $derived.by(() => {
        if (!selected) return undefined
        const { action, fullscreenDisplay } = browser
            ? resolveShareStartup(page.url.searchParams, selected.startup)
            : { action: undefined, fullscreenDisplay: false }
        return exampleSharePath(selected.id, action, fullscreenDisplay)
    })
    let pickerValue = $derived(
        filtered.some((e) => e.id === selected?.id) ? (selected?.id ?? '') : ''
    )
    const options = $derived(
        filtered.map((e) => ({
            key: e.label,
            value: e.id,
            searchText: `${exampleName(e)} ${languageLabel(e.language)}`
        }))
    )
    //phones fit both pickers on one line with the shorter label
    const narrow = new MediaQuery('max-width: 600px', false)
    const isas = $derived([
        { key: narrow.current ? 'All ISAs' : 'All instruction sets', value: '' },
        ...[...new Set(examples.map((e) => e.language))].sort().map((language) => ({
            key: languageLabel(language),
            value: language
        }))
    ])

    function exampleName(example: Example): string {
        return example.variant ? `${example.name} (${example.variant})` : example.name
    }

    async function load() {
        status = 'loading'
        try {
            examples = await loadExamples()
            status = 'loaded'
        } catch (error) {
            failure = error
            status = 'error'
        }
    }
    onMount(() => {
        void load()
    })

    $effect(() => {
        void selected?.id
        dirty = false
    })

    async function choose(id: string) {
        if (id === selected?.id) return
        try {
            await goto(examplesPath(id, startAction, isa), { reset: false })
        } finally {
            pickerValue = filtered.some((e) => e.id === selected?.id) ? (selected?.id ?? '') : ''
        }
    }

    //the shown example stays when it is written for the chosen instruction set, else that set's first
    //example takes its place. The link names it only when it already did, or when "All" would
    //otherwise show a different first example
    async function chooseIsa(value: string) {
        const next = examplesIsa(value)
        if (next === isa) return
        const keep = selected !== undefined && (!next || selected.language === next)
        const id = keep && (requested !== null || !next) ? selected.id : undefined
        try {
            await goto(examplesPath(id, startAction, next), { reset: false })
        } finally {
            isaValue = isa ?? ''
        }
    }

    beforeNavigate((navigation) => {
        if (
            dirty &&
            !navigation.willUnload &&
            !confirm('You have unsaved changes. Do you want to leave without saving?')
        ) {
            navigation.cancel()
        }
    })

    function receiveChange(event: MessageEvent) {
        if (event.origin !== window.location.origin || event.source !== frame?.contentWindow) return
        if (event.data?.example !== selected?.id) return
        if (event.data?.type === EXAMPLE_CHANGE_MESSAGE) dirty = event.data.dirty === true
        //the framed editor's top bar or Save: the site opens here, not inside the frame, and the
        //frame has asked about its changes already
        if (
            event.data?.type === EXAMPLE_LEAVE_MESSAGE &&
            isExampleDestination(event.data.destination)
        ) {
            dirty = false
            void goto(destinationPath(event.data.destination))
        }
    }

    async function share(action?: ShareStartAction) {
        if (selected)
            await copyText(
                new URL(examplesPath(selected.id, action, isa), window.location.origin).href,
                'Example link'
            )
    }
</script>

<PageMeta
    title="{selected ? `${selected.label} - Examples` : 'Examples'} - ASM Editor"
    description="Open and run example projects for M68K, MIPS, RISC-V, x86-64 and Z80."
/>

<svelte:window
    onmessage={receiveChange}
    onbeforeunload={(event) => {
        if (dirty) {
            event.preventDefault()
            event.returnValue = ''
        }
    }}
/>

{#snippet exampleOption(example: Example)}
    <span class="example-option">
        <span class="example-name ellipsis">{exampleName(example)}</span>
        <span class="example-isa">{languageLabel(example.language)}</span>
    </span>
{/snippet}

<Page fillsScreen>
    <div class="examples-page">
        <DefaultNavbar compact style="position: static; align-items: center;">
            {#snippet toolbar()}
                <nav class="examples-toolbar" aria-label="Examples">
                    <div class="pickers">
                        <div class="isa-picker">
                            <Select
                                options={isas}
                                bind:value={isaValue}
                                ariaLabel="Filter by instruction set"
                                onChange={(value) => {
                                    void chooseIsa(value).catch(() => undefined)
                                }}
                                disabled={status !== 'loaded'}
                                look="outlined"
                                wrapperStyle="width: 100%;"
                            />
                        </div>
                        <div class="example-picker">
                            <Select
                                {options}
                                bind:value={pickerValue}
                                ariaLabel="Example"
                                onChange={(id) => {
                                    void choose(id).catch(() => undefined)
                                }}
                                disabled={!options.length}
                                look="outlined"
                                wrapperStyle="width: 100%;"
                            >
                                {#snippet trigger()}
                                    {#if selected && filtered.some((e) => e.id === selected.id)}
                                        {@render exampleOption(selected)}
                                    {:else}
                                        Choose an example
                                    {/if}
                                {/snippet}
                                {#snippet item(option)}
                                    {@const example = filtered.find((e) => e.id === option.value)}
                                    {#if example}{@render exampleOption(example)}{/if}
                                {/snippet}
                            </Select>
                        </div>
                    </div>
                    <div class="actions">
                        <ShareMenu
                            onShare={(action) => {
                                void share(action)
                            }}
                        >
                            {#snippet trigger({ open, expanded })}
                                <Button
                                    kind="secondary"
                                    onClick={open}
                                    disabled={!selected}
                                    aria-haspopup="dialog"
                                    aria-expanded={expanded}>Share example</Button
                                >
                            {/snippet}
                        </ShareMenu>
                        <ButtonLink
                            href={editorPath}
                            disabled={!editorPath}
                            target="_blank"
                            rel="noopener"
                        >
                            <span class="button-icon" aria-hidden="true"><FaExternalLinkAlt /></span
                            >
                            Open in editor
                        </ButtonLink>
                    </div>
                </nav>
            {/snippet}
        </DefaultNavbar>
        {#if status === 'loading'}
            <p class="message" role="status">Loading examples…</p>
        {:else if status === 'error'}
            <ErrorState title="Examples could not be loaded" error={failure}>
                Try loading the examples again.
                {#snippet actions()}<Button onClick={() => void load()}>Try again</Button>{/snippet}
            </ErrorState>
        {:else if !selected}
            <ErrorState
                title={requested === null
                    ? 'No examples available'
                    : 'This example is not available'}
            >
                {requested === null
                    ? 'There are no example projects to show.'
                    : 'Choose an example from the picker above.'}
            </ErrorState>
        {:else}
            {#key editorPath}
                <iframe
                    bind:this={frame}
                    src={editorPath}
                    title={selected.label}
                    allow="clipboard-write; fullscreen"
                    allowfullscreen
                ></iframe>
            {/key}
        {/if}
    </div>
</Page>

<style>
    .examples-page {
        display: flex;
        flex-direction: column;
        height: var(--screen-height);
        min-height: 0;
        overflow: hidden;
    }
    /* the pickers outlined on the navbar (Select's `outlined`): a --tertiary edge, the text in
       --tertiary-text */
    .examples-toolbar {
        --select-edge: var(--tertiary);
        --select-text: var(--tertiary-text);
        display: flex;
        flex: 1 1 40rem;
        min-width: 0;
        flex-wrap: wrap;
        justify-content: flex-end;
        align-items: center;
        gap: 0.5rem;
    }
    /* only a layout box on phones, where the two pickers share one line */
    .pickers {
        display: contents;
    }
    .isa-picker {
        width: 14rem;
    }
    .example-picker {
        flex: 1;
        min-width: 12rem;
        max-width: 26rem;
    }
    .example-picker :global(.control > .label) {
        flex: 1;
    }
    .example-option {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        width: 100%;
        min-width: 0;
    }
    .example-name {
        min-width: 0;
    }
    .example-isa {
        flex: none;
        font-size: 0.85em;
        font-weight: 400;
        color: var(--text-muted);
    }
    .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    .button-icon {
        display: flex;
        width: var(--fs-small);
        flex-shrink: 0;
    }
    iframe {
        display: block;
        width: 100%;
        flex: 1;
        min-height: 0;
        border: 0;
    }
    .message {
        margin: auto;
        padding: 1rem;
    }
    @media (max-width: 600px) {
        /* the toolbar wraps under the site links: keep it close to them */
        .examples-page :global(.navbar) {
            row-gap: 0.25rem;
        }
        .pickers {
            display: flex;
            gap: 0.5rem;
            width: 100%;
        }
        .isa-picker {
            flex: none;
            width: 7rem;
        }
        .example-picker {
            min-width: 0;
            max-width: none;
        }
        .actions {
            width: 100%;
            margin: 0;
        }
        /* Share example and Open in editor split the row */
        .actions > :global(.btn) {
            flex: 1 1 0;
        }
        .button-icon {
            display: none;
        }
    }
</style>
