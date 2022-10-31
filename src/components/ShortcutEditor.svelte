<script lang="ts">
	import { shortcutsStore } from '$stores/shortcutsStore'
	import Button from './buttons/Button.svelte'
	import FloatingContainer from './FloatingContainer.svelte'
	import Input from './inputs/Input.svelte'
	import Icon from './layout/Icon.svelte'
    import FaUndo from 'svelte-icons/fa/FaUndo.svelte'
	export let visible = false
</script>

<FloatingContainer {visible} title="Shortcuts" >
	<div class="shortcuts column">
		{#each Array.from($shortcutsStore.entries()).sort((a,b) => a[1].id - b[1].id) as entry}
			<div class="column">
                <div class="row input-row">
    				<Input 
                        value={entry[0]} 
                        on:blur={(e) => shortcutsStore.updateKey(entry[0],e.target.value )}
                    />
                    <Button
                        hasIcon
                        cssVar={entry[0] !== entry[1].defaultValue ? "accent" : "secondary"}
                        disabled={entry[0] === entry[1].defaultValue}
                        on:click={() => shortcutsStore.updateKey(entry[0], entry[1].defaultValue)}
                    >
                        <Icon size={1}>
                            <FaUndo />
                        </Icon>
                    </Button>
                </div>
				<div class="description">
					{entry[1].description}
				</div>
			</div>
		{/each}
	</div>
</FloatingContainer>

<style lang="scss">
	.shortcuts {
		display: flex;
		padding: 0.6rem;
		flex-direction: column;
		height: 80vh;
		gap: 1.4rem;
		overflow-y: auto;
		font-family: FiraCode;
	}
    .input-row{
        justify-content: space-between;
        margin-bottom: 0.4rem;
    }
    .description{
		padding: 0.6rem 0.8rem;
		background-color: rgba(var(--RGB-secondary), 0.7);
		line-height: 1.4rem;
		border-radius: 0.4rem;
	}
</style>
