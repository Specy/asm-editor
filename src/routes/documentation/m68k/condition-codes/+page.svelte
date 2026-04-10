<script lang="ts">
    import M68KConditionCodesExplanation from '$cmp/documentation/m68k/M68KConditionCodesExplanation.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
</script>

<svelte:head>
    <title>M68K Condition Codes</title>
    <meta
        name="description"
        content="M68K condition codes are used to determine the result of an operation and control the flow of the program."
    />
    <meta
        property="og:description"
        content="M68K condition codes are used to determine the result of an operation and control the flow of the program."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>Condition Codes</h1>
    <M68KConditionCodesExplanation />
</Page>
