<script lang="ts">
    import { highlight } from './highlight'

    interface Props {
        text: string
        terms: string[]
    }

    let { text, terms }: Props = $props()
</script>

{#each highlight(text, terms) as part, index (index)}{#if part.match}<mark>{part.text}</mark
        >{:else}{part.text}{/if}{/each}

<style>
    mark {
        background-color: color-mix(in srgb, var(--accent) 30%, transparent);
        color: inherit;
        border-radius: 0.15rem;
    }
</style>
