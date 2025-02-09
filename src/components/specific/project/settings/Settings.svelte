<script lang="ts">
    import Setting from './Setting.svelte'
    import { settingsStore } from '$stores/settingsStore.svelte'
    import FloatingContainer from '$cmp/shared/layout/FloatingContainer.svelte'
    import FaPalette from 'svelte-icons/fa/FaPalette.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import Button from '$cmp/shared/button/Button.svelte'
    interface Props {
        visible: boolean
    }

    let { visible = $bindable() }: Props = $props()
</script>

<FloatingContainer bind:visible title="Settings">
    <div class="settings-values">
        {#each Object.entries(settingsStore.values) as entry, i (i)}
            <Setting
                entry={entry[1]}
                on:changeValue={(e) => {
                    //@ts-expect-error
                    settingsStore.setValue(entry[0], e.detail)
                }}
            />
        {/each}
        <div
            class="row"
            style="align-items: center; justify-content: space-between; padding: 0.4rem"
        >
            <div style="padding-left: 0.5rem">Change theme</div>
            <a href="/themes" title="Edit the theme">
                <Button cssVar="accent2">
                    <Icon>
                        <FaPalette />
                    </Icon>
                </Button>
            </a>
        </div>
    </div>
</FloatingContainer>

<style lang="scss">
    .settings-values {
        display: flex;
        flex-direction: column;
        padding: 0.6rem;
        gap: 0.2rem;
        padding-top: 0.2rem;
    }
</style>
