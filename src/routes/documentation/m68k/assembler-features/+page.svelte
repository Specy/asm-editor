<script lang="ts">
    import M68KAssemblerFeatures from '$cmp/documentation/m68k/M68KAssemblerFeatures.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
</script>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>Assembler features</h1>
    <div class="column content">
        <M68KAssemblerFeatures />
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
