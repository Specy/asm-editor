<script lang="ts">
    import type { StatusRegister } from '$lib/languages/commonLanguageFeatures.svelte'

    interface Props {
        statusCodes: StatusRegister[]
        style?: string
    }

    let { statusCodes, style = '' }: Props = $props()
</script>

<div class="status-codes" {style}>
    {#each statusCodes as el, i (i)}
        <div class="column flag">
            <div style="opacity: 0.8;">
                {el.name}
            </div>
            <div class="flag-value" class:edited={el.prev !== el.value}>
                {el.value}
            </div>
        </div>
    {/each}
</div>

<style lang="scss">
    .status-codes {
        display: flex;
        background-color: var(--secondary);
        color: var(--secondary-text);
        gap: 0.3rem;
        justify-content: space-around;
        padding: 0.3rem;
        border-radius: 0.4rem;
    }
    .edited {
        color: var(--accent);
    }
    .flag {
        flex: 1 1 0;
        min-width: 0;
        align-items: center;
    }
    .flag-value {
        min-width: 1ch;
        text-align: center;
        font-variant-numeric: tabular-nums;
    }
</style>
