<script lang="ts">
    import type { PageData } from './$types'
    import Page from '$cmp/shared/layout/Page.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import { onMount } from 'svelte'
    import { formatAggregatedArgs } from '$lib/languages/MIPS/MIPS-documentation'
    interface Props {
        data: PageData
    }

    let { data }: Props = $props()
    let ins = $derived(data.props.instruction[0])

    let code = $state(ins.interactiveExample?.code ?? '; no interactive instruction available')

    let component: any = $state.raw()
    onMount(async () => {
        //HUGE HACK TO MAKE SVELTEKIT PRERENDER BECAUSE OF TOP LEVEL AWAIT
        const imp = await import('../../../m68k/instruction/[instructionName]/ClientOnly.svelte')
        //@ts-ignore
        await imp?.__tla
        //@ts-ignore
        component = imp?.default
    })

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
        </Column>

        <Column gap="1rem" flex1>
            <Column gap='1rem'>
                <h2>Operands</h2>
                <span>
                    {formatAggregatedArgs(data.props.instruction)}
                </span>
            </Column>

            <Column style="gap: 1rem">
                <h2>Variants</h2>
                <MarkdownRenderer
                    source={data.props.instruction
                        .map((v) => `- ${v.description} **${v.example}**`)
                        .join('\n')}
                />
            </Column>
            <article class="description">
                <MarkdownRenderer source={ins.description} />
            </article>
        </Column>
    </div>
    {#if component}
        {@const SvelteComponent_1 = component}
        <SvelteComponent_1 bind:code instructionKey={ins.name} language="MIPS" />
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
