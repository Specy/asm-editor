<script lang="ts">
	import Button from '$cmp/buttons/Button.svelte'
	import Icon from '$cmp/layout/Icon.svelte'
    import Setting from './Setting.svelte';
	import type { Settings, SettingValues } from '$stores/settingsStore'
	import FaTimes from 'svelte-icons/fa/FaTimes.svelte'
	import type { Readable } from 'svelte/store'
    import { settingsStore } from '$stores/settingsStore';
	export let visible: boolean
</script>

<div class="floating-settings" class:hidden={!visible}>
	<div class="row settings-header">
		<div>Settings</div>
		<Button 
            style="padding: 0.4rem" 
            hasIcon 
            on:click={() => {
                visible = !visible
            }}
            cssVar="secondary"
        >
			<Icon>
				<FaTimes />
			</Icon>
		</Button>
	</div>
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
</div>

<style lang="scss">
	.settings-header {
        font-weight: bold;
        font-size: 1.2rem;
		padding: 0.6rem;
        padding-left: 1rem;
		justify-content: space-between;
        background-color: rgba(var(--RGB-secondary), 0.7);
        align-items: center;
	}

	.floating-settings {
		display: flex;
		flex-direction: column;
		position: absolute;
		width: 30rem;
        overflow: hidden;
        max-width: 80vw;
		top: 50vh;
		left: 50vw;
		transform: translate(-50%, -50%);
		border-radius: 0.8rem;
		z-index: 5;
		background-color: rgba(var(--RGB-secondary-attention), 0.85);
		backdrop-filter: blur(3px);
		opacity: 1;
		transition: all 0.3s;
		box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);
	}
	@keyframes delayHide {
		99% {
		}
		100% {
			visibility: hidden;
		}
	}
    .settings-values{
        padding: 0.6rem;
        padding-top: 0.2rem;
    }
	.hidden {
		opacity: 0;
		transform: translate(-50%, calc(-50% - 1rem));
		animation: delayHide 0.3s forwards;
	}
</style>
