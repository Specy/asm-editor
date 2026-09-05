<script lang="ts">
    import type { PageData } from './$types'
    import { page } from '$app/state'
    import { toMetaDescription, serializeJsonLd, instructionLd } from '$lib/seo'
    import Page from '$cmp/shared/layout/Page.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import { onMount } from 'svelte'
    import Z80FlagsCell from '$cmp/documentation/z80/Z80FlagsCell.svelte'
    import { dedupeZ80Variants } from '$cmp/documentation/z80/z80DocsUtils'

    interface Props {
        data: PageData
    }

    let { data }: Props = $props()
    let variants = $derived(dedupeZ80Variants(data.props.variants))
    let name = $derived(data.props.name)
    // The plainest form leads the page; the table below it carries the other 190-odd forms of `ld`.
    let description = $derived(variants[0].description)

    // Bound into the editor below, which is free to overwrite it; navigating to another
    // instruction re-derives it, the same way the other languages' instruction pages do.
    let code = $derived(data.props.example)

    let component:
        | typeof import('../../../m68k/instruction/[instructionName]/ClientOnly.svelte').default
        | undefined = $state.raw()
    onMount(async () => {
        //HUGE HACK TO MAKE SVELTEKIT PRERENDER BECAUSE OF TOP LEVEL AWAIT
        const imp = await import('../../../m68k/instruction/[instructionName]/ClientOnly.svelte')
        // @ts-ignore -- the dynamic import type omits the generated top-level-await promise
        await imp?.__tla
        // @ts-ignore -- the prerender import shim obscures the component's default export
        component = imp?.default
    })


    function formatCycles(cycles: { taken: number; notTaken: number }): string {
        // The two counts differ only for the conditional branches, where the package reports the
        // with-jump and without-jump timings separately.
        return cycles.taken === cycles.notTaken
            ? `${cycles.taken}`
            : `${cycles.taken}/${cycles.notTaken}`
    }

    // "Docs - move" matched no query anyone types; "MOVE — M68K instruction reference"
    // matches how these are actually searched for.
    let pageTitle = $derived(`${String(name).toUpperCase()} — Z80 instruction reference`)
    // The raw description is markdown, and was reaching search results with its link
    // syntax and newlines intact.
    let metaDescription = $derived(toMetaDescription(`The ${name} Z80 instruction. ${description}`))
    let structuredData = $derived(
        instructionLd({
            name: String(name),
            architecture: 'Z80',
            description: description,
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
    {@html `<script type="application/ld+json">${serializeJsonLd(structuredData)}</script>`}
</svelte:head>

<Page contentStyle="padding: 1rem; gap: 1rem;">
    <div class="instruction-info" style="flex: 1;">
        <Column>
            <h1 class="instruction-name">
                {name}
            </h1>
        </Column>

        <Column gap="1rem" flex1>
            <Column gap="1rem">
                <h2>Operands</h2>
                <span class="summary">
                    {data.props.summary}
                </span>
            </Column>

            <article class="description">
                <MarkdownRenderer source={description} />
            </article>
        </Column>
    </div>

    {#if component}
        {@const SvelteComponent_1 = component}
        <SvelteComponent_1
            bind:code
            instructionKey={name}
            {description}
            arguments={[data.props.summary]}
            language="Z80"
            showPc={true}
            showFlags={true}
            showConsole={true}
        />
    {:else}
        <div class="loading">Loading...</div>
    {/if}

    <Column gap="1rem">
        <h2>Variants</h2>
        <p class="variants-hint">
            Every form of <code>{name}</code> the assembler accepts. The cycles column counts clock
            cycles, written as <code>taken/not taken</code> for the conditional forms.
        </p>
        <div class="table-scroll">
            <table class="variants">
                <thead>
                    <tr>
                        <th>Instruction</th>
                        <th>Description</th>
                        <th>Flags</th>
                        <th>Bytes</th>
                        <th>Cycles</th>
                    </tr>
                </thead>
                <tbody>
                    {#each variants as variant (`${variant.instruction} ${variant.opcodes}`)}
                        <tr>
                            <td class="mono">
                                {variant.instruction}
                                {#if variant.undocumented}
                                    <span
                                        class="badge"
                                        title="Not in Zilog's manual, but implemented by the hardware and by this emulator"
                                    >
                                        undocumented
                                    </span>
                                {/if}
                            </td>
                            <!-- Markdown, like every other description on the page: the operand
                                 placeholders are code spans (`nnnn`). -->
                            <td>
                                <MarkdownRenderer source={variant.description} simpleCode />
                            </td>
                            <td><Z80FlagsCell flags={variant.flagsTable} /></td>
                            <td class="mono numeric">{variant.bytes}</td>
                            <td class="mono numeric">{formatCycles(variant.cycles)}</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    </Column>
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
    .summary {
        font-family: FiraCode;
        line-height: 1.6;
        word-break: break-word;
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
    .variants-hint {
        line-height: 1.5;
    }
    code {
        font-family: FiraCode;
        color: var(--accent);
    }
    .table-scroll {
        width: 100%;
        overflow-x: auto;
    }
    .variants {
        border-collapse: collapse;
        width: 100%;
        border: solid 0.1rem var(--tertiary);
        border-radius: 0.5rem;
        overflow: hidden;
        font-size: 0.9rem;
    }
    .variants thead {
        background-color: var(--tertiary);
        color: var(--tertiary-text);
        text-align: left;
    }
    .variants th {
        padding: 0.5rem;
    }
    .variants td {
        padding: 0.4rem 0.5rem;
        border-top: 0.1rem solid var(--tertiary);
        vertical-align: top;
    }
    .variants tbody {
        background-color: var(--secondary);
        color: var(--secondary-text);
    }
    .variants tbody tr:nth-child(odd) {
        background-color: color-mix(in srgb, var(--secondary), var(--tertiary) 20%);
    }
    .mono {
        font-family: FiraCode;
        white-space: nowrap;
    }
    .numeric {
        text-align: right;
    }
    .badge {
        display: inline-block;
        margin-left: 0.4rem;
        padding: 0 0.35rem;
        border-radius: 0.3rem;
        font-size: 0.7rem;
        font-family: Rubik;
        background-color: var(--accent2);
        color: var(--accent2-text);
        white-space: nowrap;
    }
    @media (max-width: 800px) {
        .instruction-info {
            flex-direction: column;
        }
    }
</style>
