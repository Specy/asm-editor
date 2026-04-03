<script lang="ts">
    import M68KShiftDirectionsExplanation from '$cmp/documentation/m68k/M68KShiftDirectionsExplanation.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
</script>

<svelte:head>
    <title>M68K Shift Directions</title>
    <meta
        name="description"
        content="Shift directions in M68K specify the direction in which bits are shifted. Learn about the shift logical, shift arithmetical, and rotate directions."
    />
    <meta
        property="og:description"
        content="Shift directions in M68K specify the direction in which bits are shifted. Learn about the shift logical, shift arithmetical, and rotate directions."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>Shift Directions</h1>
    <M68KShiftDirectionsExplanation />
</Page>
