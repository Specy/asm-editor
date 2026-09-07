<script lang="ts">
    import type { ProjectSettingDeclaration } from '$lib/projectSettings'
    import FaUndo from '~icons/fa-solid/undo'
    import Icon from '$cmp/shared/layout/Icon.svelte'

    /**
     * One Setting of the open Project: its effective value, whether that value is a decision or
     * the language's default, and a way back to the default. Decisions are all a Project stores
     * ([ADR 0014](../../../../../docs/adr/0014-settings-split-by-effect.md)), so the difference
     * is shown rather than hidden.
     */
    interface Props {
        declaration: ProjectSettingDeclaration<number>
        /** The value the Project runs with: the decision, or the default. */
        value: number
        decided: boolean
        onDecide: (value: number) => void
        onReset: () => void
    }

    let { declaration, value, decided, onDecide, onReset }: Props = $props()
    let draft = $derived(value)
</script>

<div class="row settings-value">
    <div class="name">
        {declaration.name}
        {#if !decided}
            <span class="origin" title="This project follows the app's default">default</span>
        {/if}
    </div>
    <div class="row" style="gap: 0.4rem; align-items: center">
        {#if decided}
            <button class="reset" title="Back to the default" onclick={onReset}>
                <Icon size={0.9}>
                    <FaUndo />
                </Icon>
            </button>
        {/if}
        <input
            class="number"
            type="number"
            min="0"
            bind:value={draft}
            onchange={() => {
                if (Number.isFinite(draft) && draft >= 0) onDecide(draft)
                else draft = value
            }}
        />
    </div>
</div>

<style lang="scss">
    .settings-value {
        justify-content: space-between;
        align-items: center;
        gap: 0.4rem;
        padding: 0.2rem 0.4rem;
        padding-left: 1rem;
    }
    .name {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .origin {
        font-size: 0.75rem;
        opacity: 0.7;
        padding: 0.1rem 0.4rem;
        border-radius: 0.3rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
    }
    .reset {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        border-radius: 0.4rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
        cursor: pointer;
    }
    .number {
        padding: 0.6rem 1rem;
        border-radius: 0.4rem;
        width: 7rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
    }
</style>
