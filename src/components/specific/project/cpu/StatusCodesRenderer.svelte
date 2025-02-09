<script lang="ts">
    import type { StatusRegister } from '$lib/languages/M68KEmulator.svelte'
    interface Props {
        statusCodes: StatusRegister[]
        style?: string
    }

    let { statusCodes, style = '' }: Props = $props()
</script>

<div class="status-codes" {style}>
    {#each statusCodes as el, i (i)}
        <div class="column">
            <div>
                {el.name}
            </div>
            <div class:edited={el.prev !== el.value}>
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
</style>
