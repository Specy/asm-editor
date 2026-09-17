<script lang="ts">
    import type { PageData } from './$types'
    import { page } from '$app/state'
    import { toMetaDescription, jsonLdScriptTag, instructionLd } from '$lib/seo'
    import Page from '$cmp/shared/layout/Page.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import { onMount } from 'svelte'
    import X86InstructionForms from '$cmp/documentation/x86/X86InstructionForms.svelte'
    import { formatX86Cpu } from '$lib/languages/X86/X86-documentation'

    interface Props {
        data: PageData
    }

    let { data }: Props = $props()

    let instruction = $derived(data.props.instruction)
    let name = $derived(data.props.name)
    let description = $derived(data.props.description)

    // Bound into the editor below, which is free to overwrite it; navigating to another
    // instruction re-derives it, the same way the other languages' instruction pages do.
    let code = $derived(data.props.example ?? '')

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

    let pageTitle = $derived(`${String(name).toUpperCase()} — x86-64 instruction reference`)
    let metaDescription = $derived(
        toMetaDescription(`The ${name} x86-64 instruction. ${description}`)
    )
    let structuredData = $derived(
        instructionLd({
            name: String(name),
            architecture: 'x86-64',
            description,
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
    <!-- The page's schema.org description; see the M68K page for why this is {@html}. -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html jsonLdScriptTag(structuredData)}
</svelte:head>

<Page contentStyle="padding: 1rem; gap: 1rem;">
    <div class="instruction-info" style="flex: 1;">
        <Column>
            <h1 class="instruction-name">
                {name}
            </h1>
            <span class="since">{formatX86Cpu(instruction.cpu)} and later</span>
        </Column>

        <Column gap="1rem" flex1>
            <Column gap="1rem">
                <h2>{data.props.title}</h2>
                <span class="summary">
                    {data.props.summary}
                </span>
            </Column>

            <article class="description">
                <MarkdownRenderer source={description} />
            </article>
        </Column>
    </div>

    {#if data.props.example}
        {#if component}
            {@const SvelteComponent_1 = component}
            <SvelteComponent_1
                bind:code
                instructionKey={name}
                language="X86"
                showPc={true}
                showFlags={true}
                showConsole={true}
            />
        {:else}
            <div class="loading">Loading...</div>
        {/if}
    {:else}
        <p class="no-example">
            No example here: this instruction either stops the program, or belongs to a mode this
            emulator does not run.
        </p>
    {/if}

    <Column gap="1rem">
        <h2>Forms</h2>
        <p class="forms-hint">
            Every form of <code>{name}</code> the assembler accepts, from NASM's own instruction table.
            The second column is the processor that introduced the form; a badge marks a form that needs
            an extension, that is lockable, or that long mode dropped.
        </p>
        <X86InstructionForms {instruction} />
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
    }
    .since {
        color: var(--background-text-muted);
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
    .no-example {
        line-height: 1.5;
        color: var(--background-text-muted);
    }
    .forms-hint {
        line-height: 1.5;
    }
    code {
        font-family: FiraCode;
        color: var(--accent);
    }
    @media (max-width: 800px) {
        .instruction-info {
            flex-direction: column;
        }
    }
</style>
