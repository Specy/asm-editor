<script lang="ts">
    import Setting from './Setting.svelte';
    import { settingsStore } from '$stores/settingsStore';
	import FloatingContainer from '$cmp/FloatingContainer.svelte'
	export let visible: boolean
</script>

<FloatingContainer bind:visible title="Settings">
    <div class="settings-values">
        {#each Object.entries($settingsStore.values) as entry,i (i) }
            <Setting 
                entry={entry[1]}
                on:changeValue={(e) => {
                    //@ts-ignore not sure why it gives me error with "as"
                    settingsStore.setValue(entry[0] , e.detail)
                }}
            />
        {/each}
    </div>
</FloatingContainer>


<style lang="scss">

    .settings-values{
        padding: 0.6rem;
        padding-top: 0.2rem;
    }

</style>
