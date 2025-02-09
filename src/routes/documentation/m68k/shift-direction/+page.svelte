<script lang="ts">
    import M68KShiftDirections from '$cmp/documentation/m68k/M68KShiftDirections.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
</script>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>Shift Directions</h1>
    <div class="text">
        The shift logical, shift arithmetical and rotate, instructions use the directions to specify
        in which direction the bits are shifted.
    </div>
    <div class="column content">
        <M68KShiftDirections />
    </div>
    <div>
        Those instructions are:
        <a href="/documentation/m68k/instruction/lsl">lsl</a>
        <a href="/documentation/m68k/instruction/lsr">lsr</a>
        <a href="/documentation/m68k/instruction/rol">rol</a>
        <a href="/documentation/m68k/instruction/ror">ror</a>
        <a href="/documentation/m68k/instruction/asl">asl</a>
        <a href="/documentation/m68k/instruction/asr">asr</a>
    </div>
</Page>

<style>
    .content {
        padding: 1rem;
    }
    a {
        color: var(--accent);
        text-decoration: underline;
    }
    @media (max-width: 800px) {
        .content {
            padding: unset;
        }
    }
    .text {
        line-height: 1.5rem;
    }
</style>
