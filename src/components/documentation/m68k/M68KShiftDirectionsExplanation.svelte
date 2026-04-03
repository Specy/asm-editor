<script lang="ts">
    import M68KShiftDirections from './M68KShiftDirections.svelte'
</script>

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
