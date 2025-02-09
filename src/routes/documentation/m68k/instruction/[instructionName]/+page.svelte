<script lang="ts">
    import { run } from 'svelte/legacy'

    import type { PageData } from './$types'
    import Page from '$cmp/shared/layout/Page.svelte'
    import { onMount } from 'svelte'
    import {
        fromSizesToString,
        fromSizeToString,
        getAddressingModeNames,
    } from '$lib/languages/M68K-documentation'
    import DocsOperand from '$cmp/documentation/DocsOperand.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
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
    <meta name="og:description" content={`The ${ins.name} instruction.\n${ins.description}`} />
    <meta name="keywords" content={ins.name} />
    <meta name="author" content="specy" />
    <title>
        Docs - {ins.name}
    </title>
    <meta name="og:title" content="Docs - {ins.name}" />
</svelte:head>

<Page contentStyle="padding: 1rem; gap: 1rem;">
    <div class="instruction-info" style="flex: 1;">
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
            <article class="column">
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
            </article>
            <article class="description">
                <MarkdownRenderer source={ins.description} />
            </article>
        </Column>
    </div>
    {#if component}
        {@const SvelteComponent_1 = component}
        <SvelteComponent_1 bind:code instructionKey={ins.name} />
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
    @media (max-width: 800px) {
        .instruction-info {
            flex-direction: column;
        }
    }
</style>
