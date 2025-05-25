<script lang="ts">
    import M68KDirectives from '$cmp/documentation/m68k/M68KDirectives.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
</script>

<svelte:head>
    <title>M68K Directives</title>
    <meta
        name="description"
        content="M68K directives are used by the assembler to execute operations at assembly time. Learn how to use them and the available directives."
    />
    <meta
        property="og:description"
        content="M68K directives are used by the assembler to execute operations at assembly time. Learn how to use them and the available directives."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>Directives</h1>
    <div class="column content">
        <M68KDirectives />
    </div>
</Page>

<style>
    .content {
        padding: 1rem;
    }
    @media (max-width: 800px) {
        .content {
            padding: unset;
        }
    }
</style>
