<script lang="ts">
    import type { PageData } from './$types'
    import { page } from '$app/state'
    import { toMetaDescription, jsonLdScriptTag, instructionLd } from '$lib/seo'
    import Page from '$cmp/shared/layout/Page.svelte'
    import { onMount } from 'svelte'
    import {
        fromSizesToString,
        fromSizeToString,
        getAddressingModeNames,
        AffectedFlagKind,
        M68KFlag
    } from '$lib/languages/M68K/M68K-documentation'
    import DocsOperand from '$cmp/documentation/DocsOperand.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import Row from '$cmp/shared/layout/Row.svelte'
    interface Props {
        data: PageData
    }

    let { data }: Props = $props()
    let ins = $derived(data.props.instruction)

    let component: typeof import('./ClientOnly.svelte').default | undefined = $state.raw()
    onMount(async () => {
        //HUGE HACK TO MAKE SVELTEKIT PRERENDER BECAUSE OF TOP LEVEL AWAIT
        const imp = await import('./ClientOnly.svelte')
        // @ts-ignore -- the dynamic import type omits the generated top-level-await promise
        await imp?.__tla
        // @ts-ignore -- the prerender import shim obscures the component's default export
        component = imp?.default
    })
    let code = $derived(ins.interactiveExample?.code ?? '; no interactive instruction available')

    // "Docs - move" matched no query anyone types; "MOVE — M68K instruction reference"
    // matches how these are actually searched for.
    let pageTitle = $derived(`${String(ins.name).toUpperCase()} — M68K instruction reference`)
    // The raw description is markdown, and was reaching search results with its link
    // syntax and newlines intact.
    let metaDescription = $derived(
        toMetaDescription(`The ${ins.name} M68K instruction. ${ins.description}`)
    )
    let structuredData = $derived(
        instructionLd({
            name: String(ins.name),
            architecture: 'M68K',
            description: ins.description,
            pathname: page.url.pathname
        })
    )
</script>

<svelte:head>
    <title>{pageTitle}</title>
    <meta name="description" content={metaDescription} />
    <meta property="og:title" content={pageTitle} />
    <meta property="og:description" content={metaDescription} />
    <meta property="og:type" content="article" />
    <!-- The page's schema.org description. {@html} is the only way to emit a <script>
         from a component: <svelte:element this="script"> renders nothing in Svelte, and a
         literal script tag here is taken as the component's own instance script. Safe
         because the payload is machine generated and serializeJsonLd escapes < > and &,
         so nothing interpolated can close the tag. -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html jsonLdScriptTag(structuredData)}
</svelte:head>

<Page contentStyle="padding: 1rem; gap: 1rem;" style="flex: 1;">
    <article class="instruction-info" style="flex: 1;">
        <Column>
            <h1 class="instruction-name">
                {ins.name}
            </h1>
            <Column style="margin-left: 0.8rem;">
                {#if ins.sizes.length}
                    <h3>Sizes</h3>
                    <div style="margin: 0.8rem">
                        {fromSizesToString(ins.sizes, true)}
                    </div>
                {/if}
                {#if ins.defaultSize}
                    <h3>Default Size</h3>
                    <div style="margin: 0.8rem">
                        {fromSizeToString(ins.defaultSize, true)}
                    </div>
                {/if}
            </Column>
        </Column>

        <Column gap="1rem">
            <Row gap="1rem" wrap>
                <div class="column">
                    <h3>Affected Flags</h3>
                    <div class="flags-table" style="margin: 0.8rem;">
                        {#each [M68KFlag.Extend, M68KFlag.Negative, M68KFlag.Zero, M68KFlag.Overflow, M68KFlag.Carry] as flag (flag)}
                            <div class="flag-header">{flag}</div>
                        {/each}
                        {#each [M68KFlag.Extend, M68KFlag.Negative, M68KFlag.Zero, M68KFlag.Overflow, M68KFlag.Carry] as flag (flag)}
                            {@const kind = ins.affectsFlags[flag]}
                            <div
                                class="flag-cell"
                                class:flag-edits={kind === AffectedFlagKind.Edits}
                                class:flag-to-zero={kind === AffectedFlagKind.ToZero}
                                class:flag-to-one={kind === AffectedFlagKind.ToOne}
                                class:flag-unaffected={kind === AffectedFlagKind.Unaffected}
                            >
                                {#if kind === AffectedFlagKind.Edits}
                                    ✱
                                {:else if kind === AffectedFlagKind.ToZero}
                                    0
                                {:else if kind === AffectedFlagKind.ToOne}
                                    1
                                {:else}
                                    -
                                {/if}
                            </div>
                        {/each}
                    </div>
                </div>
                <div class="column">
                    <h3>Operands</h3>
                    <Column gap="0.5rem" margin="0.8rem">
                        {#if ins.args.length}
                            {#each ins.args as arg, i (i)}
                                <DocsOperand
                                    name={`Op ${i + 1}`}
                                    content={getAddressingModeNames(arg)}
                                    style="width: fit-content;"
                                />
                            {/each}
                        {/if}
                    </Column>
                </div>
            </Row>

            <div class="description">
                <MarkdownRenderer source={ins.description} />
            </div>
        </Column>
    </article>
    {#if component}
        {@const SvelteComponent_1 = component}
        <SvelteComponent_1 bind:code instructionKey={ins.name} language="M68K" />
    {:else}
        <div class="loading">Loading...</div>
    {/if}
</Page>

<style lang="scss">
    .loading {
        display: flex;
        justify-content: center;
        align-items: center;
        flex: 1;
        background-color: var(--secondary);
        color: var(--secondary-text);
        font-size: 2rem;
        border-radius: 0.5rem;
        min-height: 19.75rem;
    }
    .instruction-info {
        display: flex;
        gap: 1rem;
    }
    .instruction-name {
        font-size: 4rem;
        margin-top: 0;
        line-height: 1.1;
        margin-right: 2rem;
        min-width: 11.2rem;
        font-weight: 600;
        color: var(--accent);
        margin-bottom: 1rem;
    }
    .description {
        font-size: 1.1rem;
        line-height: 1.4rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
        padding: 1rem;
        width: 100%;
        border-radius: 0.6rem;
    }
    :global(.description a) {
        color: var(--accent);
        text-decoration: underline;
    }
    .flags-table {
        display: grid;
        grid-template-columns: repeat(5, auto);
        width: fit-content;
        border-radius: 0.4rem;
        overflow: hidden;
        background-color: var(--secondary);
        font-size: 0.9rem;
        text-align: center;
    }
    .flag-header {
        padding: 0.25rem 0.6rem;
        font-weight: 600;
        background-color: var(--secondary);
        color: var(--secondary-text);
    }
    .flag-cell {
        padding: 0.25rem 0.6rem;
        background-color: var(--tertiary);
        color: var(--tertiary-text);
    }
    .flag-edits {
        color: var(--accent);
    }
    .flag-unaffected {
        opacity: 0.5;
    }
    @media (max-width: 800px) {
        .instruction-info {
            flex-direction: column;
        }
    }
</style>
