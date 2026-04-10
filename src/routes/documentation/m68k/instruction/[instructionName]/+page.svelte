<script lang="ts">
    import { run } from 'svelte/legacy'

    import type { PageData } from './$types'
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

    let component: any = $state.raw()
    onMount(async () => {
        //HUGE HACK TO MAKE SVELTEKIT PRERENDER BECAUSE OF TOP LEVEL AWAIT
        const imp = await import('./ClientOnly.svelte')
        //@ts-ignore
        await imp?.__tla
        //@ts-ignore
        component = imp?.default
    })
    let code = $state(ins.interactiveExample?.code ?? '; no interactive instruction available')

    $effect(() => {
        code = ins.interactiveExample?.code ?? '; no interactive instruction available'
    })
</script>

<svelte:head>
    <meta name="description" content={`The ${ins.name} instruction.\n${ins.description}`} />
    <meta property="og:description" content={`The ${ins.name} instruction.\n${ins.description}`} />
    <meta name="keywords" content={ins.name} />
    <meta name="author" content="specy" />
    <title>
        Docs - {ins.name}
    </title>
    <meta property="og:title" content="Docs - {ins.name}" />
</svelte:head>

<Page contentStyle="padding: 1rem; gap: 1rem;" style="flex: 1;">
    <article class="instruction-info" style="flex: 1;">
        <Column>
            <div class="instruction-name">
                {ins.name}
            </div>
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
                        {#each [M68KFlag.Extend, M68KFlag.Negative, M68KFlag.Zero, M68KFlag.Overflow, M68KFlag.Carry] as flag}
                            {@const kind = ins.affectsFlags[flag]}
                            <div class="flag-header">{flag}</div>
                        {/each}
                        {#each [M68KFlag.Extend, M68KFlag.Negative, M68KFlag.Zero, M68KFlag.Overflow, M68KFlag.Carry] as flag}
                            {@const kind = ins.affectsFlags[flag]}
                            <div
                                class="flag-cell"
                                class:flag-edits={kind === AffectedFlagKind.Edits}
                                class:flag-to-zero={kind === AffectedFlagKind.ToZero}
                                class:flag-to-one={kind === AffectedFlagKind.ToOne}
                                class:flag-unaffected={kind === AffectedFlagKind.Unaffected}
                            >
                                {#if kind === AffectedFlagKind.Edits}
                                    {'\u2731'}
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
                            {#each ins.args as arg, i}
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
        <SvelteComponent_1
            bind:code
            instructionKey={ins.name}
            description={ins.description}
            arguments={ins.args.map((arg) => getAddressingModeNames(arg))}
            language="M68K"
        />
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
