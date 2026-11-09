<script lang="ts">
    /**
     * The home page's hex bytes, drawn as text like a strip of a memory view, a few picked out in
     * the accent: one line of them in the dividers (the box it is in cuts it off at its sides), or
     * a `fill` that covers the box it is in, wrapping and justified to its width, behind the quick
     * links and the closing section. Where the bytes fade out is the box's: it masks them.
     */
    import { hexStrip } from './landing.ts'

    interface Props {
        /** Which bytes: one seed always draws the same ones, on the server as in the browser. */
        seed: number
        /** How many bytes. */
        bytes?: number
        /** Covers the box it is in, wrapping, where it is otherwise one line. */
        fill?: boolean
        /** Far fainter, for text that has to read over them as over a plain background. */
        faint?: boolean
    }

    let { seed, bytes, fill = false, faint = false }: Props = $props()
</script>

<div class="hex" class:fill class:faint aria-hidden="true">
    {#each hexStrip(seed, bytes) as segment, i (i)}{#if segment.hot}<b>{segment.text}</b
            >{:else}{segment.text}{/if}{/each}
</div>

<style lang="scss">
    .hex {
        white-space: pre;
        font-family: var(--font-mono);
        font-size: 0.8rem;
        line-height: 1.3;
        letter-spacing: 0.08em;
        color: color-mix(in srgb, var(--background-text) 16%, transparent);

        b {
            font-weight: 400;
            color: color-mix(in srgb, var(--accent) 50%, transparent);
        }
    }

    .fill {
        height: 100%;
        overflow: hidden;
        white-space: normal;
        line-height: 1.45;
        word-spacing: 0.1em;
        text-align: justify;
    }

    .faint {
        color: color-mix(in srgb, var(--background-text) 6%, transparent);

        b {
            color: color-mix(in srgb, var(--accent) 18%, transparent);
        }
    }
</style>
