<script lang="ts">
    import Page from '$cmp/shared/layout/Page.svelte'
    import M68KTrapsDocumentation from '$cmp/documentation/m68k/M68KTrapsDocumentation.svelte'
</script>

<svelte:head>
    <title>M68K Trap Tasks</title>
    <meta
        name="description"
        content="The M68K has one system call, trap #15. Learn every task the emulator supports: printing and reading, the graphics tasks, the keyboard and the mouse, and program time."
    />
    <meta
        property="og:description"
        content="The M68K has one system call, trap #15. Learn every task the emulator supports: printing and reading, the graphics tasks, the keyboard and the mouse, and program time."
    />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>M68K Trap Tasks</h1>
    <M68KTrapsDocumentation />
</Page>
